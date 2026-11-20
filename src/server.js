#!/usr/bin/env node
/**
 * Zero-dependency HTTP static & leaderboard server for Đảo Đèn Lồng 3D Web Game
 * Supports `--export-leaderboard <out.json>` per Test Contract v1.3.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.resolve(__dirname, '..');
const LEADERBOARD_PATH = path.join(ROOT, 'leaderboard.json');

function loadLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_PATH)) {
      const data = JSON.parse(fs.readFileSync(LEADERBOARD_PATH, 'utf8'));
      if (data && Array.isArray(data.entries)) return data.entries;
    }
  } catch (_) {}
  return [];
}

function sortAndTrimLeaderboard(entries) {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.achieved_at).getTime() - new Date(b.achieved_at).getTime();
    })
    .slice(0, 10);
}

function saveLeaderboard(entries) {
  const sorted = sortAndTrimLeaderboard(entries);
  fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify({ entries: sorted }, null, 2) + '\n', 'utf8');
  return sorted;
}

// CLI flag: --export-leaderboard out.json
const exportIdx = process.argv.indexOf('--export-leaderboard');
if (exportIdx !== -1) {
  const outPath = process.argv[exportIdx + 1];
  if (!outPath) {
    process.stderr.write('Error: Missing output path for --export-leaderboard\n');
    process.exit(1);
  }
  const entries = sortAndTrimLeaderboard(loadLeaderboard());
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ entries }, null, 2) + '\n', 'utf8');
  process.exit(0);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // Leaderboard API
  if (urlPath === '/api/leaderboard') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ entries: sortAndTrimLeaderboard(loadLeaderboard()) }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 16384) req.destroy();
      });
      req.on('end', () => {
        try {
          const entry = JSON.parse(body);
          if (!entry || typeof entry.name !== 'string' || typeof entry.score !== 'number') {
            res.writeHead(400);
            res.end('Invalid entry');
            return;
          }
          const entries = loadLeaderboard();
          entries.push({
            name: entry.name.trim().slice(0, 12),
            score: Math.round(entry.score),
            nights_won: Number(entry.nights_won) || 0,
            achieved_at: entry.achieved_at || new Date().toISOString(),
            seed: Number(entry.seed) || 1
          });
          const saved = saveLeaderboard(entries);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ entries: saved }));
        } catch (err) {
          res.writeHead(400);
          res.end(err.message);
        }
      });
      return;
    }
  }

  let relPath = urlPath === '/' ? '/src/web/index.html' : urlPath;
  const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(ROOT, safePath);

  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(fullPath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Đảo Đèn Lồng 3D Server đang chạy tại: http://localhost:${PORT}`);
  console.log('Nhấn Ctrl+C để dừng.');
});
