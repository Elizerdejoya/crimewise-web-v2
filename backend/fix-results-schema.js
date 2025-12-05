const { Client } = require('pg');
require('dotenv').config();

async function fixResultsSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('🔧 Fixing results table schema...');

    // Get existing columns
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'results'
      ORDER BY column_name
    `);

    const existingColumns = new Set(result.rows.map(r => r.column_name));
    console.log(`Existing columns: ${Array.from(existingColumns).join(', ')}`);

    const columnsToAdd = [
      { name: 'date', type: 'TIMESTAMP', check: () => !existingColumns.has('date') },
      { name: 'answer', type: 'TEXT', check: () => !existingColumns.has('answer') },
      { name: 'tab_switches', type: 'INTEGER DEFAULT 0', check: () => !existingColumns.has('tab_switches') },
      { name: 'details', type: 'TEXT', check: () => !existingColumns.has('details') },
      { name: 'explanation', type: 'TEXT', check: () => !existingColumns.has('explanation') },
    ];

    for (const col of columnsToAdd) {
      if (col.check()) {
        console.log(`➕ Adding ${col.name} column...`);
        await client.query(`ALTER TABLE results ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✅ ${col.name} added`);
      } else {
        console.log(`✓ ${col.name} already exists`);
      }
    }

    console.log('✅ Results table schema fixed!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Details:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixResultsSchema().then(() => {
  console.log('Done!');
  process.exit(0);
});
