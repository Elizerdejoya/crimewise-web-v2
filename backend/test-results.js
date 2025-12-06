const db = require('./db.js');

(async () => {
  try {
    const results = await db.sql`SELECT id, student_id, exam_id, answer, details FROM results LIMIT 3`;
    console.log('Results from database:');
    results.forEach((r, i) => {
      console.log(`\n=== Result ${i + 1} ===`);
      console.log('ID:', r.id);
      console.log('Student ID:', r.student_id);
      console.log('Exam ID:', r.exam_id);
      console.log('Answer exists:', !!r.answer);
      console.log('Answer length:', r.answer ? r.answer.length : 0);
      console.log('Details exists:', !!r.details);
      console.log('Details length:', r.details ? r.details.length : 0);
      if (r.details && typeof r.details === 'string') {
        try {
          const parsed = JSON.parse(r.details);
          console.log('Details parsed successfully:');
          console.log('  totalScore:', parsed.totalScore);
          console.log('  totalPossiblePoints:', parsed.totalPossiblePoints);
          console.log('  explanationScore:', parsed.explanationScore);
          console.log('  explanationPoints:', parsed.explanationPoints);
        } catch (e) {
          console.log('Failed to parse details:', e.message);
        }
      }
    });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
