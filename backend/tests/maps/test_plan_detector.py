"""Rectangular room detector on ray-traced synthetic panoramas with known geometry."""
import math

import numpy as np
import pytest
from PIL import Image

from backend.app.modules.maps.plan_detector import DetectionFailed, detect_room, normalize_yaw

WALL, FLOOR, GLASS = (180, 190, 200), (50, 90, 45), (225, 238, 255)


def _room(half_x=4.0, half_y=3.0, width=1024, height=512, window=None):
    """Camera 1 unit above the floor of a box; window=(wall '+x', y0, y1) in plan units, z 1.2..2.2."""
    image = np.empty((height, width, 3), np.uint8)
    for column in range(width):
        yaw = math.radians(column / width * 360 - 180)
        dx, dy = math.sin(yaw), -math.cos(yaw)
        tx = half_x / abs(dx) if abs(dx) > 1e-9 else math.inf
        ty = half_y / abs(dy) if abs(dy) > 1e-9 else math.inf
        r = min(tx, ty)
        floor_pitch = -math.degrees(math.atan2(1, r))
        hit_y = dy * r
        for row in range(height):
            pitch = 90 - row / height * 180
            colour = FLOOR if pitch < floor_pitch else WALL
            if window and tx <= ty and dx > 0 and window[0] <= hit_y <= window[1]:
                z = 1 + r * math.tan(math.radians(pitch))
                if 1.2 <= z <= 2.2:
                    colour = GLASS
            image[row, column] = colour
    return Image.fromarray(image, "RGB")


def test_normalize_yaw():
    assert [normalize_yaw(v) for v in (0, 180, 270, 360, -45)] == [0, -180, -90, 0, -45]


def test_featureless_image_is_rejected():
    with pytest.raises(DetectionFailed):
        detect_room(Image.new("RGB", (512, 256), (128, 128, 128)), 180, 0)


def test_recovers_room_proportions_and_corners():
    observation = detect_room(_room(), 180, 0)
    d = observation.fit.distances
    ratio = (d[0] + d[2]) / (d[1] + d[3])
    ratio = max(ratio, 1 / ratio)
    assert abs(ratio - 4 / 3) < 0.15, observation.fit
    assert observation.fit.support > 0.8
    # Box corners (±4, ±3) are seen at yaw ±53.1° / ±126.9° and pitch -atan(1/5).
    expected_yaws = sorted(normalize_yaw(math.degrees(math.atan2(x, -y))) for x in (-4, 4) for y in (-3, 3))
    found = sorted(yaw for yaw, _ in observation.corners)
    if abs(found[0] - expected_yaws[0]) > 10:  # a 90° rotated fit is equivalent for a rectangle
        expected_yaws = sorted(normalize_yaw(y + 90) for y in expected_yaws)
    assert all(abs(a - b) < 6 for a, b in zip(found, expected_yaws)), (found, expected_yaws)
    assert all(abs(pitch + math.degrees(math.atan2(1, 5))) < 2.5 for _, pitch in observation.corners)
    assert 0.55 <= observation.confidence <= 0.95 + 1e-9
    assert not observation.openings, "a plain light wall must not be reported as glazing"


def test_detects_bright_window_on_the_right_wall():
    observation = detect_room(_room(window=(-1.5, 1.0)), 180, 0)
    windows = [o for o in observation.openings if o.kind == "window"]
    assert windows, observation.openings
    corners = observation.fit.corners()
    for opening in windows:
        a, b = corners[opening.wall], corners[(opening.wall + 1) % 4]
        mid = [a[i] + (b[i] - a[i]) * (opening.t_start + opening.t_end) / 2 for i in (0, 1)]
        # The fitted frame is rotated by fit.angle; turn the midpoint back into world yaw.
        yaw = normalize_yaw(math.degrees(math.atan2(mid[0], -mid[1])) + observation.fit.angle)
        assert 60 < yaw < 120, (yaw, opening)
