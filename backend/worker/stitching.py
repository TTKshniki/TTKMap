from __future__ import annotations

from dataclasses import dataclass
import shutil
import subprocess
import tempfile
from pathlib import Path
import re
from typing import Callable

from PIL import Image
import numpy as np


REQUIRED_TOOLS = ("pto_gen", "cpfind", "cpclean", "autooptimiser", "pano_modify", "nona", "enblend")

StepCallback = Callable[[str], None]
CancelCheck = Callable[[], bool]


class StitchError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class StitchCancelled(StitchError):
    """Raised when the lease owner cancels the job mid-pipeline."""

    def __init__(self, message: str = "Stitching was cancelled"):
        super().__init__("CANCELLED", message)


@dataclass(frozen=True)
class StitchResult:
    image_path: Path
    width: int
    height: int
    vaov_deg: float
    v_offset_deg: float
    work_dir: Path


def missing_tools(tools: tuple[str, ...] = REQUIRED_TOOLS) -> list[str]:
    return [tool for tool in tools if shutil.which(tool) is None]


def _run(
    args: list[str],
    *,
    timeout: int = 900,
    cwd: Path,
    on_step: StepCallback | None = None,
    is_cancelled: CancelCheck | None = None,
    step: str | None = None,
) -> str:
    if is_cancelled is not None and is_cancelled():
        raise StitchCancelled()
    if on_step is not None and step is not None:
        on_step(step)
    binary = shutil.which(args[0])
    if binary is None:
        raise StitchError("TOOL_FAILED", f"Required stitching tool is unavailable: {args[0]}")
    try:
        result = subprocess.run(
            [binary, *args[1:]], cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False
        )
    except subprocess.TimeoutExpired as exc:
        raise StitchError("TIMEOUT", f"{args[0]} exceeded its time limit") from exc
    if result.returncode:
        details = (result.stderr or result.stdout).strip().splitlines()
        raise StitchError("TOOL_FAILED", f"{args[0]} failed: {details[-1][:300] if details else 'unknown error'}")
    return result.stdout + "\n" + result.stderr


def measure_coverage(image: Image.Image, canvas_width: int = 4096, canvas_height: int = 2048) -> tuple[int, int, float, float]:
    """Returns the full-width vertical crop and the resulting angles.

    A row counts only when the alpha channel covers at least 98 % of the full
    360° canvas, so a panorama that is missing its zenith is never reported as
    a complete sphere.
    """
    alpha = image.getchannel("A") if "A" in image.getbands() else None
    if alpha is None:
        raise StitchError("INSUFFICIENT_COVERAGE", "Rendered panorama has no measurable alpha coverage")
    alpha_pixels = np.asarray(alpha, dtype=np.uint8)
    full_rows = (alpha_pixels > 0).mean(axis=1) >= 0.98
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, covered in enumerate(full_rows):
        if covered and start is None:
            start = index
        elif not covered and start is not None:
            runs.append((start, index))
            start = None
    if start is not None:
        runs.append((start, len(full_rows)))
    if not runs:
        raise StitchError("INSUFFICIENT_COVERAGE", "Rendered panorama has no full-width vertical coverage")
    top, bottom = max(runs, key=lambda run: run[1] - run[0])
    vaov = (bottom - top) * 180.0 / canvas_height
    if vaov < 40:
        raise StitchError("INSUFFICIENT_COVERAGE", "Measured full-width vertical coverage is below 40 degrees")
    v_offset = 90.0 - ((top + bottom) / 2) * 180.0 / canvas_height
    if not -70 <= v_offset <= 70:
        raise StitchError("INSUFFICIENT_COVERAGE", "Measured panorama horizon offset is outside the supported range")
    return top, bottom, vaov, v_offset


def stitch(
    frames: list[Path],
    work_root: Path,
    hfov_hint_deg: float = 60,
    *,
    on_step: StepCallback | None = None,
    is_cancelled: CancelCheck | None = None,
    frame_count: int = 16,
) -> StitchResult:
    if len(frames) != frame_count or any(not item.is_file() for item in frames):
        raise StitchError("INPUT_EXPIRED", f"The complete set of {frame_count} source frames is unavailable")

    if is_cancelled is not None and is_cancelled():
        raise StitchCancelled()

    unavailable = missing_tools()
    if unavailable:
        raise StitchError(
            "TOOL_FAILED",
            f"Stitching tools unavailable ({', '.join(unavailable)}); upload a ready 360° panorama or run the worker container",
        )

    work_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="ttk-stitch-", dir=work_root))
    try:
        if on_step is not None:
            on_step("validate")
        sources: list[Path] = []
        for index, source in enumerate(frames):
            target = work / f"frame-{index:02d}.jpg"
            shutil.copyfile(source, target)
            sources.append(target)

        project = work / "capture.pto"
        _run(["pto_gen", f"--fov={hfov_hint_deg:g}", "-o", str(project), *map(str, sources)],
             cwd=work, on_step=on_step, is_cancelled=is_cancelled)
        _run(["cpfind", "--multirow", "-o", str(project), str(project)],
             cwd=work, timeout=600, on_step=on_step, is_cancelled=is_cancelled, step="features")
        clean = work / "clean.pto"
        _run(["cpclean", "-o", str(clean), str(project)], cwd=work, on_step=on_step, is_cancelled=is_cancelled)
        optimized = work / "optimized.pto"
        _run(["autooptimiser", "-a", "-l", "-s", "-o", str(optimized), str(clean)],
             cwd=work, on_step=on_step, is_cancelled=is_cancelled, step="optimise")

        pto = optimized.read_text(encoding="utf-8", errors="replace")
        image_lines = [line for line in pto.splitlines() if line.startswith("i ")]
        if len(image_lines) != frame_count:
            raise StitchError("QUALITY_REJECTED", f"Stitch project does not contain all {frame_count} frames")
        pairs: dict[tuple[int, int], int] = {}
        for line in pto.splitlines():
            match = re.match(r"c\s+n(\d+)\s+N(\d+)\s", line)
            if match:
                a, b = int(match.group(1)), int(match.group(2))
                pairs[(min(a, b), max(a, b))] = pairs.get((min(a, b), max(a, b)), 0) + 1
        required = [(index, index + 1) for index in range(frame_count - 1)] + [(0, frame_count - 1)]
        if any(pairs.get(pair, 0) < 4 for pair in required):
            raise StitchError(
                "NOT_ENOUGH_OVERLAP",
                "Adjacent frames and the closing seam need at least four surviving control points",
            )

        final_pto = work / "final.pto"
        _run(["pano_modify", "--projection=2", "--fov=360x180", "--canvas=4096x2048",
              "--center", "-o", str(final_pto), str(optimized)], cwd=work, is_cancelled=is_cancelled)
        prefix = work / "render-"
        _run(["nona", "-m", "TIFF_m", "-o", str(prefix), str(final_pto)],
             cwd=work, timeout=1200, on_step=on_step, is_cancelled=is_cancelled, step="render")
        tiles = sorted(work.glob("render-*.tif")) + sorted(work.glob("render-*.tiff"))
        if not tiles:
            raise StitchError("TOOL_FAILED", "Hugin renderer did not produce TIFF tiles")
        output = work / "stitched.tif"
        _run(["enblend", "--compression=LZW", "-o", str(output), *map(str, tiles)],
             cwd=work, timeout=1200, on_step=on_step, is_cancelled=is_cancelled, step="blend")
        if not output.is_file():
            raise StitchError("TOOL_FAILED", "Enblend did not produce an output image")

        if on_step is not None:
            on_step("quality")
        cropped_output = work / "stitched-crop.tif"
        with Image.open(output) as image:
            image.load()
            if image.size != (4096, 2048):
                raise StitchError("QUALITY_REJECTED", "Rendered panorama must be a 4096x2048 spherical image")
            top, bottom, vaov, v_offset = measure_coverage(image)
            # Keep the measured 360° crop; never stretch a narrow capture to 2:1.
            image.crop((0, top, 4096, bottom)).save(cropped_output, format="TIFF", compression="tiff_lzw")
        return StitchResult(cropped_output, 4096, bottom - top, vaov, v_offset, work)
    except StitchError:
        shutil.rmtree(work, ignore_errors=True)
        raise
    except Exception as exc:  # noqa: BLE001 - the worker must never leak a raw traceback
        shutil.rmtree(work, ignore_errors=True)
        raise StitchError("TOOL_FAILED", "Stitching pipeline failed unexpectedly") from exc
