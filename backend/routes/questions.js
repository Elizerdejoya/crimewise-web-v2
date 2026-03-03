const express = require("express");
const router = express.Router();
const db = require("../db");
// ensure any pre‑existing questions with NULL rubrics get default weights
(async function backfillRubrics() {
  try {
    const defaultRub = JSON.stringify({ findingsSimilarity: 70, objectivity: 15, structure: 15 });
    await db.sql`UPDATE questions SET rubrics = ${defaultRub} WHERE rubrics IS NULL`;
    console.log('[QUESTIONS] backfilled null rubrics with defaults');
  } catch (e) {
    console.error('[QUESTIONS] failed to backfill rubrics:', e && e.message ? e.message : e);
  }
})();

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { put } = require("@vercel/blob");
const audit = require("../lib/audit");
const {
  authenticateToken,
  requireRole,
  addOrganizationFilter,
} = require("../middleware");

// --- QUESTIONS API ---
// GET all questions with course and user details
router.get(
  "/questions",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();
      const userRole = req.user.role;
      const userId = req.user.id;

      let query;
      if (orgFilter.hasFilter) {
        if (userRole === "instructor") {
          // Instructors can only see their own questions
          query = await db.sql`
            SELECT 
              q.*, 
              c.name as course, 
              c.code as course_code, 
              u.name as created_by,
              CASE WHEN kp.name IS NULL THEN NULL ELSE kp.name END as keyword_pool_name,
              CASE WHEN kp.description IS NULL THEN NULL ELSE kp.description END as keyword_pool_description
            FROM questions q
            LEFT JOIN courses c ON q.course_id = c.id
            LEFT JOIN users u ON q.created_by = u.id
            LEFT JOIN keyword_pools kp ON q.keyword_pool_id = kp.id
            WHERE q.organization_id = ${orgFilter.organizationId} AND q.created_by = ${userId}
          `;
        } else {
          // Admins can see all questions in their organization
          query = await db.sql`
            SELECT 
              q.*, 
              c.name as course, 
              c.code as course_code, 
              u.name as created_by,
              CASE WHEN kp.name IS NULL THEN NULL ELSE kp.name END as keyword_pool_name,
              CASE WHEN kp.description IS NULL THEN NULL ELSE kp.description END as keyword_pool_description
            FROM questions q
            LEFT JOIN courses c ON q.course_id = c.id
            LEFT JOIN users u ON q.created_by = u.id
            LEFT JOIN keyword_pools kp ON q.keyword_pool_id = kp.id
            WHERE q.organization_id = ${orgFilter.organizationId}
          `;
        }
      } else {
        // Super admin can see all questions
        query = await db.sql`
          SELECT 
            q.*, 
            c.name as course, 
            c.code as course_code, 
            u.name as created_by,
            CASE WHEN kp.name IS NULL THEN NULL ELSE kp.name END as keyword_pool_name,
            CASE WHEN kp.description IS NULL THEN NULL ELSE kp.description END as keyword_pool_description
          FROM questions q
          LEFT JOIN courses c ON q.course_id = c.id
          LEFT JOIN users u ON q.created_by = u.id
          LEFT JOIN keyword_pools kp ON q.keyword_pool_id = kp.id
        `;
      }

      // convert rubrics string to object for convenience
      query.forEach(q => {
        if (q.rubrics) {
          try { q.rubrics = JSON.parse(q.rubrics); } catch (e) {}
        }
      });
      res.json(query);
    } catch (err) {
      console.log("[QUESTIONS][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET question by id with course and user details
router.get(
  "/questions/:id",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();

      let query;
      if (orgFilter.hasFilter) {
        query = await db.sql`
        SELECT 
          q.*, 
          c.name as course, 
          c.code as course_code, 
          u.name as created_by,
          CASE WHEN kp.name IS NULL THEN NULL ELSE kp.name END as keyword_pool_name,
          CASE WHEN kp.description IS NULL THEN NULL ELSE kp.description END as keyword_pool_description,
          CASE WHEN kp.keywords IS NULL THEN NULL ELSE kp.keywords END as keyword_pool_keywords
        FROM questions q
        LEFT JOIN courses c ON q.course_id = c.id
        LEFT JOIN users u ON q.created_by = u.id
        LEFT JOIN keyword_pools kp ON q.keyword_pool_id = kp.id
        WHERE q.id = ${id} AND q.organization_id = ${orgFilter.organizationId}
      `;
      } else {
        query = await db.sql`
        SELECT 
          q.*, 
          c.name as course, 
          c.code as course_code, 
          u.name as created_by,
          CASE WHEN kp.name IS NULL THEN NULL ELSE kp.name END as keyword_pool_name,
          CASE WHEN kp.description IS NULL THEN NULL ELSE kp.description END as keyword_pool_description,
          CASE WHEN kp.keywords IS NULL THEN NULL ELSE kp.keywords END as keyword_pool_keywords
        FROM questions q
        LEFT JOIN courses c ON q.course_id = c.id
        LEFT JOIN users u ON q.created_by = u.id
        LEFT JOIN keyword_pools kp ON q.keyword_pool_id = kp.id
        WHERE q.id = ${id}
      `;
      }

      if (!query || query.length === 0) {
        return res.status(404).json({ error: "Question not found" });
      }
      if (query[0].rubrics) {
        try { query[0].rubrics = JSON.parse(query[0].rubrics); } catch (e) {}
      }
      res.json(query[0]);
    } catch (err) {
      console.log("[QUESTIONS][GET by ID] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET questions by course
router.get(
  "/questions/course/:courseId",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const courseId = req.params.courseId;
      const orgFilter = req.getOrgFilter();

      let query;
      if (orgFilter.hasFilter) {
        query = await db.sql`
        SELECT 
          q.*, 
          c.name as course, 
          c.code as course_code, 
          u.name as created_by 
        FROM questions q
        LEFT JOIN courses c ON q.course_id = c.id
        LEFT JOIN users u ON q.created_by = u.id
        WHERE q.course_id = ${courseId} AND q.organization_id = ${orgFilter.organizationId}
      `;
      } else {
        query = await db.sql`
        SELECT 
          q.*, 
          c.name as course, 
          c.code as course_code, 
          u.name as created_by 
        FROM questions q
        LEFT JOIN courses c ON q.course_id = c.id
        LEFT JOIN users u ON q.created_by = u.id
        WHERE q.course_id = ${courseId}
      `;
      }

      // convert rubrics string to object for convenience
      query.forEach(q => {
        if (q.rubrics) {
          try { q.rubrics = JSON.parse(q.rubrics); } catch (e) {}
        }
      });
      res.json(query);
    } catch (err) {
      console.log("[QUESTIONS][GET by Course] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST new question
router.post(
  "/questions",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      console.log('[QUESTIONS][POST] body:', req.body);
      const {
        title,
        text,
        course_id,
        difficulty,
        type,
        answer,
        image,
        points,
        keyword_pool_id,
        selected_keywords,
        rubrics,
      } = req.body;
      const created_by = req.user.id; // Use authenticated user ID
      const orgFilter = req.getOrgFilter();

      // Validate answer format for forensic questions
      let validatedAnswer = answer;
      let totalPoints = points;

      if (type === "forensic" && answer) {
        try {
          // Parse the answer to validate and normalize the format
          const parsedAnswer = JSON.parse(answer);

          if (parsedAnswer) {
            // Calculate total points based on the answer structure
            if (Array.isArray(parsedAnswer)) {
              // Old format - just an array of specimens
              totalPoints = parsedAnswer.reduce(
                (sum, row) => sum + (Number(row.points) || 1),
                0
              );
            } else if (parsedAnswer.specimens) {
              // New format with specimens and explanation
              const specimenPoints = parsedAnswer.specimens.reduce(
                (sum, row) => sum + (Number(row.points) || 1),
                0
              );
              const explanationPoints =
                parsedAnswer.explanation &&
                typeof parsedAnswer.explanation.points === "number"
                  ? parsedAnswer.explanation.points
                  : 0;

              totalPoints = specimenPoints + explanationPoints;
            }
          }
        } catch (parseError) {
          console.log(
            "[QUESTIONS][POST] Answer parse error:",
            parseError.message
          );
          // If parsing fails, we'll use the provided points value
        }
      }

      // validate rubrics if provided
      let rubricJson = null;
      if (rubrics !== undefined && rubrics !== null) {
        try {
          const parsed = typeof rubrics === 'string' ? JSON.parse(rubrics) : rubrics;
          const total =
            Number(parsed.findingsSimilarity || 0) +
            Number(parsed.objectivity || 0) +
            Number(parsed.structure || 0);
          if (total !== 100) {
            return res
              .status(400)
              .json({ error: 'Rubric weights must total 100%' });
          }
          rubricJson = JSON.stringify(parsed);
        } catch (e) {
          // bad rubrics format
          return res.status(400).json({ error: 'Invalid rubrics format' });
        }
      }

      // if nothing explicitly provided, default to standard weights
      if (rubricJson === null) {
        const defaultRubrics = { findingsSimilarity: 70, objectivity: 15, structure: 15 };
        rubricJson = JSON.stringify(defaultRubrics);
      }

      console.log('[QUESTIONS][POST] rubricJson =', rubricJson);

      // Get organization_id for the new question
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      // Insert the new question
      const result = await db.sql`
      INSERT INTO questions (title, text, course_id, difficulty, type, answer, image, points, keyword_pool_id, selected_keywords, rubrics, created_by, organization_id, created) 
      VALUES (${title}, ${text}, ${course_id}, ${difficulty}, ${type}, ${validatedAnswer}, ${image}, ${totalPoints}, ${keyword_pool_id || null}, ${selected_keywords ? JSON.stringify(selected_keywords) : null}, ${rubricJson}, ${created_by}, ${organization_id}, CURRENT_TIMESTAMP)
      RETURNING id, rubrics
    `;
      console.log('[QUESTIONS][POST] inserted rubrics =', result[0] && result[0].rubrics);

      const newId = result[0].id;

      // Get the inserted question with course and user details
      const newQuestion = await db.sql`
      SELECT 
        q.*, 
        c.name as course, 
        c.code as course_code, 
        u.name as created_by 
      FROM questions q
      LEFT JOIN courses c ON q.course_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.id = ${newId}
    `;
      // Log audit event
      try {
        await audit.logEvent({
          actor_id: req.user && req.user.id ? req.user.id : null,
          actor_role: req.user && req.user.role ? req.user.role : null,
          action: 'create_question',
          target_type: 'question',
          target_id: newId,
          details: { title, course_id, difficulty, type }
        });
      } catch (e) {
        console.error('[AUDIT] create_question logging failed', e && e.message ? e.message : e);
      }

      res.json(newQuestion[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update question
router.put(
  "/questions/:id",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      console.log('[QUESTIONS][PUT] body:', req.body);
      const {
        title,
        text,
        course_id,
        difficulty,
        type,
        answer,
        image,
        points,
        keyword_pool_id,
        selected_keywords,
        rubrics,
      } = req.body;
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();

      // Convert IDs to numbers if they are strings
      const questionId = typeof id === "string" ? parseInt(id, 10) : id;
      const courseId =
        typeof course_id === "string" ? parseInt(course_id, 10) : course_id;

      // Validate answer format for forensic questions
      let validatedAnswer = answer;
      let totalPoints = points;

      if (type === "forensic" && answer) {
        try {
          // Parse the answer to validate and normalize the format
          const parsedAnswer = JSON.parse(answer);

          if (parsedAnswer) {
            // Calculate total points based on the answer structure
            if (Array.isArray(parsedAnswer)) {
              // Old format - just an array of specimens
              totalPoints = parsedAnswer.reduce(
                (sum, row) => sum + (Number(row.points) || 1),
                0
              );
            } else if (parsedAnswer.specimens) {
              // New format with specimens and explanation
              const specimenPoints = parsedAnswer.specimens.reduce(
                (sum, row) => sum + (Number(row.points) || 1),
                0
              );
              const explanationPoints =
                parsedAnswer.explanation &&
                typeof parsedAnswer.explanation.points === "number"
                  ? parsedAnswer.explanation.points
                  : 0;

              totalPoints = specimenPoints + explanationPoints;
            }
          }
        } catch (parseError) {
          console.log(
            "[QUESTIONS][PUT] Answer parse error:",
            parseError.message
          );
          // If parsing fails, we'll use the provided points value
        }
      }

      console.log(
        `Updating question: id=${questionId}, title=${title}, course_id=${courseId}, points=${totalPoints}`
      );
      console.log('[QUESTIONS][PUT] incoming rubrics payload:', rubrics);

      // validate rubrics if provided
      let rubricJson = null;
      if (rubrics !== undefined && rubrics !== null) {
        try {
          const parsed = typeof rubrics === 'string' ? JSON.parse(rubrics) : rubrics;
          const total =
            Number(parsed.findingsSimilarity || 0) +
            Number(parsed.objectivity || 0) +
            Number(parsed.structure || 0);
          if (total !== 100) {
            return res
              .status(400)
              .json({ error: 'Rubric weights must total 100%' });
          }
          rubricJson = JSON.stringify(parsed);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid rubrics format' });
        }
      }


      console.log('[QUESTIONS][PUT] rubricJson =', rubricJson);

      // Update the question with organization check; always use COALESCE so existing
      // rubrics value is preserved when rubricJson is null/undefined.
      let result;
      if (orgFilter.hasFilter) {
        result = await db.sql`
        UPDATE questions 
        SET title = ${title}, text = ${text}, course_id = ${courseId}, 
            difficulty = ${difficulty}, type = ${type}, answer = ${validatedAnswer}, 
            image = ${image}, points = ${totalPoints}, 
            keyword_pool_id = ${keyword_pool_id || null}, 
            selected_keywords = ${selected_keywords || null},
            rubrics = COALESCE(${rubricJson}, rubrics)
        WHERE id = ${questionId} AND organization_id = ${orgFilter.organizationId}
        RETURNING rubrics
      `;
      } else {
        result = await db.sql`
        UPDATE questions 
        SET title = ${title}, text = ${text}, course_id = ${courseId}, 
            difficulty = ${difficulty}, type = ${type}, answer = ${validatedAnswer}, 
            image = ${image}, points = ${totalPoints}, 
            keyword_pool_id = ${keyword_pool_id || null}, 
            selected_keywords = ${selected_keywords || null},
            rubrics = COALESCE(${rubricJson}, rubrics)
        WHERE id = ${questionId}
        RETURNING rubrics
      `;
      }

      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "Question not found" });
      }

      console.log('[QUESTIONS][PUT] update result:', result);

      // Get the updated question with course and user details
      const updatedQuestion = await db.sql`
      SELECT 
        q.*, 
        c.name as course, 
        c.code as course_code, 
        u.name as created_by 
      FROM questions q
      LEFT JOIN courses c ON q.course_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.id = ${questionId}
    `;
      console.log('[QUESTIONS][PUT] fetched updated rubrics =', updatedQuestion[0] && updatedQuestion[0].rubrics);

      res.json(updatedQuestion[0]);
    } catch (err) {
      console.log("[QUESTIONS][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT only rubrics for a question (useful for debugging and direct updates)
router.put(
  "/questions/:id/rubrics",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const id = req.params.id;
      const { rubrics } = req.body;
      console.log('[QUESTIONS][PUT rubrics] incoming:', { id, rubrics });
      if (!rubrics) {
        return res.status(400).json({ error: 'Missing rubrics payload' });
      }
      let rubricJson;
      try {
        const parsed = typeof rubrics === 'string' ? JSON.parse(rubrics) : rubrics;
        const total =
          Number(parsed.findingsSimilarity || 0) +
          Number(parsed.objectivity || 0) +
          Number(parsed.structure || 0);
        if (total !== 100) {
          return res.status(400).json({ error: 'Rubric weights must total 100%' });
        }
        rubricJson = JSON.stringify(parsed);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid rubrics format' });
      }

      const orgFilter = req.getOrgFilter();
      let result;
      if (orgFilter.hasFilter) {
        result = await db.sql`
          UPDATE questions SET rubrics = ${rubricJson} 
          WHERE id = ${id} AND organization_id = ${orgFilter.organizationId}
          RETURNING id, rubrics
        `;
      } else {
        result = await db.sql`
          UPDATE questions SET rubrics = ${rubricJson} 
          WHERE id = ${id}
          RETURNING id, rubrics
        `;
      }
      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'Question not found' });
      }
      console.log('[QUESTIONS][PUT rubrics] updated:', result[0]);
      res.json(result[0]);
    } catch (err) {
      console.log("[QUESTIONS][PUT rubrics] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET only rubrics for a question (no auth) - useful for debugging via curl
router.get(
  "/questions/:id/rubrics",
  async (req, res) => {
    try {
      const id = req.params.id;
      const q = await db.sql`
        SELECT rubrics FROM questions WHERE id = ${id}
      `;
      if (!q || q.length === 0) {
        return res.status(404).json({ error: 'Question not found' });
      }
      let rubrics = q[0].rubrics;
      try { rubrics = JSON.parse(rubrics); } catch (e) {}
      res.json({ id, rubrics });
    } catch (err) {
      console.log("[QUESTIONS][GET rubrics] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE question by id
router.delete(
  "/questions/:id",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();
      const questionId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(questionId)) {
        return res.status(400).json({ error: "Invalid question ID format" });
      }

      let result;
      if (orgFilter.hasFilter) {
        result =
          await db.sql`DELETE FROM questions WHERE id = ${questionId} AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result = await db.sql`DELETE FROM questions WHERE id = ${questionId}`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Question not found or access denied" });
      }

      res.json({ success: true, id: questionId });
    } catch (err) {
      console.log("[QUESTIONS][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST endpoint for bulk deletion - alternative to DELETE /bulk
router.post(
  "/questions/bulk-delete",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      // Get direct access to the request body for debugging
      console.log("[QUESTIONS][BULK-DELETE] Raw request body:", req.body);

      const { ids } = req.body;
      const orgFilter = req.getOrgFilter();
      console.log("[QUESTIONS][BULK-DELETE] IDs extracted:", ids);

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
        console.log(
          `[QUESTIONS][BULK-DELETE] Processing ID at position ${i}:`,
          id,
          typeof id
        );

        // Skip null/undefined values
        if (id === null || id === undefined) {
          results.invalidIds.push(id);
          continue;
        }

        try {
          // Force conversion to number
          const questionId = Number(id);

          if (isNaN(questionId)) {
            console.log(
              `[QUESTIONS][BULK-DELETE] Invalid ID format at position ${i}:`,
              id
            );
            results.invalidIds.push(id);
            continue;
          }

          console.log(
            `[QUESTIONS][BULK-DELETE] Deleting question with ID: ${questionId} (${typeof questionId})`
          );

          let result;
          if (orgFilter.hasFilter) {
            result =
              await db.sql`DELETE FROM questions WHERE id = ${questionId} AND organization_id = ${orgFilter.organizationId}`;
          } else {
            result =
              await db.sql`DELETE FROM questions WHERE id = ${questionId}`;
          }
          console.log(
            "[QUESTIONS][BULK-DELETE] Delete operation result:",
            result
          );

          if (result && (result.changes > 0 || result.rowsAffected > 0)) {
            results.deletedCount++;
            console.log(
              `[QUESTIONS][BULK-DELETE] Successfully deleted question with ID: ${questionId}`
            );
          } else {
            results.notFound.push(questionId);
            console.log(
              `[QUESTIONS][BULK-DELETE] Question not found with ID: ${questionId}`
            );
          }
        } catch (deleteErr) {
          console.error(
            `[QUESTIONS][BULK-DELETE] Error deleting question ${id}:`,
            deleteErr.message,
            deleteErr.code
          );

          // Check for foreign key constraint error - check multiple patterns
          const isConstraintError = deleteErr.message && (
            deleteErr.message.includes("FOREIGN KEY constraint failed") ||
            deleteErr.message.includes("FOREIGN KEY") ||
            deleteErr.message.includes("CONSTRAINT") ||
            deleteErr.code === "SQLITE_CONSTRAINT"
          );

          if (isConstraintError) {
            // Fetch question name and exams that reference this question
            let questionName = `Question ${questionId}`;
            let referencingExams = [];
            try {
              // Fetch question name
              const questionQuery = await db.sql`
                SELECT id, name, title FROM questions WHERE id = ${questionId}
              `;
              if (Array.isArray(questionQuery) && questionQuery.length > 0) {
                questionName = questionQuery[0].name || questionQuery[0].title || `Question ${questionId}`;
                console.log(
                  `[QUESTIONS][BULK-DELETE] Found question name for ID ${questionId}:`,
                  questionName
                );
              }

              // Fetch referencing exams
              const examsQuery = await db.sql`
                SELECT id, name FROM exams WHERE question_id = ${questionId}
              `;
              referencingExams = Array.isArray(examsQuery) ? examsQuery : [];
              console.log(
                `[QUESTIONS][BULK-DELETE] Fetched ${referencingExams.length} exams for question ${questionId}:`,
                referencingExams
              );
            } catch (examQueryErr) {
              console.error(
                `[QUESTIONS][BULK-DELETE] Error fetching question/exams for question ${id}:`,
                examQueryErr.message
              );
            }

            results.constraintErrors.push({
              id,
              questionName: questionName,
              message: `Question "${questionName}" is in use`,
              referencingExams: referencingExams,
            });
            console.log(
              `[QUESTIONS][BULK-DELETE] Added constraint error for question ${id} (${questionName}) with ${referencingExams.length} referencing exams`
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

      console.log("[QUESTIONS][BULK-DELETE] Operation final results:", results);
      res.status(200).json(results);
    } catch (err) {
      console.error("[QUESTIONS][BULK-DELETE] Unexpected error:", err);
      return res
        .status(500)
        .json({ error: err.message || "An unexpected error occurred" });
    }
  }
);

// Copy questions
router.post(
  "/questions/copy",
  authenticateToken,
  requireRole("admin", "instructor", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { ids } = req.body;
      const orgFilter = req.getOrgFilter();

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Invalid question IDs" });
      }

      const copiedQuestions = [];

      // Process each ID sequentially with proper type handling
      for (const id of ids) {
        const questionId = typeof id === "string" ? parseInt(id, 10) : id;

        // Get the original question with organization check
        let originalQuestions;
        if (orgFilter.hasFilter) {
          originalQuestions =
            await db.sql`SELECT * FROM questions WHERE id = ${questionId} AND organization_id = ${orgFilter.organizationId}`;
        } else {
          originalQuestions =
            await db.sql`SELECT * FROM questions WHERE id = ${questionId}`;
        }

        if (originalQuestions.length === 0) continue;

        const question = originalQuestions[0];
        const {
          title,
          text,
          course_id,
          difficulty,
          type,
          answer,
          image,
          points,
          rubrics,
        } = question;
        const created_by = req.user.id; // Use current user as creator of the copy
        const organization_id = orgFilter.hasFilter
          ? orgFilter.organizationId
          : null;

        // Insert the copy
        const result = await db.sql`
        INSERT INTO questions (title, text, course_id, difficulty, type, answer, image, points, rubrics, created_by, organization_id, created) 
        VALUES (${ 
          "Copy of " + title
        }, ${text}, ${course_id}, ${difficulty}, ${type}, ${answer}, ${image}, ${points}, ${rubrics}, ${created_by}, ${organization_id}, CURRENT_TIMESTAMP)
      `;

        copiedQuestions.push({
          id: result[0].id,
          title: "Copy of " + title,
          course_id,
          difficulty,
          type,
        });
      }

      res.json(copiedQuestions);
    } catch (err) {
      console.log("[QUESTIONS][COPY] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// --- EXAMS API ---
// PUT update exam by id
router.put("/exams/:id", async (req, res) => {
  try {
    const examId = req.params.id;
    const { name, duration, status } = req.body;

    // Validate input
    if (examId === undefined) {
      return res.status(400).json({ error: "Missing exam ID" });
    }

    console.log(
      `[EXAMS][PUT] Updating exam: id=${examId}, name=${name}, duration=${duration}, status=${status}`
    );

    // Update the exam
    const result = await db.sql`
      UPDATE exams 
      SET name = COALESCE(${name}, name),
          duration = COALESCE(${duration}, duration),
          status = COALESCE(${status}, status)
      WHERE id = ${examId}
      RETURNING id, name, duration, status
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "Exam not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.error("[EXAMS][PUT] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE exam by id
router.delete("/exams/:id", async (req, res) => {
  try {
    const examId = req.params.id;

    // Validate input
    if (examId === undefined) {
      return res.status(400).json({ error: "Missing exam ID" });
    }

    console.log(`[EXAMS][DELETE] Deleting exam id=${examId}`);

    // First delete related exam results
    await db.sql`DELETE FROM exam_results WHERE exam_id = ${examId}`;

    // Then delete the exam
    const result = await db.sql`DELETE FROM exams WHERE id = ${examId}`;

    if (!result || result.rowsAffected === 0) {
      return res.status(404).json({ error: "Exam not found" });
    }

    res.json({ success: true, id: examId });
  } catch (err) {
    console.error("[EXAMS][DELETE] Error:", err.message);

    // Check for foreign key constraint error
    if (err.message && err.message.includes("FOREIGN KEY constraint failed")) {
      return res.status(400).json({
        error:
          "This exam cannot be deleted because it is referenced by other records",
      });
    }

    return res.status(500).json({ error: err.message });
  }
});

// Vercel-compatible upload configuration:
let upload;
// Accept only JPEG/PNG and enforce per-file size limits
const imageFileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only JPEG and PNG image types are allowed"), false);
};

if (process.env.VERCEL || process.env.NODE_ENV === "production") {
  // For Vercel/production environments, use memory storage (no disk)
  upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: imageFileFilter,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
      files: 15,                  // optional: max 15 files per request
    },
  });
} else {
  // Local development: store on disk (so frontend can GET /uploads/filename)
  const uploadDir = path.join(__dirname, "../../public/uploads");
  try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) =>
        cb(null, Date.now() + "-" + file.originalname),
    });
    upload = multer({
      storage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 10 * 1024 * 1024, files: 15 },
    });
  } catch (err) {
    console.error("Failed to initialize disk storage for uploads:", err);
    // Fallback to memory storage if disk fails
    upload = multer({
      storage: multer.memoryStorage(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 10 * 1024 * 1024, files: 15 },
    });
  }
}


// Upload endpoint with Vercel Blob Storage support
router.post(
  "/upload",
  authenticateToken,
  requireRole("admin", "super_admin", "instructor"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // For memory storage (Vercel/production) - use Vercel Blob
      if (req.file.buffer) {
        console.log("[UPLOAD] Production mode detected, using Vercel Blob");
        
        // Check if BLOB_READ_WRITE_TOKEN is configured
        // Support both standard name and the duplicate name that Vercel sometimes creates
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;
        
        if (!blobToken) {
          console.error("[UPLOAD] ERROR: BLOB_READ_WRITE_TOKEN not configured");
          return res.status(500).json({ 
            error: "Cloud storage not configured. Please add BLOB_READ_WRITE_TOKEN environment variable in Vercel project settings and redeploy." 
          });
        }

        console.log("[UPLOAD] Token found, uploading to Vercel Blob...");
        
        try {
          // Validate that put function is available
          if (typeof put !== 'function') {
            console.error("[UPLOAD] ERROR: @vercel/blob module not loaded correctly");
            return res.status(500).json({ 
              error: "Vercel Blob module not loaded. Please ensure @vercel/blob is installed." 
            });
          }

          // Upload to Vercel Blob with unique filename
          const filename = `questions/${Date.now()}-${req.file.originalname}`;
          console.log(`[UPLOAD] Uploading file: ${filename}, size: ${req.file.buffer.length} bytes`);
          
          const blob = await put(filename, req.file.buffer, {
            access: "public",
            token: blobToken,
          });

          console.log("[UPLOAD] ✅ Successfully uploaded to Vercel Blob:", blob.url);
          return res.json({ url: blob.url });
        } catch (blobError) {
          console.error("[UPLOAD] ❌ Vercel Blob upload failed:");
          console.error("[UPLOAD] Error name:", blobError.name);
          console.error("[UPLOAD] Error message:", blobError.message);
          console.error("[UPLOAD] Error stack:", blobError.stack);
          
          return res.status(500).json({ 
            error: "Failed to upload to cloud storage: " + (blobError.message || "Unknown error"),
            details: process.env.NODE_ENV === 'development' ? blobError.stack : undefined
          });
        }
      }

      // For disk storage (local development)
      const url = `/uploads/${req.file.filename}`;
      console.log("[UPLOAD] Local file saved:", url);
      res.json({ url });
    } catch (err) {
      console.error("[UPLOAD] Unexpected error:", err);
      return res.status(500).json({ error: "Upload failed: " + err.message });
    }
  }
);

// Test endpoint to check if Blob storage is configured
router.get("/upload/test", authenticateToken, (req, res) => {
  const standardToken = process.env.BLOB_READ_WRITE_TOKEN;
  const duplicateToken = process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;
  const hasToken = !!(standardToken || duplicateToken);
  const isProduction = !!(process.env.VERCEL || process.env.NODE_ENV === "production");
  
  res.json({
    configured: hasToken,
    tokenName: standardToken ? "BLOB_READ_WRITE_TOKEN" : duplicateToken ? "BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN" : "none",
    environment: isProduction ? "production" : "development",
    storageType: isProduction ? (hasToken ? "Vercel Blob" : "Not configured") : "Local disk",
    message: hasToken 
      ? "✅ Blob storage is configured and ready!"
      : isProduction 
        ? "❌ Blob storage not configured. Add BLOB_READ_WRITE_TOKEN environment variable."
        : "ℹ️ Local development: using disk storage (no token needed)"
  });
});

module.exports = router;
