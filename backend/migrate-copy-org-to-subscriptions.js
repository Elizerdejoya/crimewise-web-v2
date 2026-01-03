#!/usr/bin/env node

/**
 * Migration: Copy subscription plan, max_users, max_storage_gb from organizations to subscriptions
 * For existing subscriptions, populate max_users and max_storage_gb based on organization values
 */

const db = require('./db');

async function migrate() {
  try {
    console.log('[MIGRATE] Copying organization subscription data to subscriptions table...');
    
    // Get all organizations with their current max_users and max_storage_gb
    const organizations = await db.sql`
      SELECT id, subscription_plan, max_users, max_storage_gb 
      FROM organizations 
      WHERE subscription_plan IS NOT NULL
    `;
    
    console.log(`[MIGRATE] Found ${organizations.length} organizations with subscription plans`);
    
    // For each organization, update its active subscriptions with max_users and max_storage_gb
    for (const org of organizations) {
      try {
        // Check if organization has any subscriptions
        const subscriptions = await db.sql`
          SELECT id, max_users, max_storage_gb 
          FROM subscriptions 
          WHERE organization_id = ${org.id}
        `;
        
        if (subscriptions.length > 0) {
          // Update subscriptions that don't have these values yet
          for (const sub of subscriptions) {
            if (!sub.max_users || sub.max_users === null) {
              await db.sql`
                UPDATE subscriptions 
                SET max_users = ${org.max_users || 50}
                WHERE id = ${sub.id}
              `;
              console.log(`[MIGRATE] Updated subscription ${sub.id} with max_users: ${org.max_users || 50}`);
            }
            
            if (!sub.max_storage_gb || sub.max_storage_gb === null) {
              await db.sql`
                UPDATE subscriptions 
                SET max_storage_gb = ${org.max_storage_gb || 10}
                WHERE id = ${sub.id}
              `;
              console.log(`[MIGRATE] Updated subscription ${sub.id} with max_storage_gb: ${org.max_storage_gb || 10}`);
            }
          }
        }
      } catch (err) {
        console.warn(`[MIGRATE] Warning - Error processing organization ${org.id}:`, err.message);
        // Continue with other organizations
      }
    }
    
    console.log('[MIGRATE] Data migration complete');
    process.exit(0);
  } catch (err) {
    console.error('[MIGRATE] Error:', err.message);
    process.exit(1);
  }
}

migrate();
