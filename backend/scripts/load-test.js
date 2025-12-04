#!/usr/bin/env node

/**
 * Load Test: Simulate 250–300 concurrent AI grading submissions
 * 
 * Purpose: Verify that the system can handle large concurrent batches without:
 * - Hitting per-key RPM limits (8 RPM per key, 48 total)
 * - Incurring excessive DB contention (SQLITE_BUSY)
 * - Losing jobs or corrupting data
 * - Triggering unhandled 429 responses
 * 
 * Usage:
 *   node scripts/load-test.js [--students N] [--url URL]
 * 
 * Examples:
 *   node scripts/load-test.js                    # 250 students, http://localhost:5000
 *   node scripts/load-test.js --students 300     # 300 students
 *   node scripts/load-test.js --url http://localhost:5001  # custom URL
 */

// Use native fetch (Node 18+)
const http = require('http');
const https = require('https');

// Parse CLI args
const args = process.argv.slice(2);
let NUM_STUDENTS = 250;
let BASE_URL = 'http://localhost:5000';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--students' && i + 1 < args.length) {
    NUM_STUDENTS = parseInt(args[i + 1], 10);
  }
  if (args[i] === '--url' && i + 1 < args.length) {
    BASE_URL = args[i + 1];
  }
}

const API_ENDPOINT = `${BASE_URL}/api/ai-grader/submit`;
const MONITOR_KEYS = `${BASE_URL}/api/monitor/api-keys`;
const MONITOR_WORKER = `${BASE_URL}/api/monitor/ai-worker`;

// Test data: realistic forensic exam findings
const TEACHER_FINDINGS = `The handwriting exhibits a rightward slant of approximately 45 degrees with moderate pressure throughout. The baseline is consistently straight, indicating good emotional stability. Loop formations are open and well-proportioned, suggesting creativity and openness. Margins are appropriately maintained on all sides. The spacing between words is regular, approximately one character width. No significant variations in letter size or formation. The signature is consistent with the body text, indicating authenticity.`;

const STUDENT_FINDINGS_GOOD = `The handwriting shows a rightward slant of about 45 degrees with moderate pressure. The baseline remains straight, and the loops are open and balanced. Margins are well-maintained. Spacing between words is regular and one character width. Letter size is consistent throughout. The signature matches the main text, appearing authentic.`;

const STUDENT_FINDINGS_POOR = `The writing has some slant and pressure. There are some loops. Margins exist.`;

const STUDENT_FINDINGS_EXACT = TEACHER_FINDINGS;

/**
 * Generate realistic test data for one submission
 */
function generateTestData(studentId) {
  const variants = [
    STUDENT_FINDINGS_GOOD,     // ~70% will be good submissions
    STUDENT_FINDINGS_POOR,     // ~20% will be poor submissions
    STUDENT_FINDINGS_EXACT,    // ~10% will be exact matches (should score 100)
  ];
  
  const choice = Math.random();
  let studentFindings;
  if (choice < 0.7) {
    studentFindings = STUDENT_FINDINGS_GOOD;
  } else if (choice < 0.9) {
    studentFindings = STUDENT_FINDINGS_POOR;
  } else {
    studentFindings = STUDENT_FINDINGS_EXACT;
  }
  
  return {
    studentId: studentId + 1,  // Start from 1
    examId: 1,                  // All use same exam for consistency
    teacherFindings: TEACHER_FINDINGS,
    studentFindings: studentFindings
  };
}

/**
 * Submit a single grading job using native Node.js HTTP
 */
async function submitGradingJob(studentId, submitTimes, errors) {
  const testData = generateTestData(studentId);
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const payload = JSON.stringify(testData);
    const url = new URL(API_ENDPOINT);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    };
    
    const req = protocol.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          submitTimes.push(elapsed);
          resolve({ success: true, studentId, elapsed });
        } else {
          errors.push({ studentId, status: res.statusCode, message: body || 'Unknown error', elapsed });
          resolve({ success: false, studentId, status: res.statusCode, message: body || 'Unknown error', elapsed });
        }
      });
    });
    
    req.on('error', (err) => {
      const elapsed = Date.now() - startTime;
      errors.push({ studentId, status: 'NETWORK', message: err.message, elapsed });
      resolve({ success: false, studentId, status: 'NETWORK', message: err.message, elapsed });
    });
    
    req.on('timeout', () => {
      const elapsed = Date.now() - startTime;
      req.destroy();
      errors.push({ studentId, status: 'TIMEOUT', message: 'Request timeout', elapsed });
      resolve({ success: false, studentId, status: 'TIMEOUT', message: 'Request timeout', elapsed });
    });
    
    req.write(payload);
    req.end();
  });
}

/**
 * Poll the monitoring endpoints to check worker status using native HTTP
 */
async function checkWorkerStatus() {
  const requests = [
    { url: MONITOR_KEYS, name: 'apiKeys' },
    { url: MONITOR_WORKER, name: 'worker' }
  ];
  
  const results = {};
  
  for (const req of requests) {
    await new Promise((resolve) => {
      const url = new URL(req.url);
      const protocol = url.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 5000
      };
      
      const httpReq = protocol.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              results[req.name] = JSON.parse(body)[req.name];
            }
          } catch (e) {}
          resolve();
        });
      });
      
      httpReq.on('error', () => resolve());
      httpReq.on('timeout', () => {
        httpReq.destroy();
        resolve();
      });
      
      httpReq.end();
    });
  }
  
  return Object.keys(results).length > 0 ? results : null;
}

/**
 * Main test runner
 */
async function runLoadTest() {
  console.log('🚀 Load Test: AI Grading System');
  console.log(`📊 Configuration:`);
  console.log(`   - Students: ${NUM_STUDENTS}`);
  console.log(`   - URL: ${BASE_URL}`);
  console.log(`   - Endpoint: ${API_ENDPOINT}`);
  console.log('');
  
  // Check health
  try {
    await new Promise((resolve, reject) => {
      const url = new URL(`${BASE_URL}/health`);
      const protocol = url.protocol === 'https:' ? https : http;
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        timeout: 5000
      };
      
      const req = protocol.request(options, (res) => {
        res.statusCode === 200 ? resolve() : reject(new Error(`Health check returned ${res.statusCode}`));
        res.on('data', () => {});
      });
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Health check timeout')));
      req.end();
    });
    console.log('✅ Backend is healthy');
  } catch (err) {
    console.error('❌ Backend is not reachable. Is it running?');
    console.error('   Error:', err.message);
    process.exit(1);
  }
  
  const submitTimes = [];
  const errors = [];
  
  console.log(`\n📤 Submitting ${NUM_STUDENTS} grading jobs (rapid fire)...`);
  const submitStartTime = Date.now();
  
  // Submit all jobs concurrently (rapid fire)
  const submitPromises = [];
  for (let i = 0; i < NUM_STUDENTS; i++) {
    submitPromises.push(submitGradingJob(i, submitTimes, errors));
  }
  
  const submitResults = await Promise.all(submitPromises);
  const submitElapsedMs = Date.now() - submitStartTime;
  
  // Calculate submit stats
  const successfulSubmits = submitResults.filter(r => r.success).length;
  const failedSubmits = submitResults.filter(r => !r.success).length;
  const avgSubmitTime = submitTimes.length > 0
    ? (submitTimes.reduce((a, b) => a + b, 0) / submitTimes.length).toFixed(2)
    : 'N/A';
  
  console.log(`✅ Submitted ${successfulSubmits}/${NUM_STUDENTS} jobs in ${submitElapsedMs}ms`);
  console.log(`   - Avg submit latency: ${avgSubmitTime}ms`);
  
  if (failedSubmits > 0) {
    console.log(`⚠️  Failed submissions: ${failedSubmits}`);
    const failuresBySatus = {};
    errors.forEach(e => {
      const key = `${e.status}`;
      failuresBySatus[key] = (failuresBySatus[key] || 0) + 1;
    });
    Object.entries(failuresBySatus).forEach(([status, count]) => {
      console.log(`   - ${status}: ${count}`);
    });
  }
  
  console.log(`\n⏳ Waiting for worker to process queue (will check status every 5s)...`);
  
  // Poll worker status while queue is processing
  let pollCount = 0;
  const maxPolls = 60;  // 5 minutes max
  const pollInterval = 5000;  // 5 seconds
  
  while (pollCount < maxPolls) {
    await new Promise(r => setTimeout(r, pollInterval));
    pollCount++;
    
    const status = await checkWorkerStatus();
    if (!status) {
      console.log(`[${pollCount}] ⚠️  Could not fetch status`);
      continue;
    }
    
    const { worker } = status;
    const total = worker.pending + worker.processing + worker.done + worker.error;
    const remaining = worker.pending + worker.processing;
    const eta = worker.processing > 0 || worker.pending > 0
      ? ` (ETA: ${Math.ceil(remaining / 6 * 7.5 / 60)}m)`
      : '';
    
    console.log(`[${pollCount}] pending=${worker.pending} processing=${worker.processing} done=${worker.done} error=${worker.error} total=${total}${eta}`);
    
    // Stop if queue is done
    if (worker.pending === 0 && worker.processing === 0) {
      console.log('✅ Queue processing complete!');
      break;
    }
  }
  
  // Final status check
  const finalStatus = await checkWorkerStatus();
  if (finalStatus) {
    const { worker, apiKeys } = finalStatus;
    
    console.log(`\n📊 Final Results:`);
    console.log(`   - Done: ${worker.done}/${NUM_STUDENTS}`);
    console.log(`   - Errors: ${worker.error}`);
    console.log(`   - Pending: ${worker.pending}`);
    console.log(`   - Processing: ${worker.processing}`);
    
    const successRate = NUM_STUDENTS > 0 ? ((worker.done / NUM_STUDENTS) * 100).toFixed(1) : 0;
    console.log(`   - Success rate: ${successRate}%`);
    
    if (apiKeys) {
      console.log(`\n🔑 API Key Status:`);
      apiKeys.forEach((key, idx) => {
        console.log(`   - Key ${idx + 1}: requests=${key.requestCount} penalties=${key.penaltyCount} backoffSecs=${key.backoffSeconds}`);
      });
    }
  }
  
  console.log(`\n${failedSubmits > 0 || (finalStatus && finalStatus.worker.error > 0) ? '⚠️' : '✅'} Load test complete!`);
  
  if (failedSubmits > 0) {
    console.log(`\nFailed submissions:`);
    errors.slice(0, 5).forEach(e => {
      console.log(`  - Student ${e.studentId}: ${e.status} - ${e.message}`);
    });
    if (errors.length > 5) {
      console.log(`  ... and ${errors.length - 5} more`);
    }
  }
}

// Run the test
runLoadTest().catch(err => {
  console.error('❌ Test error:', err.message);
  process.exit(1);
});
