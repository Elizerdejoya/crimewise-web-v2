#!/usr/bin/env node

/**
 * Diagnostic test to check backend health and database connectivity
 */

const https = require('https');
const url = require('url');

const baseUrl = 'https://crimewise-web-v2-ri4n.vercel.app';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new url.URL(baseUrl + path);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runDiagnostics() {
  console.log('🔍 Running backend diagnostics...\n');

  try {
    // Test 1: Check if backend is responding
    console.log('[1] Testing backend health...');
    const health = await makeRequest('/api/health');
    console.log(`    Status: ${health.statusCode}`);
    if (health.statusCode === 200) {
      console.log(`    ✅ Backend is responding`);
    }

    // Test 2: Check database status
    console.log('\n[2] Checking database connection...');
    const db = await makeRequest('/api/monitor/db');
    console.log(`    Status: ${db.statusCode}`);
    if (db.statusCode === 200) {
      try {
        const parsed = JSON.parse(db.body);
        console.log(`    Response:`, parsed);
      } catch (e) {
        console.log(`    Body:`, db.body.substring(0, 200));
      }
    } else {
      console.log(`    Response:`, db.body.substring(0, 200));
    }

    // Test 3: Check AI worker status
    console.log('\n[3] Checking AI worker status...');
    const worker = await makeRequest('/api/monitor/ai-worker');
    console.log(`    Status: ${worker.statusCode}`);
    if (worker.statusCode === 200) {
      try {
        const parsed = JSON.parse(worker.body);
        console.log(`    Response:`, parsed);
      } catch (e) {
        console.log(`    Body:`, worker.body.substring(0, 200));
      }
    } else {
      console.log(`    Error body:`, worker.body.substring(0, 200));
    }

    // Test 4: Check exams endpoint
    console.log('\n[4] Checking exams endpoint...');
    const exams = await makeRequest('/api/exams');
    console.log(`    Status: ${exams.statusCode}`);
    if (exams.statusCode === 200) {
      try {
        const parsed = JSON.parse(exams.body);
        console.log(`    Found ${parsed.data ? parsed.data.length : 0} exams`);
      } catch (e) {
        console.log(`    Body:`, exams.body.substring(0, 200));
      }
    }

  } catch (err) {
    console.error('❌ Diagnostic error:', err.message);
  }
}

runDiagnostics();
