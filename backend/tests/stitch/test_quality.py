from pathlib import Path

import numpy as np
from PIL import Image
import pytest

from backend.worker.processes import StitchError
from backend.worker.quality import alignment_quality, control_points, crop_coverage


def project_text(*, close=True):
    pairs = [(i, i + 1) for i in range(15)] + ([(0, 15)] if close else [])
    return "p f2 w4096 h2048 v360\n" + "i w40 h60 f0 v60\n" * 16 + "".join(
        f"c n{a} N{b} x{x} y10 X{x} Y10 t0\n" for a, b in pairs for x in range(4)
    )


def test_missing_closing_pair_is_not_a_sphere(tmp_path):
    project = tmp_path / "test.pto"
    project.write_text(project_text(close=False))
    with pytest.raises(StitchError) as error:
        control_points(project)
    assert error.value.code == "LOOP_NOT_CLOSED"


def test_repeated_control_points_do_not_count_as_inliers(tmp_path):
    project = tmp_path / "test.pto"
    project.write_text(project_text().replace("x1 y10 X1", "x0 y10 X0"))
    with pytest.raises(StitchError) as error:
        control_points(project)
    assert error.value.code == "NOT_ENOUGH_OVERLAP"


@pytest.mark.parametrize("error_px,accepted", [(0, True), (2, True), (20, False)])
def test_spherical_rms_gate(tmp_path, error_px, accepted):
    project = tmp_path / "test.pto"
    project.write_text(project_text())

    class Transform:
        def run(self, args, cwd, *, stdin):
            return "\n".join(f"{1000 + (i % 2) * error_px} 1024" for i in range(128))

    if accepted:
        quality = alignment_quality(project, Transform())
        assert quality.rms_px == pytest.approx(error_px)
        assert quality.inliers == 64
    else:
        with pytest.raises(StitchError) as error:
            alignment_quality(project, Transform())
        assert error.value.code == "QUALITY_REJECTED"


def test_wraparound_control_points_use_short_distance(tmp_path):
    project = tmp_path / "test.pto"
    project.write_text(project_text())

    class Transform:
        def run(self, args, cwd, *, stdin):
            return "\n".join(f"{4095 if i % 2 else 1} 1024" for i in range(128))

    assert alignment_quality(project, Transform()).rms_px == pytest.approx(2)


def test_transformed_points_must_be_finite(tmp_path):
    project = tmp_path / "test.pto"
    project.write_text(project_text())

    class Transform:
        def run(self, *args, **kwargs):
            return "nan 1024\n" * 128

    with pytest.raises(StitchError) as error:
        alignment_quality(project, Transform())
    assert error.value.code == "QUALITY_REJECTED"


def test_measured_crop_does_not_stretch(tmp_path):
    source, output = tmp_path / "source.png", tmp_path / "crop.png"
    rgba = np.zeros((2048, 4096, 4), dtype=np.uint8)
    rgba[600:1400, :, :] = 255
    Image.fromarray(rgba).save(source)
    height, vaov, offset = crop_coverage(source, output)
    assert height == 800
    assert vaov == pytest.approx(800 * 180 / 2048)
    assert offset == pytest.approx(90 - 2000 * 90 / 2048)
    with Image.open(output) as image:
        assert image.size == (4096, 800)


@pytest.mark.parametrize("kind", ["gap", "narrow", "noalpha", "wrongsize"])
def test_bad_coverage_is_rejected(tmp_path, kind):
    source = tmp_path / "source.png"
    rgba = np.zeros((2048, 4096, 4), dtype=np.uint8)
    rgba[600:1400, :, :] = 255
    if kind == "gap":
        rgba[:, 2040:2050, 3] = 0
    elif kind == "narrow":
        rgba[650:1400, :, 3] = 0
    image = Image.fromarray(rgba)
    if kind == "noalpha":
        image = image.convert("RGB")
    elif kind == "wrongsize":
        image = image.resize((1024, 512))
    image.save(source)
    with pytest.raises(StitchError) as error:
        crop_coverage(source, tmp_path / "crop.png")
    assert error.value.code == "INSUFFICIENT_COVERAGE"
