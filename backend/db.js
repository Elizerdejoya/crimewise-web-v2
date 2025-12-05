// Load environment variables
require('dotenv').config();

// Auto-detect database type from DATABASE_URL
// Be tolerant of values that were entered with surrounding quotes in Vercel UI
function normalizeEnvUrl(raw) {
  if (!raw) return raw;
  // Trim whitespace
  let v = String(raw).trim();
  // Remove surrounding single or double quotes, if present
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

let databaseUrl = normalizeEnvUrl(process.env.DATABASE_URL) || "postgresql://neondb_owner:npg_LufDJkmlC79x@ep-odd-bush-a18tlvck-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Safe debug log (do not print full secret)
const hasDb = !!databaseUrl;
const prefix = (databaseUrl || '').slice(0, 12);
console.log('[DB] DATABASE_URL present:', hasDb, 'prefix:', prefix.replace(/\"/g, ''));

if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
  // Use PostgreSQL adapter
  console.log('[DB] Using PostgreSQL adapter (Neon)');
  module.exports = require('./db-postgres.js');
} else {
  // Use SQLite Cloud adapter (legacy fallback)
  console.log('[DB] Using SQLite Cloud adapter');
  module.exports = require('./db-sqlite-cloud.js');
}
