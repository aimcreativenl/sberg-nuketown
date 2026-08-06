/**
 * Phase 2a: spin up LAN hub, host + join over WebSocket, start → live.
 */
import http from 'node:http';
import { WebSocket } from 'ws';
import { attachLanHost } from '../server/lanRoom.js';
import { ROOM_PHASE } from '../src/net/roomLogic.js';

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function waitFor(ws, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`timeout waiting for ${type}`));
    }, timeoutMs);
    const onMsg = (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type !== type) return;
      clearTimeout(t);
      ws.off('message', onMsg);
      resolve(msg);
    };
    ws.on('message', onMsg);
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const welcomeWait = waitFor(ws, 'welcome', 3000);
    ws.once('open', () => {});
    ws.once('error', reject);
    welcomeWait.then((welcome) => resolve({ ws, welcome })).catch(reject);
  });
}

const server = http.createServer((_req, res) => {
  res.writeHead(200);
  res.end('ok');
});
const hub = attachLanHost(server, { path: '/mp' });

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `ws://127.0.0.1:${port}/mp`;

const { ws: hostWs, welcome: hostWelcome } = await connect(url);
assert(!!hostWelcome.playerId, 'host welcome');

hostWs.send(JSON.stringify({ type: 'host', name: 'Ada', modeId: 'deathmatch' }));
const hostRoom = await waitFor(hostWs, 'room');
assert(hostRoom.room?.phase === ROOM_PHASE.lobby, 'host lobby');
assert(hostRoom.room?.code?.length === 4, 'invite code');
const code = hostRoom.room.code;

const { ws: guestWs } = await connect(url);
guestWs.send(JSON.stringify({ type: 'join', code, name: 'Bob' }));
const guestRoom = await waitFor(guestWs, 'room');
assert(guestRoom.room?.players?.length === 2, 'two players in lobby');

hostWs.send(JSON.stringify({ type: 'start', seconds: 1 }));
const startMsg = await waitFor(hostWs, 'match_start', 5000);
assert(startMsg.room?.phase === ROOM_PHASE.live, 'match live');

const guestStart = await waitFor(guestWs, 'match_start', 2000).catch(() => null);
assert(!!guestStart, 'guest also got match_start');

hostWs.close();
guestWs.close();
hub.close();
await new Promise((r) => server.close(r));

const report = { ok: failures.length === 0, code, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FAIL:', failures.join('\n'));
  process.exit(1);
}
console.log('PASS: LAN WebSocket host/join/start');
process.exit(0);