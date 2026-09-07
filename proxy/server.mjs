#!/usr/bin/env node
/**
 * Optional tiny local CORS proxy for providers that block browser calls
 * (Replicate, and any preview URL without CORS headers).
 *
 *   npm run proxy            # listens on http://localhost:8787
 *   PORT=9000 npm run proxy
 *   node proxy/server.mjs --allow api.example.com
 *
 * Then set "Local proxy URL" in the app's Settings to http://localhost:8787.
 * Requests look like  GET/POST http://localhost:8787/https://api.replicate.com/v1/...
 * Headers (including Authorization) are forwarded as-is. Only the hosts in
 * ALLOWED_HOSTS (plus any --allow flags) are proxied so this is not an open relay.
 */
import http from 'node:http';

const ALLOWED_HOSTS = new Set([
  'api.replicate.com',
  'replicate.delivery',
  'fal.run',
  'queue.fal.run',
  'fal.media',
  'v3.fal.media',
  'v3b.fal.media',
  'api.runware.ai',
  'im.runware.ai',
  'generativelanguage.googleapis.com',
  'api.together.xyz',
  'api.stability.ai',
  'api.openai.com',
  'freesound.org',
  'cdn.freesound.org',
]);

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--allow' && args[i + 1]) ALLOWED_HOSTS.add(args[++i]);
}

const PORT = Number(process.env.PORT || 8787);
const HOP_HEADERS = new Set(['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding']);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, allowed: [...ALLOWED_HOSTS] }));
  }
  let target;
  try {
    target = new URL(decodeURIComponent(req.url.slice(1)));
  } catch {
    res.writeHead(400);
    return res.end('Bad target URL. Use /https://host/path');
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    res.writeHead(403);
    return res.end(`Host ${target.hostname} is not allowed. Start with --allow ${target.hostname}`);
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_HEADERS.has(k.toLowerCase()) && v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      redirect: 'follow',
    });
    const out = {};
    upstream.headers.forEach((v, k) => {
      if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k) && !k.startsWith('access-control-')) out[k] = v;
    });
    res.writeHead(upstream.status, out);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
    console.log(`${req.method} ${target.href} -> ${upstream.status} (${buf.length} bytes)`);
  } catch (err) {
    console.error(err);
    res.writeHead(502);
    res.end(`Upstream error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Storyboarder proxy listening on http://localhost:${PORT}`);
  console.log(`Allowed hosts: ${[...ALLOWED_HOSTS].join(', ')}`);
});
