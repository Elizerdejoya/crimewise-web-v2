#!/usr/bin/env node

/**
 * Migration: add events (audit) table
 * Safe to run multiple times; will skip if table already exists.
 */

const db = require('./db');

async function migrate() {
  try {
    console.log('[MIGRATE] Creating events table...');
    await db.sql`
      CREATE TABLE events (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER,
        actor_role TEXT,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('[MIGRATE] `events` table created');
  } catch (err) {
    const m = err && err.message ? err.message : String(err);
    if (/already exists|duplicate table|already exists/i.test(m) || /exists/i.test(m)) {
      console.log('[MIGRATE] `events` table already exists, skipping');
    } else {
      console.error('[MIGRATE] Error creating `events` table:', m);
      process.exit(1);
    }
  }

  console.log('[MIGRATE] Migration complete');
  process.exit(0);
}

migrate();
