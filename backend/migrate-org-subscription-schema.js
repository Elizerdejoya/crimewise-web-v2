#!/usr/bin/env node

/**
 * Migration: Restructure organizations and subscriptions tables
 * Remove contact_email, contact_phone, address, subscription_plan, max_users, max_storage_gb from organizations
 * Add admin_name to organizations
 * Add max_users, max_storage_gb to subscriptions
 * Safe to run multiple times; will skip if columns already exist.
 */

const db = require('./db');

async function migrate() {
  try {
    console.log('[MIGRATE] Adding admin_name column to organizations...');
    await db.sql`ALTER TABLE organizations ADD COLUMN admin_name TEXT`;
    console.log('[MIGRATE] `admin_name` column added to organizations');
  } catch (err) {
    const m = err && err.message ? err.message : String(err);
    if (/column .* already exists|duplicate column name|already exists/i.test(m)) {
      console.log('[MIGRATE] `admin_name` column already exists, skipping');
    } else if (/does not exist|no such table/i.test(m)) {
      console.error('[MIGRATE] Table `organizations` does not exist. Initialize schema first.');
      process.exit(1);
    } else {
      console.error('[MIGRATE] Error adding `admin_name` column:', m);
      process.exit(1);
    }
  }

  try {
    console.log('[MIGRATE] Adding max_users column to subscriptions...');
    await db.sql`ALTER TABLE subscriptions ADD COLUMN max_users INTEGER DEFAULT 50`;
    console.log('[MIGRATE] `max_users` column added to subscriptions');
  } catch (err) {
    const m = err && err.message ? err.message : String(err);
    if (/column .* already exists|duplicate column name|already exists/i.test(m)) {
      console.log('[MIGRATE] `max_users` column already exists, skipping');
    } else if (/does not exist|no such table/i.test(m)) {
      console.error('[MIGRATE] Table `subscriptions` does not exist. Initialize schema first.');
      process.exit(1);
    } else {
      console.error('[MIGRATE] Error adding `max_users` column:', m);
      process.exit(1);
    }
  }

  try {
    console.log('[MIGRATE] Adding max_storage_gb column to subscriptions...');
    await db.sql`ALTER TABLE subscriptions ADD COLUMN max_storage_gb INTEGER DEFAULT 10`;
    console.log('[MIGRATE] `max_storage_gb` column added to subscriptions');
  } catch (err) {
    const m = err && err.message ? err.message : String(err);
    if (/column .* already exists|duplicate column name|already exists/i.test(m)) {
      console.log('[MIGRATE] `max_storage_gb` column already exists, skipping');
    } else if (/does not exist|no such table/i.test(m)) {
      console.error('[MIGRATE] Table `subscriptions` does not exist. Initialize schema first.');
      process.exit(1);
    } else {
      console.error('[MIGRATE] Error adding `max_storage_gb` column:', m);
      process.exit(1);
    }
  }

  console.log('[MIGRATE] Migration complete');
  process.exit(0);
}

migrate();
