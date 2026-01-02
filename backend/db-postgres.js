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

    // Check if exam_sessions table already exists (most recent addition)
    const checkSessionsTable = await client.query(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'exam_sessions'
      )
    `);
    
    if (checkSessionsTable.rows[0].exists) {
      console.log('[DB] ✓ PostgreSQL schema verified (exam_sessions table exists)');
      return true;
    }

    // Tables don't exist, create them
    console.log('[DB] Creating PostgreSQL findings and sessions tables...');
    
    // Create ai_findings table - Clean, simple structure
    // Stores student findings and teacher findings for comparison
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_findings (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        exam_id INTEGER NOT NULL,
        result_id INTEGER,
        student_findings TEXT NOT NULL,
        teacher_findings TEXT NOT NULL,
        score DECIMAL(5,2) DEFAULT 0,
        accuracy DECIMAL(5,2) DEFAULT 0,
        completeness DECIMAL(5,2) DEFAULT 0,
        clarity DECIMAL(5,2) DEFAULT 0,
        objectivity DECIMAL(5,2) DEFAULT 0,
        feedback TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, exam_id)
      )
    `);
    console.log('[DB] Created ai_findings table');

    // Create exam_sessions table for tracking active exam sessions
    // WITHOUT foreign key constraints since users/exams may be in different schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS exam_sessions (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        exam_id INTEGER NOT NULL,
        session_start TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, exam_id)
      )
    `);
    console.log('[DB] Created exam_sessions table');
    
    // Create indexes for faster queries
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_findings_student_exam ON ai_findings(student_id, exam_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_findings_exam ON ai_findings(exam_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_findings_student ON ai_findings(student_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_exam ON exam_sessions(student_id, exam_id)`);
    console.log('[DB] ✓ Findings and sessions tables created successfully');
    
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
