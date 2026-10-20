-- Baseline schema from existing Cloudflare D1 tables. Import data separately.
-- Use utf8mb4 for domain snapshots and user names.
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY, email VARCHAR(254) NOT NULL,
  name VARCHAR(255) NOT NULL, created_at VARCHAR(35) NOT NULL,
  last_login_at VARCHAR(35) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS watchlist (
  user_id VARCHAR(255) NOT NULL,
  domain VARCHAR(253) NOT NULL,
  snapshot LONGTEXT NOT NULL,
  checked_at VARCHAR(35) NOT NULL,
  PRIMARY KEY (user_id,domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS catalog_feeds (
  tld VARCHAR(63) PRIMARY KEY,
  records LONGTEXT NOT NULL,
  checked_at VARCHAR(35) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS catalog_feed_parts (
  tld VARCHAR(63) NOT NULL,
  part INT NOT NULL,
  records LONGTEXT NOT NULL,
  PRIMARY KEY(tld,part)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS catalog_preview (
  tld VARCHAR(63) PRIMARY KEY,
  records LONGTEXT NOT NULL,
  total INT NOT NULL,
  checked_at VARCHAR(35) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS catalog_history (
  domain VARCHAR(253) PRIMARY KEY,
  tld VARCHAR(63) NOT NULL,
  release_at VARCHAR(35) NOT NULL,
  snapshot LONGTEXT NOT NULL,
  checked_at VARCHAR(35) NOT NULL,
  INDEX catalog_history_release_idx (release_at,tld)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
