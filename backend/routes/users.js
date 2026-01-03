const express = require("express");
const router = express.Router();
const db = require("../db");
const audit = require("../lib/audit");
const { authenticateToken, requireRole } = require("../middleware");

// GET all users with filtering based on current user's role and organization
router.get("/", authenticateToken, async (req, res) => {
  try {
    const currentUser = req.user;
    let rows;

    if (currentUser.role === "super_admin") {
      // Super admin can see all users
      rows =
        await db.sql`SELECT id, email, role, name, status, organization_id FROM users`;
    } else if (currentUser.role === "admin") {
      // Admin can only see users from their organization, excluding super_admin
      rows = await db.sql`
        SELECT id, email, role, name, status, organization_id 
        FROM users 
        WHERE organization_id = ${currentUser.organization_id} 
        AND role != 'super_admin'
      `;
    } else {
      // Other roles (instructor, student) have limited access
      return res
        .status(403)
        .json({ error: "Insufficient permissions to view users" });
    }

    res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET current user profile (authenticated user)
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.sql`SELECT * FROM users WHERE id = ${userId}`;

    if (!user || user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Don't return password in response
    const { password, ...userWithoutPassword } = user[0];
    res.json(userWithoutPassword);
  } catch (err) {
    console.log("[USERS][GET /me] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET single user by ID
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Convert ID to number if it's a string
    const userId = typeof id === "string" ? parseInt(id, 10) : id;

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await db.sql`SELECT * FROM users WHERE id = ${userId}`;

    if (!user || user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Don't return password in response
    const { password, ...userWithoutPassword } = user[0];
    res.json(userWithoutPassword);
  } catch (err) {
    console.log("[USERS][GET] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Create new user
router.post(
  "/",
  authenticateToken,
  requireRole("admin", "super_admin"),
  async (req, res) => {
    try {
      const { name, email, role, status } = req.body;
      const currentUser = req.user;

      // Validate required fields
      if (!name || !email || !role) {
        return res
          .status(400)
          .json({ error: "Name, email, and role are required" });
      }

      // Permission checks
      if (currentUser.role === "admin") {
        // Admin cannot create super_admin users
        if (role === "super_admin") {
          return res
            .status(403)
            .json({
              error: "Insufficient permissions to create super admin users",
            });
        }
      }

      // Set default password (in a real app, you'd want to generate this or send an invite email)
      const defaultPassword = "password123";

      try {
        // Set organization_id for non-super_admin users
        const organization_id =
          currentUser.role === "super_admin"
            ? null
            : currentUser.organization_id;

        const result =
          await db.sql`INSERT INTO users (name, email, password, role, status, organization_id) 
        VALUES (${name}, ${email}, ${defaultPassword}, ${role}, ${
            status || "active"
          }, ${organization_id}) 
        RETURNING *`;

        const created = result[0];
        // Log audit event
        try {
          await audit.logEvent({
            actor_id: currentUser.id,
            actor_role: currentUser.role,
            action: 'create_user',
            target_type: 'user',
            target_id: created.id,
            details: { name, email, role }
          });
        } catch (e) {
          console.error('[AUDIT] create_user logging failed', e && e.message ? e.message : e);
        }

        res.status(201).json(created);
      } catch (insertErr) {
        if (insertErr.message.includes("UNIQUE constraint failed")) {
          return res.status(400).json({ error: "Email already exists" });
        }
        throw insertErr;
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// UPDATE user (single) - allows users to update their own profile or admins to update others
router.put(
  "/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { name, email, role, status, password } = req.body;
      const id = req.params.id;
      const currentUser = req.user;

      // Convert ID to number if it's a string
      const userId = typeof id === "string" ? parseInt(id, 10) : id;

      // Validate required fields
      if (!name || !email) {
        return res
          .status(400)
          .json({ error: "Name and email are required" });
      }

      // Get the target user to check permissions
      const targetUser = await db.sql`SELECT * FROM users WHERE id = ${userId}`;
      if (!targetUser || targetUser.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const target = targetUser[0];

      // Check if user is updating their own profile
      const isSelfUpdate = currentUser.id === userId;
      
      // If not updating self, require admin/super_admin role
      if (!isSelfUpdate && !["admin", "super_admin"].includes(currentUser.role)) {
        return res
          .status(403)
          .json({ error: "Only admins can update other users' profiles" });
      }

      // Permission checks for admin updates
      if (!isSelfUpdate && currentUser.role === "admin") {
        // Admin cannot edit super_admin users
        if (target.role === "super_admin") {
          return res
            .status(403)
            .json({ error: "Cannot edit super admin users" });
        }

        // Admin cannot edit users from other organizations
        if (target.organization_id !== currentUser.organization_id) {
          return res
            .status(403)
            .json({ error: "Cannot edit users from other organizations" });
        }

        // Admin cannot edit co-admins (other admins from same organization)
        if (target.role === "admin" && target.id !== currentUser.id) {
          return res
            .status(403)
            .json({ error: "Cannot edit other admin users" });
        }

        // Admin cannot change role to super_admin
        if (role === "super_admin") {
          return res
            .status(403)
            .json({ error: "Cannot assign super admin role" });
        }
      }

      // For self-updates, preserve role and status, and require role for admin updates
      const finalRole = isSelfUpdate ? target.role : (role || target.role);
      const finalStatus = isSelfUpdate ? target.status : (status || target.status);
      
      if (!isSelfUpdate && !role) {
        return res
          .status(400)
          .json({ error: "Role is required when updating other users" });
      }

      console.log(
        `Updating user: id=${userId}, name=${name}, email=${email}, role=${finalRole}, status=${finalStatus}, isSelfUpdate=${isSelfUpdate}`
      );

      try {
        // Build dynamic query parts to handle optional password update
        if (password && password.trim() !== "") {
          await db.sql`UPDATE users 
          SET name = ${name}, email = ${email}, role = ${finalRole}, status = ${finalStatus}, password = ${password} 
          WHERE id = ${userId}`;
        } else {
          await db.sql`UPDATE users 
          SET name = ${name}, email = ${email}, role = ${finalRole}, status = ${finalStatus} 
          WHERE id = ${userId}`;
        }

        // Check if any rows were updated (need to query to confirm)
        const updatedUser =
          await db.sql`SELECT * FROM users WHERE id = ${userId}`;

        if (!updatedUser || updatedUser.length === 0) {
          return res.status(404).json({ error: "User not found" });
        }

        // Don't return the password in the response
        const { password: _, ...userWithoutPassword } = updatedUser[0];
        res.json({ success: true, ...userWithoutPassword });
      } catch (updateErr) {
        if (updateErr.message.includes("UNIQUE constraint failed")) {
          return res.status(400).json({ error: "Email already exists" });
        }
        throw updateErr;
      }
    } catch (err) {
      console.log("[USERS][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// UPDATE user status (active/inactive) - kept for backward compatibility
router.put("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;

    // Convert ID to number if it's a string
    const userId = typeof id === "string" ? parseInt(id, 10) : id;

    if (!status || !["active", "inactive"].includes(status)) {
      return res
        .status(400)
        .json({ error: "Valid status (active/inactive) is required" });
    }

    console.log(`Updating user status: id=${userId}, status=${status}`);

    const result =
      await db.sql`UPDATE users SET status = ${status} WHERE id = ${userId}`;

    // Check if any rows were updated
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true, id: userId, status });
  } catch (err) {
    console.log("[USERS][PUT STATUS] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// UPDATE user password
router.put("/:id/password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const id = req.params.id;
    const currentUser = req.user;

    // Convert ID to number if it's a string
    const userId = typeof id === "string" ? parseInt(id, 10) : id;

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    if (!newPassword) {
      return res.status(400).json({ error: "New password is required" });
    }

    // Check if user is changing their own password or if admin is changing someone else's
    const isSelfUpdate = currentUser.id === userId;
    
    if (!isSelfUpdate && !["admin", "super_admin"].includes(currentUser.role)) {
      return res
        .status(403)
        .json({ error: "Only admins can change other users' passwords" });
    }

    // Get current user data to verify password
    const user = await db.sql`SELECT * FROM users WHERE id = ${userId}`;

    if (!user || user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // For self-updates, verify current password. For admin updates, skip current password check
    if (isSelfUpdate) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required" });
      }
      
      // In a real app, you'd use bcrypt to compare passwords
      // Here we're doing a simple comparison for demo purposes
      if (currentPassword !== user[0].password) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
    }

    // Update the password
    await db.sql`UPDATE users SET password = ${newPassword} WHERE id = ${userId}`;

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.log("[USERS][PUT PASSWORD] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE user (single)
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Convert ID to number if it's a string
    const userId = typeof id === "string" ? parseInt(id, 10) : id;

    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    console.log(`Deleting user: id=${userId}`);

    const result = await db.sql`DELETE FROM users WHERE id = ${userId}`;

    // Check if any rows were deleted
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Log audit event (if possible)
    try {
      const actor_id = req.user && req.user.id ? req.user.id : null;
      const actor_role = req.user && req.user.role ? req.user.role : 'system';
      await audit.logEvent({
        actor_id,
        actor_role,
        action: 'delete_user',
        target_type: 'user',
        target_id: userId,
        details: null,
      });
    } catch (e) {
      console.error('[AUDIT] delete_user logging failed', e && e.message ? e.message : e);
    }

    res.json({ success: true, id: userId });
  } catch (err) {
    console.log("[USERS][DELETE] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Bulk operations
// ===============

// POST endpoint for bulk deletion - alternative to DELETE /bulk
router.post(
  "/bulk-delete",
  authenticateToken,
  requireRole("admin", "super_admin"),
  async (req, res) => {
    try {
      // Get direct access to the request body for debugging
      console.log("[USERS][BULK-DELETE] Raw request body:", req.body);

      const { ids } = req.body;
      console.log("[USERS][BULK-DELETE] IDs extracted:", ids);

      // Validate input
      if (!ids) {
        return res
          .status(400)
          .json({ error: "Missing ids property in request body" });
      }

      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }

      if (ids.length === 0) {
        return res.status(400).json({ error: "Empty ids array provided" });
      }

      const results = {
        success: true,
        totalProcessed: ids.length,
        deletedCount: 0,
        notFound: [],
        invalidIds: [],
        constraintErrors: [],
        errors: [],
      };

      // Process each deletion one by one
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        console.log(`Processing ID at position ${i}:`, id, typeof id);

        // Skip null/undefined values
        if (id === null || id === undefined) {
          results.invalidIds.push(id);
          continue;
        }

        try {
          // Force conversion to number
          const userId = Number(id);

          if (isNaN(userId)) {
            console.log(`Invalid ID format at position ${i}:`, id);
            results.invalidIds.push(id);
            continue;
          }

          console.log(`Deleting user with ID: ${userId} (${typeof userId})`);

          // Check permissions before deletion
          const targetUser =
            await db.sql`SELECT * FROM users WHERE id = ${userId}`;
          if (targetUser && targetUser.length > 0) {
            const target = targetUser[0];
            const currentUser = req.user;

            // Permission checks
            if (currentUser.role === "admin") {
              // Admin cannot delete super_admin users
              if (target.role === "super_admin") {
                results.constraintErrors.push({
                  id: userId,
                  message: "Cannot delete super admin users",
                });
                continue;
              }

              // Admin cannot delete users from other organizations
              if (target.organization_id !== currentUser.organization_id) {
                results.constraintErrors.push({
                  id: userId,
                  message: "Cannot delete users from other organizations",
                });
                continue;
              }

              // Admin cannot delete co-admins (other admins from same organization)
              if (target.role === "admin" && target.id !== currentUser.id) {
                results.constraintErrors.push({
                  id: userId,
                  message: "Cannot delete other admin users",
                });
                continue;
              }
            }
          }

          const result = await db.sql`DELETE FROM users WHERE id = ${userId}`;
          console.log("Delete operation result:", result);

          // Check for successful deletion based on changes property
          // SQLite Cloud driver returns changes property instead of rowsAffected
          if (result && (result.changes > 0 || result.rowsAffected > 0)) {
            results.deletedCount++;
            console.log(`Successfully deleted user with ID: ${userId}`);
          } else {
            results.notFound.push(userId);
            console.log(`User not found with ID: ${userId}`);
          }
        } catch (deleteErr) {
          console.error(`Error deleting user ${id}:`, deleteErr.message);

          // Check for foreign key constraint error
          if (
            deleteErr.message &&
            deleteErr.message.includes("FOREIGN KEY constraint failed")
          ) {
            results.constraintErrors.push({
              id,
              message:
                "Cannot delete this user because they are referenced by other records",
            });
            console.log(
              `Foreign key constraint error for user ${id}: User is referenced by other records`
            );
          } else {
            results.errors.push({ id, error: deleteErr.message });
          }
        }
      }

      // Update overall success flag if needed
      if (results.deletedCount === 0 && ids.length > 0) {
        results.success = false;
      }

      console.log("Delete operation final results:", results);
      res.status(200).json(results);
    } catch (err) {
      console.error("[USERS][BULK-DELETE] Unexpected error:", err);
      return res
        .status(500)
        .json({ error: err.message || "An unexpected error occurred" });
    }
  }
);

// Bulk delete users
router.delete(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json({ error: "Valid array of user IDs is required" });
      }

      const results = {
        success: true,
        totalProcessed: ids.length,
        deletedCount: 0,
        notFound: [],
        invalidIds: [],
        errors: [],
      };

      // Process each deletion individually with proper type handling and error tracking
      for (const id of ids) {
        // Convert ID to number if it's a string
        const userId = typeof id === "string" ? parseInt(id, 10) : id;

        if (isNaN(userId)) {
          results.invalidIds.push(id);
          continue;
        }

        console.log(`Bulk deleting user: id=${userId}`);

        try {
          const result = await db.sql`DELETE FROM users WHERE id = ${userId}`;

          if (result.rowsAffected > 0) {
            results.deletedCount++;
          } else {
            results.notFound.push(userId);
          }
        } catch (deleteErr) {
          console.log(`Error deleting user ${userId}:`, deleteErr.message);
          results.errors.push({ id: userId, error: deleteErr.message });
        }
      }

      // Update overall success flag if needed
      if (results.deletedCount === 0) {
        results.success = false;
      }

      res.json(results);
    } catch (err) {
      console.log("[USERS][BULK DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Bulk update user status
router.put(
  "/bulk/status",
  authenticateToken,
  requireRole("admin", "super_admin"),
  async (req, res) => {
    try {
      const { ids, status } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json({ error: "Valid array of user IDs is required" });
      }

      if (!status || !["active", "inactive"].includes(status)) {
        return res
          .status(400)
          .json({ error: "Valid status (active/inactive) is required" });
      }

      let updatedCount = 0;
      const updatedIds = [];

      // Process each update individually with proper type handling
      for (const id of ids) {
        // Convert ID to number if it's a string
        const userId = typeof id === "string" ? parseInt(id, 10) : id;

        console.log(
          `Bulk updating user status: id=${userId}, status=${status}`
        );

        const result =
          await db.sql`UPDATE users SET status = ${status} WHERE id = ${userId}`;

        if (result.rowsAffected > 0) {
          updatedCount++;
          updatedIds.push(userId);
        }
      }

      res.json({ success: true, updatedCount, updatedIds });
    } catch (err) {
      console.log("[USERS][BULK STATUS] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Bulk update users
router.patch("/bulk", async (req, res) => {
  try {
    const { users } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res
        .status(400)
        .json({ error: "Valid array of users is required" });
    }

    const updated = [];

    for (const user of users) {
      const { id, name, email, role, status } = user;

      if (!id || !name || !email || !role) {
        console.log(`Skipping invalid user update: ${JSON.stringify(user)}`);
        continue;
      }

      // Convert ID to number if it's a string
      const userId = typeof id === "string" ? parseInt(id, 10) : id;

      console.log(
        `Bulk updating user: id=${userId}, name=${name}, email=${email}, role=${role}, status=${
          status || "active"
        }`
      );

      try {
        const result = await db.sql`
          UPDATE users 
          SET name = ${name}, email = ${email}, role = ${role}, status = ${
          status || "active"
        } 
          WHERE id = ${userId}
        `;

        if (result.rowsAffected > 0) {
          updated.push({
            id: userId,
            name,
            email,
            role,
            status: status || "active",
          });
        }
      } catch (updateErr) {
        if (updateErr.message.includes("UNIQUE constraint failed")) {
          console.log(`Email already exists for user ${userId}`);
        } else {
          console.log(`Error updating user ${userId}:`, updateErr.message);
        }
      }
    }

    res.json({ success: true, updated: updated.length, items: updated });
  } catch (err) {
    console.log("[USERS][BULK PATCH] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
