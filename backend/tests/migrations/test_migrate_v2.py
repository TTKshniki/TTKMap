"""v1 -> v2 must keep every row, back up first, and equal a fresh v2 schema."""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

import pytest

from backend.app import maintenance
from backend.app.config import settings
from backend.app.db import SCHEMA_PATH, SCHEMA_VERSION, connect, initialize_database

V1 = Path(__file__).parents[1] / "fixtures" / "schema_v1.sql"
USER, MAP = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
A, B, E, P = (f"{n}3333333-3333-4333-8333-333333333333" for n in "4567")


@pytest.fixture()
def v1_database(tmp_path: Path):
    db_file, media = tmp_path / "v1.sqlite", tmp_path / "media"
    media.mkdir()
    db = connect(db_file)
    db.executescript(V1.read_text(encoding="utf-8"))
    db.execute("INSERT INTO users(id,email,password_hash) VALUES(?,?,?)", (USER, "o@example.test", "$argon2id$x"))
    db.execute("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES('h',?,'c','2999-01-01T00:00:00Z')", (USER,))
    db.execute("INSERT INTO maps(id,owner_id,slug,title,width_units,height_units,max_walk_gap_units) VALUES(?,?,?,?,?,?,?)",
               (MAP, USER, "a" * 26, "Old", 100, 100, 10))
    db.execute("INSERT INTO nav_nodes(id,map_id,x,y) VALUES(?,?,1,1),(?,?,5,5)", (A, MAP, B, MAP))
    db.execute("INSERT INTO nav_edges(id,map_id,a,b) VALUES(?,?,?,?)", (E, MAP, A, B))
    db.execute("INSERT INTO pois(id,map_id,title,category,x,y,nav_node_id) VALUES(?,?,'Hall','hall',1,1,?)", (P, MAP, A))
    db.close()
    saved = settings.database_path, settings.media_path
    object.__setattr__(settings, "database_path", db_file)
    object.__setattr__(settings, "media_path", media)
    try:
        yield db_file
    finally:
        object.__setattr__(settings, "database_path", saved[0])
        object.__setattr__(settings, "media_path", saved[1])


def _structure(db):
    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    result = {name: (sorted(tuple(r[1:]) for r in db.execute(f"PRAGMA table_info({name})")),
                     sorted(tuple(r[2:]) for r in db.execute(f"PRAGMA foreign_key_list({name})")))
              for name in tables}
    result["objects"] = sorted(r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"))
    sql = " ".join(r[0] for r in db.execute("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL"))
    result["checks"] = sorted(set(re.findall(r"CHECK ?\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)", sql)))
    return result


def test_server_refuses_to_open_v1_without_migration(v1_database):
    with pytest.raises(RuntimeError, match="explicit migration"):
        initialize_database(v1_database)


def test_migration_backs_up_and_preserves_rows(v1_database, tmp_path):
    assert maintenance.migrate(tmp_path / "backup") == SCHEMA_VERSION == 2
    manifest = json.loads((tmp_path / "backup" / "manifest.json").read_text())
    assert manifest["schema_version"] == 1
    backup = sqlite3.connect(tmp_path / "backup" / "database.sqlite")
    assert backup.execute("PRAGMA user_version").fetchone()[0] == 1
    backup.close()

    db = connect(v1_database)
    assert db.execute("SELECT kind FROM sessions").fetchone()[0] == "cookie"
    assert tuple(db.execute("SELECT kind,cost_units FROM nav_edges").fetchone()) == ("walk", None)
    assert tuple(db.execute("SELECT title,floor_id FROM pois").fetchone()) == ("Hall", None)
    assert db.execute("SELECT count(*) FROM nav_nodes WHERE floor_id IS NULL").fetchone()[0] == 2
    fresh = sqlite3.connect(":memory:")
    fresh.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert _structure(db) == _structure(fresh)
    db.close()
    initialize_database(v1_database)  # now opens normally
    assert maintenance.migrate(tmp_path / "unused") == 2 and not (tmp_path / "unused").exists()


def test_failed_migration_rolls_back(v1_database, tmp_path, monkeypatch):
    broken = tmp_path / "broken.sql"
    good = maintenance.MIGRATIONS[1].read_text(encoding="utf-8")
    broken.write_text(good.replace("PRAGMA user_version=2;", "INSERT INTO no_such_table VALUES(1);"))
    monkeypatch.setitem(maintenance.MIGRATIONS, 1, broken)
    with pytest.raises(sqlite3.OperationalError):
        maintenance.migrate(tmp_path / "backup")
    db = connect(v1_database)
    assert db.execute("PRAGMA user_version").fetchone()[0] == 1
    assert "kind" not in [r[1] for r in db.execute("PRAGMA table_info(sessions)")]
    assert db.execute("SELECT name FROM sqlite_master WHERE name='floors'").fetchone() is None
    db.close()
