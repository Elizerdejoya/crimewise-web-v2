const db = require('./db');

(async () => {
  try {
    console.log('Testing exam insert...');
    const result = await db.sql`INSERT INTO exams (organization_id, course_id, created_by, title) VALUES (1, 4, 4, 'Test Exam')`;
    console.log('Insert result:', result);
    
    const exams = await db.sql`SELECT id, title FROM exams`;
    console.log('Exams now:', exams);
  } catch(e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
