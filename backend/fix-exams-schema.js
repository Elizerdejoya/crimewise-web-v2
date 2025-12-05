const db = require('./db');
const { Client } = require('pg');

async function fixExamsSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('🔧 Fixing exams table schema...');

    // Check if columns exist
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'exams' AND (column_name = 'instructor_id' OR column_name = 'class_id')
    `);

    const existingColumns = result.rows.map(r => r.column_name);
    console.log(`Found columns: ${existingColumns.join(', ')}`);

    // Add instructor_id if missing
    if (!existingColumns.includes('instructor_id')) {
      console.log('➕ Adding instructor_id column...');
      await client.query(`
        ALTER TABLE exams
        ADD COLUMN instructor_id INTEGER REFERENCES users(id)
      `);
      console.log('✅ instructor_id added');
    }

    // Add class_id if missing  
    if (!existingColumns.includes('class_id')) {
      console.log('➕ Adding class_id column...');
      await client.query(`
        ALTER TABLE exams
        ADD COLUMN class_id INTEGER REFERENCES classes(id)
      `);
      console.log('✅ class_id added');
    }

    console.log('✅ Schema fixed!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixExamsSchema().then(() => {
  console.log('Done!');
  process.exit(0);
});
