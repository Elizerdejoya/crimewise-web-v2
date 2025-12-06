const http = require('http');

// Fake auth header
const token = 'test_token_12345';

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/students/4/results',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('API Response status:', res.statusCode);
      console.log('Number of results:', Array.isArray(parsed) ? parsed.length : 'not an array');
      
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        console.log('\n=== First Result ===');
        console.log('Keys:', Object.keys(first).sort());
        console.log('\nField values:');
        console.log('answer:', first.answer ? 'EXISTS (' + first.answer.length + ' chars)' : 'MISSING');
        console.log('details:', first.details ? 'EXISTS (' + first.details.length + ' chars)' : 'MISSING');
        console.log('score:', first.score);
        console.log('name (exam name):', first.name);
        console.log('course_name:', first.course_name);
      }
    } catch (e) {
      console.error('Failed to parse response:', e.message);
      console.log('Raw response:', data.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.end();
