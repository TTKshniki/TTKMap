from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from PIL import Image
import numpy as np


class StitchError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class StitchResult:
    image_path: Path
    width: int
    height: int
    vaov_deg: float
    v_offset_deg: float


def _run(args: list[str], *, timeout: int = 900, cwd: Path) -> str:
    binary = shutil.which(args[0])
    if binary is None:
        raise StitchError("TOOL_FAILED", f"Required stitching tool is unavailable: {args[0]}")
    try:
        result = subprocess.run([binary, *args[1:]], cwd=cwd, capture_output=True, text=True,
                                timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise StitchError("TIMEOUT", f"{args[0]} exceeded its time limit") from exc
    if result.returncode:
        details = (result.stderr or result.stdout).strip().splitlines()
        raise StitchError("TOOL_FAILED", f"{args[0]} failed: {details[-1][:300] if details else 'unknown error'}")
    return result.stdout + "\n" + result.stderr


def stitch(frames: list[Path], work_root: Path, hfov_hint_deg: float = 60) -> StitchResult:
    if len(frames) != 16 or any(not item.is_file() for item in frames):
        raise StitchError("INPUT_EXPIRED", "The complete set of 16 source frames is unavailable")
    work_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="ttk-stitch-", dir=work_root))
    try:
        # Copy to numbered local names, avoiding dependence on caller filenames.
        sources: list[Path] = []
        for index, source in enumerate(frames):
            target = work / f"frame-{index:02d}.jpg"
            shutil.copyfile(source, target)
            sources.append(target)
        project = work / "capture.pto"
        _run(["pto_gen", f"--fov={hfov_hint_deg:g}", "-o", str(project), *map(str, sources)], cwd=work)
        _run(["cpfind", "--multirow", "-o", str(project), str(project)], cwd=work, timeout=600)
        clean = work / "clean.pto"
        _run(["cpclean", "-o", str(clean), str(project)], cwd=work)
        optimized = work / "optimized.pto"
        _run(["autooptimiser", "-a", "-l", "-s", "-o", str(optimized), str(clean)], cwd=work)

        pto = optimized.read_text(encoding="utf-8", errors="replace")
        image_lines = [line for line in pto.splitlines() if line.startswith("i ")]
        if len(image_lines) != 16:
            raise StitchError("QUALITY_REJECTED", "Stitch project does not contain all 16 frames")
        pairs: dict[tuple[int, int], int] = {}
        for line in pto.splitlines():
            match = re.match(r"c\s+n(\d+)\s+N(\d+)\s", line)
            if match:
                a, b = int(match.group(1)), int(match.group(2))
                pairs[(min(a, b), max(a, b))] = pairs.get((min(a, b), max(a, b)), 0) + 1
        required = [(index, index + 1) for index in range(15)] + [(0, 15)]
        if any(pairs.get(pair, 0) < 4 for pair in required):
            raise StitchError("NOT_ENOUGH_OVERLAP", "Adjacent frames and the closing seam need at least four surviving control points")

        final_pto = work / "final.pto"
        _run(["pano_modify", "--projection=2", "--fov=360x180", "--canvas=4096x2048",
              "--center", "-o", str(final_pto), str(optimized)], cwd=work)
        prefix = work / "render-"
        _run(["nona", "-m", "TIFF_m", "-o", str(prefix), str(final_pto)], cwd=work, timeout=1200)
        tiles = sorted(work.glob("render-*.tif")) + sorted(work.glob("render-*.tiff"))
        if not tiles:
            raise StitchError("TOOL_FAILED", "Hugin renderer did not produce TIFF tiles")
        output = work / "stitched.tif"
        _run(["enblend", "--compression=LZW", "-o", str(output), *map(str, tiles)], cwd=work, timeout=1200)
        if not output.is_file():
            raise StitchError("TOOL_FAILED", "Enblend did not produce an output image")
        cropped_output = work / "stitched-crop.tif"
        with Image.open(output) as image:
            image.load()
            if image.size != (4096, 2048):
                raise StitchError("QUALITY_REJECTED", "Rendered panorama must be a 4096x2048 spherical image")
            alpha = image.getchannel("A") if "A" in image.getbands() else None
            if alpha is None:
                raise StitchError("INSUFFICIENT_COVERAGE", "Rendered panorama has no measurable alpha coverage")
            alpha_pixels = np.asarray(alpha, dtype=np.uint8)
            # A row counts only when it covers at least 98% of the full 360-degree canvas.
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
            vaov = (bottom - top) * 180.0 / 2048
            if vaov < 40:
                raise StitchError("INSUFFICIENT_COVERAGE", "Measured full-width vertical coverage is below 40 degrees")
            v_offset = 90.0 - ((top + bottom) / 2) * 180.0 / 2048
            if not -70 <= v_offset <= 70:
                raise StitchError("INSUFFICIENT_COVERAGE", "Measured panorama horizon offset is outside the supported range")
            # Keep the measured 360-degree crop; never stretch a narrow capture to 2:1.
            image.crop((0, top, 4096, bottom)).save(cropped_output, format="TIFF", compression="tiff_lzw")
        return StitchResult(cropped_output, 4096, bottom - top, vaov, v_offset)
    except StitchError:
        raise
    except Exception as exc:
        raise StitchError("TOOL_FAILED", "Stitching pipeline failed unexpectedly") from exc
    # Work files are retained until the caller has imported the output. Caller owns cleanup.
