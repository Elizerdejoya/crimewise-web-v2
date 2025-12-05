const https = require('https');

// Configuration
const BASE_URL = 'https://crimewise-web-v2-ri4n.vercel.app';
const BATCH_SIZE = 50; // Concurrent requests per batch
const TOTAL_REQUESTS = 300;
const LOGIN_EMAIL = 'student1@crimewise.com';
const LOGIN_PASSWORD = 'studpass';
const EXAM_ID = 3;  // Updated to match actual exam

// Metrics
let successful = 0;
let failed = 0;
let errors = {};
const startTime = Date.now();

/**
 * HTTPS POST request helper
 */
function httpsPost(hostname, path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data)),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            data: parsed,
            headers: res.headers,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: responseData,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

/**
 * Login and get JWT token
 */
async function login() {
  try {
    console.log('\n🔐 Logging in...');
    const hostname = BASE_URL.replace('https://', '').replace('http://', '');
    const response = await httpsPost(hostname, '/api/login', {
      email: LOGIN_EMAIL,
      password: LOGIN_PASSWORD,
    });

    if (response.status === 200 && response.data.token) {
      console.log(`✅ Login successful for ${LOGIN_EMAIL}`);
      console.log(`   User ID: ${response.data.id || 'N/A'}`);
      console.log(`📌 Token: ${response.data.token.substring(0, 50)}...`);
      return { token: response.data.token, userId: response.data.id };
    } else {
      console.error(`❌ Login failed: ${response.status}`);
      console.error(`Response:`, response.data);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Login error:', err.message);
    process.exit(1);
  }
}

/**
 * Submit a single exam
 */
async function submitExam(token, studentId, examId, requestNum) {
  const hostname = BASE_URL.replace('https://', '').replace('http://', '');
  
  try {
    const response = await httpsPost(
      hostname,
      '/api/exams/submit',
      {
        student_id: studentId,  // Must match authenticated user
        exam_id: examId,
        answer: `Answer for exam ${examId}`,
        score: Math.floor(Math.random() * 100),
        tab_switches: Math.floor(Math.random() * 5),
      },
      {
        'Authorization': `Bearer ${token}`,
      }
    );

    if (response.status === 200 || response.status === 201) {
      successful++;
      return { success: true, status: response.status, requestNum };
    } else {
      failed++;
      const errorKey = `${response.status} ${response.data?.error || 'Unknown'}`;
      errors[errorKey] = (errors[errorKey] || 0) + 1;
      return { success: false, status: response.status, requestNum, error: errorKey };
    }
  } catch (err) {
    failed++;
    errors[err.message] = (errors[err.message] || 0) + 1;
    return { success: false, requestNum, error: err.message };
  }
}

/**
 * Run load test with batching
 */
async function runLoadTest(token, studentId) {
  console.log('\n🚀 Starting 300-Submit Load Test (Vercel with Auth)');
  console.log('📊 Configuration:');
  console.log(`   Backend: ${BASE_URL}`);
  console.log(`   Total Submits: ${TOTAL_REQUESTS}`);
  console.log(`   Concurrency: ${BATCH_SIZE}`);
  console.log(`   Endpoint: /api/exams/submit`);
  console.log(`   Auth: Bearer token (${LOGIN_EMAIL})`);
  console.log(`   Student ID: ${studentId}`);
  console.log(`   Exam ID: ${EXAM_ID}`);
  console.log('');

  const batches = [];
  for (let i = 0; i < TOTAL_REQUESTS; i += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, TOTAL_REQUESTS - i);
    const promises = [];

    for (let j = 0; j < batchSize; j++) {
      const requestNum = i + j + 1;
      // All requests use the same student ID (authenticated user's ID)
      promises.push(submitExam(token, studentId, EXAM_ID, requestNum));
    }

    const batchResults = await Promise.all(promises);
    const completed = i + batchSize;
    
    // Show progress
    let successCount = batchResults.filter(r => r.success).length;
    let failCount = batchResults.filter(r => !r.success).length;
    console.log(`⏳ [${successCount}] Success (${completed}/${TOTAL_REQUESTS})`);
    if (failCount > 0) {
      console.log(`⚠  [${failCount}] Failed`);
    }

    batches.push(batchResults);
  }

  return batches;
}

/**
 * Main execution
 */
async function main() {
  const authData = await login();
  await runLoadTest(authData.token, authData.userId);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const throughput = (TOTAL_REQUESTS / duration).toFixed(1);

  console.log('\n✅ Load Test Complete');
  console.log('📈 Performance Results:');
  console.log(`   Successes:  ${successful}/${TOTAL_REQUESTS} (${((successful / TOTAL_REQUESTS) * 100).toFixed(1)}%)`);
  console.log(`   Failures:   ${failed}/${TOTAL_REQUESTS} (${((failed / TOTAL_REQUESTS) * 100).toFixed(1)}%)`);
  console.log(`   Duration:   ${duration}s`);
  console.log(`   Throughput: ${throughput} req/s`);

  if (Object.keys(errors).length > 0) {
    console.log('\nError Breakdown:');
    for (const [error, count] of Object.entries(errors).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${error}: ${count}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
