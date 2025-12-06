require('dotenv').config();
const { Client } = require('pg');

async function cleanAndSeed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log('🗑️  Truncating all tables...');
    
    // Disable foreign key constraints temporarily (PostgreSQL doesn't have PRAGMA, so we'll use CASCADE)
    await client.query(`
      TRUNCATE TABLE ai_grades CASCADE;
      TRUNCATE TABLE ai_queue CASCADE;
      TRUNCATE TABLE student_answers CASCADE;
      TRUNCATE TABLE course_students CASCADE;
      TRUNCATE TABLE class_students CASCADE;
      TRUNCATE TABLE keyword_pools CASCADE;
      TRUNCATE TABLE question_options CASCADE;
      TRUNCATE TABLE questions CASCADE;
      TRUNCATE TABLE results CASCADE;
      TRUNCATE TABLE batches CASCADE;
      TRUNCATE TABLE instructor_course CASCADE;
      TRUNCATE TABLE batch_course CASCADE;
      TRUNCATE TABLE class_instructor CASCADE;
      TRUNCATE TABLE exams CASCADE;
      TRUNCATE TABLE courses CASCADE;
      TRUNCATE TABLE classes CASCADE;
      TRUNCATE TABLE sessions CASCADE;
      TRUNCATE TABLE users CASCADE;
      TRUNCATE TABLE subscriptions CASCADE;
      TRUNCATE TABLE organizations CASCADE;
    `);
    
    console.log('✅ All tables truncated');

    console.log('\n🌱 Seeding with super admin and organization...');

    // Create organization
    const orgResult = await client.query(`
      INSERT INTO organizations (name, domain, contact_email, subscription_plan, max_users, max_storage_gb, status)
      VALUES ('CrimeWise Main', 'crimewise.com', 'admin@crimewise.com', 'premium', 200, 50, 'active')
      RETURNING id
    `);
    const orgId = orgResult.rows[0].id;
    console.log(`✓ Organization created (id=${orgId})`);

    // Create super admin (no organization)
    const superAdminResult = await client.query(`
      INSERT INTO users (email, password, role, name, organization_id, status)
      VALUES ($1, $2, $3, $4, NULL, 'active')
      RETURNING id
    `, ['superadmin@crimewise.com', 'superpass', 'super_admin', 'Super Admin']);
    const superAdminId = superAdminResult.rows[0].id;
    console.log(`✓ Super Admin created (id=${superAdminId})`);

    // Create admin (belongs to organization)
    const adminResult = await client.query(`
      INSERT INTO users (email, password, role, name, organization_id, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING id
    `, ['admin@crimewise.com', 'adminpass', 'admin', 'Admin User', orgId]);
    const adminId = adminResult.rows[0].id;
    console.log(`✓ Admin created (id=${adminId})`);

    // Create subscription for organization
    await client.query(`
      INSERT INTO subscriptions (organization_id, plan_name, status, start_date, end_date, monthly_price, features)
      VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '1 year', 99.99, $4)
    `, [orgId, 'premium', 'active', JSON.stringify({ exams: true, grading: true, reports: true })]);
    console.log('✓ Subscription created');

    console.log('\n✅ Database cleaned and seeded successfully!');
    console.log('\nCredentials:');
    console.log('  Super Admin: superadmin@crimewise.com / superpass');
    console.log('  Admin: admin@crimewise.com / adminpass');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) cleanAndSeed();

module.exports = cleanAndSeed;
