const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const CSV_PATH = path.join(__dirname, '..', 'data', 'sfw-emails.csv');
const PAGES_DIR = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

// Ensure CSV exists with header
if (!fs.existsSync(CSV_PATH)) {
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, 'timestamp,first_name,email\n');
}

const server = http.createServer((req, res) => {
  // CORS for local file:// access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // POST /subscribe — append to CSV
  if (req.method === 'POST' && req.url === '/subscribe') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { firstName, email } = JSON.parse(body);
        if (!firstName || !email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing fields' }));
        }
        const safe = (s) => `"${String(s).replace(/"/g, '""')}"`;
        const line = `${new Date().toISOString()},${safe(firstName)},${safe(email)}\n`;
        fs.appendFileSync(CSV_PATH, line);
        console.log(`+ ${firstName} <${email}>`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // Static file serving
  let filePath = req.url === '/' ? '/thisismisssally.html' : req.url;
  filePath = path.join(PAGES_DIR, decodeURIComponent(filePath));

  // Prevent directory traversal
  if (!filePath.startsWith(PAGES_DIR)) {
    res.writeHead(403);
    return res.end();
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Miss Sally server running at http://localhost:${PORT}`);
  console.log(`Emails save to ${CSV_PATH}`);
});
