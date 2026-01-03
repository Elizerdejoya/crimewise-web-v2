const express = require("express");
const router = express.Router();
const db = require("../db");
const audit = require("../lib/audit");
const {
  authenticateToken,
  requireRole,
  addOrganizationFilter,
} = require("../middleware");

// GET all students (basic endpoint)
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
          await db.sql`SELECT id, name, email, class_id, student_id, course_id FROM users WHERE role = 'student' AND organization_id = ${orgFilter.organizationId}`;
      } else {
        rows =
          await db.sql`SELECT id, name, email, class_id, student_id, course_id FROM users WHERE role = 'student'`;
      }

      res.json(rows);
    } catch (err) {
      console.log("[STUDENTS][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET all students (id, name, email, class_id) with batch information
router.get(
  "/full",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let rows;
      if (orgFilter.hasFilter) {
        rows = await db.sql`
          SELECT 
            u.id, 
            u.name, 
            u.email, 
            u.class_id, 
            u.student_id, 
            u.course_id,
            c.name as class_name,
            b.name as batch_name,
            b.id as batch_id
          FROM users u
          LEFT JOIN classes c ON u.class_id = c.id
          LEFT JOIN batches b ON c.batch_id = b.id
          WHERE u.role = 'student' AND u.organization_id = ${orgFilter.organizationId}
        `;
      } else {
        rows = await db.sql`
          SELECT 
            u.id, 
            u.name, 
            u.email, 
            u.class_id, 
            u.student_id, 
            u.course_id,
            c.name as class_name,
            b.name as batch_name,
            b.id as batch_id
          FROM users u
          LEFT JOIN classes c ON u.class_id = c.id
          LEFT JOIN batches b ON c.batch_id = b.id
          WHERE u.role = 'student'
        `;
      }

      res.json(rows);
    } catch (err) {
      console.log("[STUDENTS-FULL][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST - Add a new student
router.post(
  "/",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name, email, password, class_id, studentId, course_id } =
        req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      const result = await db.sql`
        INSERT INTO users (name, email, password, role, class_id, student_id, course_id, organization_id) 
        VALUES (${name || ""}, ${email}, ${password}, 'student', ${
        class_id || null
      }, ${studentId || null}, ${course_id || null}, ${organization_id})
        RETURNING id`;

      const createdId = result[0].id;

      // Log audit event
      try {
        await audit.logEvent({
          actor_id: req.user && req.user.id ? req.user.id : null,
          actor_role: req.user && req.user.role ? req.user.role : null,
          action: 'create_student',
          target_type: 'user',
          target_id: createdId,
          details: { name, email, class_id, studentId, course_id }
        });
      } catch (e) {
        console.error('[AUDIT] create_student logging failed', e && e.message ? e.message : e);
      }

      res.json({
        id: createdId,
        name,
        email,
        class_id,
        studentId,
        course_id,
        organization_id,
      });
    } catch (err) {
      console.log("[STUDENTS][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT - Update an existing student
router.put(
  "/:id",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name, email, password, class_id, studentId, course_id } =
        req.body;
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();

      // Build dynamic SET clause for the SQL query
      let setClauses = [];
      let updateValues = {};

      if (name !== undefined) {
        setClauses.push("name = ${name}");
        updateValues.name = name;
      }
      if (email !== undefined) {
        setClauses.push("email = ${email}");
        updateValues.email = email;
      }
      if (password !== undefined) {
        setClauses.push("password = ${password}");
        updateValues.password = password;
      }
      if (class_id !== undefined) {
        setClauses.push("class_id = ${class_id}");
        updateValues.class_id = class_id;
      }
      if (studentId !== undefined) {
        setClauses.push("student_id = ${studentId}");
        updateValues.studentId = studentId;
      }
      if (course_id !== undefined) {
        setClauses.push("course_id = ${course_id}");
        updateValues.course_id = course_id;
      }

      // If no fields to update, return early
      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      // Construct and execute the dynamic SQL query with organization filter
      let whereClause = `id = ${id} AND role = 'student'`;
      if (orgFilter.hasFilter) {
        whereClause += ` AND organization_id = ${orgFilter.organizationId}`;
      }

      const sqlQuery = `UPDATE users SET ${setClauses.join(
        ", "
      )} WHERE ${whereClause}`;
      const result = await db.sql(sqlQuery, updateValues);

      res.json({ id, name, email, class_id, studentId, course_id });
    } catch (err) {
      console.log("[STUDENTS][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE student
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
      const studentId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(studentId)) {
        return res.status(400).json({ error: "Invalid student ID format" });
      }

      let result;
      if (orgFilter.hasFilter) {
        result =
          await db.sql`DELETE FROM users WHERE id = ${studentId} AND role = 'student' AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result =
          await db.sql`DELETE FROM users WHERE id = ${studentId} AND role = 'student'`;
      }

      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Log audit event for deletion
      try {
        await audit.logEvent({
          actor_id: req.user && req.user.id ? req.user.id : null,
          actor_role: req.user && req.user.role ? req.user.role : null,
          action: 'delete_student',
          target_type: 'user',
          target_id: studentId,
          details: null,
        });
      } catch (e) {
        console.error('[AUDIT] delete_student logging failed', e && e.message ? e.message : e);
      }

      res.json({ success: true, id: studentId });
    } catch (err) {
      console.log("[STUDENTS][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// BULK operations for student management
// POST - Create multiple students
router.post(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { students } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      if (!students || !Array.isArray(students) || students.length === 0) {
        return res
          .status(400)
          .json({ error: "Invalid request. Expected an array of students." });
      }

      const createdStudents = [];

      for (const student of students) {
        const { name, email, password, class_id, studentId, course_id } =
          student;

        try {
          const result = await db.sql`
            INSERT INTO users (name, email, password, role, class_id, student_id, course_id, organization_id) 
            VALUES (${name || ""}, ${email}, ${
            password || "CRIMEWISE"
          }, 'student', ${class_id || null}, ${studentId || null}, ${
            course_id || null
          }, ${organization_id})
            RETURNING id`;

          createdStudents.push({
            id: result[0].id,
            name,
            email,
            class_id,
            student_id: studentId,
            course_id,
            organization_id,
          });
        } catch (insertErr) {
          console.log("[STUDENTS-BULK][POST] Error:", insertErr.message);
          // Continue with the next student
        }
      }

      if (createdStudents.length === 0) {
        return res
          .status(500)
          .json({ error: "Failed to create any students." });
      }

      res.json(createdStudents);
    } catch (err) {
      console.log("[STUDENTS-BULK][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PATCH - Update multiple students
router.patch("/bulk", async (req, res) => {
  try {
    const { students } = req.body;

    // --- Basic Input Validation ---
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        message: 'Invalid request body. Expected a "students" array.',
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
      "[STUDENTS][BULK PATCH] About to update students:",
      JSON.stringify(students)
    );

    // --- Process Each Update ---
    for (const student of students) {
      try {
        // Validate required fields
        if (!student || typeof student !== "object" || !student.id) {
          results.errors.push({
            id: student?.id || "unknown",
            message: "Invalid student object or missing id field.",
          });
          continue;
        }

        // Convert ID to number if it's a string
        const id =
          typeof student.id === "string"
            ? parseInt(student.id, 10)
            : student.id;

        if (isNaN(id)) {
          results.errors.push({
            id: student.id,
            message: "Invalid ID format.",
          });
          continue;
        }

        // Handle other field conversions
        const classId = student.class_id
          ? typeof student.class_id === "string"
            ? parseInt(student.class_id, 10)
            : student.class_id
          : null;
        const courseId = student.course_id
          ? typeof student.course_id === "string"
            ? parseInt(student.course_id, 10)
            : student.course_id
          : null;

        console.log(
          `Attempting to update student: id=${id}, name=${student.name}, email=${student.email}, class_id=${classId}, course_id=${courseId}`
        );

        // Before update - verify the record exists
        const checkRecord =
          await db.sql`SELECT id FROM users WHERE id = ${id} AND role = 'student'`;

        if (!checkRecord || checkRecord.length === 0) {
          results.notFound.push(id);
          console.log(`Student with id=${id} not found in database`);
          continue;
        }

        // Build separately parameterized updates for each field - this is the safest approach
        if (student.name !== undefined) {
          await db.sql`UPDATE users SET name = ${student.name} WHERE id = ${id} AND role = 'student'`;
        }

        if (student.email !== undefined) {
          await db.sql`UPDATE users SET email = ${student.email} WHERE id = ${id} AND role = 'student'`;
        }

        if (student.password !== undefined && student.password.trim() !== "") {
          await db.sql`UPDATE users SET password = ${student.password} WHERE id = ${id} AND role = 'student'`;
        }

        if (student.class_id !== undefined) {
          await db.sql`UPDATE users SET class_id = ${classId} WHERE id = ${id} AND role = 'student'`;
        }

        if (student.studentId !== undefined) {
          await db.sql`UPDATE users SET student_id = ${student.studentId} WHERE id = ${id} AND role = 'student'`;
        }

        if (student.course_id !== undefined) {
          await db.sql`UPDATE users SET course_id = ${courseId} WHERE id = ${id} AND role = 'student'`;
        }

        // Consider the update successful if we get here
        results.updated.push({
          id,
          name: student.name,
          email: student.email,
          class_id: classId,
        });

        console.log(
          `Successfully updated student: id=${id}, name=${student.name}, email=${student.email}`
        );
      } catch (updateErr) {
        console.error(
          `Error updating student with ID ${student?.id}:`,
          updateErr
        );
        results.errors.push({
          id: student?.id || "unknown",
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
    console.log("[STUDENTS][BULK PATCH] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE - Delete multiple students
router.delete(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { ids } = req.body;
      const orgFilter = req.getOrgFilter();

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: "Invalid request. Expected an array of student IDs.",
        });
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
        const studentId = typeof id === "string" ? parseInt(id, 10) : id;

        if (isNaN(studentId)) {
          results.invalidIds.push(id);
          continue;
        }

        try {
          let result;
          if (orgFilter.hasFilter) {
            result =
              await db.sql`DELETE FROM users WHERE id = ${studentId} AND role = 'student' AND organization_id = ${orgFilter.organizationId}`;
          } else {
            result =
              await db.sql`DELETE FROM users WHERE id = ${studentId} AND role = 'student'`;
          }

          if (result.rowsAffected > 0) {
            results.deletedCount++;
          } else {
            results.notFound.push(studentId);
          }
        } catch (deleteErr) {
          console.log(
            `Error deleting student ${studentId}:`,
            deleteErr.message
          );
          results.errors.push({ id: studentId, error: deleteErr.message });
        }
      }

      // Update overall success flag if needed
      if (results.deletedCount === 0) {
        results.success = false;
      }

      res.json(results);
    } catch (err) {
      console.log("[STUDENTS-BULK][DELETE] Error:", err.message);
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
      console.log("[STUDENTS][BULK-DELETE] Raw request body:", req.body);

      const { ids } = req.body;
      const orgFilter = req.getOrgFilter();
      console.log("[STUDENTS][BULK-DELETE] IDs extracted:", ids);

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
        const studentId = Number(id);

        if (isNaN(studentId)) {
          console.log(`Invalid ID format at position ${i}:`, id);
          results.invalidIds.push(id);
          continue;
        }

        console.log(
          `Deleting student with ID: ${studentId} (${typeof studentId})`
        );

        let result;
        if (orgFilter.hasFilter) {
          result =
            await db.sql`DELETE FROM users WHERE id = ${studentId} AND role = 'student' AND organization_id = ${orgFilter.organizationId}`;
        } else {
          result =
            await db.sql`DELETE FROM users WHERE id = ${studentId} AND role = 'student'`;
        }
        console.log("Delete operation result:", result);

        // Check for successful deletion based on changes property
        // SQLite Cloud driver returns changes property instead of rowsAffected
        if (result && (result.changes > 0 || result.rowsAffected > 0)) {
          results.deletedCount++;
          console.log(`Successfully deleted student with ID: ${studentId}`);
        } else {
          results.notFound.push(studentId);
          console.log(`Student not found with ID: ${studentId}`);
        }
      } catch (deleteErr) {
        console.error(`Error deleting student ${id}:`, deleteErr.message);

        // Check for foreign key constraint error
        if (
          deleteErr.message &&
          deleteErr.message.includes("FOREIGN KEY constraint failed")
        ) {
          results.constraintErrors.push({
            id,
            message:
              "Cannot delete this student because they are referenced by other records (exams, grades, etc.)",
          });
          console.log(
            `Foreign key constraint error for student ${id}: Student is referenced by other records`
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
    console.error("[STUDENTS][BULK-DELETE] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: err.message || "An unexpected error occurred" });
  }
  }
);

module.exports = router;
