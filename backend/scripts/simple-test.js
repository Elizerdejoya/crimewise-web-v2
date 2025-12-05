#!/usr/bin/env node

/**
 * Simple Load Test - Standalone (no server load)
 * Tests if the API can handle 250-300 concurrent requests
 */

// Suppress dotenv from auto-loading in this standalone test
delete require.cache[require.resolve('dotenv')];

const http = require('http');
const https = require('https');
const url = require('url');

// Parse CLI arguments
const args = process.argv.slice(2);
let studentCount = 300; // Default to 300 for stress test
let baseUrl = 'https://crimewise-web-v2-ri4n.vercel.app'; // Use deployed backend

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--students' && args[i + 1]) {
    studentCount = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--url' && args[i + 1]) {
    baseUrl = args[i + 1];
    i++;
  }
}

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
      },
      timeout: 10000
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        completed++;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          success++;
          if (success <= 3) console.log(`  ✓ Student ${studentId}: queued (job ID received)`);
        } else {
          failed++;
          if (failed <= 3) {
            console.log(`  ❌ Student ${studentId}: HTTP ${res.statusCode}`);
            if (data) console.log(`     Response: ${data.substring(0, 200)}`);
          }
        }
        if (completed % 50 === 0) {
          console.log(`  📊 ${completed}/${studentCount} submitted...`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      completed++;
      failed++;
      if (failed <= 3) console.log(`  ❌ Student ${studentId}: ${err.code || err.message}`);
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
