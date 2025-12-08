const express = require('express');
const router = express.Router();
const db = require('../db');
const comparator = require('../findingsComparator');

// POST /api/ai-grader/submit
// Submit findings for instant grading using local string similarity
router.post('/submit', async (req, res) => {

  try {
    console.log('[AI-GRADER][SUBMIT] ========== REQUEST RECEIVED ==========');
    console.log('[AI-GRADER][SUBMIT] Body:', JSON.stringify(req.body).substring(0, 200));
    
    const { studentId, examId, studentFindings, teacherFindings: reqTeacherFindings } = req.body;
    
    console.log('[AI-GRADER][SUBMIT] studentId:', studentId, 'type:', typeof studentId);
    console.log('[AI-GRADER][SUBMIT] examId:', examId, 'type:', typeof examId);
    console.log('[AI-GRADER][SUBMIT] studentFindings length:', (studentFindings || '').length);
    console.log('[AI-GRADER][SUBMIT] teacherFindings:', String(reqTeacherFindings || '').substring(0, 100));
    
    if (!studentId || !examId || !studentFindings) {
      console.error('[AI-GRADER][SUBMIT] Validation failed - missing required fields');
      return res.status(400).json({ error: 'studentId, examId, and studentFindings required' });
    }

    // Parse teacherFindings
    let teacherFindings = '';
    if (reqTeacherFindings && String(reqTeacherFindings).trim()) {
      try {
        const maybe = typeof reqTeacherFindings === 'string' ? JSON.parse(reqTeacherFindings) : reqTeacherFindings;
        if (maybe && typeof maybe === 'object') {
          if (maybe.explanation && typeof maybe.explanation === 'object' && maybe.explanation.text) {
            teacherFindings = String(maybe.explanation.text);
          } else if (maybe.explanation && typeof maybe.explanation === 'string') {
            teacherFindings = String(maybe.explanation);
          } else {
            teacherFindings = JSON.stringify(maybe);
          }
        } else if (typeof maybe === 'string') {
          teacherFindings = String(maybe);
        }
      } catch (e) {
        teacherFindings = String(reqTeacherFindings);
      }
    }

    // Instant grading using local string similarity (no API calls, no waiting)
    console.log('[AI-GRADER][SUBMIT] Processing instantly for student', studentId, 'exam', examId);
    const result = await comparator.compareFindings(
      Number(studentId), 
      Number(examId), 
      teacherFindings || '', 
      String(studentFindings)
    );

    if (!result) {
      console.error('[AI-GRADER][SUBMIT] Comparator returned null/undefined result');
      return res.status(500).json({ error: 'Grading produced invalid result' });
    }

    console.log('[AI-GRADER][SUBMIT] Grading completed instantly. Score:', result.score);

    // Return 200 OK with immediate result
    res.status(200).json({ 
      message: 'Grading completed',
      score: result.score,
      feedback: result.feedback,
      accuracy: result.accuracy,
      completeness: result.completeness,
      clarity: result.clarity,
      objectivity: result.objectivity
    });
  } catch (err) {
    console.error('[AI-GRADER][SUBMIT] *** ERROR ***');
    console.error('[AI-GRADER][SUBMIT] Error message:', err && err.message);
    console.error('[AI-GRADER][SUBMIT] Stack:', err && err.stack);
    res.status(500).json({ error: 'Failed to grade findings', details: err && err.message ? err.message : 'Unknown error' });
  }
});

// GET /api/ai-grader/result/:studentId/:examId - returns latest ai grade for student and exam
router.get('/result/:studentId/:examId', async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const row = await db.sql`SELECT * FROM ai_grades WHERE student_id = ${Number(studentId)} AND exam_id = ${Number(examId)} ORDER BY id DESC LIMIT 1`;
    // db.sql returns an array-like object; coerce
    const result = Array.isArray(row) ? row[0] : row;
    if (!result) return res.status(404).json({ error: 'No AI grade found' });
    res.json(result);
  } catch (err) {
    console.error('[AI-GRADER][GET-RESULT] Error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch AI grade' });
  }
});

// GET /api/ai-grader/queue/:studentId/:examId - returns latest ai_queue row for student/exam
router.get('/queue/:studentId/:examId', async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const row = await db.sql`SELECT * FROM ai_queue WHERE student_id = ${Number(studentId)} AND exam_id = ${Number(examId)} ORDER BY id DESC LIMIT 1`;
    const result = Array.isArray(row) ? row[0] : row;
    if (!result) return res.status(404).json({ error: 'No queue row found' });
    res.json(result);
  } catch (err) {
    console.error('[AI-GRADER][GET-QUEUE] Error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch queue row' });
  }
});

// POST /api/ai-grader/requeue - accept { studentId, examId } and enqueue/retry grading
router.post('/requeue', async (req, res) => {
  try {
    const { studentId, examId } = req.body || {};
    if (!studentId || !examId) return res.status(400).json({ error: 'studentId and examId required' });

    // Find latest queue row for this student/exam
    const latestRows = await db.sql`SELECT * FROM ai_queue WHERE student_id = ${Number(studentId)} AND exam_id = ${Number(examId)} ORDER BY id DESC LIMIT 1`;
    const latest = Array.isArray(latestRows) ? latestRows[0] : latestRows;

    // Enforce 30-minute minimum age if a row exists and was recently queued
    if (latest && latest.updated_at) {
      const updatedAt = new Date(latest.updated_at).getTime();
      const ageMs = Date.now() - updatedAt;
      const minMs = 30 * 60 * 1000;
      if (ageMs < minMs) {
        return res.status(429).json({ error: 'Too recent to requeue. Please wait before retrying.' });
      }
    }

    // Determine teacher_findings and student_findings to include on the requeued job.
    // Prefer copying from the latest queue row if present (so we preserve the original context).
    let teacherFindings = '';
    let studentFindings = '';
    if (latest) {
      if (latest.teacher_findings && String(latest.teacher_findings).trim()) teacherFindings = String(latest.teacher_findings);
      if (latest.student_findings && String(latest.student_findings).trim()) studentFindings = String(latest.student_findings);
    }

    // If not available from the queue row, try to pull student's findings from the results table
    if ((!studentFindings || !studentFindings.trim())) {
      try {
        const r = await db.sql`SELECT * FROM results WHERE student_id = ${Number(studentId)} AND exam_id = ${Number(examId)} ORDER BY id DESC LIMIT 1`;
        const resRow = Array.isArray(r) ? r[0] : r;
        if (resRow) {
          if (resRow.explanation && String(resRow.explanation).trim()) {
            studentFindings = String(resRow.explanation);
          } else if (resRow.answer && String(resRow.answer).trim()) {
            // Try to parse JSON answer and extract an explanation field if present
            try {
              const maybe = typeof resRow.answer === 'string' ? JSON.parse(resRow.answer) : resRow.answer;
              if (maybe) {
                if (maybe.explanation && typeof maybe.explanation === 'string') studentFindings = String(maybe.explanation);
                else if (maybe.explanation && maybe.explanation.text) studentFindings = String(maybe.explanation.text);
              }
            } catch (e) {
              // leave studentFindings empty if parse fails
            }
          }
        }
      } catch (e) {
        console.error('[AI-GRADER][REQUEUE] Failed to load result row for findings fallback:', e && e.message ? e.message : e);
      }
    }

    // If teacher findings not present, try to load from the exam/question (same logic as submit)
    if ((!teacherFindings || !teacherFindings.trim())) {
      try {
        const examRow = await db.sql`SELECT * FROM exams WHERE id = ${Number(examId)} LIMIT 1`;
        const exam = Array.isArray(examRow) ? examRow[0] : examRow;
        if (exam && exam.question_id) {
          const qRow = await db.sql`SELECT * FROM questions WHERE id = ${exam.question_id} LIMIT 1`;
          const question = Array.isArray(qRow) ? qRow[0] : qRow;
          if (question) {
            if (question.explanation && String(question.explanation).trim()) {
              teacherFindings = question.explanation;
            } else if (question.answer) {
              try {
                const answerObj = typeof question.answer === 'string' ? JSON.parse(question.answer) : question.answer;
                if (answerObj && answerObj.explanation && answerObj.explanation.text) {
                  teacherFindings = answerObj.explanation.text;
                } else if (answerObj && answerObj.explanation && typeof answerObj.explanation === 'string') {
                  teacherFindings = answerObj.explanation;
                }
              } catch (jsonErr) {
                // ignore parse errors
              }
            }
          }
        }
      } catch (e) {
        console.error('[AI-GRADER][REQUEUE] Could not load instructor explanation from DB:', e && e.message ? e.message : e);
      }
    }

    // Insert a new pending queue row (non-destructive) to trigger processing, including findings when available
    await db.runWithRetry(() => db.sql`INSERT INTO ai_queue (student_id, exam_id, teacher_findings, student_findings, status) VALUES (${Number(studentId)}, ${Number(examId)}, ${String(teacherFindings)}, ${String(studentFindings)}, 'pending')`);

    // Trigger worker to process quickly
    try { aiWorker.runOnce(1).catch(e => console.error('[AI-GRADER] aiWorker.runOnce error:', e && e.message ? e.message : e)); } catch (e) { /* ignore */ }

    res.status(202).json({ message: 'Requeue requested' });
  } catch (err) {
    console.error('[AI-GRADER][REQUEUE] Error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to requeue' });
  }
});

// GET /api/ai-grader/metrics - Get AI grader performance metrics
router.get('/metrics', async (req, res) => {
  try {
    // Get total graded (done status)
    const totalGradedResult = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'done'`;
    const totalGraded = (Array.isArray(totalGradedResult) ? totalGradedResult[0]?.count : totalGradedResult?.count) || 0;

    // Get pending queue count
    const pendingResult = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'pending'`;
    const pendingQueue = (Array.isArray(pendingResult) ? pendingResult[0]?.count : pendingResult?.count) || 0;

    // Get error count for success rate calculation
    const errorResult = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'error'`;
    const errorCount = (Array.isArray(errorResult) ? errorResult[0]?.count : errorResult?.count) || 0;

    // Calculate success rate
    const totalProcessed = totalGraded + errorCount;
    const successRate = totalProcessed > 0 ? Math.round((totalGraded / totalProcessed) * 100) : 100;

    // Get average grading time (in seconds) for done items
    // Using the difference between updated_at and created_at
    // PostgreSQL: Extract EPOCH gives seconds since epoch
    const timeResult = await db.sql`
      SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_time_seconds
      FROM ai_queue 
      WHERE status = 'done' AND updated_at IS NOT NULL AND created_at IS NOT NULL
    `;
    const averageGradeTime = timeResult && (Array.isArray(timeResult) ? timeResult[0]?.avg_time_seconds : timeResult?.avg_time_seconds) 
      ? Math.round(Array.isArray(timeResult) ? timeResult[0].avg_time_seconds : timeResult.avg_time_seconds)
      : 0;

    res.json({
      totalGraded: Number(totalGraded),
      pendingQueue: Number(pendingQueue),
      successRate: Math.min(100, Math.max(0, successRate)),
      averageGradeTime: Math.max(0, averageGradeTime),
      errorCount: Number(errorCount),
      totalProcessed: totalProcessed
    });
  } catch (err) {
    console.error('[AI-GRADER][METRICS] Error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

module.exports = router;
