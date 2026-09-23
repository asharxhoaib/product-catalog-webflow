-- product-catalog-webflow: local persistence schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS installations (
  site_id        TEXT PRIMARY KEY,
  access_token   TEXT NOT NULL,
  scopes         TEXT NOT NULL,
  installed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  uninstalled_at TEXT
);

-- Target CMS collection + field mapping config for this site's sync.
CREATE TABLE IF NOT EXISTS mapping_configs (
  id               TEXT PRIMARY KEY,
  site_id          TEXT NOT NULL REFERENCES installations(site_id) ON DELETE CASCADE,
  collection_id    TEXT NOT NULL,
  field_map_json   TEXT NOT NULL DEFAULT '{}',   -- CMS field slug -> source field name
  dry_run          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id)
);

-- Local mirror of each synced product, keyed by source SKU, tracking the linked CMS item.
CREATE TABLE IF NOT EXISTS synced_items (
  id                TEXT PRIMARY KEY,
  site_id           TEXT NOT NULL REFERENCES installations(site_id) ON DELETE CASCADE,
  sku               TEXT NOT NULL,
  cms_item_id       TEXT,
  last_source_hash  TEXT NOT NULL,               -- hash of the source record, for diffing
  manual_override   INTEGER NOT NULL DEFAULT 0,  -- set when a webhook detects an in-Webflow manual edit
  archived          INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, sku)
);

-- Content-hash-deduped image uploads, so re-syncs don't re-upload unchanged images.
CREATE TABLE IF NOT EXISTS image_assets (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES installations(site_id) ON DELETE CASCADE,
  content_hash  TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  webflow_asset_id TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, content_hash)
);

-- One row per sync run, with summary counts and an error list.
CREATE TABLE IF NOT EXISTS sync_runs (
  id             TEXT PRIMARY KEY,
  site_id        TEXT NOT NULL REFERENCES installations(site_id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  dry_run        INTEGER NOT NULL DEFAULT 0,
  created_count  INTEGER NOT NULL DEFAULT 0,
  updated_count  INTEGER NOT NULL DEFAULT 0,
  archived_count INTEGER NOT NULL DEFAULT 0,
  skipped_count  INTEGER NOT NULL DEFAULT 0,
  error_json     TEXT NOT NULL DEFAULT '[]',
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_synced_items_site ON synced_items(site_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_site ON sync_runs(site_id, started_at DESC);
