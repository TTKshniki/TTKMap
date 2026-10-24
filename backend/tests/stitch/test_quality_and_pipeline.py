from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from PIL import Image

from backend.worker import stitching
from backend.worker.stitching import (
    REQUIRED_TOOLS,
    StitchError,
    measure_coverage,
    missing_tools,
    stitch,
)


def spherical(width: int = 4096, height: int = 2048, band: tuple[int, int] = (0, 2048)) -> Image.Image:
    """RGBA canvas with an opaque horizontal band, like a Hugin render."""
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    top, bottom = band
    for y in range(top, bottom):
        for x in range(0, width, 64):
            image.putpixel((x, y), (120, 30, 40, 255))
        # Fill the row deterministically without a Python loop per pixel.
        image.paste((120, 30, 40, 255), (0, y, width, y + 1))
    return image


def test_full_sphere_measures_180_degrees():
    top, bottom, vaov, v_offset = measure_coverage(spherical())
    assert (top, bottom) == (0, 2048)
    assert vaov == pytest.approx(180.0)
    assert v_offset == pytest.approx(0.0, abs=0.01)


def test_narrow_capture_is_cropped_instead_of_stretched():
    # 120° of vertical coverage, horizon shifted down.
    band_top = 512
    band_bottom = 512 + int(2048 * 120 / 180)
    top, bottom, vaov, v_offset = measure_coverage(spherical(band=(band_top, band_bottom)))
    assert vaov == pytest.approx(120.0, abs=0.2)
    assert -70 <= v_offset <= 70
    assert bottom - top < 2048


def test_coverage_below_40_degrees_is_rejected():
    with pytest.raises(StitchError) as exc:
        measure_coverage(spherical(band=(900, 900 + 300)))
    assert exc.value.code == "INSUFFICIENT_COVERAGE"


def test_horizon_outside_supported_range_is_rejected():
    with pytest.raises(StitchError) as exc:
        measure_coverage(spherical(band=(1900, 2048)))
    assert exc.value.code == "INSUFFICIENT_COVERAGE"


def test_missing_alpha_channel_is_rejected():
    with pytest.raises(StitchError) as exc:
        measure_coverage(Image.new("RGB", (4096, 2048), (10, 20, 30)))
    assert exc.value.code == "INSUFFICIENT_COVERAGE"


def test_empty_render_is_rejected():
    with pytest.raises(StitchError):
        measure_coverage(Image.new("RGBA", (4096, 2048), (0, 0, 0, 0)))


def test_stitch_rejects_an_incomplete_frame_set(tmp_path: Path):
    frames = []
    for index in range(15):
        path = tmp_path / f"frame-{index}.jpg"
        path.write_bytes(b"jpeg")
        frames.append(path)
    with pytest.raises(StitchError) as exc:
        stitch(frames, tmp_path / "work")
    assert exc.value.code == "INPUT_EXPIRED"


def test_stitch_reports_every_missing_tool(tmp_path: Path, monkeypatch):
    frames = []
    for index in range(16):
        path = tmp_path / f"frame-{index}.jpg"
        path.write_bytes(b"jpeg")
        frames.append(path)

    monkeypatch.setattr(stitching.shutil, "which", lambda _name: None)
    with pytest.raises(StitchError) as exc:
        stitch(frames, tmp_path / "work")
    assert exc.value.code == "TOOL_FAILED"
    for tool in ("pto_gen", "cpfind", "enblend"):
        assert tool in str(exc.value)
    assert not (tmp_path / "work").exists(), "no work directory should be created without tools"


def test_missing_tools_lists_only_absent_binaries(monkeypatch):
    present = {"pto_gen", "cpfind"}
    monkeypatch.setattr(shutil, "which", lambda name: f"/usr/bin/{name}" if name in present else None)
    absent = missing_tools()
    assert "pto_gen" not in absent
    assert "enblend" in absent
    assert set(absent) <= set(REQUIRED_TOOLS)


def test_cancellation_is_honoured_before_the_first_tool_runs(tmp_path: Path):
    frames = []
    for index in range(16):
        path = tmp_path / f"frame-{index}.jpg"
        path.write_bytes(b"jpeg")
        frames.append(path)

    with pytest.raises(StitchError) as exc:
        stitch(frames, tmp_path / "work", is_cancelled=lambda: True)
    assert exc.value.code == "CANCELLED"
    assert not listed_work_dirs(tmp_path / "work")


def listed_work_dirs(root: Path) -> list[Path]:
    return list(root.glob("ttk-stitch-*")) if root.exists() else []
