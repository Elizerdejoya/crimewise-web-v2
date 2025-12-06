require('dotenv').config();
const { Client } = require('pg');

async function fullMigration() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log('🔄 Full SQLiteCloud → PostgreSQL Schema Conversion\n');

    // Drop all existing tables to start fresh
    console.log('🗑️  Dropping all existing tables...');
    await client.query(`
      DROP TABLE IF EXISTS ai_grades CASCADE;
      DROP TABLE IF EXISTS ai_queue CASCADE;
      DROP TABLE IF EXISTS student_answers CASCADE;
      DROP TABLE IF EXISTS course_students CASCADE;
      DROP TABLE IF EXISTS class_students CASCADE;
      DROP TABLE IF EXISTS keyword_pools CASCADE;
      DROP TABLE IF EXISTS question_options CASCADE;
      DROP TABLE IF EXISTS questions CASCADE;
      DROP TABLE IF EXISTS results CASCADE;
      DROP TABLE IF EXISTS batches CASCADE;
      DROP TABLE IF EXISTS instructor_course CASCADE;
      DROP TABLE IF EXISTS batch_course CASCADE;
      DROP TABLE IF EXISTS class_instructor CASCADE;
      DROP TABLE IF EXISTS exams CASCADE;
      DROP TABLE IF EXISTS courses CASCADE;
      DROP TABLE IF EXISTS classes CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS subscriptions CASCADE;
      DROP TABLE IF EXISTS organizations CASCADE;
      DROP TABLE IF EXISTS relations CASCADE;
    `);
    console.log('✓ All tables dropped\n');

    // Recreate tables exactly as they are in SQLiteCloud schema (db.sql.js)
    console.log('📋 Creating tables (SQLiteCloud schema conversion)...\n');

    // Organizations
    await client.query(`
      CREATE TABLE organizations (
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
    `);
    console.log('✓ organizations');

    // Subscriptions
    await client.query(`
      CREATE TABLE subscriptions (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        plan_name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP,
        monthly_price DECIMAL(10,2),
        features TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );
    `);
    console.log('✓ subscriptions');

    // Users
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );
    `);
    console.log('✓ users');

    // Batches
    await client.query(`
      CREATE TABLE batches (
        id SERIAL PRIMARY KEY,
        name TEXT,
        organization_id INTEGER,
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );
    `);
    console.log('✓ batches');

    // Classes
    await client.query(`
      CREATE TABLE classes (
        id SERIAL PRIMARY KEY,
        name TEXT,
        batch_id INTEGER,
        organization_id INTEGER,
        FOREIGN KEY(batch_id) REFERENCES batches(id),
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );
    `);
    console.log('✓ classes');

    // Add class_id foreign key to users
    await client.query(`
      ALTER TABLE users ADD CONSTRAINT fk_users_class_id FOREIGN KEY(class_id) REFERENCES classes(id);
    `);
    console.log('✓ users (added class_id FK)');

    // Courses
    await client.query(`
      CREATE TABLE courses (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT DEFAULT NULL,
        description TEXT DEFAULT NULL,
        status TEXT DEFAULT 'active',
        organization_id INTEGER,
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );
    `);
    console.log('✓ courses');

    // Exams
    await client.query(`
      CREATE TABLE exams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        course_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        instructor_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        start TIMESTAMP NOT NULL,
        "end" TIMESTAMP NOT NULL,
        duration TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        organization_id INTEGER,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        FOREIGN KEY(class_id) REFERENCES classes(id),
        FOREIGN KEY(instructor_id) REFERENCES users(id),
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );
    `);
    console.log('✓ exams');

    // Questions
    await client.query(`
      CREATE TABLE questions (
        id SERIAL PRIMARY KEY,
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
        rubrics TEXT DEFAULT NULL,
        keyword_pool_id INTEGER,
        selected_keywords TEXT,
        created_by INTEGER,
        organization_id INTEGER,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(created_by) REFERENCES users(id),
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );
    `);
    console.log('✓ questions');

    // Add question_id FK to exams
    await client.query(`
      ALTER TABLE exams ADD CONSTRAINT fk_exams_question_id FOREIGN KEY(question_id) REFERENCES questions(id);
    `);
    console.log('✓ exams (added question_id FK)');

    // Keyword Pools
    await client.query(`
      CREATE TABLE keyword_pools (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        keywords TEXT NOT NULL,
        description TEXT,
        organization_id INTEGER,
        created_by INTEGER,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(organization_id) REFERENCES organizations(id),
        FOREIGN KEY(created_by) REFERENCES users(id)
      );
    `);
    console.log('✓ keyword_pools');

    // Add keyword_pool_id FK to questions
    await client.query(`
      ALTER TABLE questions ADD CONSTRAINT fk_questions_keyword_pool_id FOREIGN KEY(keyword_pool_id) REFERENCES keyword_pools(id);
    `);
    console.log('✓ questions (added keyword_pool_id FK)');

    // Results
    await client.query(`
      CREATE TABLE results (
        id SERIAL PRIMARY KEY,
        student_id INTEGER,
        exam_id INTEGER,
        score INTEGER,
        date TIMESTAMP,
        answer TEXT,
        tab_switches INTEGER DEFAULT 0,
        details TEXT,
        explanation TEXT,
        FOREIGN KEY(student_id) REFERENCES users(id)
      );
    `);
    console.log('✓ results');

    // Relations
    await client.query(`
      CREATE TABLE relations (
        id SERIAL PRIMARY KEY,
        type TEXT,
        class_id INTEGER,
        instructor_id INTEGER,
        batch_id INTEGER,
        course_id INTEGER
      );
    `);
    console.log('✓ relations');

    // Class Instructor
    await client.query(`
      CREATE TABLE class_instructor (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL,
        instructor_id INTEGER NOT NULL,
        FOREIGN KEY (class_id) REFERENCES classes(id),
        FOREIGN KEY (instructor_id) REFERENCES users(id)
      );
    `);
    console.log('✓ class_instructor');

    // Batch Course
    await client.query(`
      CREATE TABLE batch_course (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES batches(id),
        FOREIGN KEY (course_id) REFERENCES courses(id)
      );
    `);
    console.log('✓ batch_course');

    // Instructor Course
    await client.query(`
      CREATE TABLE instructor_course (
        id SERIAL PRIMARY KEY,
        instructor_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL,
        FOREIGN KEY (instructor_id) REFERENCES users(id),
        FOREIGN KEY (course_id) REFERENCES courses(id)
      );
    `);
    console.log('✓ instructor_course');

    // AI Grades
    await client.query(`
      CREATE TABLE ai_grades (
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
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES users(id)
      );
    `);
    console.log('✓ ai_grades');

    // AI Queue
    await client.query(`
      CREATE TABLE ai_queue (
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
      );
    `);
    console.log('✓ ai_queue');

    // Sessions
    await client.query(`
      CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);
    console.log('✓ sessions');

    // Question Options
    await client.query(`
      CREATE TABLE question_options (
        id SERIAL PRIMARY KEY,
        question_id INTEGER NOT NULL,
        option_text TEXT NOT NULL,
        is_correct BOOLEAN DEFAULT FALSE,
        order_num INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(question_id) REFERENCES questions(id)
      );
    `);
    console.log('✓ question_options');

    // Class Students
    await client.query(`
      CREATE TABLE class_students (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (class_id) REFERENCES classes(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
      );
    `);
    console.log('✓ class_students');

    // Course Students
    await client.query(`
      CREATE TABLE course_students (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (course_id) REFERENCES courses(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
      );
    `);
    console.log('✓ course_students');

    // Student Answers
    await client.query(`
      CREATE TABLE student_answers (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        result_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        answer_text TEXT,
        selected_option_id INTEGER REFERENCES question_options(id),
        points_earned DECIMAL(5,2),
        is_correct BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(organization_id) REFERENCES organizations(id),
        FOREIGN KEY(result_id) REFERENCES results(id),
        FOREIGN KEY(question_id) REFERENCES questions(id),
        FOREIGN KEY(student_id) REFERENCES users(id)
      );
    `);
    console.log('✓ student_answers');

    // Batches (update - add status field if needed for AI queue work)
    await client.query(`
      ALTER TABLE batches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
      ALTER TABLE batches ADD COLUMN IF NOT EXISTS exam_id INTEGER;
      ALTER TABLE batches ADD CONSTRAINT fk_batches_exam_id FOREIGN KEY(exam_id) REFERENCES exams(id);
    `);
    console.log('✓ batches (enhanced for AI queue)');

    // Add missing columns to results for AI queue compatibility
    await client.query(`
      ALTER TABLE results ADD COLUMN IF NOT EXISTS organization_id INTEGER;
      ALTER TABLE results ADD COLUMN IF NOT EXISTS percentage DECIMAL(5,2);
      ALTER TABLE results ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'submitted';
      ALTER TABLE results ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
      ALTER TABLE results ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
      ALTER TABLE results ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
      ALTER TABLE results ADD CONSTRAINT fk_results_organization_id FOREIGN KEY(organization_id) REFERENCES organizations(id);
      ALTER TABLE results ADD CONSTRAINT fk_results_exam_id FOREIGN KEY(exam_id) REFERENCES exams(id);
    `);
    console.log('✓ results (enhanced)');

    // Create indexes for performance
    console.log('\n📍 Creating indexes...\n');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);',
      'CREATE INDEX IF NOT EXISTS idx_classes_organization ON classes(organization_id);',
      'CREATE INDEX IF NOT EXISTS idx_courses_organization ON courses(organization_id);',
      'CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);',
      'CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(course_id);',
      'CREATE INDEX IF NOT EXISTS idx_results_exam ON results(exam_id);',
      'CREATE INDEX IF NOT EXISTS idx_results_student ON results(student_id);',
      'CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_queue(status);',
      'CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);',
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_organization ON subscriptions(organization_id);'
    ];

    for (const idx of indexes) {
      await client.query(idx);
    }
    console.log('✓ All indexes created');

    console.log('\n✅ Full migration complete!\n');
    console.log('📊 Final schema summary:');
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log(`Total tables: ${tables.rows.length}`);
    tables.rows.forEach(row => console.log(`  - ${row.table_name}`));

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) fullMigration();

module.exports = fullMigration;
