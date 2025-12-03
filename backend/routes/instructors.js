const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  authenticateToken,
  requireRole,
  addOrganizationFilter,
} = require("../middleware");

// GET all instructors (id, name, email)
router.get(
  "/",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let rows;
      if (orgFilter.hasFilter) {
        rows =
          await db.sql`SELECT id, name, email, instructor_id FROM users WHERE role = 'instructor' AND organization_id = ${orgFilter.organizationId}`;
      } else {
        rows =
          await db.sql`SELECT id, name, email, instructor_id FROM users WHERE role = 'instructor'`;
      }

      res.json(rows);
    } catch (err) {
      console.log("[INSTRUCTORS][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST create instructor
router.post(
  "/",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { email, name, instructorId, password } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      if (!email || !name || !instructorId || !password) {
        return res.status(400).json({
          error: "Email, name, instructorId, and password are required",
        });
      }

      const result = await db.sql`
      INSERT INTO users (email, name, role, status, instructor_id, password, organization_id) 
      VALUES (${email}, ${name}, 'instructor', 'active', ${instructorId}, ${password}, ${organization_id})
      RETURNING id`;

      res.json({
        id: result[0].id,
        email,
        name,
        instructorId,
        organization_id,
      });
    } catch (err) {
      console.log("[INSTRUCTORS][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update instructor
router.put(
  "/:id",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { email, name, instructorId, password } = req.body;
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();

      if (!email || !name || !instructorId) {
        return res
          .status(400)
          .json({ error: "Email, name, and instructorId are required" });
      }

      // Build SQL query dynamically based on whether password is provided and organization filter
      let result;
      if (orgFilter.hasFilter) {
        if (password) {
          result = await db.sql`
          UPDATE users 
          SET email = ${email}, name = ${name}, instructor_id = ${instructorId}, password = ${password}
          WHERE id = ${id} AND role = 'instructor' AND organization_id = ${orgFilter.organizationId}`;
        } else {
          result = await db.sql`
          UPDATE users 
          SET email = ${email}, name = ${name}, instructor_id = ${instructorId}
          WHERE id = ${id} AND role = 'instructor' AND organization_id = ${orgFilter.organizationId}`;
        }
      } else {
        if (password) {
          result = await db.sql`
          UPDATE users 
          SET email = ${email}, name = ${name}, instructor_id = ${instructorId}, password = ${password}
          WHERE id = ${id} AND role = 'instructor'`;
        } else {
          result = await db.sql`
          UPDATE users 
          SET email = ${email}, name = ${name}, instructor_id = ${instructorId}
          WHERE id = ${id} AND role = 'instructor'`;
        }
      }

      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "Instructor not found" });
      }

      res.json({ id: parseInt(id), email, name, instructorId });
    } catch (err) {
      console.log("[INSTRUCTORS][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE instructor
router.delete(
  "/:id",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();
      // Convert ID to number if it's a string
      const instructorId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(instructorId)) {
        return res.status(400).json({ error: "Invalid instructor ID format" });
      }

      let result;
      if (orgFilter.hasFilter) {
        result =
          await db.sql`DELETE FROM users WHERE id = ${instructorId} AND role = 'instructor' AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result =
          await db.sql`DELETE FROM users WHERE id = ${instructorId} AND role = 'instructor'`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Instructor not found or access denied" });
      }

      res.json({ success: true, id: instructorId });
    } catch (err) {
      console.log("[INSTRUCTORS][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// BULK operations for instructors
router.post(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { instructors } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      if (!Array.isArray(instructors) || instructors.length === 0) {
        return res.status(400).json({ error: "No instructors provided" });
      }

      // Validate all instructors have required fields
      const invalidEntries = instructors.filter(
        (i) => !i.name || !i.email || !i.instructorId || !i.password
      );
      if (invalidEntries.length > 0) {
        return res.status(400).json({
          error:
            "All instructors must have name, email, instructorId, and password",
        });
      }

      const created = [];

      for (const instructor of instructors) {
        console.log("Processing instructor:", instructor);
        console.log("Instructor ID being inserted:", instructor.instructorId);
        const result = await db.sql`
        INSERT INTO users (email, name, role, status, instructor_id, password, organization_id) 
        VALUES (${instructor.email}, ${instructor.name}, 'instructor', 'active', ${instructor.instructorId}, ${instructor.password}, ${organization_id})
        RETURNING id`;
        console.log("Insert result:", result);
        console.log("Database ID created:", result[0].id);

        created.push({
          id: result[0].id,
          name: instructor.name,
          email: instructor.email,
          instructorId: instructor.instructorId,
          organization_id,
        });
      }

      res.json(created);
    } catch (err) {
      console.log("[INSTRUCTORS][BULK POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.patch(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { instructors } = req.body;
      const orgFilter = req.getOrgFilter();

      // --- Basic Input Validation ---
      if (!Array.isArray(instructors) || instructors.length === 0) {
        return res.status(400).json({
          message: 'Invalid request body. Expected an "instructors" array.',
        });
      }

      // --- Detailed Results Tracking ---
      const results = {
        updated: [],
        notFound: [],
        errors: [],
      };

      // --- Debug beforeUpdate values ---
      console.log(
        "[INSTRUCTORS][BULK PATCH] About to update instructors:",
        JSON.stringify(instructors)
      );

      // --- Process Each Update ---
      for (const instructor of instructors) {
        try {
          // Validate required fields
          if (
            !instructor ||
            typeof instructor !== "object" ||
            !instructor.name ||
            !instructor.email ||
            !instructor.instructorId
          ) {
            results.errors.push({
              id: instructor?.id || "unknown",
              message: "Invalid instructor object or missing required fields.",
            });
            continue;
          }

          // Convert ID to number if it's a string
          const id =
            typeof instructor.id === "string"
              ? parseInt(instructor.id, 10)
              : instructor.id;

          if (isNaN(id)) {
            results.errors.push({
              id: instructor.id,
              message: "Invalid ID format.",
            });
            continue;
          }

          console.log(
            `Attempting to update instructor: id=${id}, name=${instructor.name}, email=${instructor.email}, instructorId=${instructor.instructorId}`
          );

          // Before update - verify the record exists with organization filter
          let checkRecord;
          if (orgFilter.hasFilter) {
            checkRecord =
              await db.sql`SELECT id FROM users WHERE id = ${id} AND role = 'instructor' AND organization_id = ${orgFilter.organizationId}`;
          } else {
            checkRecord =
              await db.sql`SELECT id FROM users WHERE id = ${id} AND role = 'instructor'`;
          }

          if (!checkRecord || checkRecord.length === 0) {
            results.notFound.push(id);
            console.log(
              `Instructor with id=${id} not found in database or access denied`
            );
            continue;
          }

          // Perform database update with or without password and organization filter
          if (orgFilter.hasFilter) {
            if (instructor.password) {
              await db.sql`UPDATE users 
              SET name = ${instructor.name}, 
                  email = ${instructor.email}, 
                  instructor_id = ${instructor.instructorId},
                  password = ${instructor.password}
              WHERE id = ${id} AND role = 'instructor' AND organization_id = ${orgFilter.organizationId}`;
            } else {
              await db.sql`UPDATE users 
              SET name = ${instructor.name}, 
                  email = ${instructor.email}, 
                  instructor_id = ${instructor.instructorId}
              WHERE id = ${id} AND role = 'instructor' AND organization_id = ${orgFilter.organizationId}`;
            }
          } else {
            if (instructor.password) {
              await db.sql`UPDATE users 
              SET name = ${instructor.name}, 
                  email = ${instructor.email}, 
                  instructor_id = ${instructor.instructorId},
                  password = ${instructor.password}
              WHERE id = ${id} AND role = 'instructor'`;
            } else {
              await db.sql`UPDATE users 
              SET name = ${instructor.name}, 
                  email = ${instructor.email}, 
                  instructor_id = ${instructor.instructorId}
              WHERE id = ${id} AND role = 'instructor'`;
            }
          }

          // Consider the update successful since we verified the record exists
          // and no error was thrown during the update operation
          results.updated.push({
            id,
            name: instructor.name,
            email: instructor.email,
            instructorId: instructor.instructorId,
          });

          console.log(
            `Successfully updated instructor: id=${id}, name=${instructor.name}, email=${instructor.email}`
          );

          // Double-check that the update was applied
          const afterUpdate =
            await db.sql`SELECT name, email, instructor_id FROM users WHERE id = ${id} AND role = 'instructor'`;
          if (afterUpdate && afterUpdate.length > 0) {
            console.log(
              `Verification: instructor ${id} now has name "${afterUpdate[0].name}", email "${afterUpdate[0].email}", and instructorId "${afterUpdate[0].instructor_id}"`
            );
          }
        } catch (updateErr) {
          console.error(
            `Error updating instructor with ID ${instructor?.id}:`,
            updateErr
          );
          results.errors.push({
            id: instructor?.id || "unknown",
            message:
              updateErr.message ||
              "An unexpected error occurred during update.",
          });
        }
      }

      // Send response with detailed results
      res.status(200).json({
        message: `Bulk update process completed. Updated: ${results.updated.length}, Not Found: ${results.notFound.length}, Errors: ${results.errors.length}`,
        results,
      });
    } catch (err) {
      console.log("[INSTRUCTORS][BULK PATCH] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST endpoint for bulk deletion - alternative to DELETE /bulk
router.post(
  "/bulk-delete",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      // Get direct access to the request body for debugging
      console.log("[INSTRUCTORS][BULK-DELETE] Raw request body:", req.body);

      const { ids } = req.body;
      const orgFilter = req.getOrgFilter();
      console.log("[INSTRUCTORS][BULK-DELETE] IDs extracted:", ids);

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
          const instructorId = Number(id);

          if (isNaN(instructorId)) {
            console.log(`Invalid ID format at position ${i}:`, id);
            results.invalidIds.push(id);
            continue;
          }

          console.log(
            `Deleting instructor with ID: ${instructorId} (${typeof instructorId})`
          );

          let result;
          if (orgFilter.hasFilter) {
            result =
              await db.sql`DELETE FROM users WHERE id = ${instructorId} AND role = 'instructor' AND organization_id = ${orgFilter.organizationId}`;
          } else {
            result =
              await db.sql`DELETE FROM users WHERE id = ${instructorId} AND role = 'instructor'`;
          }
          console.log("Delete operation result:", result);

          // Check for successful deletion based on changes property
          // SQLite Cloud driver returns changes property instead of rowsAffected
          if (result && (result.changes > 0 || result.rowsAffected > 0)) {
            results.deletedCount++;
            console.log(
              `Successfully deleted instructor with ID: ${instructorId}`
            );
          } else {
            results.notFound.push(instructorId);
            console.log(`Instructor not found with ID: ${instructorId}`);
          }
        } catch (deleteErr) {
          console.error(`Error deleting instructor ${id}:`, deleteErr.message);

          // Check for foreign key constraint error
          if (
            deleteErr.message &&
            deleteErr.message.includes("FOREIGN KEY constraint failed")
          ) {
            results.constraintErrors.push({
              id,
              message:
                "Cannot delete this instructor because they are referenced by other records (classes, exams, etc.)",
            });
            console.log(
              `Foreign key constraint error for instructor ${id}: Instructor is referenced by other records`
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
      console.error("[INSTRUCTORS][BULK-DELETE] Unexpected error:", err);
      return res
        .status(500)
        .json({ error: err.message || "An unexpected error occurred" });
    }
  }
);

module.exports = router;
