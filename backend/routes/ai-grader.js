const express = require('express');
const router = express.Router();
const db = require('../db');
const stringSimilarity = require('string-similarity');

// Calculate similarity score between student and teacher findings
function calculateScore(studentText, teacherText) {
  if (!studentText || !teacherText) {
    return { accuracy: 0, completeness: 0, clarity: 0, objectivity: 0, score: 0 };
  }

  const studentClean = studentText.toLowerCase().trim();
  const teacherClean = teacherText.toLowerCase().trim();

  const similarity = stringSimilarity.compareTwoStrings(studentClean, teacherClean);

  // Accuracy: text similarity (0-100)
  const accuracy = Math.round(similarity * 100);
  
  // Completeness: length match (if student answer is shorter, penalize)
  const lengthRatio = studentClean.length / teacherClean.length;
  const completeness = Math.round(Math.min(lengthRatio, 1) * 100);
  
  // Clarity: if similarity is high, assume clarity is good
  const clarity = Math.round(similarity * 100);
  
  // Objectivity: if similarity is high, assume objectivity is good
  const objectivity = Math.round(similarity * 100);

  // Weighted average: 25% accuracy + 25% completeness + 25% clarity + 25% objectivity
  const score = Math.round(
    (accuracy * 0.25) + (completeness * 0.25) + (clarity * 0.25) + (objectivity * 0.25)
  );

  return { accuracy, completeness, clarity, objectivity, score };
}

// POST /submit - Store student findings and calculate scores
router.post('/submit', async (req, res) => {
  try {
    const { student_id, exam_id, result_id, student_findings, teacher_findings } = req.body;

    console.log('[AI-GRADER][SUBMIT] Received:', { student_id, exam_id, result_id });

    if (!student_id || !exam_id || !student_findings || !teacher_findings) {
      return res.status(400).json({ 
        error: 'Missing required fields: student_id, exam_id, student_findings, teacher_findings' 
      });
    }

    // Calculate scores
    const scores = calculateScore(student_findings, teacher_findings);

    // Save to database
    const result = await db.sql`
      INSERT INTO ai_findings (student_id, exam_id, result_id, student_findings, teacher_findings, score, accuracy, completeness, clarity, objectivity)
      VALUES (${student_id}, ${exam_id}, ${result_id || null}, ${student_findings}, ${teacher_findings}, ${scores.score}, ${scores.accuracy}, ${scores.completeness}, ${scores.clarity}, ${scores.objectivity})
      ON CONFLICT (student_id, exam_id) DO UPDATE SET
        student_findings = EXCLUDED.student_findings,
        teacher_findings = EXCLUDED.teacher_findings,
        score = EXCLUDED.score,
        accuracy = EXCLUDED.accuracy,
        completeness = EXCLUDED.completeness,
        clarity = EXCLUDED.clarity,
        objectivity = EXCLUDED.objectivity,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    console.log('[AI-GRADER][SUBMIT] Score saved:', result[0]);

    res.json({
      success: true,
      score: scores.score,
      accuracy: scores.accuracy,
      completeness: scores.completeness,
      clarity: scores.clarity,
      objectivity: scores.objectivity
    });
  } catch (err) {
    console.error('[AI-GRADER][SUBMIT] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /result/:studentId/:examId - Fetch calculated scores
router.get('/result/:studentId/:examId', async (req, res) => {
  try {
    const { studentId, examId } = req.params;

    console.log('[AI-GRADER][RESULT] Fetching grade for student', studentId, 'exam', examId);

    const result = await db.sql`
      SELECT score, accuracy, completeness, clarity, objectivity, feedback, created_at 
      FROM ai_findings 
      WHERE student_id = ${studentId} AND exam_id = ${examId}
      LIMIT 1
    `;

    if (!result || result.length === 0) {
      console.log('[AI-GRADER][RESULT] No grade found');
      return res.status(404).json({ error: 'No grade found' });
    }

    console.log('[AI-GRADER][RESULT] Grade found:', result[0]);
    res.json(result[0]);
  } catch (err) {
    console.error('[AI-GRADER][RESULT] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /test-db - Test database connection
router.get('/test-db', async (req, res) => {
  try {
    const result = await db.sql`
      INSERT INTO ai_findings (student_id, exam_id, student_findings, teacher_findings, score)
      VALUES (${999}, ${999}, ${'test'}, ${'test'}, ${0})
      ON CONFLICT (student_id, exam_id) DO NOTHING
      RETURNING id
    `;
    res.json({ success: true, message: 'Database connection works', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /test-schema - Check table structure
router.get('/test-schema', async (req, res) => {
  try {
    const columns = await db.sql`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'ai_findings'
      ORDER BY ordinal_position
    `;
    res.json({ success: true, columns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /test-all - Fetch all findings
router.get('/test-all', async (req, res) => {
  try {
    const results = await db.sql`SELECT * FROM ai_findings ORDER BY created_at DESC LIMIT 50`;
    res.json({ success: true, count: results.length, findings: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
