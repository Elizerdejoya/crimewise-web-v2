const express = require('express');
const router = express.Router();
const db = require('../db');
const stringSimilarity = require('string-similarity');
const { authenticateToken } = require('../middleware');

// TEST ENDPOINT - Direct database write
router.post('/test-db', async (req, res) => {
  try {
    console.log('[AI-GRADER][TEST-DB] Testing database INSERT');
    const testResult = await db.sql`
      INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response)
      VALUES (${999}, ${999}, ${50}, ${50}, ${50}, ${50}, ${50}, ${'Test feedback'}, ${'TEST'})
    `;
    console.log('[AI-GRADER][TEST-DB] Insert successful:', testResult);
    res.json({ success: true, message: 'Database insert worked!', result: testResult });
  } catch (err) {
    console.error('[AI-GRADER][TEST-DB] Database error:', err && err.message);
    console.error('[AI-GRADER][TEST-DB] Full error:', err);
    res.status(500).json({ error: 'Database error', message: err && err.message, code: err && err.code, detail: err && err.detail, stack: err && err.stack });
  }
});

// TEST ENDPOINT - Verify table exists (NO AUTH REQUIRED)
router.get('/test-schema', async (req, res) => {
  try {
    console.log('[AI-GRADER][TEST-SCHEMA] Checking table schema');
    const columns = await db.sql`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'ai_grades'
    `;
    console.log('[AI-GRADER][TEST-SCHEMA] Columns:', columns);
    res.json({ success: true, columns });
  } catch (err) {
    console.error('[AI-GRADER][TEST-SCHEMA] Error:', err && err.message);
    res.status(500).json({ error: 'Schema check failed', details: err && err.message });
  }
});

// SIMPLE TEST - Count rows in ai_grades (NO AUTH)
router.get('/test-count', async (req, res) => {
  try {
    console.log('[AI-GRADER][TEST-COUNT] Counting rows in ai_grades');
    const result = await db.sql`SELECT COUNT(*) as count FROM ai_grades`;
    console.log('[AI-GRADER][TEST-COUNT] Row count result:', result);
    const count = result && result.length > 0 ? result[0].count : 0;
    res.json({ success: true, rowCount: count, rawResult: result });
  } catch (err) {
    console.error('[AI-GRADER][TEST-COUNT] Error:', err && err.message);
    res.status(500).json({ error: 'Count failed', details: err && err.message, stack: err && err.stack });
  }
});

// SIMPLE TEST - Get all grades (NO AUTH)
router.get('/test-all', async (req, res) => {
  try {
    console.log('[AI-GRADER][TEST-ALL] Fetching all grades from ai_grades');
    const result = await db.sql`SELECT * FROM ai_grades LIMIT 100`;
    console.log('[AI-GRADER][TEST-ALL] Found', (result && result.length) || 0, 'rows');
    res.json({ success: true, count: (result && result.length) || 0, grades: result || [] });
  } catch (err) {
    console.error('[AI-GRADER][TEST-ALL] Error:', err && err.message);
    res.status(500).json({ error: 'Fetch failed', details: err && err.message, stack: err && err.stack });
  }
});

// Helper functions for grading
function calculateAccuracy(student, teacher, baseSimilarity) {
  const studentWords = new Set((student || '').toLowerCase().match(/\b\w{3,}\b/g) || []);
  const teacherWords = new Set((teacher || '').toLowerCase().match(/\b\w{3,}\b/g) || []);
  if (teacherWords.size === 0) return 100;
  const common = [...teacherWords].filter(w => studentWords.has(w)).length;
  const coverage = common / teacherWords.size;
  const accuracy = (coverage * 0.5 + baseSimilarity * 0.5) * 100;
  return Math.round(Math.min(accuracy, 100));
}

function calculateCompleteness(student, teacher) {
  const studentLen = (student || '').split(/\s+/).length;
  const teacherLen = (teacher || '').split(/\s+/).length;
  if (teacherLen === 0) return 100;
  const lengthRatio = Math.min(studentLen / teacherLen, 1);
  const teacherKeys = (teacher || '').toLowerCase().match(/\b\w{5,}\b/g) || [];
  const studentText = (student || '').toLowerCase();
  const keysCovered = teacherKeys.filter(k => studentText.includes(k)).length;
  const keyCoverage = teacherKeys.length > 0 ? keysCovered / teacherKeys.length : 1;
  const completeness = (lengthRatio * 0.4 + keyCoverage * 0.6) * 100;
  return Math.round(Math.min(completeness, 100));
}

function calculateClarity(student) {
  const text = student || '';
  const sentences = text.match(/[.!?]/g) || [];
  const words = text.match(/\b\w+\b/g) || [];
  if (sentences.length === 0 || words.length === 0) return 60;
  const avgWordsPerSentence = words.length / sentences.length;
  let clarity = 100;
  if (avgWordsPerSentence < 5 || avgWordsPerSentence > 25) clarity = 75;
  else if (avgWordsPerSentence < 8 || avgWordsPerSentence > 20) clarity = 85;
  if (text.includes('\n') || text.includes('-') || text.includes(':')) clarity = Math.min(clarity + 5, 100);
  return clarity;
}

function calculateObjectivity(student) {
  const text = (student || '').toLowerCase();
  const subjectiveIndicators = ['i think', 'i believe', 'i feel', 'my opinion', 'in my view', 'seems to me', 'in my experience', 'very', 'extremely', 'definitely', 'certainly'];
  const subjectiveCount = subjectiveIndicators.filter(indicator => text.includes(indicator)).length;
  const objectivity = Math.max(100 - (subjectiveCount * 10), 40);
  return objectivity;
}

function generateFeedback(score, studentLen, teacherLen) {
  let feedback = '';
  if (score >= 90) feedback = 'Excellent! Your findings are nearly identical to the expected answer. Outstanding work!';
  else if (score >= 80) feedback = 'Very good! Your findings closely match the expected answer with only minor differences.';
  else if (score >= 70) feedback = 'Good work! Your findings cover the main points. Consider adding more detail to match the expected answer more closely.';
  else if (score >= 60) feedback = 'Fair effort. Your findings have the right idea but are missing some important details. Compare with the expected answer and revise.';
  else if (score >= 50) feedback = 'Needs improvement. Your findings are significantly different from the expected answer. Review the correct answer and try again.';
  else feedback = 'Please review the expected answer carefully and resubmit with more accurate findings.';
  if (studentLen < teacherLen * 0.5) feedback += ' Your response is quite short - consider adding more detail.';
  else if (studentLen > teacherLen * 2) feedback += ' Your response is very long - try to be more concise.';
  return feedback.trim();
}

// POST /api/ai-grader/submit
// Submit findings for instant grading using local string similarity
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    console.log('[AI-GRADER][SUBMIT] ========== REQUEST RECEIVED ==========');
    const { studentId, examId, studentFindings, teacherFindings: reqTeacherFindings } = req.body;
    
    console.log('[AI-GRADER][SUBMIT] studentId:', studentId, 'examId:', examId);
    console.log('[AI-GRADER][SUBMIT] studentFindings type:', typeof studentFindings, 'length:', String(studentFindings || '').length);
    
    if (!studentId || !examId || !studentFindings) {
      console.error('[AI-GRADER][SUBMIT] Validation failed - missing required fields');
      return res.status(400).json({ error: 'studentId, examId, and studentFindings required' });
    }

    // Parse studentFindings - it might be JSON with {explanation, answer, etc.}
    let parsedStudentFindings = studentFindings;
    try {
      const maybe = typeof studentFindings === 'string' ? JSON.parse(studentFindings) : studentFindings;
      if (maybe && typeof maybe === 'object') {
        // Extract explanation field if it exists, otherwise use the whole object as string
        if (maybe.explanation && typeof maybe.explanation === 'string') {
          parsedStudentFindings = maybe.explanation;
        } else if (maybe.answer && typeof maybe.answer === 'string') {
          parsedStudentFindings = maybe.answer;
        } else {
          parsedStudentFindings = JSON.stringify(maybe);
        }
      }
    } catch (e) {
      // If it's not JSON, use as-is
      parsedStudentFindings = String(studentFindings);
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

    // Normalize and compare
    const teacher = String(teacherFindings || '').trim();
    const student = String(parsedStudentFindings || '').trim();
    
    let result = null;
    
    if (!student) {
      result = {
        score: 0,
        accuracy: 0,
        completeness: 0,
        clarity: 0,
        objectivity: 0,
        feedback: 'No findings submitted. Please provide your analysis.',
        raw_response: 'EMPTY'
      };
    } else {
      const normalize = (text) => text.toLowerCase().trim().replace(/\s+/g, ' ');
      const teacherNorm = normalize(teacher);
      const studentNorm = normalize(student);

      if (teacherNorm === studentNorm) {
        result = {
          score: 100,
          accuracy: 100,
          completeness: 100,
          clarity: 100,
          objectivity: 100,
          feedback: 'Perfect! Your findings exactly match the teacher\'s answer. Excellent work!',
          raw_response: 'EXACT_MATCH'
        };
      } else {
        const similarity = stringSimilarity.compareTwoStrings(teacherNorm, studentNorm);
        const accuracy = calculateAccuracy(student, teacher, similarity);
        const completeness = calculateCompleteness(student, teacher);
        const clarity = calculateClarity(student);
        const objectivity = calculateObjectivity(student);
        const overall = Math.round((accuracy * 0.35 + completeness * 0.35 + clarity * 0.20 + objectivity * 0.10));
        const feedback = generateFeedback(overall, student.length, teacher.length);
        
        result = {
          score: overall,
          accuracy,
          completeness,
          clarity,
          objectivity,
          feedback,
          raw_response: `SIMILARITY: ${(similarity * 100).toFixed(1)}%`
        };
      }
    }

    // SAVE TO DATABASE DIRECTLY
    console.log('[AI-GRADER][SUBMIT] Saving to database:', { sid: studentId, eid: examId, score: result.score });
    try {
      // First, try to delete any existing grade for this student/exam
      await db.sql`DELETE FROM ai_grades WHERE student_id = ${Number(studentId)} AND exam_id = ${Number(examId)}`;
      
      // Then insert the new grade - match actual table columns
      await db.sql`
        INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response)
        VALUES (${Number(studentId)}, ${Number(examId)}, ${result.score}, ${result.accuracy}, ${result.completeness}, ${result.clarity}, ${result.objectivity}, ${result.feedback}, ${result.raw_response})
      `;
      console.log('[AI-GRADER][SUBMIT] Grade saved successfully to database');
    } catch (dbErr) {
      console.error('[AI-GRADER][SUBMIT] DB SAVE ERROR:', dbErr && dbErr.message);
      console.error('[AI-GRADER][SUBMIT] Stack:', dbErr && dbErr.stack);
      throw dbErr;
    }

    // Return result
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
    console.error('[AI-GRADER][SUBMIT] FATAL ERROR:', err && err.message);
    console.error('[AI-GRADER][SUBMIT] Stack:', err && err.stack);
    res.status(500).json({ error: 'Failed to grade findings', details: err && err.message ? err.message : 'Unknown error' });
  }
});

// GET /api/ai-grader/result/:studentId/:examId - returns latest ai grade for student and exam
router.get('/result/:studentId/:examId', authenticateToken, async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    console.log('[AI-GRADER][GET-RESULT] Fetching grade for student:', studentId, 'exam:', examId);
    
    const row = await db.sql`SELECT * FROM ai_grades WHERE student_id = ${Number(studentId)} AND exam_id = ${Number(examId)} ORDER BY id DESC LIMIT 1`;
    const result = Array.isArray(row) ? row[0] : row;
    
    if (!result) {
      console.log('[AI-GRADER][GET-RESULT] No grade found for student', studentId, 'exam', examId);
      return res.status(404).json({ error: 'No AI grade found' });
    }
    
    console.log('[AI-GRADER][GET-RESULT] Found grade:', result);
    res.json(result);
  } catch (err) {
    console.error('[AI-GRADER][GET-RESULT] Database error:', err && err.message ? err.message : err);
    console.error('[AI-GRADER][GET-RESULT] Stack:', err && err.stack);
    res.status(500).json({ error: 'Failed to fetch AI grade', details: err && err.message });
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
