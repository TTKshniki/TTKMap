-- Explicit v1 -> v2 migration; run only through `python -m backend.app.cli migrate`,
-- which takes a verified backup first and applies this file in one transaction.
ALTER TABLE sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'cookie' CHECK(kind IN ('cookie','bearer'));
ALTER TABLE shapes ADD COLUMN floor_id TEXT REFERENCES floors(id);
ALTER TABLE shapes ADD COLUMN height_m REAL CHECK(height_m IS NULL OR (height_m>0 AND height_m<=100));
ALTER TABLE nav_nodes ADD COLUMN floor_id TEXT REFERENCES floors(id);
ALTER TABLE nav_edges ADD COLUMN kind TEXT NOT NULL DEFAULT 'walk' CHECK(kind IN ('walk','door','stairs','elevator','ramp'));
ALTER TABLE nav_edges ADD COLUMN cost_units REAL CHECK(cost_units IS NULL OR cost_units>0);
ALTER TABLE pois ADD COLUMN floor_id TEXT REFERENCES floors(id);
ALTER TABLE panoramas ADD COLUMN floor_id TEXT REFERENCES floors(id);
-- Schema v2: buildings/floors, bearer sessions and visitor analytics.
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  kind TEXT NOT NULL CHECK(kind IN ('building','outdoor')),
  outline_json TEXT CHECK(outline_json IS NULL OR (json_valid(outline_json) AND json_type(outline_json)='array')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(map_id,id)
) STRICT;
CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  building_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK(level BETWEEN -20 AND 200),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  elevation_m REAL NOT NULL DEFAULT 0 CHECK(elevation_m BETWEEN -500 AND 2000),
  height_m REAL NOT NULL DEFAULT 3 CHECK(height_m>0 AND height_m<=100),
  background_asset_id TEXT,
  background_kind TEXT NOT NULL DEFAULT 'plan' CHECK(background_kind='plan'),
  UNIQUE(map_id,id),
  UNIQUE(building_id,level),
  FOREIGN KEY(map_id,building_id) REFERENCES buildings(map_id,id) ON DELETE CASCADE,
  FOREIGN KEY(map_id,background_asset_id,background_kind) REFERENCES assets(map_id,id,kind)
) STRICT;
CREATE TRIGGER IF NOT EXISTS shapes_floor_same_map_insert BEFORE INSERT ON shapes
WHEN NEW.floor_id IS NOT NULL AND (SELECT map_id FROM floors WHERE id=NEW.floor_id) IS NOT NEW.map_id
BEGIN SELECT RAISE(ABORT,'floor belongs to another map'); END;
CREATE TRIGGER IF NOT EXISTS shapes_floor_same_map_update BEFORE UPDATE OF floor_id,map_id ON shapes
WHEN NEW.floor_id IS NOT NULL AND (SELECT map_id FROM floors WHERE id=NEW.floor_id) IS NOT NEW.map_id
BEGIN SELECT RAISE(ABORT,'floor belongs to another map'); END;
CREATE TRIGGER IF NOT EXISTS nav_nodes_floor_same_map_insert BEFORE INSERT ON nav_nodes
WHEN NEW.floor_id IS NOT NULL AND (SELECT map_id FROM floors WHERE id=NEW.floor_id) IS NOT NEW.map_id
BEGIN SELECT RAISE(ABORT,'floor belongs to another map'); END;
CREATE TRIGGER IF NOT EXISTS nav_nodes_floor_same_map_update BEFORE UPDATE OF floor_id,map_id ON nav_nodes
WHEN NEW.floor_id IS NOT NULL AND (SELECT map_id FROM floors WHERE id=NEW.floor_id) IS NOT NEW.map_id
BEGIN SELECT RAISE(ABORT,'floor belongs to another map'); END;
CREATE TRIGGER IF NOT EXISTS pois_floor_same_map_insert BEFORE INSERT ON pois
WHEN NEW.floor_id IS NOT NULL AND (SELECT map_id FROM floors WHERE id=NEW.floor_id) IS NOT NEW.map_id
BEGIN SELECT RAISE(ABORT,'floor belongs to another map'); END;
CREATE TRIGGER IF NOT EXISTS pois_floor_same_map_update BEFORE UPDATE OF floor_id,map_id ON pois
WHEN NEW.floor_id IS NOT NULL AND (SELECT map_id FROM floors WHERE id=NEW.floor_id) IS NOT NEW.map_id
BEGIN SELECT RAISE(ABORT,'floor belongs to another map'); END;
CREATE TRIGGER IF NOT EXISTS panoramas_floor_same_map_insert BEFORE INSERT ON panoramas
WHEN NEW.floor_id IS NOT NULL AND (SELECT map_id FROM floors WHERE id=NEW.floor_id) IS NOT NEW.map_id
BEGIN SELECT RAISE(ABORT,'floor belongs to another map'); END;
CREATE TRIGGER IF NOT EXISTS panoramas_floor_same_map_update BEFORE UPDATE OF floor_id,map_id ON panoramas
WHEN NEW.floor_id IS NOT NULL AND (SELECT map_id FROM floors WHERE id=NEW.floor_id) IS NOT NEW.map_id
BEGIN SELECT RAISE(ABORT,'floor belongs to another map'); END;
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('map_view','poi_click','route_built')),
  poi_id TEXT,
  visitor_id TEXT NOT NULL CHECK(length(visitor_id)=36),
  source TEXT NOT NULL CHECK(source IN ('web','embed','android')),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  CHECK((event_type='poi_click' AND poi_id IS NOT NULL) OR (event_type='map_view' AND poi_id IS NULL) OR event_type='route_built')
) STRICT;
CREATE INDEX IF NOT EXISTS analytics_events_map_time_idx ON analytics_events(map_id,occurred_at);
PRAGMA user_version=2;
