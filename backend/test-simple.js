const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/test',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:');
    console.log(data);
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.end();
