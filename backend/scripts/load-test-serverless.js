#!/usr/bin/env node

/**
 * Load Test with Serverless Job Processing
 * 
 * Simulates 300 concurrent submissions and then triggers job processing
 * suitable for Vercel serverless environment
 */

const http = require('http');
const https = require('https');
const url = require('url');

// Parse CLI arguments
const args = process.argv.slice(2);
let studentCount = 300;
let baseUrl = 'https://crimewise-web-v2-ri4n.vercel.app';
let triggerConcurrency = 6; // How many jobs to process per trigger

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

console.log(`🚀 Load test: ${studentCount} concurrent submissions`);
console.log(`📍 Target: ${baseUrl}`);
console.log(`⚙️  Will trigger job processing after all submissions\n`);

const startTime = Date.now();

function makeRequest(studentId, isSubmit = true) {
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
      path: isSubmit ? '/api/ai-grader/submit' : '/api/trigger-ai-worker',
      method: isSubmit ? 'POST' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (!isSubmit) {
          // Trigger response
          resolve({ statusCode: res.statusCode, data });
          return;
        }

        completed++;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          success++;
          if (success <= 3) console.log(`  ✓ Student ${studentId}: queued`);
        } else {
          failed++;
          if (failed <= 3) {
            console.log(`  ❌ Student ${studentId}: HTTP ${res.statusCode}`);
            if (data) console.log(`     ${data.substring(0, 150)}`);
          }
        }
        if (completed % 50 === 0) {
          console.log(`  📊 ${completed}/${studentCount} submitted...`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      if (isSubmit) {
        failed++;
        completed++;
        if (failed <= 3) console.log(`  ⚠️  Error: ${err.message}`);
      }
      resolve({ error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      if (isSubmit) {
        failed++;
        completed++;
      }
      resolve({ error: 'timeout' });
    });

    req.write(payload);
    req.end();
  });
}

async function run() {
  // Phase 1: Submit all jobs with aggressive staggering to minimize DB contention
  console.log('Phase 1: Submitting jobs (staggered for 300 concurrent)...\n');
  const submitPromises = [];
  const STAGGER_MS = 15; // 15ms stagger = ~67 req/s spread over ~4.5s for 300 req
  for (let i = 1; i <= studentCount; i++) {
    submitPromises.push(makeRequest(i, true));
    // Stagger submissions more aggressively to avoid DB lock contention
    if (i % 25 === 0) {
      // Every 25 requests, wait 400ms to let DB settle
      await new Promise(r => setTimeout(r, 400));
    } else if (i % 10 === 0) {
      // Regular stagger between batches
      await new Promise(r => setTimeout(r, STAGGER_MS));
    }
  }
  await Promise.all(submitPromises);

  const submitTime = (Date.now() - startTime) / 1000;
  console.log(`\n✅ All submissions complete in ${submitTime.toFixed(2)}s`);
  console.log(`  Success: ${success} | Failed: ${failed}\n`);

  // Phase 2: Trigger job processing on Vercel
  console.log('Phase 2: Triggering job processing on deployed backend...\n');
  
  try {
    const triggerResult = await makeRequest(null, false);
    if (triggerResult.statusCode >= 200 && triggerResult.statusCode < 300) {
      console.log(`  ✓ Worker triggered successfully`);
      if (triggerResult.data) console.log(`  Response: ${triggerResult.data}`);
    } else {
      console.log(`  ⚠️  Trigger response: HTTP ${triggerResult.statusCode}`);
    }
  } catch (err) {
    console.log(`  ⚠️  Failed to trigger: ${err.message}`);
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\n📊 FINAL RESULTS:`);
  console.log(`  Total submissions: ${completed}`);
  console.log(`  Success: ${success} (${((success / completed) * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${failed} (${((failed / completed) * 100).toFixed(1)}%)`);
  console.log(`  Total time: ${totalTime.toFixed(2)}s`);
  console.log(`  Submission rate: ${(studentCount / submitTime).toFixed(1)} req/s`);
  
  console.log(`\n💡 NEXT STEPS:`);
  console.log(`  1. Monitor grades with: GET ${baseUrl}/api/monitor/ai-worker`);
  console.log(`  2. Check API keys: GET ${baseUrl}/api/monitor/api-keys`);
  console.log(`  3. Wait 1-2 minutes for all jobs to be graded (48 RPM capacity)`);
  
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
