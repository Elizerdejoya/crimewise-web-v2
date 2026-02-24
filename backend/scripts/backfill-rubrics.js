const db = require('../db');

async function backfill() {
  try {
    console.log('Backfilling null rubric columns with default values...');
    const defaultRub = JSON.stringify({ findingsSimilarity: 70, objectivity: 15, structure: 15 });
    const result = await db.sql`UPDATE questions SET rubrics = ${defaultRub} WHERE rubrics IS NULL`;
    console.log('Rows affected:', result.changes || result.rowsAffected || 'unknown');
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error during backfill:', err);
    process.exit(1);
  }
}

backfill();
