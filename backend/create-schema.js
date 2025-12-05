// Check what tables exist and create missing ones
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAndCreateTables() {
  const client = await pool.connect();
  try {
    // First, check existing tables
    console.log('\n📊 Checking existing tables...\n');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log(`✓ Found ${result.rows.length} tables:`);
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));

    // Now create all required tables
    console.log('\n🔧 Creating schema...\n');
    
    const schema = `
      -- Organizations (Multi-tenant)
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
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        plan_name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP,
        monthly_price DECIMAL(10,2),
        features TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Users and Authentication
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT,
        role TEXT DEFAULT 'student',
        profile_picture TEXT,
        phone TEXT,
        status TEXT DEFAULT 'active',
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Classes and Courses
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        instructor_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        description TEXT,
        code TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        instructor_id INTEGER NOT NULL REFERENCES users(id),
        class_id INTEGER REFERENCES classes(id),
        name TEXT NOT NULL,
        description TEXT,
        code TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Exams
      CREATE TABLE IF NOT EXISTS exams (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        course_id INTEGER NOT NULL REFERENCES courses(id),
        created_by INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'draft',
        duration_minutes INTEGER,
        passing_score DECIMAL(5,2),
        total_questions INTEGER,
        shuffle_questions BOOLEAN DEFAULT FALSE,
        show_answers BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Questions
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        exam_id INTEGER NOT NULL REFERENCES exams(id),
        question_text TEXT NOT NULL,
        question_type TEXT DEFAULT 'multiple_choice',
        points INTEGER DEFAULT 1,
        order_num INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Question Options (for multiple choice)
      CREATE TABLE IF NOT EXISTS question_options (
        id SERIAL PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES questions(id),
        option_text TEXT NOT NULL,
        is_correct BOOLEAN DEFAULT FALSE,
        order_num INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Keyword Pools for AI Grading
      CREATE TABLE IF NOT EXISTS keyword_pools (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        question_id INTEGER NOT NULL REFERENCES questions(id),
        keywords TEXT NOT NULL,
        weight DECIMAL(5,2) DEFAULT 1.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Results and Submissions
      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        exam_id INTEGER NOT NULL REFERENCES exams(id),
        student_id INTEGER NOT NULL REFERENCES users(id),
        score DECIMAL(5,2),
        percentage DECIMAL(5,2),
        status TEXT DEFAULT 'submitted',
        submitted_at TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Batches for AI Grading (group submissions)
      CREATE TABLE IF NOT EXISTS batches (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        exam_id INTEGER NOT NULL REFERENCES exams(id),
        status TEXT DEFAULT 'pending',
        total_submissions INTEGER DEFAULT 0,
        graded_submissions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- AI Queue for processing submissions
      CREATE TABLE IF NOT EXISTS ai_queue (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        batch_id INTEGER NOT NULL REFERENCES batches(id),
        result_id INTEGER NOT NULL REFERENCES results(id),
        question_id INTEGER NOT NULL REFERENCES questions(id),
        student_answer TEXT,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- AI Grades (results from AI grading)
      CREATE TABLE IF NOT EXISTS ai_grades (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        result_id INTEGER NOT NULL REFERENCES results(id),
        question_id INTEGER NOT NULL REFERENCES questions(id),
        ai_score DECIMAL(5,2),
        ai_feedback TEXT,
        confidence DECIMAL(5,2),
        graded_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Class-Student Relations
      CREATE TABLE IF NOT EXISTS class_students (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id),
        student_id INTEGER NOT NULL REFERENCES users(id),
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
      );

      -- Course-Student Relations
      CREATE TABLE IF NOT EXISTS course_students (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES courses(id),
        student_id INTEGER NOT NULL REFERENCES users(id),
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
      );

      -- Student Answers (detailed answer tracking)
      CREATE TABLE IF NOT EXISTS student_answers (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        result_id INTEGER NOT NULL REFERENCES results(id),
        question_id INTEGER NOT NULL REFERENCES questions(id),
        student_id INTEGER NOT NULL REFERENCES users(id),
        answer_text TEXT,
        selected_option_id INTEGER REFERENCES question_options(id),
        points_earned DECIMAL(5,2),
        is_correct BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_classes_organization ON classes(organization_id);
      CREATE INDEX IF NOT EXISTS idx_courses_organization ON courses(organization_id);
      CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);
      CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
      CREATE INDEX IF NOT EXISTS idx_results_exam ON results(exam_id);
      CREATE INDEX IF NOT EXISTS idx_results_student ON results(student_id);
      CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_queue(status);
      CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
    `;

    // Execute schema
    await client.query(schema);
    console.log('✅ Schema created successfully!');

    // Check final table count
    const finalResult = await client.query(`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log(`\n📈 Final table count: ${finalResult.rows[0].table_count}`);
    console.log('\n✓ All required tables are now in place!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

checkAndCreateTables();
