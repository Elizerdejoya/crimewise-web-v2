const http = require('http');
const https = require('https');

const BASE_URL = 'https://crimewise-web-v2-ri4n.vercel.app';
const NUM_SUBMITS = 300;
const CONCURRENT = 50;

let completed = 0;
let successes = 0;
let failures = 0;
const errors = {};

async function submitExam(index) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      student_id: Math.floor(Math.random() * 1000) + 1,
      exam_id: Math.floor(Math.random() * 100) + 1,
      answers: { q1: 'A', q2: 'B', q3: 'C' }
    });

    const url = new URL(BASE_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: '/api/exams/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Connection': 'close'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        completed++;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          successes++;
          if (completed % 50 === 0) {
            console.log(`✓ [${index}] ${res.statusCode} (${completed}/${NUM_SUBMITS})`);
          }
        } else {
          failures++;
          const key = `${res.statusCode}`;
          errors[key] = (errors[key] || 0) + 1;
          console.log(`✗ [${index}] ${res.statusCode} (${completed}/${NUM_SUBMITS})`);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      completed++;
      failures++;
      const key = e.code || 'UNKNOWN';
      errors[key] = (errors[key] || 0) + 1;
      console.log(`✗ [${index}] Error: ${e.code} (${completed}/${NUM_SUBMITS})`);
      resolve();
    });

    req.setTimeout(10000, () => {
      req.destroy();
      completed++;
      failures++;
      errors['TIMEOUT'] = (errors['TIMEOUT'] || 0) + 1;
      console.log(`✗ [${index}] Timeout (${completed}/${NUM_SUBMITS})`);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

async function runLoadTest() {
  console.log(`\n🚀 PostgreSQL 300-Submit Load Test`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Base URL: ${BASE_URL}`);
  console.log(`🔄 Total Submits: ${NUM_SUBMITS}`);
  console.log(`⚡ Concurrency: ${CONCURRENT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const startTime = Date.now();

  // Submit in batches
  for (let i = 0; i < NUM_SUBMITS; i += CONCURRENT) {
    const batch = [];
    for (let j = 0; j < CONCURRENT && i + j < NUM_SUBMITS; j++) {
      batch.push(submitExam(i + j));
    }
    await Promise.all(batch);
    // Small delay between batches
    if (i + CONCURRENT < NUM_SUBMITS) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const duration = Date.now() - startTime;
  const throughput = (NUM_SUBMITS / (duration / 1000)).toFixed(1);
  const successRate = ((successes / NUM_SUBMITS) * 100).toFixed(1);

  console.log(`\n✅ Load Test Complete\n`);
  console.log(`📈 Results:`);
  console.log(`   Successes:  ${successes}/${NUM_SUBMITS} (${successRate}%)`);
  console.log(`   Failures:   ${failures}/${NUM_SUBMITS} (${(100 - parseFloat(successRate)).toFixed(1)}%)`);
  console.log(`   Duration:   ${(duration / 1000).toFixed(2)}s`);
  console.log(`   Throughput: ${throughput} req/s\n`);

  if (Object.keys(errors).length > 0) {
    console.log(`❌ Error Breakdown:`);
    Object.entries(errors)
      .sort((a, b) => b[1] - a[1])
      .forEach(([code, count]) => {
        console.log(`   ${code}: ${count}`);
      });
  }

  console.log(`\n${successRate === '100' ? '🎉 PERFECT - All 300 submits succeeded!' : '⚠️  Some submits failed'}\n`);

  process.exit(successRate === '100' ? 0 : 1);
}

// Wait a bit for server to be ready
setTimeout(runLoadTest, 500);
