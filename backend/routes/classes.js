const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  authenticateToken,
  requireRole,
  addOrganizationFilter,
} = require("../middleware");

// GET all classes
router.get(
  "/",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let rows;
      if (orgFilter.hasFilter) {
        // Include student counts for classes within the organization
        rows = await db.sql`
          SELECT c.*, COUNT(u.id) as students
          FROM classes c
          LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.organization_id = ${orgFilter.organizationId}
          WHERE c.organization_id = ${orgFilter.organizationId}
          GROUP BY c.id
        `;
      } else {
        // Global view: count all students assigned to each class
        rows = await db.sql`
          SELECT c.*, COUNT(u.id) as students
          FROM classes c
          LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student'
          GROUP BY c.id
        `;
      }

      // Ensure numeric count for consumers
      const result = rows.map((row) => ({ ...row, students: row.students ? Number(row.students) : 0 }));
      res.json(result);
    } catch (err) {
      console.log("[CLASSES][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST create class
router.post(
  "/",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name, batch_id } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      const result =
        await db.sql`INSERT INTO classes (name, batch_id, organization_id) VALUES (${name}, ${batch_id}, ${organization_id}) RETURNING id`;
      res.json({ id: result[0].id, name, batch_id, organization_id });
    } catch (err) {
      console.log("[CLASSES][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update class
router.put(
  "/:id",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name, batch_id } = req.body;
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();

      let result;
      if (orgFilter.hasFilter) {
        result =
          await db.sql`UPDATE classes SET name = ${name}, batch_id = ${batch_id} WHERE id = ${id} AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result =
          await db.sql`UPDATE classes SET name = ${name}, batch_id = ${batch_id} WHERE id = ${id}`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Class not found or access denied" });
      }

      res.json({ id, name, batch_id });
    } catch (err) {
      console.log("[CLASSES][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE class
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
      const classId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(classId)) {
        return res.status(400).json({ error: "Invalid class ID format" });
      }

      let result;
      if (orgFilter.hasFilter) {
        result =
          await db.sql`DELETE FROM classes WHERE id = ${classId} AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result = await db.sql`DELETE FROM classes WHERE id = ${classId}`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Class not found or access denied" });
      }

      res.json({ success: true, id: classId });
    } catch (err) {
      console.log("[CLASSES][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// BULK operations for classes
router.post(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { classes } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      if (!Array.isArray(classes) || classes.length === 0) {
        return res.status(400).json({ error: "No classes provided." });
      }

      const created = [];
      // Process each class insert one by one
      for (const cls of classes) {
        console.log("Creating class:", cls);
        const result =
          await db.sql`INSERT INTO classes (name, batch_id, organization_id) VALUES (${cls.name}, ${cls.batch_id}, ${organization_id}) RETURNING id`;
        console.log("Class created with ID:", result[0].id);
        created.push({
          id: result[0].id,
          name: cls.name,
          batch_id: cls.batch_id,
          organization_id,
        });
      }

      res.json(created);
    } catch (err) {
      console.log("[CLASSES][BULK POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.patch("/bulk", async (req, res) => {
  try {
    const { classes } = req.body;

    // --- Basic Input Validation ---
    if (!Array.isArray(classes) || classes.length === 0) {
      return res.status(400).json({
        message: 'Invalid request body. Expected a "classes" array.',
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
      "[CLASSES][BULK PATCH] About to update classes:",
      JSON.stringify(classes)
    );

    // --- Process Each Update ---
    for (const cls of classes) {
      try {
        // Validate required fields
        if (!cls || typeof cls !== "object" || cls.name === undefined) {
          results.errors.push({
            id: cls?.id || "unknown",
            message: "Invalid class object or missing name field.",
          });
          continue;
        }

        // Convert ID to number if it's a string
        const id = typeof cls.id === "string" ? parseInt(cls.id, 10) : cls.id;
        const batch_id =
          typeof cls.batch_id === "string"
            ? parseInt(cls.batch_id, 10)
            : cls.batch_id;

        if (isNaN(id)) {
          results.errors.push({ id: cls.id, message: "Invalid ID format." });
          continue;
        }

        console.log(
          `Attempting to update class: id=${id}, name=${cls.name}, batch_id=${batch_id}`
        );

        // Before update - verify the record exists
        const checkRecord =
          await db.sql`SELECT id FROM classes WHERE id = ${id}`;

        if (!checkRecord || checkRecord.length === 0) {
          results.notFound.push(id);
          console.log(`Class with id=${id} not found in database`);
          continue;
        }

        // Perform database update
        await db.sql`UPDATE classes SET name = ${cls.name}, batch_id = ${batch_id} WHERE id = ${id}`;

        // Consider the update successful since we verified the record exists
        // and no error was thrown during the update operation
        results.updated.push({ id, name: cls.name, batch_id });
        console.log(
          `Successfully updated class: id=${id}, name=${cls.name}, batch_id=${batch_id}`
        );

        // Double-check that the update was applied
        const afterUpdate =
          await db.sql`SELECT name, batch_id FROM classes WHERE id = ${id}`;
        if (afterUpdate && afterUpdate.length > 0) {
          console.log(
            `Verification: class ${id} now has name "${afterUpdate[0].name}" and batch_id ${afterUpdate[0].batch_id}`
          );
        }
      } catch (updateErr) {
        console.error(`Error updating class with ID ${cls?.id}:`, updateErr);
        results.errors.push({
          id: cls?.id || "unknown",
          message:
            updateErr.message || "An unexpected error occurred during update.",
        });
      }
    }

    // Send response with detailed results
    res.status(200).json({
      message: `Bulk update process completed. Updated: ${results.updated.length}, Not Found: ${results.notFound.length}, Errors: ${results.errors.length}`,
      results,
    });
  } catch (err) {
    console.log("[CLASSES][BULK PATCH] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "Valid array of class IDs is required" });
    }

    const results = {
      success: true,
      totalProcessed: ids.length,
      deletedCount: 0,
      notFound: [],
      invalidIds: [],
      errors: [],
    };

    // Process each deletion with validation
    for (const id of ids) {
      // Convert ID to number if it's a string
      const classId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(classId)) {
        results.invalidIds.push(id);
        continue;
      }

      try {
        const result = await db.sql`DELETE FROM classes WHERE id = ${classId}`;

        if (result.rowsAffected > 0) {
          results.deletedCount++;
        } else {
          results.notFound.push(classId);
        }
      } catch (deleteErr) {
        console.log(`Error deleting class ${classId}:`, deleteErr.message);
        results.errors.push({ id: classId, error: deleteErr.message });
      }
    }

    // Update overall success flag if needed
    if (results.deletedCount === 0) {
      results.success = false;
    }

    res.json(results);
  } catch (err) {
    console.log("[CLASSES][BULK DELETE] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST endpoint for bulk deletion - alternative to DELETE /bulk
router.post("/bulk-delete", async (req, res) => {
  try {
    // Get direct access to the request body for debugging
    console.log("[CLASSES][BULK-DELETE] Raw request body:", req.body);

    const { ids } = req.body;
    console.log("[CLASSES][BULK-DELETE] IDs extracted:", ids);

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
        const classId = Number(id);

        if (isNaN(classId)) {
          console.log(`Invalid ID format at position ${i}:`, id);
          results.invalidIds.push(id);
          continue;
        }

        console.log(`Deleting class with ID: ${classId} (${typeof classId})`);

        const result = await db.sql`DELETE FROM classes WHERE id = ${classId}`;
        console.log("Delete operation result:", result);

        // Check for successful deletion based on changes property
        // SQLite Cloud driver returns changes property instead of rowsAffected
        if (result && (result.changes > 0 || result.rowsAffected > 0)) {
          results.deletedCount++;
          console.log(`Successfully deleted class with ID: ${classId}`);
        } else {
          results.notFound.push(classId);
          console.log(`Class not found with ID: ${classId}`);
        }
      } catch (deleteErr) {
        console.error(`Error deleting class ${id}:`, deleteErr.message);

        // Check for foreign key constraint error
        if (
          deleteErr.message &&
          deleteErr.message.includes("FOREIGN KEY constraint failed")
        ) {
          results.constraintErrors.push({
            id,
            message:
              "Cannot delete this class because it is referenced by other records (students, exams, etc.)",
          });
          console.log(
            `Foreign key constraint error for class ${id}: Class is referenced by other records`
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
    console.error("[CLASSES][BULK-DELETE] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: err.message || "An unexpected error occurred" });
  }
});

module.exports = router;
