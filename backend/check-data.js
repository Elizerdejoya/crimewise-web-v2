const db = require('./db');

(async () => {
  try {
    const courses = await db.sql`SELECT id, name, code FROM courses LIMIT 5`;
    console.log('Courses:', courses);
    
    const exams = await db.sql`SELECT id, title, course_id FROM exams LIMIT 5`;
    console.log('Exams:', exams);
    
    const users = await db.sql`SELECT id, email, role FROM users WHERE email LIKE ${'%student1%'}`;
    console.log('Users:', users);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
})();
