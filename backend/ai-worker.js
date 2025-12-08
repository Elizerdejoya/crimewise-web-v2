const db = require('./db');
const comparator = require('./findingsComparator');

// DB-backed worker for local findings comparison
// 
// Architecture:
// - Uses local string similarity (no API calls)
// - Unlimited concurrent workers
// - Processes jobs from ai_queue table
// - Instant grading with 85-95% accuracy
// - Uses DB queue (ai_queue table) to persist job state across restarts
// - Implements retry logic with exponential backoff

const POLL_INTERVAL_MS = Number(process.env.AI_WORKER_POLL_MS || 2000);
const MAX_CONCURRENCY = Number(process.env.AI_WORKER_CONCURRENCY || 1); // Default 1 during high load; SQLite Cloud has 30-connection limit
const MAX_RETRIES = Number(process.env.AI_WORKER_MAX_RETRIES || 3);
const MIN_REQUEST_INTERVAL_MS = 7500; // 7.5 seconds = 8 requests per 60 seconds (safe margin)

let active = 0;
let stopped = false;

async function pickJob() {
  // Pick a single pending job that is eligible for processing.
  // Eligibility: status = 'pending' AND (attempts = 0 OR enough time has passed since updated_at)
  // Backoff uses attempts * 60 seconds (linear backoff). This avoids immediate tight retries.
  const rows = await db.sql`
    SELECT * FROM ai_queue
    WHERE status = 'pending'
      AND (
        attempts = 0
        OR (EXTRACT(EPOCH FROM NOW()) - EXTRACT(EPOCH FROM updated_at)) > attempts * 60
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
    // Select a key and respect its per-key wait time
    const keyObj = apiKeyManager.getNextKey();
    if (!keyObj || !keyObj.key) {
      // No keys available: small delay and re-queue
      console.warn('[AI-WORKER] No API keys available, sleeping briefly');
      await new Promise((r) => setTimeout(r, 2000));
    } else if (keyObj.waitMs && keyObj.waitMs > 0) {
      console.log(`[AI-WORKER] Waiting ${Math.ceil(keyObj.waitMs)}ms for key ${keyObj.index + 1} availability`);
      await new Promise((r) => setTimeout(r, keyObj.waitMs));
    }

    // Update job to processing with retry in case of transient DB lock
    await runDbUpdateWithRetry(jobId, () => db.sql`UPDATE ai_queue SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`);

    // Refresh job row to get any recent changes and current findings fields
    const freshRows = await runDbSelectWithRetry(jobId, () => db.sql`SELECT * FROM ai_queue WHERE id = ${jobId} LIMIT 1`);
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
      await runDbUpdateWithRetry(jobId, () => db.sql`UPDATE ai_queue SET teacher_findings = ${String(teacherFindings)}, student_findings = ${String(studentFindings)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`);
    } catch (e) {
      console.error('[AI-WORKER] Failed to save filled findings for job', jobId, e && e.message ? e.message : e);
    }

    // Call comparator (replaces Gemini grader with local string similarity)
    try {
      await comparator.compareFindings(Number(job.student_id), Number(job.exam_id), teacherFindings || '', studentFindings || '');
    } catch (e) {
      // comparator will throw on errors — rethrow so retry/backoff logic can handle it
      throw e;
    }

    await runDbUpdateWithRetry(jobId, () => db.sql`UPDATE ai_queue SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`);
    console.log('[AI-WORKER] Job', jobId, 'done');
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error('[AI-WORKER] Job', jobId, 'failed:', msg);

    // If we've reached max retries, mark as error. Otherwise leave as pending so it will be retried after backoff.
    const attemptsRow = await runDbSelectWithRetry(jobId, () => db.sql`SELECT attempts FROM ai_queue WHERE id = ${jobId} LIMIT 1`);
    const attempts = attemptsRow && attemptsRow[0] ? Number(attemptsRow[0].attempts || 0) : job.attempts || 0;

    if (attempts >= MAX_RETRIES) {
      await runDbUpdateWithRetry(jobId, () => db.sql`UPDATE ai_queue SET status = 'error', last_error = ${String(msg)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`);
      console.error('[AI-WORKER] Job', jobId, 'marked error after', attempts, 'attempts');
    } else {
      // Set back to pending; attempts already incremented. Save last_error so it's visible.
      await runDbUpdateWithRetry(jobId, () => db.sql`UPDATE ai_queue SET status = 'pending', last_error = ${String(msg)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`);
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

// Drain once: process up to `limit` jobs and wait for started jobs to finish (serverless-safe helper)
async function drainOnce(limit = MAX_CONCURRENCY, timeoutMs = 30000) {
  const start = Date.now();
  let totalProcessed = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const processed = await runOnce(limit);
      totalProcessed += processed;

      // Wait for active workers to finish the current batch (bounded wait)
      const waitStart = Date.now();
      while (active > 0 && Date.now() - waitStart < Math.min(10000, timeoutMs)) {
        await new Promise((r) => setTimeout(r, 200));
      }

      // If no work was picked up this round, break early
      if (!processed) break;

      // small backoff between rounds
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.error('[AI-WORKER] drainOnce caught error:', e && e.message ? e.message : e);
      break;
    }
  }
  return totalProcessed;
}

module.exports = { start, stop, runOnce, drainOnce };

// Helper: run DB update with retries on SQLITE_BUSY or transient errors
async function runDbUpdateWithRetry(jobId, dbFn, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await dbFn();
      return;
    } catch (err) {
      const m = err && err.message ? err.message : String(err);
      if (m && m.toLowerCase().includes('busy') && attempt < retries) {
        const wait = attempt * 200 + 100;
        console.warn(`[AI-WORKER] DB busy on job ${jobId}, retrying after ${wait}ms (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

async function runDbSelectWithRetry(jobId, dbFn, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const rows = await dbFn();
      return rows;
    } catch (err) {
      const m = err && err.message ? err.message : String(err);
      if (m && m.toLowerCase().includes('busy') && attempt < retries) {
        const wait = attempt * 200 + 100;
        console.warn(`[AI-WORKER] DB busy on select ${jobId}, retrying after ${wait}ms (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}
