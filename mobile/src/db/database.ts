import { openDatabaseSync } from 'expo-sqlite'

export const db = openDatabaseSync('esnagging_mobile.db')

const SCHEMA_VERSION = 3

const columnExists = (table: string, column: string): boolean => {
  const rows = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
  return rows.some((row) => row.name === column)
}

const addColumnIfMissing = (table: string, column: string, definition: string) => {
  if (!columnExists(table, column)) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

/**
 * Versioned migrations via PRAGMA user_version. Fresh installs already get the
 * latest columns from the CREATE TABLE statements below, so every ALTER is
 * guarded by a table_info check — existing installs upgrade in place without
 * data loss and re-running is a no-op.
 */
const runMigrations = () => {
  const versionRow = db.getFirstSync<{ user_version: number }>('PRAGMA user_version')
  const currentVersion = versionRow?.user_version ?? 0

  if (currentVersion < 1) {
    // v1: DLP layer on snags + attachments enqueued against unsynced snags.
    addColumnIfMissing('snags_local', 'is_dlp', 'INTEGER DEFAULT 0')
    addColumnIfMissing('snags_local', 'cluster', 'TEXT')
    addColumnIfMissing('snags_local', 'toc_reference', 'TEXT')
    addColumnIfMissing('snags_local', 'trade', 'TEXT')
    addColumnIfMissing('attachments_local', 'snag_client_uuid', 'TEXT')
  }

  if (currentVersion < 2) {
    // v2: org-scoped local cache. Reference tables (buildings/floors/locations/
    // floor_map_zones/equipment/equipment_logs) already carry organization_id via
    // their CREATE TABLE; only the mutable local tables need the new column. The
    // one-time backfill of existing rows to the active org runs in store.ts once
    // the active org is first set — the column is left NULL here.
    addColumnIfMissing('snags_local', 'organization_id', 'INTEGER')
    addColumnIfMissing('operations_queue', 'organization_id', 'INTEGER')
    addColumnIfMissing('comments_local', 'organization_id', 'INTEGER')
    addColumnIfMissing('attachments_local', 'organization_id', 'INTEGER')
    addColumnIfMissing('sync_conflicts', 'organization_id', 'INTEGER')
    // equipment_local / equipment_logs_local were created without organization_id
    // (unlike buildings/floors/locations/zones which already carry it). The pull
    // payload includes organization_id for these rows, so scope them the same way.
    addColumnIfMissing('equipment_local', 'organization_id', 'INTEGER')
    addColumnIfMissing('equipment_logs_local', 'organization_id', 'INTEGER')
  }

  if (currentVersion < 3) {
    // v3: operational snags (raised e.g. during an inspection) carry no drawing/pin.
    // The existing drawing_id/pin_x/pin_y columns are NOT NULL, so operational snags
    // store 0 sentinels locally and the snag_type column distinguishes them; the sync
    // payload sends true nulls to the server.
    addColumnIfMissing('snags_local', 'snag_type', "TEXT DEFAULT 'construction'")
    addColumnIfMissing('snags_local', 'source_organization_id', 'INTEGER')
  }

  if (currentVersion !== SCHEMA_VERSION) {
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  }
}

export const initializeDatabase = () => {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS snags_local (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER UNIQUE,
      client_uuid TEXT UNIQUE,
      organization_id INTEGER,
      reference TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      drawing_id INTEGER NOT NULL,
      building_id INTEGER,
      floor_id INTEGER,
      location_id INTEGER,
      equipment_id INTEGER,
      pin_x REAL NOT NULL,
      pin_y REAL NOT NULL,
      snag_type TEXT DEFAULT 'construction',
      source_organization_id INTEGER,
      assigned_to INTEGER,
      due_date TEXT,
      trade TEXT,
      is_dlp INTEGER DEFAULT 0,
      cluster TEXT,
      toc_reference TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_dirty INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS snags_local_server_id_idx ON snags_local (server_id);
    CREATE INDEX IF NOT EXISTS snags_local_updated_at_idx ON snags_local (updated_at);
    CREATE INDEX IF NOT EXISTS snags_local_status_idx ON snags_local (status);

    CREATE TABLE IF NOT EXISTS comments_local (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER UNIQUE,
      client_uuid TEXT UNIQUE NOT NULL,
      organization_id INTEGER,
      snag_server_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS comments_local_snag_idx ON comments_local (snag_server_id, created_at);

    CREATE TABLE IF NOT EXISTS attachments_local (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER UNIQUE,
      client_uuid TEXT UNIQUE NOT NULL,
      organization_id INTEGER,
      snag_server_id INTEGER NOT NULL,
      snag_client_uuid TEXT,
      local_uri TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      upload_state TEXT NOT NULL,
      retries INTEGER DEFAULT 0,
      next_retry_at TEXT,
      remote_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attachments_local_state_idx ON attachments_local (upload_state, next_retry_at);

    CREATE TABLE IF NOT EXISTS operations_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op_id TEXT UNIQUE NOT NULL,
      organization_id INTEGER,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retries INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS operations_queue_status_idx ON operations_queue (status, next_retry_at, created_at);

    CREATE TABLE IF NOT EXISTS buildings_local (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS buildings_local_project_idx ON buildings_local (project_id, updated_at);

    CREATE TABLE IF NOT EXISTS floors_local (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      building_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      level INTEGER,
      sort_order INTEGER,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS floors_local_building_idx ON floors_local (building_id, level, sort_order);
    CREATE INDEX IF NOT EXISTS floors_local_project_idx ON floors_local (project_id, updated_at);

    CREATE TABLE IF NOT EXISTS locations_local (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      floor_id INTEGER NOT NULL,
      building_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT,
      barcode TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS locations_local_floor_idx ON locations_local (floor_id, name);
    CREATE INDEX IF NOT EXISTS locations_local_barcode_idx ON locations_local (barcode);

    CREATE TABLE IF NOT EXISTS floor_map_zones_local (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      drawing_id INTEGER NOT NULL,
      drawing_revision_id INTEGER,
      floor_id INTEGER,
      location_id INTEGER NOT NULL,
      zone_label TEXT,
      x_min REAL NOT NULL,
      y_min REAL NOT NULL,
      x_max REAL NOT NULL,
      y_max REAL NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS floor_map_zones_local_floor_idx ON floor_map_zones_local (floor_id, priority, id);
    CREATE INDEX IF NOT EXISTS floor_map_zones_local_location_idx ON floor_map_zones_local (location_id, priority);

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op_id TEXT UNIQUE NOT NULL,
      organization_id INTEGER,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      operation_type TEXT NOT NULL,
      local_payload TEXT NOT NULL,
      server_payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolution TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS sync_conflicts_status_idx ON sync_conflicts (status, created_at);

    CREATE TABLE IF NOT EXISTS equipment_local (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      barcode TEXT,
      project_id INTEGER,
      location_id INTEGER,
      notes TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS equipment_local_status_idx ON equipment_local (status);
    CREATE INDEX IF NOT EXISTS equipment_local_barcode_idx ON equipment_local (barcode);

    CREATE TABLE IF NOT EXISTS equipment_logs_local (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER,
      equipment_id INTEGER NOT NULL,
      snag_id INTEGER,
      status TEXT NOT NULL,
      description TEXT,
      action_taken TEXT,
      occurred_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS equipment_logs_local_equipment_idx ON equipment_logs_local (equipment_id, occurred_at);
  `)

  runMigrations()
}

export const nowIso = () => new Date().toISOString()
