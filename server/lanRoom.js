/**
 * Shared LAN / signal room hub — attach to any Node HTTP server (Vite or standalone).
 * Protocol (JSON text frames):
 *   client → { type: 'host', name?, modeId? }
 *   client → { type: 'join', code, name? }
 *   client → { type: 'start' }           // host only
 *   client → { type: 'leave' }
 *   client → { type: 'ping' }
 *   client → { type: 'signal', to?, payload }   // Phase 2b WebRTC relay
 *   client → { type: 'set_mode', modeId }       // host only, lobby only
 *   server → { type: 'welcome', playerId }
 *   server → { type: 'room', room }
 *   server → { type: 'error', error }
 *   server → { type: 'countdown', countdown, phase }
 *   server → { type: 'match_start' }     // when phase becomes live
 *   server → { type: 'signal', from, payload }
 *   server → { type: 'host_left', reason }      // before room delete
 */
import { WebSocketServer } from 'ws';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  hostStartMatch,
  tickRoomCountdown,
  publicRoomState,
  normalizeInviteCode,
  setRoomMode,
  ROOM_PHASE,
} from '../src/net/roomLogic.js';

/**
 * @param {import('node:http').Server} httpServer
 * @param {{ path?: string }} [opts]
 */
export function attachLanHost(httpServer, opts = {}) {
  const path = opts.path || '/mp';
  const wss = new WebSocketServer({ noServer: true });
  /** @type {Map<string, object>} */
  const roomsByCode = new Map();
  /** @type {Map<object, { playerId: string, code: string|null }>} */
  const clients = new Map();
  let idSeq = 1;

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  const broadcastRoom = (code) => {
    const room = roomsByCode.get(code);
    if (!room) return;
    const payload = JSON.stringify({ type: 'room', room: publicRoomState(room) });
    for (const [ws, meta] of clients) {
      if (meta.code === code && ws.readyState === 1) ws.send(payload);
    }
  };

  const send = (ws, obj) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  /** Notify remaining players that the host disconnected (before room delete). */
  const notifyHostLeft = (code, exceptWs) => {
    const payload = JSON.stringify({ type: 'host_left', reason: 'host_disconnected' });
    for (const [cws, cmeta] of clients) {
      if (cmeta.code !== code) continue;
      if (exceptWs && cws === exceptWs) continue;
      if (cws.readyState === 1) cws.send(payload);
    }
  };

  const clearRoomBindings = (code) => {
    for (const [, cmeta] of clients) {
      if (cmeta.code === code) cmeta.code = null;
    }
  };

  /**
   * Apply leave; if host left with other players in the room,
   * broadcast host_left before deleting.
   */
  const handlePlayerLeave = (ws, meta) => {
    if (!meta?.code) return;
    const code = meta.code;
    const room = roomsByCode.get(code);
    if (!room) {
      meta.code = null;
      return;
    }
    const hadOthers = room.players.some((p) => p.id !== meta.playerId);
    const result = leaveRoom(room, meta.playerId);
    meta.code = null;
    if (!result.ok) return;

    if (result.hostLeft && hadOthers) {
      // Spec: host_left to remaining clients BEFORE delete; room broadcast still useful
      notifyHostLeft(code, ws);
      broadcastRoom(code);
      clearRoomBindings(code);
      roomsByCode.delete(code);
      return;
    }

    broadcastRoom(code);
    if (result.hostLeft || room.phase === ROOM_PHASE.ended) {
      roomsByCode.delete(code);
    }
  };

  // Host-side countdown ticker (~4 Hz)
  const tickTimer = setInterval(() => {
    const dt = 0.25;
    for (const [code, room] of roomsByCode) {
      if (room.phase !== ROOM_PHASE.countdown) continue;
      const before = room.phase;
      tickRoomCountdown(room, dt);
      const payload = JSON.stringify({
        type: 'countdown',
        countdown: room.countdown,
        phase: room.phase,
      });
      for (const [ws, meta] of clients) {
        if (meta.code === code && ws.readyState === 1) ws.send(payload);
      }
      if (before === ROOM_PHASE.countdown && room.phase === ROOM_PHASE.live) {
        const startMsg = JSON.stringify({ type: 'match_start', room: publicRoomState(room) });
        for (const [ws, meta] of clients) {
          if (meta.code === code && ws.readyState === 1) ws.send(startMsg);
        }
      }
      if (room.phase === ROOM_PHASE.ended || !room.players.length) {
        roomsByCode.delete(code);
      }
    }
  }, 250);

  wss.on('connection', (ws) => {
    const playerId = `p${idSeq++}`;
    clients.set(ws, { playerId, code: null });
    send(ws, { type: 'welcome', playerId });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        send(ws, { type: 'error', error: 'Invalid JSON' });
        return;
      }
      const meta = clients.get(ws);
      if (!meta) return;

      if (msg.type === 'ping') {
        send(ws, { type: 'pong', t: Date.now() });
        return;
      }

      if (msg.type === 'host') {
        // Leave previous room if any
        if (meta.code) {
          handlePlayerLeave(ws, meta);
        }
        let code;
        do {
          const room = createRoom({
            hostId: meta.playerId,
            hostName: msg.name || 'Host',
            modeId: msg.modeId || 'deathmatch',
          });
          code = room.code;
          if (!roomsByCode.has(code)) {
            roomsByCode.set(code, room);
            meta.code = code;
            send(ws, { type: 'room', room: publicRoomState(room) });
            return;
          }
        } while (true);
      }

      if (msg.type === 'join') {
        const code = normalizeInviteCode(msg.code);
        const room = roomsByCode.get(code);
        const result = joinRoom(room, {
          playerId: meta.playerId,
          name: msg.name || 'Guest',
        });
        if (!result.ok) {
          send(ws, { type: 'error', error: result.error });
          return;
        }
        meta.code = code;
        broadcastRoom(code);
        // Late join into live match
        if (result.late && room.phase === ROOM_PHASE.live) {
          send(ws, { type: 'match_start', room: publicRoomState(room), late: true });
        }
        return;
      }

      if (msg.type === 'start') {
        const room = meta.code ? roomsByCode.get(meta.code) : null;
        const result = hostStartMatch(room, meta.playerId, msg.seconds ?? 10);
        if (!result.ok) {
          send(ws, { type: 'error', error: result.error });
          return;
        }
        broadcastRoom(meta.code);
        return;
      }

      if (msg.type === 'set_mode') {
        const room = meta.code ? roomsByCode.get(meta.code) : null;
        const result = setRoomMode(room, meta.playerId, msg.modeId);
        if (!result.ok) {
          send(ws, { type: 'error', error: result.error });
          return;
        }
        broadcastRoom(meta.code);
        return;
      }

      if (msg.type === 'signal') {
        if (!meta.code) {
          send(ws, { type: 'error', error: 'Not in a room' });
          return;
        }
        const room = roomsByCode.get(meta.code);
        if (!room) {
          send(ws, { type: 'error', error: 'Room not found' });
          return;
        }
        let targetId = msg.to;
        if (!targetId) {
          if (meta.playerId === room.hostId) {
            send(ws, { type: 'error', error: 'signal requires `to` when sent by host' });
            return;
          }
          targetId = room.hostId;
        }
        if (!room.players.some((p) => p.id === targetId)) {
          send(ws, { type: 'error', error: 'Signal target not in room' });
          return;
        }
        if (targetId === meta.playerId) {
          send(ws, { type: 'error', error: 'Cannot signal self' });
          return;
        }
        let targetWs = null;
        for (const [cws, cmeta] of clients) {
          if (cmeta.playerId === targetId && cmeta.code === meta.code) {
            targetWs = cws;
            break;
          }
        }
        if (!targetWs || targetWs.readyState !== 1) {
          send(ws, { type: 'error', error: 'Signal target unreachable' });
          return;
        }
        send(targetWs, {
          type: 'signal',
          from: meta.playerId,
          payload: msg.payload,
        });
        return;
      }

      if (msg.type === 'leave') {
        handlePlayerLeave(ws, meta);
        return;
      }

      send(ws, { type: 'error', error: `Unknown type: ${msg.type}` });
    });

    ws.on('close', () => {
      const meta = clients.get(ws);
      clients.delete(ws);
      if (!meta?.code) return;
      handlePlayerLeave(ws, meta);
    });
  });

  return {
    path,
    close() {
      clearInterval(tickTimer);
      for (const ws of clients.keys()) {
        try {
          ws.terminate();
        } catch (_) {}
      }
      clients.clear();
      roomsByCode.clear();
      wss.close();
    },
    _roomsByCode: roomsByCode,
  };
}
