const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken, requireRole } = require("../middleware");

// GET all organizations (super admin only)
router.get(
  "/",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
            const organizations = await db.sql`
            SELECT o.*, 
              s.plan_name as current_plan,
              s.status as subscription_status,
              s.end_date as subscription_end_date,
              s.max_users as max_users,
              s.max_storage_gb as max_storage_gb,
              (SELECT email FROM users ua WHERE ua.organization_id = o.id AND ua.role = 'admin' LIMIT 1) as admin_email,
              COUNT(u.id) as user_count
            FROM organizations o
            LEFT JOIN subscriptions s ON o.id = s.organization_id AND s.status = 'active'
            LEFT JOIN users u ON o.id = u.organization_id
            GROUP BY o.id, s.id, s.plan_name, s.status, s.end_date
            ORDER BY o.created_at DESC
          `;
      res.json(organizations);
    } catch (err) {
      console.log("[ORGANIZATIONS][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET single organization
router.get(
  "/:id",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
            const organization = await db.sql`
            SELECT o.*, 
              s.plan_name as current_plan,
              s.status as subscription_status,
              s.end_date as subscription_end_date,
              s.monthly_price,
              s.features,
              s.max_users as max_users,
              s.max_storage_gb as max_storage_gb,
              (SELECT email FROM users ua WHERE ua.organization_id = o.id AND ua.role = 'admin' LIMIT 1) as admin_email
            FROM organizations o
            LEFT JOIN subscriptions s ON o.id = s.organization_id AND s.status = 'active'
            WHERE o.id = ${id}
          `;

      if (!organization || organization.length === 0) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json(organization[0]);
    } catch (err) {
      console.log("[ORGANIZATIONS][GET BY ID] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST create new organization
router.post(
  "/",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const {
        name,
        domain,
        admin_name,
        subscription_plan,
        max_users,
        max_storage_gb,
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Organization name is required" });
      }

      // Create organization
      const result = await db.sql`
      INSERT INTO organizations (name, domain, admin_name)
      VALUES (${name}, ${domain}, ${admin_name})
      RETURNING *
    `;

      const organization = result[0];

      res.status(201).json(organization);
        // If admin credentials are provided, create the admin user for this organization
        const { admin_email, admin_password } = req.body;
        if (admin_email && admin_password) {
          try {
            await db.sql`
              INSERT INTO users (name, email, password, role, status, organization_id)
              VALUES (${admin_name || name + " Admin"}, ${admin_email}, ${admin_password}, 'admin', 'active', ${organization.id})
            `;
          } catch (userErr) {
            console.error('[ORGANIZATIONS][POST] Failed to create admin user:', userErr && userErr.message ? userErr.message : userErr);
            // Organization created successfully, but admin user creation failed - don't block the response
          }
        }
    } catch (err) {
      console.log("[ORGANIZATIONS][POST] Error:", err.message);
      if (err.message.includes("UNIQUE constraint failed")) {
        return res.status(400).json({ error: "Domain already exists" });
      }
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update organization
router.put(
  "/:id",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        domain,
        admin_name,
        status,
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Organization name is required" });
      }

      await db.sql`
      UPDATE organizations 
      SET name = ${name}, 
          domain = ${domain}, 
          admin_name = ${admin_name}, 
          status = ${status},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;

      const updatedOrg =
        await db.sql`SELECT * FROM organizations WHERE id = ${id}`;

      if (!updatedOrg || updatedOrg.length === 0) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json(updatedOrg[0]);
    } catch (err) {
      console.log("[ORGANIZATIONS][PUT] Error:", err.message);
      if (err.message.includes("UNIQUE constraint failed")) {
        return res.status(400).json({ error: "Domain already exists" });
      }
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE organization
router.delete(
  "/:id",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Delete users in this organization first
      await db.sql`DELETE FROM users WHERE organization_id = ${id}`;

      // Delete subscriptions
      await db.sql`DELETE FROM subscriptions WHERE organization_id = ${id}`;

      // Delete organization
      await db.sql`DELETE FROM organizations WHERE id = ${id}`;

      res.json({ success: true, message: "Organization deleted successfully" });
    } catch (err) {
      console.log("[ORGANIZATIONS][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET organization statistics
router.get(
  "/:id/stats",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [userCount, batchCount, courseCount, questionCount] =
        await Promise.all([
          db.sql`SELECT COUNT(*) as count FROM users WHERE organization_id = ${id}`,
          db.sql`SELECT COUNT(*) as count FROM batches WHERE organization_id = ${id}`,
          db.sql`SELECT COUNT(*) as count FROM courses WHERE organization_id = ${id}`,
          db.sql`SELECT COUNT(*) as count FROM questions WHERE organization_id = ${id}`,
        ]);

      res.json({
        users: userCount[0].count,
        batches: batchCount[0].count,
        courses: courseCount[0].count,
        questions: questionCount[0].count,
      });
    } catch (err) {
      console.log("[ORGANIZATIONS][STATS] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
