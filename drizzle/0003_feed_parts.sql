CREATE TABLE catalog_feed_parts (
  tld TEXT NOT NULL,
  part INTEGER NOT NULL,
  records TEXT NOT NULL,
  PRIMARY KEY (tld, part)
);
