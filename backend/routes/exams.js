const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  authenticateToken,
  requireRole,
  addOrganizationFilter,
} = require("../middleware");

// Generate a random token for the exam
function generateToken(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}


// GET all exams, filter by instructorId if provided
router.get(
  "/",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { instructorId, includeDetails } = req.query;
      const orgFilter = req.getOrgFilter();

      let rows;
      if (instructorId) {
        if (orgFilter.hasFilter) {
          // For non-super_admin users, filter by organization
          if (includeDetails === 'true') {
            // Get exams with aggregated results data
            rows = await db.sql`
            SELECT 
              e.*,
              COUNT(r.id) as participants,
              CASE 
                WHEN COUNT(r.id) > 0 THEN ROUND(AVG(r.score), 2)
                ELSE NULL 
              END as avgScore,
              q.points as totalItemScore,
              q.type as question_type,
              q.answer as answer_key,
              q.title as question_title,
              q.text as question_text
            FROM exams e
            JOIN users u ON e.instructor_id = u.id
            LEFT JOIN results r ON e.id = r.exam_id
            LEFT JOIN questions q ON e.question_id = q.id
            WHERE e.instructor_id = ${instructorId} AND u.organization_id = ${orgFilter.organizationId}
            GROUP BY e.id, q.id
            ORDER BY e.start DESC
          `;
          } else {
            rows = await db.sql`
            SELECT e.* FROM exams e
            JOIN users u ON e.instructor_id = u.id
            WHERE e.instructor_id = ${instructorId} AND u.organization_id = ${orgFilter.organizationId}
            ORDER BY e.start DESC
          `;
          }
        } else {
          // Super admin can see all
          if (includeDetails === 'true') {
            rows = await db.sql`
            SELECT 
              e.*,
              COUNT(r.id) as participants,
              CASE 
                WHEN COUNT(r.id) > 0 THEN ROUND(AVG(r.score), 2)
                ELSE NULL 
              END as avgScore,
              q.points as totalItemScore,
              q.type as question_type,
              q.answer as answer_key,
              q.title as question_title,
              q.text as question_text
            FROM exams e
            LEFT JOIN results r ON e.id = r.exam_id
            LEFT JOIN questions q ON e.question_id = q.id
            WHERE e.instructor_id = ${instructorId}
            GROUP BY e.id, q.id
            ORDER BY e.start DESC
          `;
          } else {
            rows = await db.sql`
            SELECT * FROM exams 
            WHERE instructor_id = ${instructorId}
            ORDER BY start DESC
          `;
          }
        }
      } else {
        if (orgFilter.hasFilter) {
          // For non-super_admin users, only show exams from their organization
          if (includeDetails === 'true') {
            rows = await db.sql`
            SELECT 
              e.*,
              COUNT(r.id) as participants,
              CASE 
                WHEN COUNT(r.id) > 0 THEN ROUND(AVG(r.score), 2)
                ELSE NULL 
              END as avgScore,
              q.points as totalItemScore,
              q.type as question_type,
              q.answer as answer_key,
              q.title as question_title,
              q.text as question_text
            FROM exams e
            JOIN users u ON e.instructor_id = u.id
            LEFT JOIN results r ON e.id = r.exam_id
            LEFT JOIN questions q ON e.question_id = q.id
            WHERE u.organization_id = ${orgFilter.organizationId}
            GROUP BY e.id, q.id
            ORDER BY e.start DESC
          `;
          } else {
            rows = await db.sql`
            SELECT e.* FROM exams e
            JOIN users u ON e.instructor_id = u.id
            WHERE u.organization_id = ${orgFilter.organizationId}
            ORDER BY e.start DESC
          `;
          }
        } else {
          // Super admin can see all
          if (includeDetails === 'true') {
            rows = await db.sql`
            SELECT 
              e.*,
              COUNT(r.id) as participants,
              CASE 
                WHEN COUNT(r.id) > 0 THEN ROUND(AVG(r.score), 2)
                ELSE NULL 
              END as avgScore,
              q.points as totalItemScore,
              q.type as question_type,
              q.answer as answer_key,
              q.title as question_title,
              q.text as question_text
            FROM exams e
            LEFT JOIN results r ON e.id = r.exam_id
            LEFT JOIN questions q ON e.question_id = q.id
            GROUP BY e.id, q.id
            ORDER BY e.start DESC
          `;
          } else {
            rows = await db.sql`SELECT * FROM exams ORDER BY start DESC`;
          }
        }
      }

      res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST create exam
router.post(
  "/",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const {
        name,
        course_id,
        class_id,
        instructor_id,
        question_id,
        start,
        end,
        duration,
      } = req.body;
      const orgFilter = req.getOrgFilter();

      // Verify that instructor, course, class, and question belong to the same organization
      if (orgFilter.hasFilter) {
        // Check instructor organization
        const instructorCheck = await db.sql`
        SELECT id FROM users WHERE id = ${instructor_id} AND organization_id = ${orgFilter.organizationId} AND role = 'instructor'
      `;
        if (!instructorCheck || instructorCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Instructor not found in your organization" });
        }

        // Check course organization
        const courseCheck = await db.sql`
        SELECT id FROM courses WHERE id = ${course_id} AND organization_id = ${orgFilter.organizationId}
      `;
        if (!courseCheck || courseCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Course not found in your organization" });
        }

        // Check class organization
        const classCheck = await db.sql`
        SELECT id FROM classes WHERE id = ${class_id} AND organization_id = ${orgFilter.organizationId}
      `;
        if (!classCheck || classCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Class not found in your organization" });
        }

        // Check question organization (questions belong to instructors who belong to organizations)
        const questionCheck = await db.sql`
        SELECT q.id FROM questions q
        JOIN users u ON q.created_by = u.id
        WHERE q.id = ${question_id} AND u.organization_id = ${orgFilter.organizationId}
      `;
        if (!questionCheck || questionCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Question not found in your organization" });
        }
      }

      const token = generateToken();

      // Store times: treat incoming time as Asia/Manila, convert to UTC for storage
      // This way: 11:54 Manila (input) → stored as 03:54 UTC internally → displayed as 11:54 in Manila timezone
      const result = await db.sql`
      INSERT INTO exams (name, course_id, class_id, instructor_id, question_id, start, "end", duration, token) 
      VALUES (
        ${name}, 
        ${course_id}, 
        ${class_id}, 
        ${instructor_id}, 
        ${question_id}, 
        ${start}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC',
        ${end}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC',
        ${duration}, 
        ${token}
      )
      RETURNING id
    `;

      res.json({ id: result[0].id, token });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET exam by token (used by students to access exam)
router.get(
  "/token/:token",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor", "student"),
  async (req, res) => {
    try {
      const token = req.params.token;
      const userId = req.user.id;
      const userOrgId = req.user.organization_id;

      // Get exam details - convert from UTC back to Manila time for display
      const rows = await db.sql`
      SELECT 
        id, name, course_id, class_id, instructor_id, question_id, 
        (start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::text as start,
        ("end" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::text as "end",
        duration, token, organization_id, created
      FROM exams WHERE token = ${token}
      `;

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: "Exam not found" });
      }

      const exam = rows[0];

      // For students, check if the exam belongs to their organization and class
      if (req.user.role === "student") {
        // Check if exam instructor belongs to same organization as student
        const instructorCheck = await db.sql`
        SELECT u.organization_id FROM users u WHERE u.id = ${exam.instructor_id}
      `;

        if (
          !instructorCheck ||
          instructorCheck.length === 0 ||
          instructorCheck[0].organization_id !== userOrgId
        ) {
          return res.status(403).json({ error: "Access denied to this exam" });
        }

        // Check if student belongs to the class assigned to this exam
        if (exam.class_id) {
          const studentClassCheck = await db.sql`
          SELECT class_id FROM users WHERE id = ${userId} AND role = 'student'
        `;

          if (
            !studentClassCheck ||
            studentClassCheck.length === 0 ||
            studentClassCheck[0].class_id !== exam.class_id
          ) {
            return res.status(403).json({ 
              error: "Access denied. This exam is restricted to a specific class and you are not enrolled in that class." 
            });
          }
        }

        // Check subscription status
        const subscriptionCheck = await db.sql`
        SELECT s.end_date FROM subscriptions s 
        WHERE s.organization_id = ${userOrgId} AND s.status = 'active'
        ORDER BY s.end_date DESC LIMIT 1
      `;

        if (subscriptionCheck && subscriptionCheck.length > 0) {
          const endDate = new Date(subscriptionCheck[0].end_date);
          const now = new Date();

          if (endDate < now) {
            return res
              .status(403)
              .json({
                error:
                  "Organization subscription has expired. Cannot take exam.",
              });
          }
        }
      }

      res.json(exam);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET exam by id
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await db.sql`
    SELECT 
      id, name, course_id, class_id, instructor_id, question_id, 
      (start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::text as start,
      ("end" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::text as "end",
      duration, token, organization_id, created
    FROM exams WHERE id = ${id}
    `;

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Exam not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET exam results with participants and average score
router.get(
  "/results/:examId",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const examId = req.params.examId;
      const orgFilter = req.getOrgFilter();

      // First verify that the exam belongs to the user's organization
      if (orgFilter.hasFilter) {
        const examCheck = await db.sql`
        SELECT e.id FROM exams e
        JOIN users u ON e.instructor_id = u.id
        WHERE e.id = ${examId} AND u.organization_id = ${orgFilter.organizationId}
      `;
        if (!examCheck || examCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Exam not found in your organization" });
        }
      }

      // Get participants and their scores for the exam
      const rows = await db.sql`
      SELECT r.*, u.name as student_name, u.email as student_email
      FROM results r
      JOIN users u ON r.student_id = u.id
      WHERE r.exam_id = ${examId}
    `;

      // Calculate average score
      const avgScore =
        rows.length > 0
          ? Math.round(
              rows.reduce((sum, r) => sum + (r.score || 0), 0) / rows.length
            )
          : null;

      // Get question information for total score
      const questionInfo = await db.sql`
      SELECT q.points as totalItemScore, q.type, q.answer as answer_key
      FROM exams e
      JOIN questions q ON e.question_id = q.id
      WHERE e.id = ${examId}
    `;

      const totalItemScore =
        questionInfo.length > 0 ? questionInfo[0].totalItemScore : null;
      const questionType =
        questionInfo.length > 0 ? questionInfo[0].type : null;
      const answerKey =
        questionInfo.length > 0 ? questionInfo[0].answer_key : null;

      res.json({
        participants: rows.length,
        avgScore,
        totalItemScore,
        questionType,
        answer_key: answerKey,
        results: rows,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST student exam answer
router.post(
  "/submit",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor", "student"),
  async (req, res) => {
    try {
      const {
        student_id,
        exam_id,
        score,
        answer,
        date,
        tab_switches,
        details,
        explanation,
      } = req.body;

      const userId = req.user.id;
      const userOrgId = req.user.organization_id;

      // For students, verify they can only submit their own exam results
      if (req.user.role === "student" && student_id !== userId) {
        return res
          .status(403)
          .json({ error: "Cannot submit exam for another student" });
      }

      // Check if student belongs to same organization and class as exam
      if (req.user.role === "student") {
        const examCheck = await db.sql`
        SELECT e.instructor_id, e.class_id FROM exams e WHERE e.id = ${exam_id}
      `;

        if (examCheck && examCheck.length > 0) {
          const exam = examCheck[0];
          
          const instructorCheck = await db.sql`
          SELECT u.organization_id FROM users u WHERE u.id = ${exam.instructor_id}
        `;

          if (
            !instructorCheck ||
            instructorCheck.length === 0 ||
            instructorCheck[0].organization_id !== userOrgId
          ) {
            return res
              .status(403)
              .json({ error: "Access denied to this exam" });
          }

          // Check if student belongs to the class assigned to this exam
          if (exam.class_id) {
            const studentClassCheck = await db.sql`
            SELECT class_id FROM users WHERE id = ${userId} AND role = 'student'
          `;

            if (
              !studentClassCheck ||
              studentClassCheck.length === 0 ||
              studentClassCheck[0].class_id !== exam.class_id
            ) {
              return res.status(403).json({ 
                error: "Access denied. This exam is restricted to a specific class and you are not enrolled in that class." 
              });
            }
          }

          // Check subscription status before allowing submission
          const subscriptionCheck = await db.sql`
          SELECT s.end_date FROM subscriptions s 
          WHERE s.organization_id = ${userOrgId} AND s.status = 'active'
          ORDER BY s.end_date DESC LIMIT 1
        `;

          if (subscriptionCheck && subscriptionCheck.length > 0) {
            const endDate = new Date(subscriptionCheck[0].end_date);
            const now = new Date();

            if (endDate < now) {
              return res
                .status(403)
                .json({
                  error:
                    "Organization subscription has expired. Cannot submit exam.",
                });
            }
          }
        }
      }

      const result = await db.sql`
      INSERT INTO results (organization_id, student_id, exam_id, score, date, answer, tab_switches, details, explanation) 
      VALUES (${userOrgId}, ${student_id}, ${exam_id}, ${score}, ${date}, ${answer}, ${
        tab_switches || 0
      }, ${details || null}, ${explanation || null})
      RETURNING id
    `;

      const resultId = result[0].id;

      // Queue for AI grading if exam has questions
      try {
        // Get questions for this exam
        const questions = await db.sql`SELECT id FROM questions WHERE exam_id = ${exam_id} LIMIT 1`;
        
        if (questions && questions.length > 0) {
          const questionId = questions[0].id;
          
          // Get a batch_id (use exam_id as batch_id for simplicity, or create one)
          const batches = await db.sql`SELECT id FROM batches WHERE organization_id = ${userOrgId} LIMIT 1`;
          const batchId = batches && batches[0] ? batches[0].id : 1;
          
          // Queue for AI grading
          await db.sql`
            INSERT INTO ai_queue (organization_id, batch_id, result_id, question_id, student_answer, status)
            VALUES (${userOrgId}, ${batchId}, ${resultId}, ${questionId}, ${answer || null}, 'pending')
          `;
          console.log(`[EXAMS][SUBMIT] Queued result ${resultId} for AI grading`);
        }
      } catch (queueErr) {
        // Don't fail the submit if queueing fails, just log it
        console.warn(`[EXAMS][SUBMIT] Failed to queue AI grading: ${queueErr.message}`);
      }

      res.json({ success: true, id: resultId });
    } catch (err) {
      console.log("[EXAMS][SUBMIT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET exam PDF (mock implementation)
router.get("/:id/pdf", (req, res) => {
  // In a real app, generate a PDF and send it
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=exam_${req.params.id}.pdf`
  );
  // For now, send a simple PDF header and text
  res.end(
    Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 100 Td (Exam PDF Placeholder) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000212 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n312\n%%EOF",
      "utf-8"
    )
  );
});

// GET all results for a student (detailed)
router.get(
  "/student/:studentId/results",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor", "student"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const studentId = req.params.studentId;
      const orgFilter = req.getOrgFilter();
      const userId = req.user.id;

      // Students can only view their own results
      if (req.user.role === "student" && parseInt(studentId) !== userId) {
        return res
          .status(403)
          .json({ error: "Cannot view other student's results" });
      }

      let query;
      if (orgFilter.hasFilter) {
        // For non-super_admin users, ensure student belongs to same organization
        query = await db.sql`
        SELECT r.*, e.name as examName, e.course_id as course, e.start as examStart, e.end as examEnd,
                q.type as question_type, q.answer as answer_key, q.points,
                q.keyword_pool_id, q.selected_keywords,
                CASE WHEN kp.name IS NULL THEN NULL ELSE kp.name END as keyword_pool_name,
                CASE WHEN kp.description IS NULL THEN NULL ELSE kp.description END as keyword_pool_description,
                CASE WHEN kp.keywords IS NULL THEN NULL ELSE kp.keywords END as keyword_pool_keywords
        FROM results r
        JOIN exams e ON r.exam_id = e.id
        JOIN questions q ON e.question_id = q.id
        LEFT JOIN keyword_pools kp ON q.keyword_pool_id = kp.id
        JOIN users u ON r.student_id = u.id
        WHERE r.student_id = ${studentId} AND u.organization_id = ${orgFilter.organizationId}
        ORDER BY r.date DESC
      `;
      } else {
        // Super admin can see all
        query = await db.sql`
        SELECT r.*, e.name as examName, e.course_id as course, e.start as examStart, e.end as examEnd,
                q.type as question_type, q.answer as answer_key, q.points,
                q.keyword_pool_id, q.selected_keywords,
                CASE WHEN kp.name IS NULL THEN NULL ELSE kp.name END as keyword_pool_name,
                CASE WHEN kp.description IS NULL THEN NULL ELSE kp.description END as keyword_pool_description,
                CASE WHEN kp.keywords IS NULL THEN NULL ELSE kp.keywords END as keyword_pool_keywords
        FROM results r
        JOIN exams e ON r.exam_id = e.id
        JOIN questions q ON e.question_id = q.id
        LEFT JOIN keyword_pools kp ON q.keyword_pool_id = kp.id
        WHERE r.student_id = ${studentId}
        ORDER BY r.date DESC
      `;
      }

      res.json(query);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update exam
router.put(
  "/:id",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const id = req.params.id;
      const {
        name,
        course_id,
        class_id,
        instructor_id,
        question_id,
        start,
        end,
        duration,
      } = req.body;
      const orgFilter = req.getOrgFilter();

      // Convert IDs to numbers if they are strings
      const examId = typeof id === "string" ? parseInt(id, 10) : id;
      const courseId =
        typeof course_id === "string" ? parseInt(course_id, 10) : course_id;
      const classId =
        typeof class_id === "string" ? parseInt(class_id, 10) : class_id;
      const instructorId =
        typeof instructor_id === "string"
          ? parseInt(instructor_id, 10)
          : instructor_id;
      const questionId =
        typeof question_id === "string"
          ? parseInt(question_id, 10)
          : question_id;

      // Verify that the exam belongs to the user's organization
      if (orgFilter.hasFilter) {
        const examCheck = await db.sql`
        SELECT e.id FROM exams e
        JOIN users u ON e.instructor_id = u.id
        WHERE e.id = ${examId} AND u.organization_id = ${orgFilter.organizationId}
      `;
        if (!examCheck || examCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Exam not found in your organization" });
        }

        // Verify that new instructor, course, class, and question belong to the same organization
        // Check instructor organization
        const instructorCheck = await db.sql`
        SELECT id FROM users WHERE id = ${instructorId} AND organization_id = ${orgFilter.organizationId} AND role = 'instructor'
      `;
        if (!instructorCheck || instructorCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Instructor not found in your organization" });
        }

        // Check course organization
        const courseCheck = await db.sql`
        SELECT id FROM courses WHERE id = ${courseId} AND organization_id = ${orgFilter.organizationId}
      `;
        if (!courseCheck || courseCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Course not found in your organization" });
        }

        // Check class organization
        const classCheck = await db.sql`
        SELECT id FROM classes WHERE id = ${classId} AND organization_id = ${orgFilter.organizationId}
      `;
        if (!classCheck || classCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Class not found in your organization" });
        }

        // Check question organization (questions belong to instructors who belong to organizations)
        const questionCheck = await db.sql`
        SELECT q.id FROM questions q
        JOIN users u ON q.created_by = u.id
        WHERE q.id = ${questionId} AND u.organization_id = ${orgFilter.organizationId}
      `;
        if (!questionCheck || questionCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Question not found in your organization" });
        }
      }

      const result = await db.sql`
      UPDATE exams 
      SET name = ${name}, 
          course_id = ${courseId}, 
          class_id = ${classId}, 
          instructor_id = ${instructorId}, 
          question_id = ${questionId}, 
          start = ${start}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC', 
          "end" = ${end}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC', 
          duration = ${duration}
      WHERE id = ${examId}
    `;

      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "Exam not found" });
      }

      res.json({
        id: examId,
        name,
        course_id: courseId,
        class_id: classId,
        instructor_id: instructorId,
        question_id: questionId,
        start,
        end,
        duration,
      });
    } catch (err) {
      console.log("[EXAMS][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE exam
router.delete(
  "/:id",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();

      // Convert ID to number if it's a string
      const examId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(examId)) {
        return res.status(400).json({ error: "Invalid exam ID format" });
      }

      // Verify that the exam belongs to the user's organization
      if (orgFilter.hasFilter) {
        const examCheck = await db.sql`
        SELECT e.id FROM exams e
        JOIN users u ON e.instructor_id = u.id
        WHERE e.id = ${examId} AND u.organization_id = ${orgFilter.organizationId}
      `;
        if (!examCheck || examCheck.length === 0) {
          return res
            .status(403)
            .json({ error: "Exam not found in your organization" });
        }
      }

      const result = await db.sql`DELETE FROM exams WHERE id = ${examId}`;

      if (result.rowsAffected === 0) {
        return res.status(404).json({ error: "Exam not found" });
      }

      res.json({ success: true, id: examId });
    } catch (err) {
      console.log("[EXAMS][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// BULK operations for exams
router.post(
  "/bulk",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { exams } = req.body;
      const orgFilter = req.getOrgFilter();

      if (!Array.isArray(exams) || exams.length === 0) {
        return res.status(400).json({ error: "No exams provided." });
      }

      const created = [];

      for (const exam of exams) {
        try {
          const {
            name,
            course_id,
            class_id,
            instructor_id,
            question_id,
            start,
            end,
            duration,
          } = exam;

          // Verify that instructor, course, class, and question belong to the same organization
          if (orgFilter.hasFilter) {
            // Check instructor organization
            const instructorCheck = await db.sql`
            SELECT id FROM users WHERE id = ${instructor_id} AND organization_id = ${orgFilter.organizationId} AND role = 'instructor'
          `;
            if (!instructorCheck || instructorCheck.length === 0) {
              console.log(
                `[EXAMS][BULK POST] Instructor ${instructor_id} not found in organization`
              );
              continue;
            }

            // Check course organization
            const courseCheck = await db.sql`
            SELECT id FROM courses WHERE id = ${course_id} AND organization_id = ${orgFilter.organizationId}
          `;
            if (!courseCheck || courseCheck.length === 0) {
              console.log(
                `[EXAMS][BULK POST] Course ${course_id} not found in organization`
              );
              continue;
            }

            // Check class organization
            const classCheck = await db.sql`
            SELECT id FROM classes WHERE id = ${class_id} AND organization_id = ${orgFilter.organizationId}
          `;
            if (!classCheck || classCheck.length === 0) {
              console.log(
                `[EXAMS][BULK POST] Class ${class_id} not found in organization`
              );
              continue;
            }

            // Check question organization
            const questionCheck = await db.sql`
            SELECT q.id FROM questions q
            JOIN users u ON q.created_by = u.id
            WHERE q.id = ${question_id} AND u.organization_id = ${orgFilter.organizationId}
          `;
            if (!questionCheck || questionCheck.length === 0) {
              console.log(
                `[EXAMS][BULK POST] Question ${question_id} not found in organization`
              );
              continue;
            }
          }

          const token = generateToken();

          const result = await db.sql`
          INSERT INTO exams (name, course_id, class_id, instructor_id, question_id, start, "end", duration, token) 
          VALUES (
            ${name}, 
            ${course_id}, 
            ${class_id}, 
            ${instructor_id}, 
            ${question_id}, 
            ${start}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC',
            ${end}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC',
            ${duration}, 
            ${token}
          )
          RETURNING id
        `;

          created.push({
            id: result[0].id,
            name,
            course_id,
            class_id,
            instructor_id,
            question_id,
            start,
            end,
            duration,
            token,
          });
        } catch (insertErr) {
          console.log("[EXAMS][BULK POST] Error:", insertErr.message);
        }
      }

      res.json(created);
    } catch (err) {
      console.log("[EXAMS][BULK POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.patch("/bulk", async (req, res) => {
  try {
    const { exams } = req.body;
    if (!Array.isArray(exams) || exams.length === 0) {
      return res.status(400).json({ error: "No exams provided." });
    }

    const updated = [];

    for (const exam of exams) {
      try {
        const {
          id,
          name,
          course_id,
          class_id,
          instructor_id,
          question_id,
          start,
          end,
          duration,
        } = exam;

        if (!id) continue;

        // Convert IDs to numbers if they are strings
        const examId = typeof id === "string" ? parseInt(id, 10) : id;
        const courseId =
          typeof course_id === "string" ? parseInt(course_id, 10) : course_id;
        const classId =
          typeof class_id === "string" ? parseInt(class_id, 10) : class_id;
        const instructorId =
          typeof instructor_id === "string"
            ? parseInt(instructor_id, 10)
            : instructor_id;
        const questionId =
          typeof question_id === "string"
            ? parseInt(question_id, 10)
            : question_id;

        console.log(`Updating exam: id=${examId}, name=${name}`);

        const result = await db.sql`
          UPDATE exams 
          SET name = ${name}, 
              course_id = ${courseId}, 
              class_id = ${classId}, 
              instructor_id = ${InstructorId}, 
              question_id = ${questionId}, 
              start = ${start}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC', 
              "end" = ${end}::timestamp AT TIME ZONE 'Asia/Manila' AT TIME ZONE 'UTC', 
              duration = ${duration}
          WHERE id = ${examId}
        `;

        if (result.rowsAffected > 0) {
          updated.push({
            id: examId,
            name,
            course_id: courseId,
            class_id: classId,
            instructor_id: instructorId,
            question_id: questionId,
            start,
            end,
            duration,
          });
        }
      } catch (updateErr) {
        console.log("[EXAMS][BULK PATCH] Error:", updateErr.message);
      }
    }

    res.json({ success: true, updated: updated.length, items: updated });
  } catch (err) {
    console.log("[EXAMS][BULK PATCH] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "Valid array of exam IDs is required" });
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
      const examId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(examId)) {
        results.invalidIds.push(id);
        continue;
      }

      try {
        const result = await db.sql`DELETE FROM exams WHERE id = ${examId}`;

        if (result.rowsAffected > 0) {
          results.deletedCount++;
        } else {
          results.notFound.push(examId);
        }
      } catch (deleteErr) {
        console.log(`Error deleting exam ${examId}:`, deleteErr.message);
        results.errors.push({ id: examId, error: deleteErr.message });
      }
    }

    // Update overall success flag if needed
    if (results.deletedCount === 0) {
      results.success = false;
    }

    res.json(results);
  } catch (err) {
    console.log("[EXAMS][BULK DELETE] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET upcoming exams for a specific student
router.get(
  "/student/:studentId/upcoming",
  authenticateToken,
  requireRole("super_admin", "admin", "instructor", "student"),
  async (req, res) => {
    try {
      const studentId = req.params.studentId;
      const userId = req.user.id;
      const userRole = req.user.role;
      const userOrgId = req.user.organization_id;

      // For students, verify they can only access their own upcoming exams
      if (userRole === "student" && parseInt(studentId) !== userId) {
        return res.status(403).json({ error: "Cannot access another student's exams" });
      }

      // Get student's class information
      const studentInfo = await db.sql`
        SELECT u.class_id, u.organization_id 
        FROM users u 
        WHERE u.id = ${studentId} AND u.role = 'student'
      `;

      if (!studentInfo || studentInfo.length === 0) {
        return res.status(404).json({ error: "Student not found" });
      }

      const student = studentInfo[0];

      // For non-super_admin users, verify organization match
      if (userRole !== "super_admin" && student.organization_id !== userOrgId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get upcoming exams for the student's class
      const now = new Date().toISOString();
      const rows = await db.sql`
        SELECT 
          e.id,
          e.name,
          e.start,
          e.end,
          e.duration,
          e.token,
          c.name as course_name,
          c.code as course_code,
          u.name as instructor_name
        FROM exams e
        JOIN courses c ON e.course_id = c.id
        JOIN users u ON e.instructor_id = u.id
        WHERE e.class_id = ${student.class_id} 
          AND e.start > ${now}
          AND c.organization_id = ${student.organization_id}
        ORDER BY e.start ASC
      `;

      res.json(rows);
    } catch (err) {
      console.log("[EXAMS][STUDENT-UPCOMING] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Log exam violations (tab switching, etc.)
router.post("/log-violation", async (req, res) => {
  try {
    const { student_id, exam_id, violation_type, timestamp } = req.body;

    if (!student_id || !exam_id || !violation_type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await db.sql`
      INSERT INTO exam_violations (student_id, exam_id, violation_type, timestamp)
      VALUES (${student_id}, ${exam_id}, ${violation_type}, ${
      timestamp || new Date().toISOString()
    })
      RETURNING id
    `;

    res.json({ success: true, id: result[0].id });
  } catch (err) {
    console.log("[EXAMS][LOG-VIOLATION] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
