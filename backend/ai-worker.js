const db = require('./db');
const grader = require('./geminiGrader');

// DB-backed worker with intelligent concurrency and rate limiting.
// 
// Architecture:
// - MAX_CONCURRENCY: 6 parallel workers (one per API key)
// - Rate limiting: 8 RPM per key = 48 total RPM (safely under 60 RPM limit)
// - Min delay: 7.5 seconds between requests to each key (60 / 8 = 7.5)
// - Uses DB queue (ai_queue table) to persist job state across restarts
// - Implements retry logic with exponential backoff

const POLL_INTERVAL_MS = Number(process.env.AI_WORKER_POLL_MS || 2000);
const MAX_CONCURRENCY = Number(process.env.AI_WORKER_CONCURRENCY || 6); // 6 = one per API key
const MAX_RETRIES = Number(process.env.AI_WORKER_MAX_RETRIES || 3);
const MIN_REQUEST_INTERVAL_MS = 7500; // 7.5 seconds = 8 requests per 60 seconds (safe margin)

let active = 0;
let stopped = false;
let lastRequestTime = 0; // Track last request time for global rate limiting

async function pickJob() {
  // Pick a single pending job that is eligible for processing.
  // Eligibility: status = 'pending' AND (attempts = 0 OR enough time has passed since updated_at)
  // Backoff uses attempts * 60 seconds (linear backoff). This avoids immediate tight retries.
  const rows = await db.sql`
    SELECT * FROM ai_queue
    WHERE status = 'pending'
      AND (
        attempts = 0
        OR (strftime('%s','now') - strftime('%s', updated_at)) > attempts * 60
      )
    ORDER BY id ASC
    LIMIT 1
  `;
  const job = Array.isArray(rows) ? rows[0] : rows;
  return job || null;
}

async function processJob(job) {
  if (!job) return;
  const jobId = job.id;
  try {
    // Rate limiting: ensure min 7.5 seconds between any requests (8 RPM per key)
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      const waitMs = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
      console.log(`[AI-WORKER] Rate limiting: waiting ${Math.ceil(waitMs)}ms before next request`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    lastRequestTime = Date.now();

    await db.sql`UPDATE ai_queue SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`;

    // Refresh job row to get any recent changes and current findings fields
    const freshRows = await db.sql`SELECT * FROM ai_queue WHERE id = ${jobId} LIMIT 1`;
    const fresh = Array.isArray(freshRows) ? freshRows[0] : freshRows || {};

    // Ensure we have teacher_findings and student_findings; if missing, try to populate from results/exam/question
    let teacherFindings = fresh.teacher_findings || job.teacher_findings || '';
    let studentFindings = fresh.student_findings || job.student_findings || '';

    // If student findings missing, try to load from results table (explanation or answer.explanation)
    if (!studentFindings || !String(studentFindings).trim()) {
      try {
        const r = await db.sql`SELECT * FROM results WHERE student_id = ${Number(job.student_id)} AND exam_id = ${Number(job.exam_id)} ORDER BY id DESC LIMIT 1`;
        const resRow = Array.isArray(r) ? r[0] : r;
        if (resRow) {
          if (resRow.explanation && String(resRow.explanation).trim()) {
            studentFindings = String(resRow.explanation);
          } else if (resRow.answer && String(resRow.answer).trim()) {
            try {
              const maybe = typeof resRow.answer === 'string' ? JSON.parse(resRow.answer) : resRow.answer;
              if (maybe) {
                if (maybe.explanation && typeof maybe.explanation === 'string') studentFindings = String(maybe.explanation);
                else if (maybe.explanation && maybe.explanation.text) studentFindings = String(maybe.explanation.text);
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      } catch (e) {
        console.error('[AI-WORKER] Failed to load results for job', jobId, e && e.message ? e.message : e);
      }
    }

    // If teacher findings missing, try to load from exams/questions (same logic as submit)
    if (!teacherFindings || !String(teacherFindings).trim()) {
      try {
        const examRow = await db.sql`SELECT * FROM exams WHERE id = ${Number(job.exam_id)} LIMIT 1`;
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
        console.error('[AI-WORKER] Failed to load question/exam data for job', jobId, e && e.message ? e.message : e);
      }
    }

    // Persist any findings we filled so retries or UI queries see them
    try {
      await db.sql`UPDATE ai_queue SET teacher_findings = ${String(teacherFindings)}, student_findings = ${String(studentFindings)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`;
    } catch (e) {
      console.error('[AI-WORKER] Failed to save filled findings for job', jobId, e && e.message ? e.message : e);
    }

    // Call grader. grader.gradeStudent should write results to ai_grades table.
    await grader.gradeStudent(Number(job.student_id), Number(job.exam_id), teacherFindings || '', studentFindings || '');

    await db.sql`UPDATE ai_queue SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`;
    console.log('[AI-WORKER] Job', jobId, 'done');
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error('[AI-WORKER] Job', jobId, 'failed:', msg);

    // If we've reached max retries, mark as error. Otherwise leave as pending so it will be retried after backoff.
    const attemptsRow = await db.sql`SELECT attempts FROM ai_queue WHERE id = ${jobId} LIMIT 1`;
    const attempts = attemptsRow && attemptsRow[0] ? Number(attemptsRow[0].attempts || 0) : job.attempts || 0;

    if (attempts >= MAX_RETRIES) {
      await db.sql`UPDATE ai_queue SET status = 'error', last_error = ${msg}, updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`;
      console.error('[AI-WORKER] Job', jobId, 'marked error after', attempts, 'attempts');
    } else {
      // Set back to pending; attempts already incremented. Save last_error so it's visible.
      await db.sql`UPDATE ai_queue SET status = 'pending', last_error = ${msg}, updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`;
      console.log('[AI-WORKER] Job', jobId, 'will be retried (attempt', attempts, ')');
    }
  }
}

async function runOnce(limit = 1) {
  let processed = 0;
  while (processed < limit && active < MAX_CONCURRENCY) {
    const job = await pickJob();
    if (!job) break;
    // Process job but don't block the loop if concurrency allows more
    active++;
    processed++;
    console.log(`[AI-WORKER] Started job ${job.id} (${active}/${MAX_CONCURRENCY} active, rate: 8 RPM per key = 48 total)`);
    processJob(job)
      .catch((e) => console.error('[AI-WORKER] processJob error:', e && e.message ? e.message : e))
      .finally(() => {
        active = Math.max(0, active - 1);
      });
  }
  if (processed > 0) {
    console.log(`[AI-WORKER] Picked up ${processed} job(s), now ${active} active`);
  }
  return processed;
}

function start() {
  if (stopped) stopped = false;
  console.log(`[AI-WORKER] Starting worker:`);
  console.log(`  - Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`  - Max concurrency: ${MAX_CONCURRENCY} (one per API key)`);
  console.log(`  - Rate limit: 8 RPM per key = ${MAX_CONCURRENCY * 8} total RPM`);
  console.log(`  - Min delay between requests: ${MIN_REQUEST_INTERVAL_MS}ms`);
  console.log(`  - Max retries: ${MAX_RETRIES}`);
  const tick = async () => {
    if (stopped) return;
    try {
      if (active < MAX_CONCURRENCY) {
        await runOnce(1);
      }
    } catch (e) {
      console.error('[AI-WORKER] Tick error:', e && e.message ? e.message : e);
    } finally {
      setTimeout(tick, POLL_INTERVAL_MS);
    }
  };
  // Kick off
  setTimeout(tick, POLL_INTERVAL_MS);
}

function stop() {
  stopped = true;
}

module.exports = { start, stop, runOnce };
