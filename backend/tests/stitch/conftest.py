from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from PIL import Image

from backend.app.config import settings
from backend.app.db import database, initialize_database, transaction
from backend.app.modules.capture.service import claim_next_capture, store_capture_frame, submit_stitch


@pytest.fixture
def isolated_storage(tmp_path):
    original_db, original_media = settings.database_path, settings.media_path
    object.__setattr__(settings, "database_path", tmp_path / "worker.sqlite")
    object.__setattr__(settings, "media_path", tmp_path / "media")
    try:
        yield
    finally:
        object.__setattr__(settings, "database_path", original_db)
        object.__setattr__(settings, "media_path", original_media)


@pytest.fixture
def capture_job(isolated_storage):
    initialize_database()
    owner, map_id, capture_id = (str(uuid4()) for _ in range(3))
    with database() as db:
        with transaction(db, immediate=True):
            db.execute("INSERT INTO users(id,email,password_hash) VALUES(?,?,?)", (owner, "worker@example.test", "$argon2id$fixture"))
            db.execute("INSERT INTO maps(id,owner_id,slug,title,width_units,height_units,max_walk_gap_units) VALUES(?,?,?,?,?,?,?)",
                       (map_id, owner, "a" * 26, "Worker test", 500, 500, 100))
            db.execute("INSERT INTO captures(id,map_id,title,x,y,hfov_hint_deg) VALUES(?,?,?,?,?,?)",
                       (capture_id, map_id, "Capture", 10, 10, 60))
            for index in range(16):
                data = BytesIO()
                Image.new("RGB", (40, 60), (index * 15, 50, 90)).save(data, format="JPEG")
                row = db.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
                store_capture_frame(db, row, index, data.getvalue())
            row = db.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
            submit_stitch(db, row)
    return capture_id


@pytest.fixture
def running(capture_job):
    with database() as db:
        return dict(claim_next_capture(db))


@pytest.fixture
def real_frames():
    import json
    root = Path(__file__).resolve().parents[1] / "fixtures" / "stitch"
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    series = manifest["series"][0]
    frames = [root / series["id"] / item["filename"] for item in sorted(series["frames"], key=lambda item: item["index"])]
    assert len(frames) == 16 and all(frame.is_file() for frame in frames), "C1 real fixture series is missing"
    return frames
