const http = require('http');

const BASE_URL = 'http://localhost:5000'; // Change to Vercel URL if needed
const NUM_SUBMITS = 300;
const CONCURRENT = 50; // Submit 50 at a time to be realistic

let completed = 0;
let successes = 0;
let failures = 0;
const errors = {};

async function submitExam(index) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      student_id: Math.floor(Math.random() * 1000) + 1,
      course_id: Math.floor(Math.random() * 100) + 1,
      exam_id: Math.floor(Math.random() * 50) + 1,
      answers: JSON.stringify({ q1: 'A', q2: 'B', q3: 'C' })
    });

    const options = {
      hostname: new URL(BASE_URL).hostname,
      port: new URL(BASE_URL).port || 80,
      path: '/api/exams/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        completed++;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          successes++;
        } else {
          failures++;
          const key = `${res.statusCode}`;
          errors[key] = (errors[key] || 0) + 1;
        }
        console.log(`[${index}] Status: ${res.statusCode} (${completed}/${NUM_SUBMITS})`);
        resolve();
      });
    });

    req.on('error', (e) => {
      completed++;
      failures++;
      const key = e.code || 'UNKNOWN';
      errors[key] = (errors[key] || 0) + 1;
      console.log(`[${index}] Error: ${e.message} (${completed}/${NUM_SUBMITS})`);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

async function runLoadTest() {
  console.log(`\n🚀 Starting 300-submit PostgreSQL load test...`);
  console.log(`📊 Base URL: ${BASE_URL}`);
  console.log(`🔄 Concurrency: ${CONCURRENT}\n`);

  const startTime = Date.now();

  // Submit in batches
  for (let i = 0; i < NUM_SUBMITS; i += CONCURRENT) {
    const batch = [];
    for (let j = 0; j < CONCURRENT && i + j < NUM_SUBMITS; j++) {
      batch.push(submitExam(i + j));
    }
    await Promise.all(batch);
  }

  const duration = Date.now() - startTime;

  console.log(`\n✅ Load test completed in ${(duration / 1000).toFixed(2)}s`);
  console.log(`\n📈 Results:`);
  console.log(`   Successes: ${successes}/${NUM_SUBMITS} (${((successes / NUM_SUBMITS) * 100).toFixed(1)}%)`);
  console.log(`   Failures:  ${failures}/${NUM_SUBMITS} (${((failures / NUM_SUBMITS) * 100).toFixed(1)}%)`);
  console.log(`   Throughput: ${(NUM_SUBMITS / (duration / 1000)).toFixed(1)} req/s`);

  if (Object.keys(errors).length > 0) {
    console.log(`\n❌ Error breakdown:`);
    Object.entries(errors).forEach(([code, count]) => {
      console.log(`   ${code}: ${count}`);
    });
  }

  process.exit(successes === NUM_SUBMITS ? 0 : 1);
}

runLoadTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
