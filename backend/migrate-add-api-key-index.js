#!/usr/bin/env node

/**
 * Migration: Add `api_key_index` column to `ai_grades` table if not exists
 */

const db = require('./db');

async function migrate() {
  try {
    console.log('[MIGRATE] Checking for api_key_index column in ai_grades...');
    // Try to add the column; SQLite will throw if column exists -> catch and ignore
    await db.sql`ALTER TABLE ai_grades ADD COLUMN api_key_index INTEGER DEFAULT NULL`;
    console.log('[MIGRATE] Column `api_key_index` added to ai_grades');
  } catch (err) {
    const m = err && err.message ? err.message : String(err);
    if (m && /duplicate column name|already exists/i.test(m)) {
      console.log('[MIGRATE] Column `api_key_index` already exists, skipping');
    } else if (m && /no such table/i.test(m)) {
      console.error('[MIGRATE] Table ai_grades does not exist. Ensure DB schema initialized first.');
      process.exit(1);
    } else {
      console.error('[MIGRATE] Error adding column:', m);
      process.exit(1);
    }
  }
  process.exit(0);
}

migrate();
