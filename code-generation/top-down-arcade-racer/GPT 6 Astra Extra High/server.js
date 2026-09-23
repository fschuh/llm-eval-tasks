'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']],
  ['/simulation.js', ['simulation.js', 'text/javascript']],
  ['/renderer.js', ['renderer.js', 'text/javascript']],
  ['/game.js', ['game.js', 'text/javascript']],
]);
const port = Number(process.env.PORT) || 8080;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = files.get(pathname);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  if (!file) { response.writeHead(pathname === '/favicon.ico' ? 204 : 404); response.end(); return; }
  fs.readFile(path.join(__dirname, file[0]), (error, data) => {
    if (error) { response.writeHead(500); response.end('Unable to load game file.'); return; }
    response.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`APEX is ready at http://localhost:${port}`));
