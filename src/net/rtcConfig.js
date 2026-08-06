/**
 * WebRTC / signaling defaults for Phase 2b (online/NAT join).
 * Production: set VITE_SBARG_SIGNAL_URL=wss://your-hub.onrender.com/mp at build time.
 * Public STUN only — no paid TURN required for v1.
 */

/** Google public STUN servers. */
export const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const DEFAULT_SIGNAL_PORT = 8787;

/**
 * Build-time signal hub (Vercel → Render). Empty in local dev unless .env is set.
 * @returns {string}
 */
export function envSignalUrl() {
  try {
    const v = import.meta.env?.VITE_SBARG_SIGNAL_URL;
    return v ? String(v).trim() : '';
  } catch {
    return '';
  }
}

/** True when the client was built with a remote signal hub (Vercel deploy). */
export function hasRemoteSignalHub() {
  if (typeof window !== 'undefined' && window.__SBARG_SIGNAL_URL__) return true;
  return !!envSignalUrl();
}

/**
 * @returns {RTCConfiguration}
 */
export function getRtcConfiguration() {
  const iceServers =
    (typeof window !== 'undefined' && window.__SBARG_ICE_SERVERS__) || DEFAULT_ICE_SERVERS;
  return { iceServers };
}

/**
 * Build `ws://` / `wss://` URL to `/mp` from a host string.
 * @param {string} [host]
 * @param {number} [port]
 * @returns {string}
 */
export function signalUrlFromHost(host, port) {
  const trimmed = String(host || '').trim();
  if (!trimmed) return defaultSignalUrl();

  let rest = trimmed.replace(/^(ws|wss|http|https):\/\//i, '');
  const slash = rest.indexOf('/');
  if (slash >= 0) rest = rest.slice(0, slash);

  let hostname = rest;
  let resolvedPort = port != null ? Number(port) : DEFAULT_SIGNAL_PORT;

  const colon = rest.lastIndexOf(':');
  if (colon > 0 && rest.indexOf(']') < 0) {
    const maybePort = rest.slice(colon + 1);
    if (/^\d+$/.test(maybePort)) {
      hostname = rest.slice(0, colon);
      if (port == null) resolvedPort = Number(maybePort);
    }
  } else if (rest.startsWith('[') && rest.includes(']:')) {
    const end = rest.indexOf(']:');
    hostname = rest.slice(0, end + 1);
    const maybePort = rest.slice(end + 2);
    if (/^\d+$/.test(maybePort) && port == null) resolvedPort = Number(maybePort);
  }

  // Render / hosted hubs: always wss on 443 path /mp (no :8787)
  if (hostname.includes('onrender.com')) {
    return `wss://${hostname}/mp`;
  }

  let wsProto = 'ws:';
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    wsProto = 'wss:';
  }
  return `${wsProto}//${hostname}:${resolvedPort}/mp`;
}

/**
 * Default signaling URL priority:
 * 1. window.__SBARG_SIGNAL_URL__ (runtime override)
 * 2. VITE_SBARG_SIGNAL_URL (Vercel build env → Render hub)
 * 3. Local/LAN: page hostname :8787/mp
 * @returns {string}
 */
export function defaultSignalUrl() {
  if (typeof window !== 'undefined' && window.__SBARG_SIGNAL_URL__) {
    return String(window.__SBARG_SIGNAL_URL__);
  }
  const fromEnv = envSignalUrl();
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8787/mp';
  const { protocol, hostname } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  const p = Number(window.__SBARG_LAN_PORT__) || DEFAULT_SIGNAL_PORT;
  return `${wsProto}//${hostname}:${p}/mp`;
}
