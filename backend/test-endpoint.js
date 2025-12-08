const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/ai-grader/metrics',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer test'
  }
};

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response body (first 500 chars):');
    console.log(data.substring(0, 500));
    console.log('\n\nFull response:');
    console.log(data);
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.end();
