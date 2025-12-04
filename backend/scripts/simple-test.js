#!/usr/bin/env node

/**
 * Simple Load Test - Standalone (no server load)
 * Tests if the API can handle 250-300 concurrent requests
 */

const http = require('http');

const baseUrl = 'http://localhost:5000';
const studentCount = 250;

let completed = 0;
let success = 0;
let failed = 0;

console.log(`🚀 Load test: ${studentCount} concurrent submissions to ${baseUrl}`);
console.log(`Starting at ${new Date().toISOString()}\n`);

const startTime = Date.now();

function testRequest(studentId) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      studentId,
      examId: (studentId % 10) + 1,
      teacherFindings: 'The handwriting shows a rightward slant of approximately 45 degrees',
      studentFindings: 'The handwriting shows a rightward slant of approximately 45 degrees'
    });

    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/ai-grader/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        completed++;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          success++;
        } else {
          failed++;
          if (failed <= 3) console.log(`❌ ${studentId}: HTTP ${res.statusCode}`);
        }
        if (completed % 50 === 0) {
          console.log(`  Sent ${completed}/${studentCount}...`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      completed++;
      failed++;
      if (failed <= 3) console.log(`❌ ${studentId}: ${err.code || err.message}`);
      resolve();
    });

    req.on('timeout', () => {
      completed++;
      failed++;
      req.destroy();
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

async function run() {
  const promises = [];
  for (let i = 1; i <= studentCount; i++) {
    promises.push(testRequest(i));
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 5));
  }

  await Promise.all(promises);

  const elapsed = (Date.now() - startTime) / 1000;

  console.log(`\n✅ Test complete!`);
  console.log(`  Total: ${completed}`);
  console.log(`  Success: ${success} (${((success / completed) * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${failed} (${((failed / completed) * 100).toFixed(1)}%)`);
  console.log(`  Time: ${elapsed.toFixed(2)}s`);
  console.log(`  Rate: ${(completed / elapsed).toFixed(1)} req/s`);
  
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
