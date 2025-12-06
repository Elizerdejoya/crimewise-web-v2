const { Client } = require('pg');

async function setTimezone() {
  const client = new Client(process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_LufDJkmlC79x@ep-odd-bush-a18tlvck-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  
  try {
    await client.connect();
    console.log('Connected to Neon...');
    
    // Try to set timezone for the database
    await client.query("ALTER DATABASE neondb SET timezone = 'Asia/Manila'");
    console.log('Set database timezone to Asia/Manila');
    
    // Check current timezone
    const result = await client.query('SHOW timezone');
    console.log('Current session timezone:', result.rows[0]);
    
    // Get all existing timestamps to see their current format
    const examsCheck = await client.query('SELECT id, start, "end" FROM exams LIMIT 3');
    console.log('Sample exams:', examsCheck.rows);
    
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await client.end();
  }
}

setTimezone();
