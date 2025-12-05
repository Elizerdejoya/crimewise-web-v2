const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Query wrapper that mimics @sqlitecloud/drivers API
class Database {
  constructor(pool) {
    this.pool = pool;
  }

  async sql(strings, ...values) {
    let query = strings[0];
    for (let i = 1; i < strings.length; i++) {
      query += `$${i}` + strings[i];
    }
    
    try {
      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (err) {
      console.error('[DB] Query error:', err.message);
      throw err;
    }
  }
}

const db = new Database(pool);

// Initialize PostgreSQL schema
async function initializeSchema() {
  const client = await pool.connect();
  try {
    console.log('Checking PostgreSQL schema...');

    // Check if ai_queue table exists - if it does, schema is ready
    // (tables were created by migrate-to-postgres.js script)
    const checkTable = await client.query(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ai_queue'
      )
    `);
    
    if (checkTable.rows[0].exists) {
      console.log('✓ PostgreSQL schema verified (ai_queue table exists)');
      return true;
    }

    console.log('⚠ PostgreSQL schema incomplete - run: node migrate-to-postgres.js');
    return true;
  } catch (err) {
    console.error('[DB] Schema check error:', err.message);
    // Don't throw - allow app to start even if schema check fails
    return true;
  } finally {
    client.release();
  }
}

// Initialize schema on startup
const initPromise = (async () => {
  try {
    console.log('[DB] Starting PostgreSQL schema initialization...');
    await initializeSchema();
    console.log('[DB] Schema initialization completed');
    return true;
  } catch (err) {
    console.error('[DB] Error initializing schema:', err.message);
    return false;
  }
})();

db.initialized = initPromise;

// Retry helper
async function runWithRetry(fn, opts = {}) {
  const retries = typeof opts.retries === 'number' ? opts.retries : 6;
  const baseDelay = typeof opts.baseDelay === 'number' ? opts.baseDelay : 150;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const m = err && err.message ? String(err.message) : String(err || '');
      const isTransient = m.includes('ECONNREFUSED') || m.includes('timeout') || m.includes('pool');
      if (isTransient && attempt < retries) {
        const wait = baseDelay * attempt;
        if (attempt === 1 || attempt % 2 === 0) {
          console.warn(`[DB] Operation failed, retrying after ${wait}ms (attempt ${attempt}/${retries})`);
        }
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

db.runWithRetry = runWithRetry;

// Graceful shutdown
process.on('exit', () => {
  pool.end();
});

module.exports = db;
