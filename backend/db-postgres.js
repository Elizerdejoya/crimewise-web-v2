const { Pool } = require('pg');

// PostgreSQL connection pool (Neon supports connection pooling natively)
// Pool size: 5-10 connections per Vercel function (way less than SQLite Cloud's 30-connection limit)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Max connections per function instance
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Simple query wrapper that mimics the @sqlitecloud/drivers API
// Usage: db.sql`SELECT * FROM users WHERE id = ${id}`
class Database {
  constructor(pool) {
    this.pool = pool;
  }

  // Tagged template function to handle SQL queries
  async sql(strings, ...values) {
    let query = strings[0];
    for (let i = 1; i < strings.length; i++) {
      query += `$${i}` + strings[i];
    }
    
    try {
      const result = await this.pool.query(query, values);
      // Return rows in array format (matches SQLiteCloud driver behavior)
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
    console.log('Initializing PostgreSQL schema...');

    // Create organizations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT UNIQUE,
        contact_email TEXT,
        contact_phone TEXT,
        address TEXT,
        status TEXT DEFAULT 'active',
        subscription_plan TEXT DEFAULT 'basic',
        max_users INTEGER DEFAULT 50,
        max_storage_gb INTEGER DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        plan_name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        start_date TEXT NOT NULL,
        end_date TEXT,
        monthly_price DECIMAL(10,2),
        features TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT,
        name TEXT,
        status TEXT DEFAULT 'active',
        organization_id INTEGER REFERENCES organizations(id),
        class_id INTEGER,
        instructor_id TEXT,
        student_id TEXT,
        course_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create batches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id SERIAL PRIMARY KEY,
        name TEXT,
        organization_id INTEGER REFERENCES organizations(id)
      )
    `);

    // Create classes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name TEXT,
        batch_id INTEGER REFERENCES batches(id),
        organization_id INTEGER REFERENCES organizations(id)
      )
    `);

    // Create courses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT DEFAULT NULL,
        description TEXT DEFAULT NULL,
        status TEXT DEFAULT 'active',
        organization_id INTEGER REFERENCES organizations(id)
      )
    `);

    // Create results table
    await client.query(`
      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id),
        exam_id INTEGER,
        score INTEGER,
        date TEXT,
        answer TEXT,
        tab_switches INTEGER DEFAULT 0,
        details TEXT,
        explanation TEXT
      )
    `);

    // Create relations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS relations (
        id SERIAL PRIMARY KEY,
        type TEXT,
        class_id INTEGER,
        instructor_id INTEGER,
        batch_id INTEGER,
        course_id INTEGER
      )
    `);

    // Create class_instructor table
    await client.query(`
      CREATE TABLE IF NOT EXISTS class_instructor (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id),
        instructor_id INTEGER NOT NULL REFERENCES users(id)
      )
    `);

    // Create batch_course table
    await client.query(`
      CREATE TABLE IF NOT EXISTS batch_course (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER NOT NULL REFERENCES batches(id),
        course_id INTEGER NOT NULL REFERENCES courses(id)
      )
    `);

    // Create instructor_course table
    await client.query(`
      CREATE TABLE IF NOT EXISTS instructor_course (
        id SERIAL PRIMARY KEY,
        instructor_id INTEGER NOT NULL REFERENCES users(id),
        course_id INTEGER NOT NULL REFERENCES courses(id)
      )
    `);

    // Create questions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        text TEXT,
        course_id INTEGER REFERENCES courses(id),
        difficulty TEXT,
        type TEXT,
        answer TEXT,
        image TEXT,
        points INTEGER,
        explanation TEXT,
        explanation_points INTEGER DEFAULT 0,
        rubrics TEXT DEFAULT NULL,
        keyword_pool_id INTEGER,
        selected_keywords TEXT,
        created_by INTEGER REFERENCES users(id),
        organization_id INTEGER REFERENCES organizations(id),
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create keyword_pools table
    await client.query(`
      CREATE TABLE IF NOT EXISTS keyword_pools (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        keywords TEXT NOT NULL,
        description TEXT,
        organization_id INTEGER REFERENCES organizations(id),
        created_by INTEGER REFERENCES users(id),
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create exams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS exams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        course_id INTEGER NOT NULL REFERENCES courses(id),
        class_id INTEGER NOT NULL REFERENCES classes(id),
        instructor_id INTEGER NOT NULL REFERENCES users(id),
        question_id INTEGER NOT NULL,
        start TEXT NOT NULL,
        end TEXT NOT NULL,
        duration TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        organization_id INTEGER REFERENCES organizations(id),
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create ai_grades table (for AI grading results)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_grades (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id),
        exam_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        accuracy INTEGER DEFAULT 0,
        completeness INTEGER DEFAULT 0,
        clarity INTEGER DEFAULT 0,
        objectivity INTEGER DEFAULT 0,
        feedback TEXT,
        raw_response TEXT,
        api_key_index INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create ai_queue table (for job processing)
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('PostgreSQL schema initialized successfully');
    return true;
  } catch (err) {
    console.error('[DB] Schema initialization error:', err.message);
    throw err;
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
    // Don't exit - let the app start and handle errors per-request
    return false;
  }
})();

db.initialized = initPromise;

// Generic helper to run DB operations with retries
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
