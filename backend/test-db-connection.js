const db = require('./db');

async function testConnection() {
  try {
    console.log('Testing PostgreSQL connection...');
    const result = await db.sql`SELECT 1 as test`;
    console.log('✓ Connection successful!');
    console.log('Result:', result);
    process.exit(0);
  } catch (err) {
    console.error('✗ Connection failed:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  }
}

testConnection();
