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
    console.log('[DB] Checking PostgreSQL schema...');

    // Check if ai_grades table exists
    const checkGrades = await client.query(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ai_grades'
      )
    `);
    
    // If ai_grades exists, try to migrate it (remove problematic foreign key)
    if (checkGrades.rows[0].exists) {
      console.log('[DB] ai_grades table exists, checking for constraints to migrate...');
      try {
        // Drop foreign key constraint if it exists
        await client.query(`
          ALTER TABLE ai_grades 
          DROP CONSTRAINT IF EXISTS ai_grades_student_id_fkey
        `);
        console.log('[DB] Removed foreign key constraint from ai_grades');
      } catch (migrationErr) {
        console.log('[DB] No migration needed or already migrated:', migrationErr.message);
      }
    }

    // Check if ai_queue table exists
    const checkTable = await client.query(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'ai_queue'
      )
    `);
    
    if (checkTable.rows[0].exists) {
      console.log('[DB] ✓ PostgreSQL schema verified (ai_queue table exists)');
      return true;
    }

    // Tables don't exist, create them
    console.log('[DB] Creating PostgreSQL AI grading tables...');
    
    // Create ai_grades table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_grades (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        exam_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        accuracy INTEGER DEFAULT 0,
        completeness INTEGER DEFAULT 0,
        clarity INTEGER DEFAULT 0,
        objectivity INTEGER DEFAULT 0,
        feedback TEXT,
        raw_response TEXT,
        api_key_index INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[DB] Created ai_grades table');

    // Create ai_queue table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_queue (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        exam_id INTEGER NOT NULL,
        teacher_findings TEXT,
        student_findings TEXT,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('[DB] Created ai_queue table');
    
    // Create indexes for faster queries
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_grades_student_exam ON ai_grades(student_id, exam_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_queue(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_queue_student_exam ON ai_queue(student_id, exam_id)`);
    console.log('[DB] ✓ AI grading tables created successfully');
    
    return true;
  } catch (err) {
    console.error('[DB] Schema initialization error:', err.message);
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
