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
    // More realistic exam submission payload
    const postData = JSON.stringify({
      student_id: Math.floor(Math.random() * 1000) + 1,
      exam_id: Math.floor(Math.random() * 100) + 1,
      answers: JSON.stringify({
        q1: 'The answer is correct',
        q2: 'This is a good response',
        q3: 'Student demonstrated understanding'
      })
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
        'Connection': 'close',
        'User-Agent': 'LoadTest/1.0',
        // No auth header - testing if endpoint is public or requires auth
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        completed++;
        const statusCode = res.statusCode;
        
        // Count 2xx and 3xx as partial successes, 4xx as auth issues, 5xx as server errors
        if (statusCode >= 200 && statusCode < 300) {
          successes++;
          if (completed % 50 === 0) {
            console.log(`✓ [${index}] ${statusCode} Success (${completed}/${NUM_SUBMITS})`);
          }
        } else {
          failures++;
          const key = `${statusCode}`;
          errors[key] = (errors[key] || 0) + 1;
          if (statusCode === 401) {
            // 401 means server is reachable but auth is needed
            if (completed % 100 === 0) {
              console.log(`⚠ [${index}] ${statusCode} Unauthorized (${completed}/${NUM_SUBMITS})`);
            }
          } else if (statusCode === 404) {
            console.log(`✗ [${index}] ${statusCode} Endpoint not found (${completed}/${NUM_SUBMITS})`);
          } else {
            console.log(`✗ [${index}] ${statusCode} (${completed}/${NUM_SUBMITS})`);
          }
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      completed++;
      failures++;
      const key = e.code || 'UNKNOWN';
      errors[key] = (errors[key] || 0) + 1;
      console.log(`✗ [${index}] Network Error: ${e.code} (${completed}/${NUM_SUBMITS})`);
      resolve();
    });

    req.setTimeout(15000, () => {
      req.destroy();
      completed++;
      failures++;
      errors['TIMEOUT'] = (errors['TIMEOUT'] || 0) + 1;
      console.log(`✗ [${index}] Request Timeout (${completed}/${NUM_SUBMITS})`);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

async function runLoadTest() {
  console.log(`\n🚀 PostgreSQL 300-Submit Load Test (Vercel)\n`);
  console.log(`📊 Configuration:`);
  console.log(`   Backend: ${BASE_URL}`);
  console.log(`   Total Submits: ${NUM_SUBMITS}`);
  console.log(`   Concurrency: ${CONCURRENT}`);
  console.log(`   Endpoint: /api/exams/submit\n`);

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
      await new Promise(r => setTimeout(r, 50));
    }
  }

  const duration = Date.now() - startTime;
  const throughput = (NUM_SUBMITS / (duration / 1000)).toFixed(1);
  const successRate = ((successes / NUM_SUBMITS) * 100).toFixed(1);

  console.log(`\n✅ Load Test Complete\n`);
  console.log(`📈 Performance Results:`);
  console.log(`   Successes:  ${successes}/${NUM_SUBMITS} (${successRate}%)`);
  console.log(`   Failures:   ${failures}/${NUM_SUBMITS} (${(100 - parseFloat(successRate)).toFixed(1)}%)`);
  console.log(`   Duration:   ${(duration / 1000).toFixed(2)}s`);
  console.log(`   Throughput: ${throughput} req/s\n`);

  if (Object.keys(errors).length > 0) {
    console.log(`Error Breakdown:`);
    const sorted = Object.entries(errors).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([code, count]) => {
      if (code === '401') {
        console.log(`   ${code} Unauthorized: ${count} (authentication required)`);
      } else if (code === 'TIMEOUT') {
        console.log(`   ${code}: ${count}`);
      } else {
        console.log(`   HTTP ${code}: ${count}`);
      }
    });
  }

  if (successRate === '100') {
    console.log(`\n🎉 PERFECT - All 300 submits succeeded!`);
  } else if (successRate > '90') {
    console.log(`\n⭐ EXCELLENT - Over 90% success rate!`);
  } else if (successRate > '70') {
    console.log(`\n✓ GOOD - PostgreSQL handled ${successRate}% of concurrent submits`);
  } else if (successRate === '0' && errors['401']) {
    console.log(`\n⚠️  Server is reachable but requires authentication.`);
    console.log(`   Note: 401 errors mean the endpoint exists and is working.`);
    console.log(`   To test with real submits, provide authentication headers.`);
  } else {
    console.log(`\n⚠️  Some submits failed - check error breakdown above`);
  }

  console.log();
  process.exit(successRate > '50' ? 0 : 1);
}

// Wait a moment for network to settle
setTimeout(runLoadTest, 1000);
