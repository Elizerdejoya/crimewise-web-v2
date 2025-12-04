#!/usr/bin/env node

/**
 * Minimal Load Test: Concurrent AI grading submissions
 * Uses built-in Node.js http module (no external deps)
 */

const http = require('http');

const BASE_URL = process.argv.includes('--url') 
  ? process.argv[process.argv.indexOf('--url') + 1] 
  : 'http://localhost:5000';

const NUM_STUDENTS = process.argv.includes('--students')
  ? parseInt(process.argv[process.argv.indexOf('--students') + 1], 10)
  : 250;

const API_SUBMIT = `${BASE_URL}/api/ai-grader/submit`;
const API_MONITOR_KEYS = `${BASE_URL}/api/monitor/api-keys`;
const API_MONITOR_WORKER = `${BASE_URL}/api/monitor/ai-worker`;

const TEACHER_FINDINGS = `The handwriting exhibits a rightward slant of approximately 45 degrees with moderate pressure throughout. The baseline is consistently straight, indicating good emotional stability. Loop formations are open and well-proportioned, suggesting creativity and openness.`;

const STUDENT_VARIANTS = [
  `The handwriting shows a rightward slant of about 45 degrees with moderate pressure. The baseline remains straight, and loops are open and balanced.`,
  `The writing has some slant and pressure. There are some loops.`,
  TEACHER_FINDINGS
];

function makeRequest(url, method, payload) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: method,
      timeout: 15000,
      headers: method === 'POST' 
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {}
    };
    
    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: body,
          elapsed: Date.now() - startTime,
          success: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({
        status: 0,
        body: err.message,
        elapsed: Date.now() - startTime,
        success: false,
        error: true
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 0,
        body: 'Timeout',
        elapsed: Date.now() - startTime,
        success: false,
        error: true
      });
    });
    
    if (payload) req.write(payload);
    req.end();
  });
}

async function runLoadTest() {
  console.log(`\n🚀 Load Test: ${NUM_STUDENTS} concurrent submissions`);
  console.log(`📍 URL: ${BASE_URL}\n`);
  
  // Health check
  console.log('🏥 Checking backend health...');
  const health = await makeRequest(`${BASE_URL}/health`, 'GET');
  if (!health.success) {
    console.error('❌ Backend unreachable:', health.body);
    process.exit(1);
  }
  console.log('✅ Backend healthy\n');
  
  // Submit all jobs concurrently
  console.log(`📤 Submitting ${NUM_STUDENTS} jobs (rapid-fire)...`);
  const submitStart = Date.now();
  const submitResults = [];
  
  for (let i = 0; i < NUM_STUDENTS; i++) {
    const studentData = {
      studentId: i + 1,
      examId: 1,
      teacherFindings: TEACHER_FINDINGS,
      studentFindings: STUDENT_VARIANTS[i % STUDENT_VARIANTS.length]
    };
    
    const resultPromise = makeRequest(
      API_SUBMIT,
      'POST',
      JSON.stringify(studentData)
    ).then(result => {
      submitResults.push(result);
      if ((i + 1) % 50 === 0) {
        const success = submitResults.filter(r => r.success).length;
        console.log(`   [${i + 1}/${NUM_STUDENTS}] ${success} successful so far...`);
      }
      return result;
    });
    
    // Submit without waiting (concurrent)
    resultPromise.catch(err => console.error('Submit error:', err));
  }
  
  // Wait for all submissions (quick timeout)
  await new Promise(r => setTimeout(r, 3000));
  
  const submitElapsed = Date.now() - submitStart;
  const submitSuccess = submitResults.filter(r => r.success).length;
  const submitFailed = submitResults.filter(r => !r.success).length;
  
  console.log(`✅ Submitted: ${submitSuccess} succeeded, ${submitFailed} failed in ${submitElapsed}ms`);
  
  if (submitFailed > 0) {
    const failureTypes = {};
    submitResults.filter(r => !r.success).forEach(r => {
      const key = r.status === 0 ? (r.error ? 'ERROR' : 'UNKNOWN') : `HTTP ${r.status}`;
      failureTypes[key] = (failureTypes[key] || 0) + 1;
    });
    Object.entries(failureTypes).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
  }
  
  // Monitor queue processing
  console.log(`\n⏳ Monitoring queue (checking every 5s, max 3 mins)...`);
  
  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    
    const keyStats = await makeRequest(API_MONITOR_KEYS, 'GET');
    const workerStats = await makeRequest(API_MONITOR_WORKER, 'GET');
    
    if (workerStats.success && workerStats.body) {
      try {
        const data = JSON.parse(workerStats.body);
        const queue = data.aiWorkerQueue;
        const done = queue.done || 0;
        const error = queue.error || 0;
        const pending = queue.pending || 0;
        const processing = queue.processing || 0;
        
        const remaining = pending + processing;
        const pct = ((done / NUM_STUDENTS) * 100).toFixed(1);
        
        console.log(`[${i + 1}] Done: ${done}/${NUM_STUDENTS} (${pct}%) | Pending: ${pending} | Processing: ${processing} | Errors: ${error}`);
        
        if (remaining === 0) {
          console.log('✅ Queue complete!');
          
          // Final stats
          console.log(`\n📊 Final Results:`);
          console.log(`   - Total Done: ${done}`);
          console.log(`   - Total Errors: ${error}`);
          console.log(`   - Success Rate: ${((done / NUM_STUDENTS) * 100).toFixed(1)}%`);
          
          if (keyStats.success && keyStats.body) {
            try {
              const keysData = JSON.parse(keyStats.body);
              const keys = keysData.apiKeyStats || [];
              if (keys.length > 0) {
                console.log(`\n🔑 API Keys:`);
                keys.forEach((key, idx) => {
                  console.log(`   - Key ${idx + 1}: ${key.requestCount || 0} requests, ${key.penaltyCount || 0} penalties, backoff: ${key.backoffSeconds || 0}s`);
                });
              }
            } catch (e) {}
          }
          
          process.exit(done === NUM_STUDENTS ? 0 : 1);
        }
      } catch (e) {
        console.log(`[${i + 1}] Could not parse stats`);
      }
    }
  }
  
  console.log('\n⚠️  Load test timeout (3 minutes) - queue may still be processing');
  process.exit(1);
}

runLoadTest().catch(err => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
