const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  authenticateToken,
  requireRole,
  addOrganizationFilter,
} = require("../middleware");

// GET all courses
router.get(
  "/",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let rows;
      if (orgFilter.hasFilter) {
        // Include student counts for courses within the organization
        rows = await db.sql`
          SELECT c.*, COUNT(u.id) as students
          FROM courses c
          LEFT JOIN users u ON u.course_id = c.id AND u.role = 'student' AND u.organization_id = ${orgFilter.organizationId}
          WHERE c.organization_id = ${orgFilter.organizationId}
          GROUP BY c.id
        `;
      } else {
        // Global view: count all students assigned to each course
        rows = await db.sql`
          SELECT c.*, COUNT(u.id) as students
          FROM courses c
          LEFT JOIN users u ON u.course_id = c.id AND u.role = 'student'
          GROUP BY c.id
        `;
      }

      const result = rows.map((row) => ({ ...row, students: row.students ? Number(row.students) : 0 }));
      res.json(result);
    } catch (err) {
      console.log("[COURSES][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST create course
router.post(
  "/",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name, code, description } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      const result =
        await db.sql`INSERT INTO courses (name, code, description, organization_id) VALUES (${name}, ${
          code || null
        }, ${description || null}, ${organization_id}) RETURNING id`;
      res.json({ id: result[0].id, name, code, description, organization_id });
    } catch (err) {
      console.log("[COURSES][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update course
router.put(
  "/:id",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name, code, description } = req.body;
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();

      let result;
      if (orgFilter.hasFilter) {
        result = await db.sql`UPDATE courses SET name = ${name}, code = ${
          code || null
        }, description = ${
          description || null
        } WHERE id = ${id} AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result = await db.sql`UPDATE courses SET name = ${name}, code = ${
          code || null
        }, description = ${description || null} WHERE id = ${id}`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Course not found or access denied" });
      }

      res.json({ id: parseInt(id), name, code, description });
    } catch (err) {
      console.log("[COURSES][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE course
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
      const courseId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(courseId)) {
        return res.status(400).json({ error: "Invalid course ID format" });
      }

      let result;
      if (orgFilter.hasFilter) {
        result =
          await db.sql`DELETE FROM courses WHERE id = ${courseId} AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result = await db.sql`DELETE FROM courses WHERE id = ${courseId}`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Course not found or access denied" });
      }

      res.json({ success: true, id: courseId });
    } catch (err) {
      console.log("[COURSES][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// BULK operations for courses
router.post(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { courses } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      if (!Array.isArray(courses) || courses.length === 0) {
        return res.status(400).json({ error: "No courses provided." });
      }

      const created = [];
      // Process each course insert one by one
      for (const course of courses) {
        console.log("Processing course:", course);
        const result =
          await db.sql`INSERT INTO courses (name, code, description, organization_id) VALUES (${
            course.name
          }, ${course.code || null}, ${
            course.description || null
          }, ${organization_id}) RETURNING id`;
        console.log("Insert result:", result);
        created.push({
          id: result[0].id,
          name: course.name,
          code: course.code,
          description: course.description,
          organization_id,
        });
      }

      res.json(created);
    } catch (err) {
      console.log("[COURSES][BULK POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.patch("/bulk", async (req, res) => {
  try {
    const { courses } = req.body;

    // --- Basic Input Validation ---
    if (!Array.isArray(courses) || courses.length === 0) {
      return res
        .status(400)
        .json({ message: 'Invalid request body. Expected a "courses" array.' });
    }

    // --- Detailed Results Tracking ---
    const results = {
      updated: [],
      notFound: [],
      errors: [],
    };

    // --- Debug beforeUpdate values ---
    console.log(
      "[COURSES][BULK PATCH] About to update courses:",
      JSON.stringify(courses)
    );

    // --- Process Each Update ---
    for (const course of courses) {
      try {
        // Validate required fields
        if (
          !course ||
          typeof course !== "object" ||
          course.name === undefined
        ) {
          results.errors.push({
            id: course?.id || "unknown",
            message: "Invalid course object or missing name field.",
          });
          continue;
        }

        // Convert ID to number if it's a string
        const id =
          typeof course.id === "string" ? parseInt(course.id, 10) : course.id;

        if (isNaN(id)) {
          results.errors.push({ id: course.id, message: "Invalid ID format." });
          continue;
        }

        console.log(
          `Attempting to update course: id=${id}, name=${course.name}`
        );

        // Before update - verify the record exists
        const checkRecord =
          await db.sql`SELECT id FROM courses WHERE id = ${id}`;

        if (!checkRecord || checkRecord.length === 0) {
          results.notFound.push(id);
          console.log(`Course with id=${id} not found in database`);
          continue;
        }

        // Perform database update
        await db.sql`UPDATE courses SET name = ${course.name} WHERE id = ${id}`;

        // Consider the update successful since we verified the record exists
        // and no error was thrown during the update operation
        results.updated.push({ id, name: course.name });
        console.log(
          `Successfully updated course: id=${id}, name=${course.name}`
        );

        // Double-check that the update was applied
        const afterUpdate =
          await db.sql`SELECT name FROM courses WHERE id = ${id}`;
        if (afterUpdate && afterUpdate.length > 0) {
          console.log(
            `Verification: course ${id} now has name "${afterUpdate[0].name}"`
          );
        }
      } catch (updateErr) {
        console.error(
          `Error updating course with ID ${course?.id}:`,
          updateErr
        );
        results.errors.push({
          id: course?.id || "unknown",
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
    console.log("[COURSES][BULK PATCH] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "Valid array of course IDs is required" });
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
      const courseId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(courseId)) {
        results.invalidIds.push(id);
        continue;
      }

      try {
        const result = await db.sql`DELETE FROM courses WHERE id = ${courseId}`;

        if (result.rowsAffected > 0) {
          results.deletedCount++;
        } else {
          results.notFound.push(courseId);
        }
      } catch (deleteErr) {
        console.log(`Error deleting course ${courseId}:`, deleteErr.message);
        results.errors.push({ id: courseId, error: deleteErr.message });
      }
    }

    // Update overall success flag if needed
    if (results.deletedCount === 0) {
      results.success = false;
    }

    res.json(results);
  } catch (err) {
    console.log("[COURSES][BULK DELETE] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST endpoint for bulk deletion - alternative to DELETE /bulk
router.post("/bulk-delete", async (req, res) => {
  try {
    // Get direct access to the request body for debugging
    console.log("[COURSES][BULK-DELETE] Raw request body:", req.body);

    const { ids } = req.body;
    console.log("[COURSES][BULK-DELETE] IDs extracted:", ids);

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
        const courseId = Number(id);

        if (isNaN(courseId)) {
          console.log(`Invalid ID format at position ${i}:`, id);
          results.invalidIds.push(id);
          continue;
        }

        console.log(
          `Deleting course with ID: ${courseId} (${typeof courseId})`
        );

        const result = await db.sql`DELETE FROM courses WHERE id = ${courseId}`;
        console.log("Delete operation result:", result);

        // Check for successful deletion based on changes property
        // SQLite Cloud driver returns changes property instead of rowsAffected
        if (result && (result.changes > 0 || result.rowsAffected > 0)) {
          results.deletedCount++;
          console.log(`Successfully deleted course with ID: ${courseId}`);
        } else {
          results.notFound.push(courseId);
          console.log(`Course not found with ID: ${courseId}`);
        }
      } catch (deleteErr) {
        console.error(`Error deleting course ${id}:`, deleteErr.message);

        // Check for foreign key constraint error
        if (
          deleteErr.message &&
          deleteErr.message.includes("FOREIGN KEY constraint failed")
        ) {
          results.constraintErrors.push({
            id,
            message:
              "Cannot delete this course because it is referenced by other records (classes, students, etc.)",
          });
          console.log(
            `Foreign key constraint error for course ${id}: Course is referenced by other records`
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
    console.error("[COURSES][BULK-DELETE] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: err.message || "An unexpected error occurred" });
  }
});

module.exports = router;
