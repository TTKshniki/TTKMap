"""Rectangular room estimate from one equirectangular panorama (port of Panorame spatial-go detector).

Deterministic Manhattan-room heuristic, not a learned model: it fits four orthogonal floor/wall
boundaries to vertical colour changes. Occlusion, mirrors, non-rectangular rooms and dark glazing
can defeat it, so the result is always "inferred" and is never written to a map automatically.
Distances are in camera-height units; the caller supplies the metric camera height.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
import time
from typing import Callable

import numpy as np
from PIL import Image

MODEL = "builtin-manhattan-image-v1"
_COLUMNS = 120  # one azimuth sample every 3 degrees


class DetectionFailed(Exception):
    pass


@dataclass(frozen=True)
class Opening:
    kind: str  # window | door
    wall: int  # index of the wall from corner[wall] to corner[wall + 1]
    t_start: float  # position along that wall, 0..1
    t_end: float
    yaw_start: float
    yaw_end: float
    confidence: float


@dataclass(frozen=True)
class RoomFit:
    angle: float
    distances: tuple[float, float, float, float]  # to -Y, +X, +Y, -X walls in camera heights
    score: float
    support: float  # share of ALL azimuths with boundary evidence (occlusion is not hidden)

    def corners(self) -> list[tuple[float, float]]:
        d = self.distances
        return [(-d[3], -d[0]), (d[1], -d[0]), (d[1], d[2]), (-d[3], d[2])]


@dataclass(frozen=True)
class RoomObservation:
    fit: RoomFit
    confidence: float
    corners: list[tuple[float, float]]  # (yaw, pitch) degrees of the floor corners
    openings: list[Opening]


def normalize_yaw(yaw: float) -> float:
    return (yaw + 180) % 360 - 180


def local_yaw(x: float, y: float, angle: float) -> float:
    return normalize_yaw(math.degrees(math.atan2(x, -y)) + angle)


def _luminance(c: np.ndarray) -> float:
    return float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])


class _Evidence:
    def __init__(self, image: Image.Image, vaov: float, offset: float):
        width = 1024
        height = max(32, int(image.height * width / image.width))
        resized = image.convert("RGB").resize((width, height), Image.Resampling.BICUBIC)
        self.img = np.asarray(resized, dtype=np.float32) / 255
        self.w, self.h, self.vaov, self.offset = width, height, vaov, offset
        # Vertical colour change at each row for 120 columns, averaged over a 5-pixel-wide band.
        xs = (np.arange(_COLUMNS) * width // _COLUMNS)[:, None] + np.arange(-2, 3)
        band = self.img[:, xs % width].mean(axis=2)  # (h, columns, 3)
        cumulative = np.concatenate([np.zeros((1, _COLUMNS, 3), np.float32), np.cumsum(band, axis=0)])
        self.edge = np.zeros((_COLUMNS, height), np.float32)
        rows = np.arange(3, height - 3)
        up = (cumulative[rows] - cumulative[rows - 3]) / 3
        down = (cumulative[rows + 4] - cumulative[rows + 1]) / 3
        self.edge[:, rows] = np.abs(up - down).mean(axis=2).T
        azimuth = np.radians(np.arange(_COLUMNS) * 3 - 180)
        self._azimuth = azimuth

    def row(self, pitch):
        return (self.offset + self.vaov / 2 - pitch) / self.vaov * self.h

    def sample(self, yaw: float, pitch: float) -> np.ndarray:
        x = int((normalize_yaw(yaw) + 180) / 360 * self.w) % self.w
        y = min(self.h - 1, max(0, int(self.row(pitch))))
        return self.img[y, x]

    def evaluate(self, angle: float, d: tuple[float, float, float, float]) -> tuple[float, float]:
        low, high = self.offset - self.vaov / 2 + 1, min(-1.05, self.offset + self.vaov / 2 - 1)
        for side in range(4):  # every floor corner must be inside the visible crop
            pitch = -math.degrees(math.atan2(1, math.hypot(d[side], d[(side + 1) % 4])))
            if not low <= pitch <= high:
                return -1.0, 0.0
        a = self._azimuth - math.radians(angle)
        dx, dy = np.sin(a), -np.cos(a)
        with np.errstate(divide="ignore", invalid="ignore"):
            r = np.full(_COLUMNS, np.inf)
            r = np.where(dy < -1e-6, np.minimum(r, d[0] / -dy), r)
            r = np.where(dx > 1e-6, np.minimum(r, d[1] / dx), r)
            r = np.where(dy > 1e-6, np.minimum(r, d[2] / dy), r)
            r = np.where(dx < -1e-6, np.minimum(r, d[3] / -dx), r)
        rows = self.row(-np.degrees(np.arctan2(1, r)))
        valid = (rows >= 3) & (rows < self.h - 3)
        index = np.clip(np.floor(rows + 0.5).astype(int), 1, self.h - 2)
        columns = np.arange(_COLUMNS)
        value = np.maximum(self.edge[columns, index],
                           0.85 * np.maximum(self.edge[columns, index - 1], self.edge[columns, index + 1]))
        value = np.where(valid, value, 0)
        # Furniture may hide part of the perimeter: score the best 80 percent of azimuths,
        # but report support over all of them so an occluded wall is not presented as seen.
        scores = np.sort(np.minimum(value, 0.35))
        return float(scores[24:].sum() / 96), float((value > 0.045).mean())


def _fit(evidence: _Evidence, deadline: float, checkpoint: Callable[[], None]) -> RoomFit:
    candidates = [0.9 * (75 / 0.9) ** (i / 24) for i in range(25)]
    best = RoomFit(0, (3, 3, 3, 3), -1, 0)
    for step in range(12):
        angle = step * 7.5
        for initial in (3.0, 8.0, 20.0):
            checkpoint()
            d = [initial] * 4
            score, support = evidence.evaluate(angle, tuple(d))
            for _ in range(4):
                for side in range(4):
                    chosen = (score, support, d[side])
                    for candidate in candidates:
                        test = d.copy()
                        test[side] = candidate
                        result = evidence.evaluate(angle, tuple(test))
                        if result[0] > chosen[0]:
                            chosen = (*result, candidate)
                    score, support, d[side] = chosen
            if score > best.score:
                best = RoomFit(angle, tuple(d), score, support)
            if time.monotonic() > deadline:
                raise DetectionFailed("Room analysis exceeded its time limit")
    for refinement in range(4):
        step = 2 / 2 ** refinement
        for delta in (-step, step):
            score, support = evidence.evaluate(best.angle + delta, best.distances)
            if score > best.score:
                best = RoomFit(best.angle + delta, best.distances, score, support)
        for side in range(4):
            for factor in (0.88, 0.94, 1.06, 1.12):
                d = list(best.distances)
                d[side] *= factor
                score, support = evidence.evaluate(best.angle, tuple(d))
                if score > best.score:
                    best = RoomFit(best.angle, tuple(d), score, support)
    if best.score < 0.05 or best.support < 0.28:
        raise DetectionFailed("The panorama has too few consistent floor boundaries for an automatic plan")
    return best


def _openings(evidence: _Evidence, corners: list[tuple[float, float]], angle: float) -> list[Opening]:
    steps, low, high = 120, evidence.offset - evidence.vaov / 2 + 2, evidence.offset + evidence.vaov / 2 - 2
    result = []
    for wall, (ax, ay) in enumerate(corners):
        bx, by = corners[(wall + 1) % 4]

        def at(t):
            return ax + (bx - ax) * t, ay + (by - ay) * t

        def colour(t, z):  # z: height in camera-height units; the metric scale cancels out
            x, y = at(t)
            return evidence.sample(local_yaw(x, y, angle), math.degrees(math.atan2(z - 1, math.hypot(x, y))))

        bright, dark = [False] * steps, [False] * steps
        upper: list[list[tuple[float, float]]] = [[] for _ in range(steps)]
        for i in range(2, steps - 2):
            t = (i + 0.5) / steps
            x, y = at(t)
            r = math.hypot(x, y)
            for z in (1.1, 1.35, 1.65, 2.0, 2.4):
                if low <= math.degrees(math.atan2(z - 1, r)) <= high:
                    c = colour(t, z)
                    upper[i].append((_luminance(c), float(c[2])))
            dark[i] = sum(math.degrees(math.atan2(z - 1, r)) >= low and _luminance(colour(t, z)) < 0.2
                          for z in (0.15, 0.4, 0.65, 1.0)) == 4
        # Glazing must stand out from this wall: a plain white wall is not a window.
        wall_level = float(np.median([lum for samples in upper for lum, _ in samples] or [1.0]))
        for i, samples in enumerate(upper):
            light = sum(lum > max(0.6, wall_level + 0.12) and blue > 0.48 for lum, blue in samples)
            bright[i] = len(samples) >= 3 and light / len(samples) >= 0.6
        filled = bright.copy()  # bridge narrow mullions, not large opaque wall sections
        for i in range(3, steps - 3):
            if not bright[i] and bright[i - 1] and (bright[i + 1] or bright[i + 2]):
                filled[i] = True
        for kind, mask in (("window", filled), ("door", dark)):
            start = -1
            for i in range(steps + 1):
                on = i < steps and mask[i]
                if on and start < 0:
                    start = i
                if on or start < 0:
                    continue
                t1, t2 = start / steps, i / steps
                if kind == "window":
                    valid = 4 <= i - start <= steps * 0.8
                else:
                    valid = 3 <= i - start <= 16 and start > 2 and i < steps - 2
                    if valid:  # demand a darker interior than both door jambs at several heights
                        edges = sum(_luminance(colour(t - 0.012 * side, z)) - _luminance(colour(t + 0.012 * side, z)) > 0.15
                                    for z in (0.25, 0.65, 1.0) for t, side in ((t1, 1), (t2, -1)))
                        valid = edges >= 5
                if valid:
                    result.append(Opening(kind, wall, t1, t2, local_yaw(*at(t1), angle), local_yaw(*at(t2), angle), 0.7))
                start = -1
    return result


def detect_room(image: Image.Image, vaov_deg: float, v_offset_deg: float, *,
                timeout_s: float = 12, checkpoint: Callable[[], None] = lambda: None) -> RoomObservation:
    """Raises DetectionFailed when the image does not support a rectangular room."""
    evidence = _Evidence(image, vaov_deg, v_offset_deg)
    fit = _fit(evidence, time.monotonic() + timeout_s, checkpoint)
    corners = fit.corners()
    return RoomObservation(
        fit=fit,
        confidence=0.55 + 0.4 * fit.support,
        corners=[(local_yaw(x, y, fit.angle), -math.degrees(math.atan2(1, math.hypot(x, y)))) for x, y in corners],
        openings=_openings(evidence, corners, fit.angle),
    )
