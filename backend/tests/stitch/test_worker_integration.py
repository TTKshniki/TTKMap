from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app.auth import clear_login_failures, create_organizer
from backend.app.config import settings
from backend.app.db import initialize_database
from backend.app.main import create_app
from backend.worker.jobs import process_one_capture
from backend.worker.lease import ProgressTracker
from backend.tests.stitch.conftest import fake_stitcher

EMAIL = "venue@example.test"
PASSWORD = "worker-integration-123"


def jpeg_bytes(index: int) -> bytes:
    """A real decodable frame; the API re-encodes and hashes every upload."""
    image = Image.new("RGB", (120 + index, 90 + index), (index * 12 % 255, 80, 120))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=80)
    return buffer.getvalue()


@pytest.fixture()
def api(tmp_path: Path):
    db_file = tmp_path / "worker_e2e.sqlite"
    media_dir = tmp_path / "media"
    original = (settings.database_path, settings.media_path, settings.app_origin)
    object.__setattr__(settings, "database_path", db_file)
    object.__setattr__(settings, "media_path", media_dir)
    object.__setattr__(settings, "app_origin", "http://testserver")
    try:
        clear_login_failures()
        initialize_database(db_file)
        media_dir.mkdir(parents=True, exist_ok=True)
        create_organizer(EMAIL, PASSWORD)
        with TestClient(create_app()) as client:
            yield client
    finally:
        object.__setattr__(settings, "database_path", original[0])
        object.__setattr__(settings, "media_path", original[1])
        object.__setattr__(settings, "app_origin", original[2])


def organizer_headers(client: TestClient) -> dict[str, str]:
    origin = {"Origin": "http://testserver"}
    login = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD}, headers=origin)
    assert login.status_code == 200, login.text
    return {**origin, "X-CSRF-Token": login.json()["csrf_token"]}


def create_map(client: TestClient, headers: dict[str, str]) -> str:
    response = client.post(
        "/api/v1/maps",
        json={
            "title": "Интеграционная карта",
            "description": "",
            "width_units": 500,
            "height_units": 500,
            "scale_m_per_unit": 0.05,
            "max_walk_gap_units": 100,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["snapshot"]["id"]


def upload_series(client: TestClient, headers: dict[str, str], map_id: str) -> str:
    capture = client.post(
        f"/api/v1/maps/{map_id}/captures",
        json={"title": "Панорама зала", "x": 120, "y": 130, "hfov_hint_deg": 65},
        headers=headers,
    )
    assert capture.status_code == 201, capture.text
    capture_id = capture.json()["id"]

    for index in range(16):
        uploaded = client.put(
            f"/api/v1/maps/{map_id}/captures/{capture_id}/frames/{index}",
            files={"file": (f"frame-{index}.jpg", jpeg_bytes(index), "image/jpeg")},
            headers=headers,
        )
        assert uploaded.status_code == 200, uploaded.text
    return capture_id


def test_api_to_worker_full_panorama_lifecycle(api: TestClient):
    headers = organizer_headers(api)
    map_id = create_map(api, headers)
    capture_id = upload_series(api, headers, map_id)

    queued = api.post(f"/api/v1/maps/{map_id}/captures/{capture_id}/stitch", headers=headers)
    assert queued.status_code == 202, queued.text
    assert queued.json()["state"] == "queued"

    outcome = process_one_capture(stitcher=fake_stitcher(vaov=165.0, v_offset=-4.0), tools_check=lambda: [])
    assert outcome.status == "succeeded"

    status = api.get(f"/api/v1/maps/{map_id}/captures/{capture_id}", headers=headers).json()
    assert status["state"] == "succeeded"
    assert status["progress"] == 100
    assert status["result_asset_id"]
    assert status["error_code"] is None
    assert status["finished_at"] is not None

    assets = api.get(f"/api/v1/maps/{map_id}/assets", headers=headers).json()
    stitched = next(item for item in assets if item["id"] == status["result_asset_id"])
    assert stitched["source"] == "stitch"
    assert stitched["kind"] == "panorama"
    assert stitched["vaov_deg"] == 165.0
    assert stitched["v_offset_deg"] == -4.0

    media = api.get(stitched["mobile_url"], headers=headers)
    assert media.status_code == 200
    assert media.headers["content-type"] == "image/webp"
    assert len(media.content) > 0


def test_failed_stitch_is_visible_as_failed_and_retryable(api: TestClient):
    headers = organizer_headers(api)
    map_id = create_map(api, headers)
    capture_id = upload_series(api, headers, map_id)
    api.post(f"/api/v1/maps/{map_id}/captures/{capture_id}/stitch", headers=headers)

    def broken(frames, work_root, hfov, *, on_step=None, is_cancelled=None, frame_count=16):
        from backend.worker.stitching import StitchError

        if on_step is not None:
            on_step("features")
        raise StitchError("INSUFFICIENT_COVERAGE", "Measured full-width vertical coverage is below 40 degrees")

    outcome = process_one_capture(stitcher=broken, tools_check=lambda: [])
    assert outcome.status == "failed"

    failed = api.get(f"/api/v1/maps/{map_id}/captures/{capture_id}", headers=headers).json()
    assert failed["state"] == "failed"
    assert failed["error_code"] == "INSUFFICIENT_COVERAGE"
    assert 0 < failed["progress"] < 100
    assert failed["result_asset_id"] is None

    # The organizer can retry the same capture instead of reshooting everything.
    retry = api.post(f"/api/v1/maps/{map_id}/captures/{capture_id}/stitch", headers=headers)
    assert retry.status_code == 202, retry.text
    assert retry.json()["state"] == "queued"
    assert retry.json()["attempt"] == 2


def test_worker_ignores_a_capture_cancelled_before_it_polls(api: TestClient):
    headers = organizer_headers(api)
    map_id = create_map(api, headers)
    capture_id = upload_series(api, headers, map_id)
    api.post(f"/api/v1/maps/{map_id}/captures/{capture_id}/stitch", headers=headers)

    cancelled = api.post(f"/api/v1/maps/{map_id}/captures/{capture_id}/cancel", headers=headers)
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["state"] == "cancelled"

    outcome = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    assert outcome.processed is False
    state = api.get(f"/api/v1/maps/{map_id}/captures/{capture_id}", headers=headers).json()
    assert state["state"] == "cancelled"
    assets = api.get(f"/api/v1/maps/{map_id}/assets", headers=headers).json()
    assert [item for item in assets if item["source"] == "stitch"] == []


def test_progress_visible_to_the_capture_ui_while_running(api: TestClient):
    headers = organizer_headers(api)
    map_id = create_map(api, headers)
    capture_id = upload_series(api, headers, map_id)
    api.post(f"/api/v1/maps/{map_id}/captures/{capture_id}/stitch", headers=headers)

    seen: list[int] = []

    def stitcher(frames, work_root, hfov, *, on_step=None, is_cancelled=None, frame_count=16):
        def record(step: str) -> None:
            on_step(step)
            polled = api.get(f"/api/v1/maps/{map_id}/captures/{capture_id}", headers=headers).json()
            seen.append(polled["progress"])
            assert polled["state"] == "running"

        return fake_stitcher()(frames, work_root, hfov, on_step=record, is_cancelled=is_cancelled)

    outcome = process_one_capture(stitcher=stitcher, tools_check=lambda: [])
    assert outcome.status == "succeeded"
    assert seen == sorted(seen)
    assert seen[0] == ProgressTracker.STEPS["validate"]
    assert seen[-1] <= 95
