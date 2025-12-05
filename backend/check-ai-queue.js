const db = require('./db');

(async () => {
  try {
    console.log('📊 Checking AI Grading Pipeline\n');

    // Get column info
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    
    const colResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ai_queue'
      ORDER BY ordinal_position
    `);
    console.log('AI Queue Columns:');
    for (const col of colResult.rows) {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    }
    await client.end();

    console.log('');

    // Check results
    const results = await db.sql`SELECT COUNT(*) as count FROM results`;
    console.log(`📝 Total Results Submitted: ${results[0].count}`);

    // Check ai_queue
    const queueStats = await db.sql`
      SELECT status, COUNT(*) as count 
      FROM ai_queue 
      GROUP BY status
    `;
    console.log(`\n📋 AI Queue Status:`);
    let totalQueued = 0;
    for (const row of queueStats) {
      console.log(`   ${row.status}: ${row.count}`);
      totalQueued += row.count;
    }
    console.log(`   TOTAL QUEUED: ${totalQueued}`);

    // Check ai_grades
    const grades = await db.sql`SELECT COUNT(*) as count FROM ai_grades`;
    console.log(`\n⭐ AI Grades Completed: ${grades[0].count}`);

    // Get sample queue items
    console.log(`\n🔍 Recent Queue Items (last 5):`);
    const recent = await db.sql`
      SELECT id, status, result_id, question_id, retry_count, updated_at 
      FROM ai_queue 
      ORDER BY id DESC 
      LIMIT 5
    `;
    if (recent.length > 0) {
      for (const row of recent) {
        console.log(`   ID ${row.id}: status=${row.status}, result=${row.result_id}, question=${row.question_id}, retries=${row.retry_count}`);
      }
    } else {
      console.log('   (empty)');
    }

    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`   Results: ${results[0].count}`);
    console.log(`   Queued for AI: ${totalQueued}`);
    console.log(`   Grades completed: ${grades[0].count}`);
    console.log(`   Pending/Processing: ${totalQueued - grades[0].count}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  }
  process.exit(0);
})();
