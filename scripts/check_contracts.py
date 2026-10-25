from __future__ import annotations

import sqlite3
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def check_openapi() -> None:
    document = yaml.safe_load((ROOT / "CONTRACTS/openapi.yaml").read_text(encoding="utf-8"))
    assert document.get("openapi") == "3.0.3"
    assert document.get("info", {}).get("title") == "TTKMap Space Map API"
    assert document.get("paths")

    def visit(value):
        if isinstance(value, dict):
            reference = value.get("$ref")
            if reference:
                assert reference.startswith("#/"), reference
                target = document
                for part in reference[2:].split("/"):
                    target = target[part.replace("~1", "/").replace("~0", "~")]
                assert target is not None, reference
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(document)
    assert "/api/v1/maps/{map_id}/document" in document["paths"]
    assert "/api/v1/public/maps/{slug}/route" in document["paths"]
    assert "/api/v1/items" not in document["paths"]


def check_schema() -> None:
    connection = sqlite3.connect(":memory:")
    connection.executescript((ROOT / "CONTRACTS/db_schema.sql").read_text(encoding="utf-8"))
    assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert connection.execute("PRAGMA user_version").fetchone()[0] == 2
    assert not connection.execute("PRAGMA foreign_key_check").fetchall()
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"maps", "pois", "panoramas", "hotspots", "captures", "capture_frames"} <= tables
    connection.close()


if __name__ == "__main__":
    check_openapi()
    check_schema()
    print("TTKMap OpenAPI and SQLite contracts are valid")
