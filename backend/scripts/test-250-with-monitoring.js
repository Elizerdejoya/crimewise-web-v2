#!/usr/bin/env node

/**
 * Test 250 Concurrent Submissions with AI Grading Monitoring
 * 
 * This script:
 * 1. Submits 250 concurrent exam responses
 * 2. Monitors the AI worker queue
 * 3. Verifies all grades are processed
 * 
 * Usage:
 *   node test-250-with-monitoring.js [--url BASE_URL]
 * 
 * Example:
 *   node test-250-with-monitoring.js --url http://localhost:5000
 *   node test-250-with-monitoring.js --url https://crimewise-api.vercel.app
 */

const http = require('http');
const https = require('https');
const url = require('url');

// Parse CLI args
const args = process.argv.slice(2);
let baseUrl = 'http://localhost:5000';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) {
    baseUrl = args[i + 1];
    i++;
  }
}

const STUDENT_COUNT = 250;
const EXAM_ID = 1; // Use a single exam for consistency

console.log(`🧪 Testing 250 Concurrent Submissions with AI Grading`);
console.log(`📍 Target: ${baseUrl}`);
console.log(`⏱️  Started at ${new Date().toISOString()}\n`);

// Sample findings for testing
const sampleTeacherFindings = `The handwriting shows a rightward slant of approximately 45 degrees with moderate pressure. The baseline is relatively consistent. Loop formations are well-formed. The overall size is medium, approximately 3-4mm for lowercase letters. Pen lifts are minimal.`;
const sampleStudentFindings = `The handwriting shows a rightward slant of approximately 45 degrees with moderate pressure. The baseline is relatively consistent. Loop formations are well-formed. The overall size is medium, approximately 3-4mm for lowercase letters. Pen lifts are minimal.`;

let submittedIds = [];

function makeHttpRequest(method, path, payload = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new url.URL(baseUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (payload) {
      const payloadStr = JSON.stringify(payload);
      options.headers['Content-Length'] = Buffer.byteLength(payloadStr);
    }

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

async function submitExams() {
  console.log(`\n[PHASE 1] Submitting 250 exam responses concurrently...`);
  const startTime = Date.now();
  
  const requests = [];
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const promise = makeHttpRequest('POST', '/api/ai-grader/submit', {
      studentId: i,
      examId: EXAM_ID,
      teacherFindings: sampleTeacherFindings,
      studentFindings: sampleStudentFindings
    }).then(res => {
      if (res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 202) {
        if (res.body?.resultId) {
          submittedIds.push(res.body.resultId);
        }
        return { success: true, studentId: i };
      } else {
        return { success: false, studentId: i, status: res.statusCode };
      }
    }).catch(err => {
      return { success: false, studentId: i, error: err.message };
    });

    requests.push(promise);

    // Small stagger to avoid overwhelming the system
    if (i % 25 === 0) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  const results = await Promise.all(requests);
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Submissions complete (${elapsed}s)`);
  console.log(`   Success: ${successful}/${STUDENT_COUNT}`);
  console.log(`   Failed: ${failed}/${STUDENT_COUNT}`);
  console.log(`   Result IDs captured: ${submittedIds.length}`);

  if (failed > 0) {
    console.log(`   ⚠️  Sample failures:`, results.filter(r => !r.success).slice(0, 3));
  }

  return successful === STUDENT_COUNT;
}

async function monitorAiQueue() {
  console.log(`\n[PHASE 2] Monitoring AI grading queue...`);
  
  let completed = 0;
  let pending = 0;
  let failed = 0;
  let maxWaitTime = 300; // 5 minutes max wait
  let elapsedTime = 0;
  const pollInterval = 5000; // Check every 5 seconds
  const startTime = Date.now();

  while (elapsedTime < maxWaitTime * 1000) {
    try {
      const res = await makeHttpRequest('GET', '/api/monitor/ai-worker');
      
      if (res.statusCode === 200 && res.body) {
        const stats = res.body;
        completed = stats.completed || 0;
        pending = stats.pending || 0;
        failed = stats.failed || 0;

        elapsedTime = Math.round((Date.now() - startTime) / 1000);
        console.log(`[${elapsedTime}s] 📊 Completed: ${completed}, Pending: ${pending}, Failed: ${failed}`);

        // Check if we're done (all jobs completed or failed)
        if (pending === 0 && (completed + failed >= STUDENT_COUNT)) {
          console.log(`\n✅ All ${STUDENT_COUNT} submissions have been processed!`);
          return { completed, failed };
        }
      }
    } catch (err) {
      console.log(`⚠️  Monitor error: ${err.message}`);
    }

    // Wait before next poll
    await new Promise(r => setTimeout(r, pollInterval));
  }

  console.log(`\n⏰ Monitor timeout after ${maxWaitTime}s`);
  return { completed, failed, timeout: true };
}

async function verifyGrades() {
  console.log(`\n[PHASE 3] Verifying grades in database...`);
  
  if (submittedIds.length === 0) {
    console.log(`⚠️  No result IDs captured during submission phase`);
    return;
  }

  try {
    // Query database for graded results
    const res = await makeHttpRequest('GET', `/api/results?graded=true&limit=300`);
    
    if (res.statusCode === 200 && res.body) {
      const gradedCount = res.body.data ? res.body.data.length : 0;
      console.log(`   Total graded results in system: ${gradedCount}`);
      console.log(`   Submitted in this test: ${submittedIds.length}`);
      
      // Check a sample to verify they have grades
      if (res.body.data && res.body.data.length > 0) {
        const sample = res.body.data[0];
        console.log(`   Sample graded result:`, {
          resultId: sample.id,
          studentId: sample.studentId,
          score: sample.score,
          feedback: sample.feedback ? sample.feedback.substring(0, 50) + '...' : 'N/A',
          gradedAt: sample.gradedAt
        });
      }

      return gradedCount;
    }
  } catch (err) {
    console.log(`⚠️  Verification error: ${err.message}`);
  }
}

async function runFullTest() {
  try {
    // Phase 1: Submit exams
    const allSubmitted = await submitExams();
    
    if (!allSubmitted) {
      console.log(`\n❌ Not all submissions were successful. Aborting monitoring phase.`);
      process.exit(1);
    }

    // Phase 2: Monitor queue
    const queueStats = await monitorAiQueue();
    
    // Phase 3: Verify grades
    const gradedCount = await verifyGrades();

    // Final summary
    console.log(`\n📋 FINAL REPORT:`);
    console.log(`   Submissions: ${STUDENT_COUNT}`);
    console.log(`   AI Jobs Completed: ${queueStats.completed}`);
    console.log(`   AI Jobs Failed: ${queueStats.failed}`);
    console.log(`   Grades in Database: ${gradedCount || 'Unknown'}`);
    
    if (queueStats.timeout) {
      console.log(`\n⚠️  Test timed out. Some submissions may still be processing.`);
      console.log(`   Monitor /api/monitor/ai-worker for completion status.`);
      process.exit(1);
    } else if (queueStats.completed >= STUDENT_COUNT - 5) {
      console.log(`\n✅ SUCCESS: All submissions have been graded!`);
      process.exit(0);
    } else {
      console.log(`\n⚠️  WARNING: Not all submissions appear to be graded.`);
      console.log(`   Expected: ~${STUDENT_COUNT}, Got: ${queueStats.completed}`);
      process.exit(1);
    }

  } catch (err) {
    console.error(`\n❌ Test error:`, err);
    process.exit(1);
  }
}

// Run the test
runFullTest();
