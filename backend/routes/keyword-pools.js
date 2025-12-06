const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken, requireRole, addOrganizationFilter } = require("../middleware");

// GET all keyword pools for the organization
router.get(
  "/keyword-pools",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();
      
      let query;
      if (orgFilter.hasFilter) {
        query = db.sql`
          SELECT kp.*, u.name as created_by_name
          FROM keyword_pools kp
          LEFT JOIN users u ON kp.created_by = u.id
          WHERE kp.organization_id = ${orgFilter.organizationId}
          ORDER BY kp.created DESC
        `;
      } else {
        query = db.sql`
          SELECT kp.*, u.name as created_by_name
          FROM keyword_pools kp
          LEFT JOIN users u ON kp.created_by = u.id
          ORDER BY kp.created DESC
        `;
      }

      const pools = await query;
      
      // Parse keywords JSON for each pool
      const poolsWithKeywords = pools.map(pool => ({
        ...pool,
        keywords: JSON.parse(pool.keywords || '[]')
      }));

      res.json(poolsWithKeywords);
    } catch (err) {
      console.error("[Keyword Pools][GET] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET single keyword pool by ID
router.get(
  "/keyword-pools/:id",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const orgFilter = req.getOrgFilter();

      let query;
      if (orgFilter.hasFilter) {
        query = db.sql`
          SELECT kp.*, u.name as created_by_name
          FROM keyword_pools kp
          LEFT JOIN users u ON kp.created_by = u.id
          WHERE kp.id = ${id} AND kp.organization_id = ${orgFilter.organizationId}
        `;
      } else {
        query = db.sql`
          SELECT kp.*, u.name as created_by_name
          FROM keyword_pools kp
          LEFT JOIN users u ON kp.created_by = u.id
          WHERE kp.id = ${id}
        `;
      }

      const pool = await query;
      
      if (pool.length === 0) {
        return res.status(404).json({ error: "Keyword pool not found" });
      }

      // Parse keywords JSON
      const poolWithKeywords = {
        ...pool[0],
        keywords: JSON.parse(pool[0].keywords || '[]')
      };

      res.json(poolWithKeywords);
    } catch (err) {
      console.error("[Keyword Pools][GET] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST create new keyword pool
router.post(
  "/keyword-pools",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name, keywords, description } = req.body;
      const created_by = req.user.id;
      const orgFilter = req.getOrgFilter();

      if (!name || !keywords || !Array.isArray(keywords)) {
        return res.status(400).json({ 
          error: "Name and keywords array are required" 
        });
      }

      // Get organization_id for the new keyword pool
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      // Insert the new keyword pool
      const result = await db.sql`
        INSERT INTO keyword_pools (name, keywords, description, organization_id, created_by, created) 
        VALUES (${name}, ${JSON.stringify(keywords)}, ${description || null}, ${organization_id}, ${created_by}, CURRENT_TIMESTAMP)
        RETURNING id
      `;

      const newId = result[0].id;

      // Get the inserted keyword pool with creator details
      const newPool = await db.sql`
        SELECT kp.*, u.name as created_by_name
        FROM keyword_pools kp
        LEFT JOIN users u ON kp.created_by = u.id
        WHERE kp.id = ${newId}
      `;

      // Parse keywords JSON
      const poolWithKeywords = {
        ...newPool[0],
        keywords: JSON.parse(newPool[0].keywords || '[]')
      };

      res.json(poolWithKeywords);
    } catch (err) {
      console.error("[Keyword Pools][POST] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update keyword pool
router.put(
  "/keyword-pools/:id",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, keywords, description } = req.body;
      const orgFilter = req.getOrgFilter();

      if (!name || !keywords || !Array.isArray(keywords)) {
        return res.status(400).json({ 
          error: "Name and keywords array are required" 
        });
      }

      // Check if keyword pool exists and user has access
      let checkQuery;
      if (orgFilter.hasFilter) {
        checkQuery = db.sql`
          SELECT id FROM keyword_pools 
          WHERE id = ${id} AND organization_id = ${orgFilter.organizationId}
        `;
      } else {
        checkQuery = db.sql`
          SELECT id FROM keyword_pools WHERE id = ${id}
        `;
      }

      const existing = await checkQuery;
      if (existing.length === 0) {
        return res.status(404).json({ error: "Keyword pool not found" });
      }

      // Update the keyword pool
      await db.sql`
        UPDATE keyword_pools 
        SET name = ${name}, 
            keywords = ${JSON.stringify(keywords)}, 
            description = ${description || null}
        WHERE id = ${id}
      `;

      // Get the updated keyword pool
      const updatedPool = await db.sql`
        SELECT kp.*, u.name as created_by_name
        FROM keyword_pools kp
        LEFT JOIN users u ON kp.created_by = u.id
        WHERE kp.id = ${id}
      `;

      // Parse keywords JSON
      const poolWithKeywords = {
        ...updatedPool[0],
        keywords: JSON.parse(updatedPool[0].keywords || '[]')
      };

      res.json(poolWithKeywords);
    } catch (err) {
      console.error("[Keyword Pools][PUT] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE keyword pool
router.delete(
  "/keyword-pools/:id",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const orgFilter = req.getOrgFilter();

      // Check if keyword pool exists and user has access
      let checkQuery;
      if (orgFilter.hasFilter) {
        checkQuery = db.sql`
          SELECT id FROM keyword_pools 
          WHERE id = ${id} AND organization_id = ${orgFilter.organizationId}
        `;
      } else {
        checkQuery = db.sql`
          SELECT id FROM keyword_pools WHERE id = ${id}
        `;
      }

      const existing = await checkQuery;
      if (existing.length === 0) {
        return res.status(404).json({ error: "Keyword pool not found" });
      }

      // Check if any questions are using this keyword pool
      const questionsUsingPool = await db.sql`
        SELECT COUNT(*) as count FROM questions WHERE keyword_pool_id = ${id}
      `;

      if (questionsUsingPool[0].count > 0) {
        return res.status(400).json({ 
          error: "Cannot delete keyword pool. It is being used by existing questions." 
        });
      }

      // Delete the keyword pool
      await db.sql`DELETE FROM keyword_pools WHERE id = ${id}`;

      res.json({ message: "Keyword pool deleted successfully" });
    } catch (err) {
      console.error("[Keyword Pools][DELETE] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
