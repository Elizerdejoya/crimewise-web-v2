const db = require('./db');

async function populateExamColumns() {
  try {
    console.log('📝 Populating exams with instructor_id and class_id...');

    // Get all exams
    const exams = await db.sql`SELECT id FROM exams`;
    console.log(`Found ${exams.length} exams`);

    if (exams.length === 0) {
      console.log('✅ No exams to update');
      process.exit(0);
    }

    // Get instructor ID
    const instructors = await db.sql`SELECT id FROM users WHERE role = 'instructor' LIMIT 1`;
    const instructorId = instructors[0]?.id;

    if (!instructorId) {
      console.error('❌ No instructor found in database');
      process.exit(1);
    }

    // Get class ID
    const classes = await db.sql`SELECT id FROM classes LIMIT 1`;
    const classId = classes[0]?.id;

    if (!classId) {
      console.error('❌ No class found in database');
      process.exit(1);
    }

    console.log(`Using instructor_id=${instructorId}, class_id=${classId}`);

    // Update all exams
    await db.sql`UPDATE exams SET instructor_id = ${instructorId}, class_id = ${classId}`;

    console.log('✅ Exams updated!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

populateExamColumns().then(() => {
  console.log('Done!');
  process.exit(0);
});
