from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import re

import numpy as np
from PIL import Image

from backend.worker.processes import Runner, StitchError


@dataclass(frozen=True)
class AlignmentQuality:
    control_points: int
    inliers: int
    rms_px: float
    p95_px: float


def _pairs(points, code="NOT_ENOUGH_OVERLAP"):
    pairs = {}
    for n, N, *_ in points:
        pair = tuple(sorted((int(n), int(N))))
        pairs[pair] = pairs.get(pair, 0) + 1
    missing = [f"{i}-{i + 1}" for i in range(15) if pairs.get((i, i + 1), 0) < 4]
    if missing:
        raise StitchError(code, "Fewer than four matching inliers in pairs: " + ", ".join(missing))
    if pairs.get((0, 15), 0) < 4:
        raise StitchError("LOOP_NOT_CLOSED" if code == "NOT_ENOUGH_OVERLAP" else code,
                          "The closing pair (15, 0) needs four matching inliers")


def control_points(project: Path):
    text = project.read_text(encoding="utf-8", errors="replace")
    if sum(line.startswith("i ") for line in text.splitlines()) != 16:
        raise StitchError("QUALITY_REJECTED", "Project must contain all 16 images")
    points = []
    for line in text.splitlines():
        if not line.startswith("c "):
            continue
        fields = dict(re.findall(r"([nNxyXYt])(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)", line))
        if fields.get("t", "0") != "0":
            continue
        try:
            row = tuple(float(fields[key]) for key in ("n", "N", "x", "y", "X", "Y"))
        except (KeyError, ValueError) as exc:
            raise StitchError("QUALITY_REJECTED", "Invalid control point") from exc
        if not all(math.isfinite(v) for v in row) or any(v < 0 or v > 15 or v != int(v) for v in row[:2]) or row[0] == row[1]:
            raise StitchError("QUALITY_REJECTED", "Invalid control point indices")
        points.append(row)
    points = sorted(set(points))
    if len(points) > 10000:
        raise StitchError("QUALITY_REJECTED", "Too many control points")
    _pairs(points)
    return points


def alignment_quality(project: Path, runner: Runner) -> AlignmentQuality:
    points = control_points(project)
    coordinates = "".join(f"{int(n)} {x} {y}\n{int(N)} {X} {Y}\n" for n, N, x, y, X, Y in points)
    output = runner.run(["pano_trafo", str(project)], project.parent, stdin=coordinates)
    try:
        values = np.array([float(v) for v in output.split()]).reshape(len(points), 2, 2)
    except (ValueError, TypeError) as exc:
        raise StitchError("QUALITY_REJECTED", "Invalid transformed control points") from exc
    if not np.isfinite(values).all():
        raise StitchError("QUALITY_REJECTED", "Non-finite transformed control points")
    # Final project is a 4096x2048 equirectangular sphere. Compare directions
    # on that sphere so the seam and polar latitude do not inflate errors.
    longitude = values[:, :, 0] * (2 * np.pi / 4096)
    latitude = np.pi / 2 - values[:, :, 1] * (np.pi / 2048)
    vectors = np.stack((np.cos(latitude) * np.cos(longitude),
                        np.cos(latitude) * np.sin(longitude), np.sin(latitude)), axis=-1)
    chord = np.linalg.norm(vectors[:, 0] - vectors[:, 1], axis=-1)
    errors = 2 * np.arcsin(np.clip(chord / 2, 0, 1)) * 4096 / (2 * np.pi)
    rms = float(np.sqrt(np.mean(errors ** 2)))
    p95 = float(np.percentile(errors, 95))
    if rms > 4 or p95 > 8:
        raise StitchError("QUALITY_REJECTED", f"Alignment error is too large (RMS {rms:.2f}px, p95 {p95:.2f}px)")
    inliers = [row for row, error in zip(points, errors) if error <= 8]
    _pairs(inliers, "QUALITY_REJECTED")
    return AlignmentQuality(len(points), len(inliers), rms, p95)


def crop_coverage(source: Path, target: Path) -> tuple[int, float, float]:
    with Image.open(source) as image:
        if image.size != (4096, 2048) or "A" not in image.getbands():
            raise StitchError("INSUFFICIENT_COVERAGE", "Expected a 4096x2048 spherical render with alpha")
        image.load()
        alpha = np.asarray(image.getchannel("A"))
        # Require actual opaque coverage at every longitude, including the seam.
        # Accepting a row with a missing 2% would hide a 7.2-degree hole.
        full_rows = (alpha >= 254).all(axis=1)
        padded = np.r_[False, full_rows, False].astype(int)
        starts = np.flatnonzero(np.diff(padded) == 1)
        ends = np.flatnonzero(np.diff(padded) == -1)
        if len(starts) == 0:
            raise StitchError("INSUFFICIENT_COVERAGE", "No rows cover all 360 degrees")
        selected = int(np.argmax(ends - starts))
        top, bottom = int(starts[selected]), int(ends[selected])
        vaov = (bottom - top) * 180.0 / 2048
        offset = 90.0 - (top + bottom) * 90.0 / 2048
        if vaov < 40 or not -70 <= offset <= 70:
            raise StitchError("INSUFFICIENT_COVERAGE", "Measured vertical coverage is outside the supported range")
        image.crop((0, top, 4096, bottom)).convert("RGB").save(target, format="PNG")
        return bottom - top, vaov, offset
