const db = require('./db');

async function seedPostgres() {
  try {
    console.log('🌱 Seeding PostgreSQL database with sample data...');

    // Organizations
    console.log('📦 Creating organizations...');
    await db.sql`
      INSERT INTO organizations (name, domain, contact_email, subscription_plan, max_users, max_storage_gb)
      VALUES 
        ('CrimeWise Main', 'crimewise.com', 'admin@crimewise.com', 'premium', 200, 50),
        ('Police Academy A', 'policeacademy-a.edu', 'admin@policeacademy-a.edu', 'basic', 50, 10),
        ('Criminal Justice Institute', 'cji.org', 'admin@cji.org', 'enterprise', 500, 100)
      ON CONFLICT DO NOTHING
    `;

    // Get organization ID
    const orgs = await db.sql`SELECT id FROM organizations ORDER BY id LIMIT 1`;
    const orgId = orgs[0]?.id || 1;

    // Users (must be before courses because courses references instructor_id)
    console.log('👥 Creating users...');
    await db.sql`
      INSERT INTO users (email, password, role, name, organization_id, class_id)
      VALUES
        ('superadmin@crimewise.com', 'superpass', 'super_admin', 'Super Admin', NULL, NULL),
        ('admin@crimewise.com', 'adminpass', 'admin', 'Admin User', ${orgId}, NULL),
        ('instructor1@crimewise.com', 'instrpass', 'instructor', 'Instructor One', ${orgId}, NULL),
        ('student1@crimewise.com', 'studpass', 'student', 'Student One', ${orgId}, 1),
        ('student2@crimewise.com', 'studpass', 'student', 'Student Two', ${orgId}, 2)
      ON CONFLICT DO NOTHING
    `;

    // Batches
    console.log('📋 Creating batches...');
    await db.sql`
      INSERT INTO batches (name, organization_id)
      VALUES ('Batch A', ${orgId}), ('Batch B', ${orgId})
      ON CONFLICT DO NOTHING
    `;

    // Classes
    console.log('🏫 Creating classes...');
    await db.sql`
      INSERT INTO classes (name, batch_id, organization_id)
      VALUES 
        ('Class 1', 1, ${orgId}),
        ('Class 2', 2, ${orgId})
      ON CONFLICT DO NOTHING
    `;

    // Get instructor ID (must exist now)
    const instructors = await db.sql`SELECT id FROM users WHERE role = 'instructor' LIMIT 1`;
    const instructorId = instructors[0]?.id || 3;

    // Courses
    console.log('📚 Creating courses...');
    await db.sql`
      INSERT INTO courses (name, code, description, organization_id, instructor_id)
      VALUES 
        ('Criminal Law', 'CRIM101', 'Intro to Criminal Law', ${orgId}, ${instructorId}),
        ('Forensics', 'FORE201', 'Forensic Science Basics', ${orgId}, ${instructorId})
    `;
    
    // Verify courses were created
    const courses = await db.sql`SELECT id, name FROM courses WHERE organization_id = ${orgId}`;
    console.log(`✅ Courses created:`, courses.map(c => `${c.id}:${c.name}`).join(', '));

    // Exams (must be before questions)
    console.log('📝 Creating exams...');
    await db.sql`
      INSERT INTO exams (organization_id, course_id, created_by, title, description, duration_minutes, total_questions, status)
      VALUES
        (${orgId}, ${courses[0].id}, ${instructorId}, 'Criminal Law Midterm', 'Midterm exam for Criminal Law', 60, 2, 'published'),
        (${orgId}, ${courses[1].id}, ${instructorId}, 'Forensics Quiz', 'Quick quiz on forensic evidence', 30, 2, 'published')
    `;

    // Questions
    console.log('❓ Creating questions...');
    await db.sql`
      INSERT INTO questions (organization_id, exam_id, question_text, question_type, points)
      VALUES
        (${orgId}, 1, 'What is a felony?', 'short', 5),
        (${orgId}, 2, 'List two types of forensic evidence.', 'short', 5)
      ON CONFLICT DO NOTHING
    `;

    // Subscriptions
    console.log('💳 Creating subscriptions...');
    await db.sql`
      INSERT INTO subscriptions (organization_id, plan, status, start_date, end_date)
      VALUES 
        (${orgId}, 'premium', 'active', NOW(), NOW() + INTERVAL '1 year')
      ON CONFLICT DO NOTHING
    `;

    console.log('✅ Database seeded successfully!');
    console.log('\n🔑 Test Credentials:');
    console.log('   Student: student1@crimewise.com / studpass');
    console.log('   Instructor: instructor1@crimewise.com / instrpass');
    console.log('   Admin: admin@crimewise.com / adminpass');
    console.log('   Super Admin: superadmin@crimewise.com / superpass');

  } catch (err) {
    console.error('❌ Error seeding database:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seedPostgres().then(() => {
  console.log('\n✨ Seeding complete!');
  process.exit(0);
});
