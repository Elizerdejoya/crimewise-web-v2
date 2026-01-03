const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware');

// GET /api/events?actor=123&action=create_user&since=2026-01-01&until=2026-01-03&limit=50
router.get('/', authenticateToken, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { actor, action, since, until, limit = 100, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Fetch all events and filter in-memory (simple approach)
    const allRows = await db.sql`SELECT * FROM events ORDER BY created_at DESC`;
    
    // Filter results
    let filtered = allRows;
    if (actor) filtered = filtered.filter(e => e.actor_id === Number(actor));
    if (action) filtered = filtered.filter(e => e.action === action);
    if (since) filtered = filtered.filter(e => new Date(e.created_at) >= new Date(since));
    if (until) filtered = filtered.filter(e => new Date(e.created_at) <= new Date(until));
    
    // Apply pagination
    const paginated = filtered.slice(offset, offset + Number(limit));
    
    res.json(paginated);
  } catch (err) {
    console.error('[EVENTS][GET] Error:', err && err.message ? err.message : err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
