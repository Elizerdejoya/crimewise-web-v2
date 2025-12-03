const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  authenticateToken,
  requireRole,
  addOrganizationFilter,
} = require("../middleware");

// --- CLASS-INSTRUCTOR RELATION ---
// GET all class-instructor relations
router.get(
  "/class-instructor",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let rows;
      if (orgFilter.hasFilter) {
        rows = await db.sql`
        SELECT ci.id, ci.class_id, ci.instructor_id, c.name as class, u.email as instructor
        FROM class_instructor ci
        JOIN classes c ON ci.class_id = c.id
        JOIN users u ON ci.instructor_id = u.id
        WHERE u.role = 'instructor' 
        AND c.organization_id = ${orgFilter.organizationId}
        AND u.organization_id = ${orgFilter.organizationId}
      `;
      } else {
        rows = await db.sql`
        SELECT ci.id, ci.class_id, ci.instructor_id, c.name as class, u.email as instructor
        FROM class_instructor ci
        JOIN classes c ON ci.class_id = c.id
        JOIN users u ON ci.instructor_id = u.id
        WHERE u.role = 'instructor'
      `;
      }

      res.json(rows);
    } catch (err) {
      console.log("[RELATIONS][CLASS-INSTRUCTOR][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST new class-instructor relation
router.post(
  "/class-instructor",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { classId, instructorId } = req.body;
      const orgFilter = req.getOrgFilter();

      // Convert IDs to numbers if they are strings
      const classIdNum =
        typeof classId === "string" ? parseInt(classId, 10) : classId;
      const instructorIdNum =
        typeof instructorId === "string"
          ? parseInt(instructorId, 10)
          : instructorId;

      console.log(
        `Creating relation: class_id=${classIdNum}, instructor_id=${instructorIdNum}`
      );

      // Verify that both class and instructor belong to the same organization (if filtered)
      if (orgFilter.hasFilter) {
        const classCheck =
          await db.sql`SELECT id FROM classes WHERE id = ${classIdNum} AND organization_id = ${orgFilter.organizationId}`;
        const instructorCheck =
          await db.sql`SELECT id FROM users WHERE id = ${instructorIdNum} AND organization_id = ${orgFilter.organizationId} AND role = 'instructor'`;

        if (classCheck.length === 0) {
          return res
            .status(404)
            .json({ error: "Class not found in your organization" });
        }
        if (instructorCheck.length === 0) {
          return res
            .status(404)
            .json({ error: "Instructor not found in your organization" });
        }
      }

      // Insert the relation and get the new ID
      const result = await db.sql`
      INSERT INTO class_instructor (class_id, instructor_id) 
      VALUES (${classIdNum}, ${instructorIdNum})
      RETURNING id
    `;

      const newId = result[0].id;

      // Get the newly created relation with joined data
      let newRelation;
      if (orgFilter.hasFilter) {
        newRelation = await db.sql`
        SELECT ci.id, ci.class_id, ci.instructor_id, c.name as class, u.email as instructor
        FROM class_instructor ci
        JOIN classes c ON ci.class_id = c.id
        JOIN users u ON ci.instructor_id = u.id
        WHERE ci.id = ${newId}
        AND c.organization_id = ${orgFilter.organizationId}
        AND u.organization_id = ${orgFilter.organizationId}
      `;
      } else {
        newRelation = await db.sql`
        SELECT ci.id, ci.class_id, ci.instructor_id, c.name as class, u.email as instructor
        FROM class_instructor ci
        JOIN classes c ON ci.class_id = c.id
        JOIN users u ON ci.instructor_id = u.id
        WHERE ci.id = ${newId}
      `;
      }

      res.json(newRelation[0]);
    } catch (err) {
      console.log("[RELATIONS][CLASS-INSTRUCTOR][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE class-instructor relation
router.delete(
  "/class-instructor/:id",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();
      const relationId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(relationId)) {
        return res.status(400).json({ error: "Invalid relation ID format" });
      }

      let result;
      if (orgFilter.hasFilter) {
        // Ensure the relation involves entities from the user's organization
        result = await db.sql`
        DELETE FROM class_instructor 
        WHERE id = ${relationId}
        AND EXISTS (
          SELECT 1 FROM classes c WHERE c.id = class_instructor.class_id AND c.organization_id = ${orgFilter.organizationId}
        )
        AND EXISTS (
          SELECT 1 FROM users u WHERE u.id = class_instructor.instructor_id AND u.organization_id = ${orgFilter.organizationId}
        )
      `;
      } else {
        result =
          await db.sql`DELETE FROM class_instructor WHERE id = ${relationId}`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Relation not found or access denied" });
      }

      res.json({ success: true, id: relationId });
    } catch (err) {
      console.log("[RELATIONS][CLASS-INSTRUCTOR][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// --- BATCH-COURSE RELATION ---
router.get(
  "/batch-course",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let rows;
      if (orgFilter.hasFilter) {
        rows = await db.sql`
        SELECT bc.id, bc.batch_id, bc.course_id, b.name as batch, c.name as course
        FROM batch_course bc
        JOIN batches b ON bc.batch_id = b.id
        JOIN courses c ON bc.course_id = c.id
        WHERE b.organization_id = ${orgFilter.organizationId}
        AND c.organization_id = ${orgFilter.organizationId}
      `;
      } else {
        rows = await db.sql`
        SELECT bc.id, bc.batch_id, bc.course_id, b.name as batch, c.name as course
        FROM batch_course bc
        JOIN batches b ON bc.batch_id = b.id
        JOIN courses c ON bc.course_id = c.id
      `;
      }

      res.json(rows);
    } catch (err) {
      console.log("[RELATIONS][BATCH-COURSE][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.post("/batch-course", async (req, res) => {
  try {
    const { batchId, courseId } = req.body;

    // Convert IDs to numbers if they are strings
    const batchIdNum =
      typeof batchId === "string" ? parseInt(batchId, 10) : batchId;
    const courseIdNum =
      typeof courseId === "string" ? parseInt(courseId, 10) : courseId;

    console.log(
      `Creating relation: batch_id=${batchIdNum}, course_id=${courseIdNum}`
    );

    // Insert the relation and get the new ID
    const result = await db.sql`
      INSERT INTO batch_course (batch_id, course_id) 
      VALUES (${batchIdNum}, ${courseIdNum})
      RETURNING id
    `;

    const newId = result[0].id;

    // Get the newly created relation with joined data
    const newRelation = await db.sql`
      SELECT bc.id, bc.batch_id, bc.course_id, b.name as batch, c.name as course
      FROM batch_course bc
      JOIN batches b ON bc.batch_id = b.id
      JOIN courses c ON bc.course_id = c.id
      WHERE bc.id = ${newId}
    `;

    res.json(newRelation[0]);
  } catch (err) {
    console.log("[RELATIONS][BATCH-COURSE][POST] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE batch-course relation
router.delete("/batch-course/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const relationId = typeof id === "string" ? parseInt(id, 10) : id;

    if (isNaN(relationId)) {
      return res.status(400).json({ error: "Invalid relation ID format" });
    }

    const result =
      await db.sql`DELETE FROM batch_course WHERE id = ${relationId}`;

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Relation not found" });
    }

    res.json({ success: true, id: relationId });
  } catch (err) {
    console.log("[RELATIONS][BATCH-COURSE][DELETE] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// --- INSTRUCTOR-COURSE RELATION ---
router.get(
  "/instructor-course",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let rows;
      if (orgFilter.hasFilter) {
        rows = await db.sql`
        SELECT ic.id, ic.instructor_id, ic.course_id, u.email as instructor, c.name as course
        FROM instructor_course ic
        JOIN users u ON ic.instructor_id = u.id
        JOIN courses c ON ic.course_id = c.id
        WHERE u.role = 'instructor'
        AND u.organization_id = ${orgFilter.organizationId}
        AND c.organization_id = ${orgFilter.organizationId}
      `;
      } else {
        rows = await db.sql`
        SELECT ic.id, ic.instructor_id, ic.course_id, u.email as instructor, c.name as course
        FROM instructor_course ic
        JOIN users u ON ic.instructor_id = u.id
        JOIN courses c ON ic.course_id = c.id
        WHERE u.role = 'instructor'
      `;
      }

      res.json(rows);
    } catch (err) {
      console.log("[RELATIONS][INSTRUCTOR-COURSE][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.post(
  "/instructor-course",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { instructorId, courseId } = req.body;
      const orgFilter = req.getOrgFilter();

      // Convert IDs to numbers if they are strings
      const instructorIdNum =
        typeof instructorId === "string"
          ? parseInt(instructorId, 10)
          : instructorId;
      const courseIdNum =
        typeof courseId === "string" ? parseInt(courseId, 10) : courseId;

      console.log(
        `Creating relation: instructor_id=${instructorIdNum}, course_id=${courseIdNum}`
      );

      // Insert the relation and get the new ID
      const result = await db.sql`
        INSERT INTO instructor_course (instructor_id, course_id) 
        VALUES (${instructorIdNum}, ${courseIdNum})
        RETURNING id
      `;

      const newId = result[0].id;

      // Get the newly created relation with joined data
      let newRelation;
      if (orgFilter.hasFilter) {
        newRelation = await db.sql`
        SELECT ic.id, ic.instructor_id, ic.course_id, u.email as instructor, c.name as course
        FROM instructor_course ic
        JOIN users u ON ic.instructor_id = u.id
        JOIN courses c ON ic.course_id = c.id
        WHERE ic.id = ${newId}
        AND u.organization_id = ${orgFilter.organizationId}
        AND c.organization_id = ${orgFilter.organizationId}
      `;
      } else {
        newRelation = await db.sql`
        SELECT ic.id, ic.instructor_id, ic.course_id, u.email as instructor, c.name as course
        FROM instructor_course ic
        JOIN users u ON ic.instructor_id = u.id
        JOIN courses c ON ic.course_id = c.id
        WHERE ic.id = ${newId}
      `;
      }

      res.json(newRelation[0]);
    } catch (err) {
      console.log("[RELATIONS][INSTRUCTOR-COURSE][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE instructor-course relation
router.delete("/instructor-course/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const relationId = typeof id === "string" ? parseInt(id, 10) : id;

    if (isNaN(relationId)) {
      return res.status(400).json({ error: "Invalid relation ID format" });
    }

    const result =
      await db.sql`DELETE FROM instructor_course WHERE id = ${relationId}`;

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: "Relation not found" });
    }

    res.json({ success: true, id: relationId });
  } catch (err) {
    console.log("[RELATIONS][INSTRUCTOR-COURSE][DELETE] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// BULK operations
// Bulk create relations (for each type)
router.post("/class-instructor/bulk", async (req, res) => {
  try {
    const { relations } = req.body;

    if (!Array.isArray(relations) || relations.length === 0) {
      return res.status(400).json({ error: "Invalid relations data" });
    }

    const created = [];

    for (const relation of relations) {
      const { classId, instructorId } = relation;

      if (!classId || !instructorId) continue;

      // Convert IDs to numbers if they are strings
      const classIdNum =
        typeof classId === "string" ? parseInt(classId, 10) : classId;
      const instructorIdNum =
        typeof instructorId === "string"
          ? parseInt(instructorId, 10)
          : instructorId;

      try {
        // Insert the relation and get the new ID
        const result = await db.sql`
          INSERT INTO class_instructor (class_id, instructor_id) 
          VALUES (${classIdNum}, ${instructorIdNum})
          RETURNING id
        `;

        created.push({
          id: result[0].id,
          class_id: classIdNum,
          instructor_id: instructorIdNum,
        });
      } catch (insertErr) {
        console.log(
          `Error creating class-instructor relation: ${insertErr.message}`
        );
      }
    }

    res.json({ success: true, created: created.length, items: created });
  } catch (err) {
    console.log("[RELATIONS][CLASS-INSTRUCTOR][BULK POST] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Bulk delete endpoints
router.delete("/class-instructor/bulk", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "Valid array of relation IDs is required" });
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
      const relationId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(relationId)) {
        results.invalidIds.push(id);
        continue;
      }

      try {
        const result =
          await db.sql`DELETE FROM class_instructor WHERE id = ${relationId}`;

        if (result.rowsAffected > 0) {
          results.deletedCount++;
        } else {
          results.notFound.push(relationId);
        }
      } catch (deleteErr) {
        console.log(
          `Error deleting class-instructor relation ${relationId}:`,
          deleteErr.message
        );
        results.errors.push({ id: relationId, error: deleteErr.message });
      }
    }

    // Update overall success flag if needed
    if (results.deletedCount === 0) {
      results.success = false;
    }

    res.json(results);
  } catch (err) {
    console.log(
      "[RELATIONS][CLASS-INSTRUCTOR][BULK DELETE] Error:",
      err.message
    );
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/batch-course/bulk", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "Valid array of relation IDs is required" });
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
      const relationId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(relationId)) {
        results.invalidIds.push(id);
        continue;
      }

      try {
        const result =
          await db.sql`DELETE FROM batch_course WHERE id = ${relationId}`;

        if (result.rowsAffected > 0) {
          results.deletedCount++;
        } else {
          results.notFound.push(relationId);
        }
      } catch (deleteErr) {
        console.log(
          `Error deleting batch-course relation ${relationId}:`,
          deleteErr.message
        );
        results.errors.push({ id: relationId, error: deleteErr.message });
      }
    }

    // Update overall success flag if needed
    if (results.deletedCount === 0) {
      results.success = false;
    }

    res.json(results);
  } catch (err) {
    console.log("[RELATIONS][BATCH-COURSE][BULK DELETE] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/instructor-course/bulk", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "Valid array of relation IDs is required" });
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
      const relationId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(relationId)) {
        results.invalidIds.push(id);
        continue;
      }

      try {
        const result =
          await db.sql`DELETE FROM instructor_course WHERE id = ${relationId}`;

        if (result.rowsAffected > 0) {
          results.deletedCount++;
        } else {
          results.notFound.push(relationId);
        }
      } catch (deleteErr) {
        console.log(
          `Error deleting instructor-course relation ${relationId}:`,
          deleteErr.message
        );
        results.errors.push({ id: relationId, error: deleteErr.message });
      }
    }

    // Update overall success flag if needed
    if (results.deletedCount === 0) {
      results.success = false;
    }

    res.json(results);
  } catch (err) {
    console.log(
      "[RELATIONS][INSTRUCTOR-COURSE][BULK DELETE] Error:",
      err.message
    );
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
