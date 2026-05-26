'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT      = 8080;
const DATA_FILE = path.join(__dirname, 'data.json');
const HTML_FILE = path.join(__dirname, 'patient-handover.html');

// ── SSE clients ──────────────────────────────────────────────────────────────
const clients = new Set();

function broadcast(payload) {
  const msg = `data: ${payload}\n\n`;
  for (const res of clients) {
    try { res.write(msg); }
    catch (_) { clients.delete(res); }
  }
}

// ── Data helpers ─────────────────────────────────────────────────────────────
function readData() {
  try {
    if (fs.existsSync(DATA_FILE))
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (_) {}
  return { teams: [], teamData: {} };
}

function writeData(obj) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

  // Serve the app HTML
  if (req.method === 'GET' && pathname === '/') {
    try {
      const html = fs.readFileSync(HTML_FILE);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (_) {
      res.writeHead(404);
      res.end('patient-handover.html not found next to server.js');
    }
    return;
  }

  // GET all data
  if (req.method === 'GET' && pathname === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readData()));
    return;
  }

  // POST save data
  if (req.method === 'POST' && pathname === '/api/data') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000_000) req.destroy(); // 10 MB guard
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        writeData(data);
        const payload = JSON.stringify(data);
        broadcast(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (_) {
        res.writeHead(400);
        res.end('Bad JSON');
      }
    });
    return;
  }

  // SSE event stream — push updates to all connected browsers
  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',  // disable nginx buffering if behind a proxy
    });
    res.write(': connected\n\n');
    clients.add(res);

    // Keep-alive ping every 25 s (prevents proxy / browser timeout at 30 s)
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); }
      catch (_) { clearInterval(ping); clients.delete(res); }
    }, 25_000);

    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('\n  ================================================');
  console.log('   GM Patient Handover — Server Running');
  console.log('  ================================================\n');
  console.log(`  Local:    http://localhost:${PORT}`);

  // Show all LAN IP addresses so other devices can connect
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`  Network:  http://${addr.address}:${PORT}`);
      }
    }
  }

  console.log(`\n  Data:     ${DATA_FILE}`);
  console.log('\n  Other devices on the same Wi-Fi/network can');
  console.log('  connect using the Network address above.');
  console.log('\n  Close this window to stop the server.\n');
});
