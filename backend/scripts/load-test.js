#!/usr/bin/env node

/**
 * Load Test Script for AI Grader
 * 
 * Simulates 250-300 concurrent submissions to test the AI grading pipeline.
 * 
 * Usage:
 *   node load-test.js [--students NUM] [--url BASE_URL]
 * 
 * Examples:
 *   node load-test.js --students 250
 *   node load-test.js --students 300 --url http://localhost:5000
 */

const http = require('http');
const https = require('https');
const url = require('url');

// Parse CLI args
const args = process.argv.slice(2);
let studentCount = 250;
let baseUrl = 'http://localhost:5000';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--students' && args[i + 1]) {
    studentCount = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--url' && args[i + 1]) {
    baseUrl = args[i + 1];
    i++;
  }
}

console.log(`🚀 Starting load test: ${studentCount} concurrent submissions`);
console.log(`📍 Target: ${baseUrl}/api/ai-grader/submit`);
console.log(`⏱️  Starting at ${new Date().toISOString()}\n`);

// Test data
const sampleTeacherFindings = `The handwriting shows a rightward slant of approximately 45 degrees with moderate pressure. The baseline is relatively consistent with minor deviations. Loop formations in letters like 'l', 'h', and 'k' are well-formed and proportional. The overall size is medium, approximately 3-4mm for lowercase letters. Pen lifts are minimal, indicating good writing flow. Punctuation is placed correctly.`;

const sampleStudentFindings = `The handwriting shows a rightward slant of approximately 45 degrees with moderate pressure. The baseline is relatively consistent with minor deviations. Loop formations in letters like 'l', 'h', and 'k' are well-formed and proportional. The overall size is medium, approximately 3-4mm for lowercase letters. Pen lifts are minimal, indicating good writing flow. Punctuation is placed correctly.`;

// Generate exam IDs (will cycle through 10 different exams)
const examIds = Array.from({ length: 10 }, (_, i) => i + 1);

// Request counter and timing
let totalRequests = 0;
let successCount = 0;
let failureCount = 0;
let startTime = Date.now();
const responseTimes = [];

function makeRequest(studentId, examId) {
  return new Promise((resolve) => {
    const reqStartTime = Date.now();
    const payload = JSON.stringify({
      studentId,
      examId,
      teacherFindings: sampleTeacherFindings,
      studentFindings: sampleStudentFindings
    });

    const parsedUrl = new url.URL(baseUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: '/api/ai-grader/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const responseTime = Date.now() - reqStartTime;
        responseTimes.push(responseTime);
        
        if (res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 202) {
          successCount++;
        } else {
          failureCount++;
          if (failureCount <= 5) {
            // Log first 5 failures with details
            console.log(`  ❌ Student ${studentId}: HTTP ${res.statusCode}`);
            if (data) console.log(`     Response: ${data.substring(0, 150)}`);
          }
        }
        
        totalRequests++;
        
        // Log progress every 50 requests
        if (totalRequests % 50 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`✓ ${totalRequests}/${studentCount} submitted (${elapsed}s elapsed, ${successCount} ok, ${failureCount} failed)`);
        }
        
        resolve({ statusCode: res.statusCode, responseTime });
      });
    });

    req.on('error', (err) => {
      failureCount++;
      totalRequests++;
      if (failureCount <= 5) {
        console.log(`  ⚠️  Student ${studentId}: Connection error - ${err.code || err.message}`);
      }
      resolve({ error: err.message });
    });
    
    req.on('timeout', () => {
      failureCount++;
      totalRequests++;
      if (failureCount <= 5) {
        console.log(`  ⚠️  Student ${studentId}: Request timeout`);
      }
      req.destroy();
      resolve({ error: 'timeout' });
    });

    req.write(payload);
    req.end();
  });
}

async function runLoadTest() {
  const concurrentRequests = [];
  
  // Fire off all requests with a small stagger to avoid TCP connection storms
  for (let i = 0; i < studentCount; i++) {
    const studentId = i + 1;
    const examId = examIds[i % examIds.length];
    
    concurrentRequests.push(makeRequest(studentId, examId));
    
    // Small delay to avoid overwhelming the system on startup
    if (i % 10 === 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // Wait for all requests to complete
  await Promise.all(concurrentRequests);
  
  // Calculate statistics
  const totalTime = (Date.now() - startTime) / 1000;
  const avgResponseTime = responseTimes.length > 0 
    ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2)
    : 'N/A';
  const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 'N/A';
  const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 'N/A';
  
  console.log(`\n✅ Load test completed!\n`);
  console.log(`📊 Results:`);
  console.log(`  Total requests: ${totalRequests}`);
  console.log(`  Successful: ${successCount} (${((successCount / totalRequests) * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${failureCount} (${((failureCount / totalRequests) * 100).toFixed(1)}%)`);
  console.log(`  Total time: ${totalTime.toFixed(2)}s`);
  console.log(`  Average response time: ${avgResponseTime}ms`);
  console.log(`  Min response time: ${minResponseTime}ms`);
  console.log(`  Max response time: ${maxResponseTime}ms`);
  console.log(`  Requests/sec: ${(totalRequests / totalTime).toFixed(2)}`);
  console.log(`\n📝 Note: Jobs have been queued. Monitor with GET /api/monitor/ai-worker`);
  
  process.exit(failureCount > 0 ? 1 : 0);
}

// Run the test
runLoadTest().catch((err) => {
  console.error('❌ Load test error:', err);
  process.exit(1);
});
