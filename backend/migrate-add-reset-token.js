#!/usr/bin/env node

/**
 * Migration: add `reset_token` and `reset_token_expiry` columns to `users` table
 * Safe to run multiple times; will skip if columns already exist.
 */

const db = require('./db');

async function migrate() {
  try {
    console.log('[MIGRATE] Adding reset_token column to users...');
    await db.sql`ALTER TABLE users ADD COLUMN reset_token TEXT`;
    console.log('[MIGRATE] `reset_token` column added');
  } catch (err) {
    const m = err && err.message ? err.message : String(err);
    if (/column .* already exists|duplicate column name|already exists/i.test(m)) {
      console.log('[MIGRATE] `reset_token` column already exists, skipping');
    } else if (/does not exist|no such table/i.test(m)) {
      console.error('[MIGRATE] Table `users` does not exist. Initialize schema first.');
      process.exit(1);
    } else {
      console.error('[MIGRATE] Error adding `reset_token` column:', m);
      process.exit(1);
    }
  }

  try {
    console.log('[MIGRATE] Adding reset_token_expiry column to users...');
    // Use TIMESTAMP for Postgres; SQLite will accept TEXT in many setups but the ALTER may still work
    await db.sql`ALTER TABLE users ADD COLUMN reset_token_expiry TIMESTAMP`;
    console.log('[MIGRATE] `reset_token_expiry` column added');
  } catch (err) {
    const m = err && err.message ? err.message : String(err);
    if (/column .* already exists|duplicate column name|already exists/i.test(m)) {
      console.log('[MIGRATE] `reset_token_expiry` column already exists, skipping');
    } else if (/does not exist|no such table/i.test(m)) {
      console.error('[MIGRATE] Table `users` does not exist. Initialize schema first.');
      process.exit(1);
    } else {
      console.error('[MIGRATE] Error adding `reset_token_expiry` column:', m);
      process.exit(1);
    }
  }

  console.log('[MIGRATE] Migration complete');
  process.exit(0);
}

migrate();
