const db = require('../db');

async function logEvent({ actor_id = null, actor_role = null, action, target_type = null, target_id = null, details = null }) {
  try {
    await db.sql`
      INSERT INTO events (actor_id, actor_role, action, target_type, target_id, details, created_at)
      VALUES (${actor_id}, ${actor_role}, ${action}, ${target_type}, ${target_id}, ${details ? JSON.stringify(details) : null}, CURRENT_TIMESTAMP)
    `;
  } catch (err) {
    console.error('[AUDIT] Failed to log event:', err && err.message ? err.message : err);
  }
}

module.exports = {
  logEvent,
};
