/**
 * Browser client for the LAN / signal hub (`/mp` WebSocket).
 * Phase 2a lobby + Phase 2b signal relay (`signal`, `host_left`, `set_mode`).
 */
import { normalizeInviteCode } from './roomLogic.js';
import { defaultSignalUrl, signalUrlFromHost } from './rtcConfig.js';

/** @deprecated prefer signalUrlFromHost — kept as a clear alias */
export function wsUrlForHost(host, port) {
  return signalUrlFromHost(host, port);
}

export class LanClient {
  /**
   * @param {{
   *   url?: string,
   *   onRoom?: Function,
   *   onCountdown?: Function,
   *   onMatchStart?: Function,
   *   onError?: Function,
   *   onClose?: Function,
   *   onSignal?: Function,
   *   onHostLeft?: Function,
   * }} handlers
   */
  constructor(handlers = {}) {
    this.url = handlers.url || defaultSignalUrl();
    this.onRoom = handlers.onRoom || (() => {});
    this.onCountdown = handlers.onCountdown || (() => {});
    this.onMatchStart = handlers.onMatchStart || (() => {});
    this.onError = handlers.onError || (() => {});
    this.onClose = handlers.onClose || (() => {});
    this.onSignal = handlers.onSignal || (() => {});
    this.onHostLeft = handlers.onHostLeft || (() => {});
    this.ws = null;
    this.playerId = null;
    this.room = null;
    this._openPromise = null;
  }

  /** @returns {Promise<void>} */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this._openPromise) return this._openPromise;
    this._openPromise = new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch (_) {}
        this._openPromise = null;
        reject(new Error('LAN host not reachable — is `npm run dev` or `npm run lan-host` running?'));
      }, 4000);

      ws.onopen = () => {
        /* wait for welcome */
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.type === 'welcome') {
          this.playerId = msg.playerId;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this._openPromise = null;
            resolve();
          }
          return;
        }
        if (msg.type === 'room') {
          this.room = msg.room;
          this.onRoom(msg.room);
          return;
        }
        if (msg.type === 'countdown') {
          if (this.room) {
            this.room.phase = msg.phase;
            this.room.countdown = msg.countdown;
          }
          this.onCountdown(msg);
          return;
        }
        if (msg.type === 'match_start') {
          this.room = msg.room || this.room;
          this.onMatchStart(msg);
          return;
        }
        if (msg.type === 'signal') {
          this.onSignal(msg);
          return;
        }
        if (msg.type === 'host_left') {
          this.room = null;
          this.onHostLeft(msg);
          return;
        }
        if (msg.type === 'error') {
          this.onError(msg.error || 'Unknown error');
        }
      };

      ws.onerror = () => {
        /* onclose / timeout handle failure */
      };

      ws.onclose = () => {
        this.ws = null;
        this._openPromise = null;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('Disconnected from LAN host'));
        }
        this.onClose();
      };
    });
    return this._openPromise;
  }

  _send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }
    this.ws.send(JSON.stringify(obj));
  }

  async host({ name = 'Host', modeId = 'deathmatch' } = {}) {
    await this.connect();
    this._send({ type: 'host', name, modeId });
  }

  async join({ code, name = 'Guest' }) {
    await this.connect();
    this._send({ type: 'join', code: normalizeInviteCode(code), name });
  }

  start(seconds = 10) {
    this._send({ type: 'start', seconds });
  }

  /**
   * Relay WebRTC / custom signal to a peer (or room host if `to` omitted on server).
   * @param {{ to?: string, payload: object }} opts
   */
  sendSignal({ to, payload }) {
    this._send({ type: 'signal', to, payload });
  }

  /** Host-only: change lobby mode. */
  setMode(modeId) {
    this._send({ type: 'set_mode', modeId });
  }

  leave() {
    try {
      this._send({ type: 'leave' });
    } catch (_) {}
    this.room = null;
  }

  disconnect() {
    this.leave();
    try {
      this.ws?.close();
    } catch (_) {}
    this.ws = null;
    this.playerId = null;
    this.room = null;
  }

  get isHost() {
    return !!(this.room && this.playerId && this.room.hostId === this.playerId);
  }
}
