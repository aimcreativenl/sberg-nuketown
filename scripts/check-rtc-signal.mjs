/**
 * Phase 2b: signal relay + set_mode + host_left over the LAN hub.
 * (WebRTC datachannel itself is browser-only; this covers signaling protocol.)
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
const hostId = hostWelcome.playerId;

hostWs.send(JSON.stringify({ type: 'host', name: 'Ada', modeId: 'deathmatch' }));
const hostRoom = await waitFor(hostWs, 'room');
assert(hostRoom.room?.phase === ROOM_PHASE.lobby, 'host lobby');
const code = hostRoom.room.code;

const { ws: guestWs, welcome: guestWelcome } = await connect(url);
const guestId = guestWelcome.playerId;
const hostJoinedWait = waitFor(hostWs, 'room');
guestWs.send(JSON.stringify({ type: 'join', code, name: 'Bob' }));
const guestRoom = await waitFor(guestWs, 'room');
assert(guestRoom.room?.players?.length === 2, 'two players in lobby');
await hostJoinedWait;

// Guest → host signal (offer shape)
const offerPayload = { kind: 'offer', sdp: { type: 'offer', sdp: 'v=0-fake' } };
const hostSignalWait = waitFor(hostWs, 'signal');
guestWs.send(
  JSON.stringify({
    type: 'signal',
    to: hostId,
    payload: offerPayload,
  }),
);
const hostSignal = await hostSignalWait;
assert(hostSignal.from === guestId, `signal from guest got ${hostSignal.from}`);
assert(hostSignal.payload?.kind === 'offer', 'signal kind offer');
assert(hostSignal.payload?.sdp?.type === 'offer', 'signal sdp offer');

// Host → guest signal (answer)
const answerPayload = { kind: 'answer', sdp: { type: 'answer', sdp: 'v=0-fake-ans' } };
const guestSignalWait = waitFor(guestWs, 'signal');
hostWs.send(
  JSON.stringify({
    type: 'signal',
    to: guestId,
    payload: answerPayload,
  }),
);
const guestSignal = await guestSignalWait;
assert(guestSignal.from === hostId, 'answer from host');
assert(guestSignal.payload?.kind === 'answer', 'answer kind');

// Host set_mode → tdm (setRoomMode is in roomLogic)
const hostModeWait = waitFor(hostWs, 'room');
const guestModeWait = waitFor(guestWs, 'room');
hostWs.send(JSON.stringify({ type: 'set_mode', modeId: 'tdm' }));
const modeRoom = await hostModeWait;
assert(modeRoom.room?.modeId === 'tdm', `modeId tdm got ${modeRoom.room?.modeId}`);
const guestModeRoom = await guestModeWait;
assert(guestModeRoom.room?.modeId === 'tdm', 'guest saw tdm');

// Host leave → guest gets host_left
const hostLeftWait = waitFor(guestWs, 'host_left', 3000);
hostWs.send(JSON.stringify({ type: 'leave' }));
const hostLeft = await hostLeftWait.catch((e) => ({ error: e.message }));
assert(hostLeft?.type === 'host_left', `guest host_left got ${JSON.stringify(hostLeft)}`);
assert(hostLeft?.reason === 'host_disconnected', 'host_left reason');

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
console.log('PASS: RTC signal relay / set_mode / host_left');
process.exit(0);
