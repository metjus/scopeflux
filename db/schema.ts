import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const watchlist=sqliteTable('watchlist',{userId:text('user_id').notNull(),domain:text('domain').notNull(),snapshot:text('snapshot').notNull(),checkedAt:text('checked_at').notNull()},t=>[primaryKey({columns:[t.userId,t.domain]})]);
export const catalogFeeds=sqliteTable('catalog_feeds',{tld:text('tld').primaryKey(),records:text('records').notNull(),checkedAt:text('checked_at').notNull()});
export const catalogHistory=sqliteTable('catalog_history',{domain:text('domain').primaryKey(),tld:text('tld').notNull(),releaseAt:text('release_at').notNull(),snapshot:text('snapshot').notNull(),checkedAt:text('checked_at').notNull()},t=>[index('catalog_history_release_idx').on(t.releaseAt,t.tld)]);

export const catalogFeedParts=sqliteTable('catalog_feed_parts',{tld:text('tld').notNull(),part:integer('part').notNull(),records:text('records').notNull()},t=>[primaryKey({columns:[t.tld,t.part]})]);
