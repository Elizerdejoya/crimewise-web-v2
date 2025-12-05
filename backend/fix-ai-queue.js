// Add missing columns to ai_queue table
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixAiQueueTable() {
  const client = await pool.connect();
  try {
    console.log('Adding missing columns to ai_queue table...\n');

    // Check what columns exist
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ai_queue'
      ORDER BY ordinal_position;
    `);

    console.log('Current ai_queue columns:');
    result.rows.forEach(row => console.log(`  - ${row.column_name}`));

    // Add attempts column if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE ai_queue 
        ADD COLUMN attempts INTEGER DEFAULT 0
      `);
      console.log('\n✓ Added attempts column');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('\n✓ attempts column already exists');
      } else {
        throw err;
      }
    }

    // Add other potentially missing columns
    const colsToAdd = [
      { name: 'batch_id', def: 'INTEGER' },
      { name: 'result_id', def: 'INTEGER' },
      { name: 'question_id', def: 'INTEGER' },
      { name: 'student_answer', def: 'TEXT' },
      { name: 'priority', def: 'INTEGER DEFAULT 0' },
      { name: 'retry_count', def: 'INTEGER DEFAULT 0' },
      { name: 'error_message', def: 'TEXT' }
    ];

    for (const col of colsToAdd) {
      try {
        await client.query(`
          ALTER TABLE ai_queue 
          ADD COLUMN ${col.name} ${col.def}
        `);
        console.log(`✓ Added ${col.name} column`);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.log(`⚠ Could not add ${col.name}: ${err.message}`);
        }
      }
    }

    console.log('\n✅ ai_queue table updated successfully');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAiQueueTable();
