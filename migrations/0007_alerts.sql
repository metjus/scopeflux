CREATE TABLE IF NOT EXISTS alert_settings (user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL, checked_at TEXT);
CREATE TABLE IF NOT EXISTS alert_sent (user_id TEXT NOT NULL, domain TEXT NOT NULL, release_at TEXT NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY (user_id, domain, release_at));
