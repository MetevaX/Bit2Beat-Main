#!/usr/bin/env node
/*
 * Tiny static server for development: `npm start` → http://localhost:8765
 * Supports HTTP Range requests, which browsers need to seek inside videos.
 * No dependencies; serves only files inside the project folder, and passes /svs/… on to NASA's
 * Scientific Visualization Studio (svs.gsfc.nasa.gov) like vercel.json does online.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8',
};

http
  .createServer((req, res) => {
    // /svs/… → NASA's Scientific Visualization Studio (as vercel.json does online), with Range
    if (req.url.startsWith('/svs/')) {
      const up = https.request('https://svs.gsfc.nasa.gov' + req.url.slice(4), { headers: req.headers.range ? { range: req.headers.range } : {} }, (r) => {
        res.writeHead(r.statusCode, { 'Content-Type': r.headers['content-type'] || 'application/octet-stream', ...(r.headers['content-length'] ? { 'Content-Length': r.headers['content-length'] } : {}), ...(r.headers['content-range'] ? { 'Content-Range': r.headers['content-range'] } : {}), 'Accept-Ranges': 'bytes' });
        r.pipe(res);
      });
      up.on('error', () => res.writeHead(502).end('NASA SVS not reachable'));
      return void up.end();
    }
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range) {
        const start = range[1] ? +range[1] : st.size - +range[2];
        const end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
        if (start > end || start >= st.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
          return;
        }
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(port, () => console.log(`Bit2Beat studio: http://localhost:${port}`));
