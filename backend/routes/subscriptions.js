const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken, requireRole } = require("../middleware");

// GET all subscriptions (super admin only)
router.get(
  "/",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const subscriptions = await db.sql`
      SELECT s.*, o.name as organization_name, o.domain
      FROM subscriptions s
      JOIN organizations o ON s.organization_id = o.id
      ORDER BY s.created_at DESC
    `;
      res.json(subscriptions);
    } catch (err) {
      console.log("[SUBSCRIPTIONS][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET subscriptions for specific organization
router.get(
  "/organization/:orgId",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const { orgId } = req.params;
      const subscriptions = await db.sql`
      SELECT s.*, o.name as organization_name
      FROM subscriptions s
      JOIN organizations o ON s.organization_id = o.id
      WHERE s.organization_id = ${orgId}
      ORDER BY s.created_at DESC
    `;
      res.json(subscriptions);
    } catch (err) {
      console.log("[SUBSCRIPTIONS][GET BY ORG] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST create new subscription
router.post(
  "/",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const {
        organization_id,
        plan_name,
        start_date,
        end_date,
        monthly_price,
        features,
        max_users,
        max_storage_gb,
      } = req.body;

      if (!organization_id || !plan_name || !start_date) {
        return res
          .status(400)
          .json({
            error: "Organization ID, plan name, and start date are required",
          });
      }

      // Deactivate current active subscription
      await db.sql`
      UPDATE subscriptions 
      SET status = 'inactive', end_date = CURRENT_TIMESTAMP 
      WHERE organization_id = ${organization_id} AND status = 'active'
    `;

      // Create new subscription (store max users / storage on subscription)
      const result = await db.sql`
      INSERT INTO subscriptions (organization_id, plan_name, max_users, max_storage_gb, start_date, end_date, monthly_price, features)
      VALUES (${organization_id}, ${plan_name}, ${max_users || 50}, ${max_storage_gb || 10}, ${start_date}, ${end_date}, ${monthly_price}, ${JSON.stringify(
        features
      )})
      RETURNING *
    `;

      res.status(201).json(result[0]);
    } catch (err) {
      console.log("[SUBSCRIPTIONS][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update subscription
router.put(
  "/:id",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        plan_name,
        start_date,
        end_date,
        monthly_price,
        features,
        status,
        max_users,
        max_storage_gb,
      } = req.body;

      await db.sql`
      UPDATE subscriptions 
      SET plan_name = ${plan_name}, 
          max_users = ${max_users},
          max_storage_gb = ${max_storage_gb},
          start_date = ${start_date}, 
          end_date = ${end_date}, 
          monthly_price = ${monthly_price}, 
          features = ${JSON.stringify(features)}, 
          status = ${status}
      WHERE id = ${id}
    `;

      const updatedSub =
        await db.sql`SELECT * FROM subscriptions WHERE id = ${id}`;

      if (!updatedSub || updatedSub.length === 0) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      res.json(updatedSub[0]);
    } catch (err) {
      console.log("[SUBSCRIPTIONS][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE subscription
router.delete(
  "/:id",
  authenticateToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      await db.sql`DELETE FROM subscriptions WHERE id = ${id}`;

      res.json({ success: true, message: "Subscription deleted successfully" });
    } catch (err) {
      console.log("[SUBSCRIPTIONS][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET subscription status for current user's organization
router.get(
  "/my-status",
  authenticateToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const user = req.user;
      
      // First check if the organization itself is active
      const organization = await db.sql`
        SELECT id, status, name FROM organizations WHERE id = ${user.organization_id}
      `;

      if (!organization || organization.length === 0) {
        return res.json({
          hasActiveSubscription: false,
          message: "Organization not found",
          subscription: null
        });
      }

      const orgData = organization[0];
      
      // If organization is inactive, subscription is considered expired
      if (orgData.status !== 'active') {
        return res.json({
          hasActiveSubscription: false,
          isExpired: true,
          message: "Organization is inactive",
          subscription: null
        });
      }
      
      // Get the most recent active subscription for the user's organization
      const subscription = await db.sql`
        SELECT s.*, o.name as organization_name
        FROM subscriptions s
        JOIN organizations o ON s.organization_id = o.id
        WHERE s.organization_id = ${user.organization_id} 
        AND s.status = 'active'
        ORDER BY s.end_date DESC
        LIMIT 1
      `;

      if (!subscription || subscription.length === 0) {
        // No active subscription found, but organization is active
        // Check if there are any subscriptions at all
        const anySubscription = await db.sql`
          SELECT s.*, o.name as organization_name
          FROM subscriptions s
          JOIN organizations o ON s.organization_id = o.id
          WHERE s.organization_id = ${user.organization_id}
          ORDER BY s.created_at DESC
          LIMIT 1
        `;

        if (anySubscription && anySubscription.length > 0) {
          // Has subscription but it's inactive - expired
          return res.json({
            hasActiveSubscription: false,
            isExpired: true,
            message: "Subscription is inactive",
            subscription: {
              id: anySubscription[0].id,
              plan_name: anySubscription[0].plan_name,
              status: anySubscription[0].status,
              end_date: anySubscription[0].end_date,
              monthly_price: anySubscription[0].monthly_price,
              organization_name: anySubscription[0].organization_name
            }
          });
        } else {
          // No subscription at all - but organization is active, so allow access
          return res.json({
            hasActiveSubscription: true,
            isExpired: false,
            message: "Organization is active",
            subscription: null
          });
        }
      }

      const currentSubscription = subscription[0];
      const now = new Date();
      const endDate = new Date(currentSubscription.end_date);
      const isExpired = now > endDate;
      const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

      res.json({
        hasActiveSubscription: !isExpired,
        isExpired: isExpired,
        daysUntilExpiry: daysUntilExpiry,
        subscription: {
          id: currentSubscription.id,
          plan_name: currentSubscription.plan_name,
          status: currentSubscription.status,
          end_date: currentSubscription.end_date,
          monthly_price: currentSubscription.monthly_price,
          organization_name: currentSubscription.organization_name
        }
      });
    } catch (err) {
      console.log("[SUBSCRIPTIONS][MY_STATUS] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET subscription plans (available plans)
router.get("/plans/available", async (req, res) => {
  try {
    const plans = [
      {
        name: "basic",
        display_name: "Basic Plan",
        price: 49.99,
        max_users: 50,
        max_storage_gb: 10,
        features: ["basic_features", "email_support"],
        description: "Perfect for small organizations",
      },
      {
        name: "premium",
        display_name: "Premium Plan",
        price: 99.99,
        max_users: 200,
        max_storage_gb: 50,
        features: [
          "advanced_analytics",
          "priority_support",
          "custom_branding",
          "api_access",
        ],
        description: "Advanced features for growing organizations",
      },
      {
        name: "enterprise",
        display_name: "Enterprise Plan",
        price: 199.99,
        max_users: 1000,
        max_storage_gb: 200,
        features: [
          "advanced_analytics",
          "priority_support",
          "custom_branding",
          "api_access",
          "dedicated_support",
          "custom_integrations",
        ],
        description: "Enterprise-grade solution for large organizations",
      },
    ];

    res.json(plans);
  } catch (err) {
    console.log("[SUBSCRIPTIONS][PLANS] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
