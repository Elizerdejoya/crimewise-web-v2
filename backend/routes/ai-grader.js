const express = require('express');
const router = express.Router();
const db = require('../db');
const aiWorker = require('../ai-worker');

// POST /api/ai-grader/submit
// Enqueue a job into the DB-backed ai_queue
router.post('/submit', async (req, res) => {

  try {
    const { studentId, examId, studentFindings, teacherFindings: reqTeacherFindings } = req.body;
    // Prefer teacherFindings sent by the frontend. If it's JSON, try to extract explanation text.
    let teacherFindings = '';
    if (reqTeacherFindings && String(reqTeacherFindings).trim()) {
      try {
        const maybe = typeof reqTeacherFindings === 'string' ? JSON.parse(reqTeacherFindings) : reqTeacherFindings;
        if (maybe) {
          // Try common shapes: { explanation: { text: '...' } } or { explanation: '...' }
          if (maybe.explanation && typeof maybe.explanation === 'object' && maybe.explanation.text) {
            teacherFindings = String(maybe.explanation.text);
          } else if (maybe.explanation && typeof maybe.explanation === 'string') {
            teacherFindings = String(maybe.explanation);
          } else if (typeof maybe === 'string') {
            teacherFindings = String(maybe);
          } else {
            // Fallback to JSON-stringified form
            teacherFindings = JSON.stringify(maybe);
          }
        }
      } catch (e) {
        // Not JSON, use as-is
        teacherFindings = String(reqTeacherFindings);
      }
    }

    // If still empty, fallback to loading from DB (question.explanation or answer.explanation.text)
    if (!teacherFindings || !teacherFindings.trim()) {
      try {
        const examRow = await db.sql`SELECT * FROM exams WHERE id = ${examId} LIMIT 1`;
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
        console.error('[AI-GRADER][SUBMIT] Could not load instructor explanation from DB:', e && e.message ? e.message : e);
      }
    }

    // Insert job as pending and return immediately (enqueue-only)
    await db.sql`INSERT INTO ai_queue (student_id, exam_id, teacher_findings, student_findings, status) VALUES (${Number(studentId)}, ${Number(examId)}, ${String(teacherFindings)}, ${String(studentFindings)}, 'pending')`;

    // Find the inserted job id to return to the client
    const inserted = await db.sql`SELECT id FROM ai_queue WHERE student_id = ${Number(studentId)} AND exam_id = ${Number(examId)} ORDER BY id DESC LIMIT 1`;
    const jobRow = Array.isArray(inserted) ? inserted[0] : inserted;
    const jobId = jobRow ? jobRow.id : null;

    // Kick the worker once in-process to reduce latency (non-blocking)
    try {
      // runOnce will schedule processing respecting concurrency/backoff; we don't await it here
      aiWorker.runOnce(1).catch((e) => console.error('[AI-GRADER] aiWorker.runOnce error:', e && e.message ? e.message : e));
    } catch (e) {
      // Ignore errors from trying to trigger worker; job remains queued
      console.error('[AI-GRADER] Failed to trigger ai worker:', e && e.message ? e.message : e);
    }

    res.status(202).json({ message: 'Queued for AI grading', jobId });
  } catch (err) {
    console.error('[AI-GRADER][SUBMIT] Error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to submit for AI grading' });
  }
});

// POST /api/ai-grader/process-pending
// Process up to `limit` pending jobs (default 1). Intended to be called by a scheduler.
router.post('/process-pending', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 1);
    const processed = await aiWorker.runOnce(limit);
    res.json({ processed });
  } catch (err) {
    console.error('[AI-GRADER][PROCESS-PENDING] Error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to process pending jobs' });
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
    await db.sql`INSERT INTO ai_queue (student_id, exam_id, teacher_findings, student_findings, status) VALUES (${Number(studentId)}, ${Number(examId)}, ${String(teacherFindings)}, ${String(studentFindings)}, 'pending')`;

    // Trigger worker to process quickly
    try { aiWorker.runOnce(1).catch(e => console.error('[AI-GRADER] aiWorker.runOnce error:', e && e.message ? e.message : e)); } catch (e) { /* ignore */ }

    res.status(202).json({ message: 'Requeue requested' });
  } catch (err) {
    console.error('[AI-GRADER][REQUEUE] Error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to requeue' });
  }
});

module.exports = router;
