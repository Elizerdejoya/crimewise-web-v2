const db = require("./db");

async function migrate() {
  try {
    console.log("Starting database migration...");

    // Drop existing tables in reverse order of dependencies
    console.log("Dropping existing tables...");
    await db.sql`DROP TABLE IF EXISTS exams`;
    await db.sql`DROP TABLE IF EXISTS questions`;
    await db.sql`DROP TABLE IF EXISTS instructor_course`;
    await db.sql`DROP TABLE IF EXISTS batch_course`;
    await db.sql`DROP TABLE IF EXISTS class_instructor`;
    await db.sql`DROP TABLE IF EXISTS relations`;
    await db.sql`DROP TABLE IF EXISTS results`;
    await db.sql`DROP TABLE IF EXISTS users`;
    await db.sql`DROP TABLE IF EXISTS classes`;
    await db.sql`DROP TABLE IF EXISTS batches`;
    await db.sql`DROP TABLE IF EXISTS courses`;
    await db.sql`DROP TABLE IF EXISTS subscriptions`;
    await db.sql`DROP TABLE IF EXISTS organizations`;

    console.log("Creating new tables with organization support...");

    // Create organizations table first
    await db.sql`CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT UNIQUE,
      admin_name TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`;

    await db.sql`CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      plan_name TEXT NOT NULL,
      max_users INTEGER DEFAULT 50,
      max_storage_gb INTEGER DEFAULT 10,
      status TEXT DEFAULT 'active',
      start_date TEXT NOT NULL,
      end_date TEXT,
      monthly_price DECIMAL(10,2),
      features TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
    )`;

    // Create users table with organization_id
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

    // Create other tables with organization_id
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
      answer TEXT,
      image TEXT,
      points INTEGER,
      explanation TEXT,
      explanation_points INTEGER DEFAULT 0,
      created_by INTEGER,
      organization_id INTEGER,
      created TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
    )`;

    await db.sql`CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      course_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      instructor_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
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
    )`;

    console.log("Database migration completed successfully!");
  } catch (err) {
    console.error("Error during migration:", err.message);
    process.exit(1);
  }
}

// Run the migration
migrate();
