-- TTKMap SQLite schema; SQLite 3.40+, foreign keys/WAL enabled per connection.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
BEGIN;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL CHECK(password_hash LIKE '$argon2id$%'),
  role TEXT NOT NULL DEFAULT 'organizer' CHECK (role = 'organizer'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'cookie' CHECK(kind IN ('cookie','bearer'))
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug)=26 AND slug NOT GLOB '*[^a-z2-7]*'),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description)<=4000),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
  width_units INTEGER NOT NULL CHECK (width_units>0),
  height_units INTEGER NOT NULL CHECK (height_units>0),
  scale_m_per_unit REAL,
  max_walk_gap_units REAL NOT NULL CHECK (max_walk_gap_units>0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(id, owner_id)
) STRICT;
CREATE INDEX IF NOT EXISTS maps_owner_idx ON maps(owner_id);
CREATE TRIGGER IF NOT EXISTS maps_revision_step BEFORE UPDATE ON maps
WHEN NEW.revision <> OLD.revision + 1
BEGIN SELECT RAISE(ABORT,'map revision must increment exactly once'); END;
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('plan','panorama')),
  source TEXT NOT NULL CHECK (source IN ('upload','stitch')),
  width_px INTEGER NOT NULL CHECK (width_px>0),
  height_px INTEGER NOT NULL CHECK (height_px>0),
  projection TEXT,
  haov_deg REAL,
  vaov_deg REAL,
  v_offset_deg REAL,
  preview_key TEXT NOT NULL UNIQUE,
  mobile_key TEXT NOT NULL UNIQUE,
  full_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK ((kind='plan' AND source='upload' AND projection IS NULL AND haov_deg IS NULL AND vaov_deg IS NULL AND v_offset_deg IS NULL)
      OR (kind='panorama' AND projection='equirectangular' AND haov_deg=360 AND vaov_deg BETWEEN 40 AND 180 AND v_offset_deg BETWEEN -70 AND 70)),
  UNIQUE(map_id,id),
  UNIQUE(map_id,id,kind)
) STRICT;
CREATE TABLE IF NOT EXISTS shapes (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('wall','room','corridor')),
  label TEXT NOT NULL DEFAULT '',
  points_json TEXT NOT NULL CHECK (json_valid(points_json) AND json_type(points_json)='array'),
  floor_id TEXT REFERENCES floors(id),
  height_m REAL CHECK(height_m IS NULL OR (height_m>0 AND height_m<=100))
) STRICT;
CREATE TABLE IF NOT EXISTS map_backgrounds (
  map_id TEXT PRIMARY KEY NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  asset_kind TEXT NOT NULL DEFAULT 'plan' CHECK(asset_kind='plan'),
  FOREIGN KEY(map_id,asset_id,asset_kind) REFERENCES assets(map_id,id,kind) ON DELETE CASCADE
) STRICT;
CREATE TABLE IF NOT EXISTS nav_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  x REAL NOT NULL CHECK (x>=0),
  y REAL NOT NULL CHECK (y>=0),
  floor_id TEXT REFERENCES floors(id),
  UNIQUE(map_id,id)
) STRICT;
CREATE TABLE IF NOT EXISTS nav_edges (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'walk' CHECK(kind IN ('walk','door','stairs','elevator','ramp')),
  cost_units REAL CHECK(cost_units IS NULL OR cost_units>0),
  CHECK(a<b),
  UNIQUE(map_id,a,b),
  FOREIGN KEY(map_id,a) REFERENCES nav_nodes(map_id,id) ON DELETE CASCADE,
  FOREIGN KEY(map_id,b) REFERENCES nav_nodes(map_id,id) ON DELETE CASCADE
) STRICT;
CREATE TABLE IF NOT EXISTS pois (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  category TEXT NOT NULL CHECK(category IN ('booth','hall','entrance','service_desk','wifi','custom')),
  category_label TEXT,
  description TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL CHECK(x>=0),
  y REAL NOT NULL CHECK(y>=0),
  nav_node_id TEXT,
  floor_id TEXT REFERENCES floors(id),
  UNIQUE(map_id,id),
  FOREIGN KEY(map_id,nav_node_id) REFERENCES nav_nodes(map_id,id),
  CHECK((category='custom' AND category_label IS NOT NULL) OR (category<>'custom' AND category_label IS NULL))
) STRICT;
CREATE TABLE IF NOT EXISTS panoramas (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  asset_kind TEXT NOT NULL DEFAULT 'panorama' CHECK(asset_kind='panorama'),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  x REAL NOT NULL CHECK(x>=0),
  y REAL NOT NULL CHECK(y>=0),
  nav_node_id TEXT,
  heading_offset_deg REAL NOT NULL DEFAULT 0 CHECK(heading_offset_deg>=-180 AND heading_offset_deg<180),
  floor_id TEXT REFERENCES floors(id),
  UNIQUE(map_id,id),
  FOREIGN KEY(map_id,asset_id,asset_kind) REFERENCES assets(map_id,id,kind) ON DELETE CASCADE,
  FOREIGN KEY(map_id,nav_node_id) REFERENCES nav_nodes(map_id,id),
  UNIQUE(map_id,nav_node_id)
) STRICT;
CREATE TABLE IF NOT EXISTS hotspots (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  panorama_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('poi','transition')),
  yaw_deg REAL NOT NULL CHECK(yaw_deg>=-180 AND yaw_deg<180),
  pitch_deg REAL NOT NULL CHECK(pitch_deg>=-90 AND pitch_deg<=90),
  poi_id TEXT,
  target_panorama_id TEXT,
  FOREIGN KEY(map_id,panorama_id) REFERENCES panoramas(map_id,id) ON DELETE CASCADE,
  FOREIGN KEY(map_id,poi_id) REFERENCES pois(map_id,id) ON DELETE CASCADE,
  FOREIGN KEY(map_id,target_panorama_id) REFERENCES panoramas(map_id,id) ON DELETE CASCADE,
  CHECK((kind='poi' AND poi_id IS NOT NULL AND target_panorama_id IS NULL)
     OR (kind='transition' AND poi_id IS NULL AND target_panorama_id IS NOT NULL AND target_panorama_id<>panorama_id))
) STRICT;
CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY NOT NULL,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  x REAL NOT NULL CHECK(x>=0),
  y REAL NOT NULL CHECK(y>=0),
  hfov_hint_deg REAL NOT NULL CHECK(hfov_hint_deg BETWEEN 40 AND 85),
  state TEXT NOT NULL DEFAULT 'collecting' CHECK(state IN ('collecting','queued','running','succeeded','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 2),
  result_asset_id TEXT,
  result_kind TEXT NOT NULL DEFAULT 'panorama' CHECK(result_kind='panorama'),
  error_code TEXT,
  error_message TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY(map_id,result_asset_id,result_kind) REFERENCES assets(map_id,id,kind) ON DELETE CASCADE,
  CHECK (
    (state='collecting' AND attempt=0 AND progress=0 AND started_at IS NULL AND finished_at IS NULL
      AND result_asset_id IS NULL AND error_code IS NULL AND error_message IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (state='queued' AND attempt BETWEEN 1 AND 2 AND progress=0 AND started_at IS NULL AND finished_at IS NULL
      AND result_asset_id IS NULL AND error_code IS NULL AND error_message IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (state='running' AND attempt BETWEEN 1 AND 2 AND progress BETWEEN 1 AND 99 AND started_at IS NOT NULL AND finished_at IS NULL
      AND result_asset_id IS NULL AND error_code IS NULL AND error_message IS NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state='succeeded' AND attempt BETWEEN 1 AND 2 AND progress=100 AND started_at IS NOT NULL AND finished_at IS NOT NULL
      AND result_asset_id IS NOT NULL AND error_code IS NULL AND error_message IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (state='failed' AND attempt BETWEEN 1 AND 2 AND progress<100 AND finished_at IS NOT NULL
      AND result_asset_id IS NULL AND error_code IS NOT NULL AND error_message IS NOT NULL AND length(error_message)>0
      AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (state='cancelled' AND progress<100 AND finished_at IS NOT NULL
      AND result_asset_id IS NULL AND error_code IS NULL AND error_message IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
) STRICT;
CREATE INDEX IF NOT EXISTS captures_queue_idx ON captures(state,created_at);
CREATE TRIGGER IF NOT EXISTS captures_transition BEFORE UPDATE OF state ON captures
WHEN NEW.state<>OLD.state AND NOT (
  (OLD.state='collecting' AND NEW.state IN ('queued','cancelled'))
  OR (OLD.state='queued' AND NEW.state IN ('running','cancelled'))
  OR (OLD.state='running' AND NEW.state IN ('queued','succeeded','failed','cancelled'))
  OR (OLD.state='failed' AND NEW.state='queued')
)
BEGIN SELECT RAISE(ABORT,'invalid capture state transition'); END;
CREATE TRIGGER IF NOT EXISTS captures_retry BEFORE UPDATE OF state ON captures
WHEN NEW.state='queued' AND OLD.state<>'queued' AND NEW.attempt<>OLD.attempt+1
BEGIN SELECT RAISE(ABORT,'capture attempt must increment when queued'); END;
CREATE TABLE IF NOT EXISTS capture_frames (
  capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL CHECK(frame_index BETWEEN 0 AND 15),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  storage_key TEXT NOT NULL UNIQUE,
  width_px INTEGER NOT NULL CHECK(width_px>0),
  height_px INTEGER NOT NULL CHECK(height_px>0),
  PRIMARY KEY(capture_id,frame_index)
) STRICT;
CREATE TRIGGER IF NOT EXISTS capture_frames_insert_collecting BEFORE INSERT ON capture_frames
WHEN (SELECT state FROM captures WHERE id=NEW.capture_id)<>'collecting'
BEGIN SELECT RAISE(ABORT,'capture frames are sealed'); END;
CREATE TRIGGER IF NOT EXISTS capture_frames_update_collecting BEFORE UPDATE ON capture_frames
WHEN NEW.capture_id<>OLD.capture_id OR NEW.frame_index<>OLD.frame_index
  OR (SELECT state FROM captures WHERE id=NEW.capture_id)<>'collecting'
BEGIN SELECT RAISE(ABORT,'capture frames are sealed'); END;
CREATE TRIGGER IF NOT EXISTS maps_immutable_extent BEFORE UPDATE ON maps
WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.slug<>OLD.slug OR NEW.width_units<>OLD.width_units OR NEW.height_units<>OLD.height_units
BEGIN SELECT RAISE(ABORT,'map identity and extent are immutable'); END;
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
COMMIT;
