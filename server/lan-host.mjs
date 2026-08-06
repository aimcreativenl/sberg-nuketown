/**
 * Standalone multiplayer signal hub (WebSocket on /mp).
 *
 * Local:  npm run lan-host  → ws://127.0.0.1:8787/mp
 * Render: npm start         → uses process.env.PORT (required on Render)
 */
import http from 'node:http';
import os from 'node:os';
import { attachLanHost } from './lanRoom.js';

const PORT = Number(process.env.PORT || process.env.SBARG_LAN_PORT || 8787);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'sbarg-lan-host',
        path: '/mp',
        port: PORT,
      })
    );
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

attachLanHost(server, { path: '/mp' });

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  console.log(`[sbarg-signal] listening on 0.0.0.0:${PORT}  path /mp`);
  console.log(`[sbarg-signal] local:  ws://127.0.0.1:${PORT}/mp`);
  for (const ip of ips) console.log(`[sbarg-signal] lan:    ws://${ip}:${PORT}/mp`);
  if (process.env.RENDER) {
    console.log(
      '[sbarg-signal] Render detected — clients should use wss://<your-service>.onrender.com/mp'
    );
  }
});
