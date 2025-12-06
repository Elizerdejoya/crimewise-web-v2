require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log('🔧 Aligning PostgreSQL schema to expected (SQLite-derived) schema...');

    // Helper to check column
    async function hasColumn(table, column) {
      const r = await client.query(`
        SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2
      `, [table, column]);
      return r.rowCount > 0;
    }

    // Exams: ensure columns exist
    const examColumns = [
      { name: 'name', type: 'TEXT' },
      { name: 'course_id', type: 'INTEGER' },
      { name: 'class_id', type: 'INTEGER' },
      { name: 'instructor_id', type: 'INTEGER' },
      { name: 'question_id', type: 'INTEGER' },
      { name: 'start', type: 'TIMESTAMP' },
      { name: 'end', type: 'TIMESTAMP' },
      { name: 'duration', type: 'TEXT' },
      { name: 'token', type: 'TEXT' },
      { name: 'organization_id', type: 'INTEGER' }
    ];

    for (const col of examColumns) {
      const exists = await hasColumn('exams', col.name);
      if (!exists) {
        console.log(`➕ Adding exams.${col.name} ${col.type}`);
        // 'end' is a reserved word in Postgres, quote it when present
        if (col.name === 'end') {
          await client.query(`ALTER TABLE exams ADD COLUMN "end" ${col.type}`);
        } else {
          await client.query(`ALTER TABLE exams ADD COLUMN ${col.name} ${col.type}`);
        }
      } else {
        console.log(`✓ exams.${col.name} exists`);
      }
    }

    // Questions: ensure course_id, title, text, created_by, created
    const qCols = [
      { name: 'course_id', type: 'INTEGER' },
      { name: 'title', type: 'TEXT' },
      { name: 'text', type: 'TEXT' },
      { name: 'created_by', type: 'INTEGER' },
      { name: 'organization_id', type: 'INTEGER' },
      { name: 'created', type: 'TIMESTAMP' },
      { name: 'points', type: 'INTEGER' },
      { name: 'explanation', type: 'TEXT' }
    ];

    for (const col of qCols) {
      const exists = await hasColumn('questions', col.name);
      if (!exists) {
        console.log(`➕ Adding questions.${col.name} ${col.type}`);
        await client.query(`ALTER TABLE questions ADD COLUMN ${col.name} ${col.type}`);
      } else {
        console.log(`✓ questions.${col.name} exists`);
      }
    }

    // Results: ensure date, answer, tab_switches, details, explanation
    const rCols = [
      { name: 'date', type: 'TIMESTAMP' },
      { name: 'answer', type: 'TEXT' },
      { name: 'tab_switches', type: 'INTEGER DEFAULT 0' },
      { name: 'details', type: 'TEXT' },
      { name: 'explanation', type: 'TEXT' }
    ];

    for (const col of rCols) {
      const exists = await hasColumn('results', col.name);
      if (!exists) {
        console.log(`➕ Adding results.${col.name} ${col.type}`);
        await client.query(`ALTER TABLE results ADD COLUMN ${col.name} ${col.type}`);
      } else {
        console.log(`✓ results.${col.name} exists`);
      }
    }

    console.log('\n✅ Schema alignment complete.');
  } catch (err) {
    console.error('❌ Schema alignment failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) run();

module.exports = run;
