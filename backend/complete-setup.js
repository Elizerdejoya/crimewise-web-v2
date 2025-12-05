const db = require('./db');

async function seedPostgres() {
  try {
    console.log('🌱 Completing PostgreSQL database setup...');

    // Get organization ID
    const orgs = await db.sql`SELECT id FROM organizations ORDER BY id LIMIT 1`;
    const orgId = orgs[0]?.id || 1;
    console.log(`📦 Organization ID: ${orgId}`);

    // Get instructor ID
    const instructors = await db.sql`SELECT id FROM users WHERE role = 'instructor' LIMIT 1`;
    const instructorId = instructors[0]?.id || 3;
    console.log(`👨‍🏫 Instructor ID: ${instructorId}`);

    // Get existing courses
    const courses = await db.sql`SELECT id, name, code FROM courses WHERE organization_id = ${orgId}`;
    console.log(`📚 Found ${courses.length} courses:`, courses.map(c => `${c.id}:${c.name}`).join(', '));

    if (courses.length < 2) {
      console.error('❌ Need at least 2 courses. Run seed-postgres.js first.');
      process.exit(1);
    }

    // Check existing exams
    const existingExams = await db.sql`SELECT COUNT(*) as count FROM exams WHERE organization_id = ${orgId}`;
    const examCount = existingExams[0]?.count || 0;
    console.log(`   Exams in org: ${examCount}`);
    
    if (examCount === 0) {
      console.log('📝 Creating exams...');
      try {
        await db.sql`
          INSERT INTO exams (organization_id, course_id, created_by, title, description, duration_minutes, total_questions, status)
          VALUES
            (${orgId}, ${courses[0].id}, ${instructorId}, 'Criminal Law Midterm', 'Midterm exam for Criminal Law', 60, 2, 'published'),
            (${orgId}, ${courses[1].id}, ${instructorId}, 'Forensics Quiz', 'Quick quiz on forensic evidence', 30, 2, 'published')
        `;
        console.log('✅ Exams created');
      } catch (insertErr) {
        console.error('❌ Error creating exams:', insertErr.message);
        throw insertErr;
      }
    } else {
      console.log(`✅ Exams already exist (${examCount})`);
    }

    // Get exams
    const exams = await db.sql`SELECT id, title FROM exams WHERE organization_id = ${orgId}`;
    if (exams.length > 0) {
      console.log(`📋 Exams:`, exams.map(e => `${e.id}:${e.title}`).join(', '));
    }

    // Check existing questions
    const existingQuestions = await db.sql`SELECT COUNT(*) as count FROM questions`;
    const questionCount = existingQuestions[0]?.count || 0;
    if (questionCount === 0 && exams.length >= 2) {
      console.log('❓ Creating questions...');
      try {
        await db.sql`
          INSERT INTO questions (organization_id, exam_id, question_text, question_type, points)
          VALUES
            (${orgId}, ${exams[0].id}, 'What is a felony?', 'short', 5),
            (${orgId}, ${exams[1].id}, 'List two types of forensic evidence.', 'short', 5)
        `;
        console.log('✅ Questions created');
      } catch (insertErr) {
        console.error('❌ Error creating questions:', insertErr.message);
        throw insertErr;
      }
    } else {
      console.log(`✅ Questions already exist (${questionCount})`);
    }

    console.log('\n✅ Database setup complete!');
    console.log('\n🔑 Test Credentials:');
    console.log('   Email: student1@crimewise.com');
    console.log('   Password: studpass');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seedPostgres().then(() => {
  console.log('\n✨ Done!');
  process.exit(0);
});
