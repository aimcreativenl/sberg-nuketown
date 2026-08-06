/**
 * Vite starts a dedicated LAN WebSocket hub on port 8787 so it never fights
 * Vite HMR upgrades on the same HTTP server.
 * Client connects to ws://<hostname>:8787/mp
 */
import { defineConfig } from 'vite';
import http from 'node:http';
import { attachLanHost } from './server/lanRoom.js';

const LAN_PORT = Number(process.env.SBARG_LAN_PORT || 8787);

function startLanHub() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'sbarg-lan-host', path: '/mp' }));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });
  attachLanHost(server, { path: '/mp' });
  server.listen(LAN_PORT, '0.0.0.0', () => {
    console.log(`[sbarg-lan] hub ready at ws://localhost:${LAN_PORT}/mp`);
  });
  server.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      console.log(`[sbarg-lan] port ${LAN_PORT} already in use — reusing existing hub`);
      return;
    }
    console.warn('[sbarg-lan] hub failed', err);
  });
  return server;
}

export default defineConfig({
  plugins: [
    {
      name: 'sbarg-lan-host',
      configureServer() {
        startLanHub();
      },
      configurePreviewServer() {
        startLanHub();
      },
    },
  ],
  server: {
    host: true,
  },
});
