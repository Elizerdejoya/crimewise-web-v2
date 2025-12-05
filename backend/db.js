const { Database } = require("@sqlitecloud/drivers");

// Connect to SQLite Cloud database 
const db = new Database(
  process.env.DATABASE_URL || "sqlitecloud://cxd2tnbwvk.g5.sqlite.cloud:8860/crimewise?apikey=euIjfRGcZnywBxr10nuXqdrk6BXamqJZvXRalZPVWVg"
);

// Function to initialize the database schema
async function initializeSchema() {
  try {
    console.log("Connecting to SQLite Cloud...");
    // The connection might happen implicitly or require an explicit connect method
    // Check driver docs if connection issues arise.

    console.log("Initializing database schema...");

    // --- MULTI-TENANT TABLES ---
    await db.sql`CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT UNIQUE,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      status TEXT DEFAULT 'active',
      subscription_plan TEXT DEFAULT 'basic',
      max_users INTEGER DEFAULT 50,
      max_storage_gb INTEGER DEFAULT 10,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`;

    await db.sql`CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      plan_name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      start_date TEXT NOT NULL,
      end_date TEXT,
      monthly_price DECIMAL(10,2),
      features TEXT, -- JSON string of features
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
    )`;

    // --- TABLE CREATION ---
    // Execute each CREATE TABLE statement using db.sql
    await db.sql`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT,
      name TEXT,
      status TEXT DEFAULT 'active',
      organization_id INTEGER,
      class_id INTEGER,
      instructor_id TEXT,
      student_id TEXT,
      course_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(organization_id) REFERENCES organizations(id),
      FOREIGN KEY(class_id) REFERENCES classes(id)
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      organization_id INTEGER,
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      batch_id INTEGER,
      organization_id INTEGER,
      FOREIGN KEY(batch_id) REFERENCES batches(id),
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT DEFAULT NULL,
      description TEXT DEFAULT NULL,
      status TEXT DEFAULT 'active',
      organization_id INTEGER,
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      exam_id INTEGER,
      score INTEGER,
      date TEXT,
      answer TEXT,
      tab_switches INTEGER DEFAULT 0,
      details TEXT,
      explanation TEXT,
      FOREIGN KEY(student_id) REFERENCES users(id)
    )`;
    // Note: The 'relations' table seems redundant given the specific join tables below.
    // Consider removing it if it's not actively used.
    await db.sql`CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      class_id INTEGER,
      instructor_id INTEGER,
      batch_id INTEGER,
      course_id INTEGER
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS class_instructor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      instructor_id INTEGER NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (instructor_id) REFERENCES users(id)
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS batch_course (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (course_id) REFERENCES courses(id)
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS instructor_course (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instructor_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      FOREIGN KEY (instructor_id) REFERENCES users(id),
      FOREIGN KEY (course_id) REFERENCES courses(id)
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      text TEXT,
      course_id INTEGER,
      difficulty TEXT,
      type TEXT,
      answer TEXT,         -- Now stores either JSON array of rows or JSON object with specimens and explanation
      image TEXT,
      points INTEGER,      -- Total points (sum of specimen points + explanation points)
      explanation TEXT,    -- Legacy field for backward compatibility
      explanation_points INTEGER DEFAULT 0,  -- Points specifically for explanation section
      rubrics TEXT DEFAULT NULL, -- JSON string: {accuracy:40,completeness:30,clarity:20,objectivity:10}
      keyword_pool_id INTEGER, -- Reference to keyword pool used for this question
      selected_keywords TEXT, -- JSON array of selected keywords from the pool
      created_by INTEGER,
      organization_id INTEGER,
      created TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(organization_id) REFERENCES organizations(id),
      FOREIGN KEY(keyword_pool_id) REFERENCES keyword_pools(id)
    )`;
    await db.sql`CREATE TABLE IF NOT EXISTS keyword_pools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      keywords TEXT NOT NULL, -- JSON array of keywords
      description TEXT,
      organization_id INTEGER,
      created_by INTEGER,
      created TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(organization_id) REFERENCES organizations(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    )`;

    await db.sql`CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      course_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      instructor_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL, -- This might need to be a JSON array or separate table if an exam has multiple questions
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      duration TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      organization_id INTEGER,
      created TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(course_id) REFERENCES courses(id),
      FOREIGN KEY(class_id) REFERENCES classes(id),
      FOREIGN KEY(instructor_id) REFERENCES users(id),
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
      -- FOREIGN KEY(question_id) REFERENCES questions(id) -- Revisit this relationship if multiple questions per exam
    )`;

    // AI grades table for storing Gemini grading results
    await db.sql`CREATE TABLE IF NOT EXISTS ai_grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      accuracy INTEGER DEFAULT 0,
      completeness INTEGER DEFAULT 0,
      clarity INTEGER DEFAULT 0,
      objectivity INTEGER DEFAULT 0,
      feedback TEXT,
      raw_response TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(student_id) REFERENCES users(id)
    )`;

    // Queue table for AI grading jobs (DB-backed queue)
    await db.sql`CREATE TABLE IF NOT EXISTS ai_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      teacher_findings TEXT,
      student_findings TEXT,
      status TEXT DEFAULT 'pending', -- pending, processing, done, error
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`;

    console.log("Database schema initialized successfully.");
  } catch (err) {
    console.error(
      "Error initializing SQLite Cloud database schema:",
      err.message
    );
    // Throw so the outer initializer can handle failures gracefully
    throw err;
  }
}

// Call the async function to initialize the schema and attach the promise
const initPromise = (async () => {
  try {
    console.log("[DB] Starting schema initialization...");
    
    // Add a timeout to prevent hanging on Vercel
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database initialization timeout (30s)")), 30000)
    );
    
    await Promise.race([initializeSchema(), timeoutPromise]);
    console.log("[DB] Schema initialization completed");
    return true;
  } catch (err) {
    console.error("[DB] Error initializing schema:", err.message || err);
    // Don't exit - let the app start and handle errors per-request
    return false;
  }
})();

// expose the initialization promise on the db object so callers can wait for it
db.initialized = initPromise;

// Generic helper to run a DB operation with retries on transient errors (eg. SQLITE_BUSY)
// opts: { retries: number, baseDelay: number }
async function runWithRetry(fn, opts = {}) {
  const retries = typeof opts.retries === 'number' ? opts.retries : 6;
  const baseDelay = typeof opts.baseDelay === 'number' ? opts.baseDelay : 150;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const m = err && err.message ? String(err.message) : String(err || '');
      if (m.toLowerCase().includes('busy') && attempt < retries) {
        // Exponential backoff: baseDelay * attempt
        const wait = baseDelay * attempt;
        // Log sparingly to avoid spamming
        if (attempt === 1 || attempt % 2 === 0) {
          console.warn(`[DB] Operation busy, retrying after ${wait}ms (attempt ${attempt}/${retries})`);
        }
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // Not a transient busy error or no retries left
      throw err;
    }
  }
}

db.runWithRetry = runWithRetry;

module.exports = db;
