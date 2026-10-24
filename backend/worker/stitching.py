"""Measured spherical stitching; the caller owns the temporary work directory."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import math
from pathlib import Path
import shutil
from typing import Callable

from backend.worker.processes import Runner, StitchError, require_tools
from backend.worker.quality import AlignmentQuality, alignment_quality, control_points, crop_coverage


@dataclass(frozen=True)
class StitchResult:
    image_path: Path
    width: int
    height: int
    vaov_deg: float
    v_offset_deg: float
    quality: AlignmentQuality


def stitch(frames: list[Path], work_root: Path, hfov_hint_deg: float = 60,
           *, runner: Runner | None = None, progress: Callable[[int], None] = lambda value: None) -> StitchResult:
    if len(frames) != 16 or any(not item.is_file() for item in frames):
        raise StitchError("INPUT_EXPIRED", "The complete set of 16 source frames is unavailable")
    if not math.isfinite(hfov_hint_deg) or not 40 <= hfov_hint_deg <= 85:
        raise StitchError("QUALITY_REJECTED", "Invalid input horizontal field of view")
    if len({hashlib.sha256(item.read_bytes()).digest() for item in frames}) != 16:
        raise StitchError("NOT_ENOUGH_OVERLAP", "The capture contains duplicate frames")
    require_tools()
    runner = runner or Runner()
    work = work_root.resolve()
    work.mkdir(parents=True, exist_ok=True)
    sources = []
    for index, frame in enumerate(frames):
        runner.check()
        target = work / f"frame-{index:02d}.jpg"
        shutil.copyfile(frame, target)
        sources.append(str(target))
    project = work / "capture.pto"
    runner.run(["pto_gen", f"--fov={hfov_hint_deg:g}", "-o", str(project), *sources], work)
    progress(10)
    matched = work / "matched.pto"
    # All 120 pairs, including 15 -> 0. This spelling also works on Hugin
    # versions predating the --allpairs option (e.g. Debian bookworm).
    runner.run(["cpfind", "--linearmatch", "--linearmatchlen=15", "-o", str(matched), str(project)], work, timeout=600)
    control_points(matched)
    progress(30)
    clean = work / "clean.pto"
    runner.run(["cpclean", "--pairwise-checking", "-o", str(clean), str(matched)], work)
    control_points(clean)
    optimized = work / "optimized.pto"
    runner.run(["autooptimiser", "-a", "-l", "-s", "-m", "-o", str(optimized), str(clean)], work)
    progress(45)
    final = work / "final.pto"
    runner.run(["pano_modify", "--projection=2", "--fov=360x180", "--canvas=4096x2048",
                "--crop=0,4096,0,2048", "--center", "-o", str(final), str(optimized)], work)
    quality = alignment_quality(final, runner)
    progress(55)
    runner.run(["nona", "-m", "TIFF_m", "-o", str(work / "render-"), str(final)], work, timeout=600)
    tiles = sorted(work.glob("render-*.tif"))
    if len(tiles) != 16:
        raise StitchError("TOOL_FAILED", "Hugin renderer must produce all 16 remapped images")
    progress(75)
    output = work / "stitched.tif"
    runner.run(["enblend", "--wrap=horizontal", "-f", "4096x2048+0+0", "--compression=LZW",
                "-o", str(output), *map(str, tiles)], work, timeout=600)
    if not output.is_file():
        raise StitchError("TOOL_FAILED", "Enblend did not produce an output image")
    runner.check()
    crop = work / "stitched-crop.png"
    height, vaov, offset = crop_coverage(output, crop)
    progress(85)
    return StitchResult(crop, 4096, height, vaov, offset, quality)
