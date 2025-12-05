// Load environment variables
require('dotenv').config();

// Auto-detect database type from DATABASE_URL
const databaseUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_LufDJkmlC79x@ep-odd-bush-a18tlvck-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
  // Use PostgreSQL adapter
  console.log('[DB] Using PostgreSQL adapter (Neon)');
  module.exports = require('./db-postgres.js');
} else {
  // Use SQLite Cloud adapter (legacy fallback)
  console.log('[DB] Using SQLite Cloud adapter');
  module.exports = require('./db-sqlite-cloud.js');
}
