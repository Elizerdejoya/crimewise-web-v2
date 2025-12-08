const db = require('./db');

(async () => {
  try {
    console.log('Testing AI metrics endpoint...\n');

    // Test each query individually
    console.log('1. Testing total graded query...');
    const totalGradedResult = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'done'`;
    console.log('Total graded result:', totalGradedResult);

    console.log('\n2. Testing pending queue query...');
    const pendingResult = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'pending'`;
    console.log('Pending result:', pendingResult);

    console.log('\n3. Testing error count query...');
    const errorResult = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'error'`;
    console.log('Error result:', errorResult);

    console.log('\n4. Testing average time query...');
    const timeResult = await db.sql`
      SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_time_seconds
      FROM ai_queue 
      WHERE status = 'done' AND updated_at IS NOT NULL AND created_at IS NOT NULL
    `;
    console.log('Average time result:', timeResult);

    console.log('\n5. Testing ai_queue table structure...');
    const tableInfo = await db.sql`PRAGMA table_info(ai_queue)`;
    console.log('Table structure:', tableInfo);

    console.log('\n6. Checking ai_queue row count...');
    const rowCount = await db.sql`SELECT COUNT(*) as total FROM ai_queue`;
    console.log('Total rows in ai_queue:', rowCount);

  } catch (err) {
    console.error('Error:', err.message);
    console.error('Full error:', err);
  }
  process.exit(0);
})();
