/**
 * Phase 2b: Online/NAT session — LanClient lobby + WebRTC datachannel to host.
 * Signaling (offer/answer/ICE) rides the existing hub; gameplay bytes go P2P.
 */
import { LanClient } from './LanClient.js';
import { RtcLink } from './RtcLink.js';
import { defaultSignalUrl, signalUrlFromHost } from './rtcConfig.js';

export class OnlineSession {
  /**
   * @param {{
   *   onRoom?: Function,
   *   onCountdown?: Function,
   *   onMatchStart?: Function,
   *   onError?: Function,
   *   onClose?: Function,
   *   onHostLeft?: Function,
   *   onPeerOpen?: Function,
   *   onPeerMessage?: Function,
   * }} handlers
   */
  constructor(handlers = {}) {
    this.onRoom = handlers.onRoom || (() => {});
    this.onCountdown = handlers.onCountdown || (() => {});
    this.onMatchStart = handlers.onMatchStart || (() => {});
    this.onError = handlers.onError || (() => {});
    this.onClose = handlers.onClose || (() => {});
    this.onHostLeft = handlers.onHostLeft || (() => {});
    this.onPeerOpen = handlers.onPeerOpen || (() => {});
    this.onPeerMessage = handlers.onPeerMessage || (() => {});

    /** @type {LanClient|null} */
    this._lan = null;
    /** @type {Map<string, RtcLink>} remoteId → link */
    this._peers = new Map();
    /** @type {Set<string>} guests whose offer we already handled (host) */
    this._offerHandled = new Set();
    this._guestOfferSent = false;
  }

  get lan() {
    return this._lan;
  }

  get room() {
    return this._lan?.room || null;
  }

  get playerId() {
    return this._lan?.playerId || null;
  }

  get isHost() {
    return !!this._lan?.isHost;
  }

  /** @returns {number} */
  getPeerReadyCount() {
    let n = 0;
    for (const link of this._peers.values()) {
      if (link.ready) n++;
    }
    return n;
  }

  _wireLan(url) {
    this._lan = new LanClient({
      url,
      onRoom: (room) => {
        this.onRoom(room);
        this._maybeStartGuestRtc(room);
      },
      onCountdown: (msg) => this.onCountdown(msg),
      onMatchStart: (msg) => this.onMatchStart(msg),
      onError: (err) => this.onError(err),
      onClose: () => this.onClose(),
      onHostLeft: (msg) => {
        this._closeAllPeers();
        this.onHostLeft(msg);
      },
      onSignal: (msg) => this._onSignal(msg),
    });
    return this._lan;
  }

  /**
   * Host: connect signaling hub, create room, accept guest RTC offers.
   * @param {{ name?: string, modeId?: string, signalUrl?: string }} opts
   */
  async host({ name = 'Host', modeId = 'deathmatch', signalUrl } = {}) {
    this.disconnect();
    const url = signalUrl || defaultSignalUrl();
    const lan = this._wireLan(url);
    await lan.host({ name, modeId });
  }

  /**
   * Guest: connect to signal (optional hostAddress), join room, then RTC to host.
   * @param {{ code: string, name?: string, hostAddress?: string }} opts
   */
  async join({ code, name = 'Guest', hostAddress } = {}) {
    this.disconnect();
    const url = hostAddress
      ? signalUrlFromHost(hostAddress)
      : defaultSignalUrl();
    const lan = this._wireLan(url);
    await lan.join({ code, name });
    // Room may already be set via onRoom during join reply; kick guest RTC if so
    if (lan.room) this._maybeStartGuestRtc(lan.room);
  }

  setMode(modeId) {
    this._lan?.setMode(modeId);
  }

  start(seconds = 10) {
    this._lan?.start(seconds);
  }

  leave() {
    this._closeAllPeers();
    this._lan?.leave();
  }

  disconnect() {
    this._closeAllPeers();
    this._guestOfferSent = false;
    this._offerHandled.clear();
    try {
      this._lan?.disconnect();
    } catch (_) {}
    this._lan = null;
  }

  /**
   * Send on all open peer channels (host) or to host (guest). Future gameplay.
   * @param {object} obj
   */
  sendGame(obj) {
    if (this.isHost) {
      for (const link of this._peers.values()) {
        if (link.ready) link.send(obj);
      }
      return;
    }
    const hostId = this.room?.hostId;
    if (!hostId) return;
    const link = this._peers.get(hostId);
    if (link?.ready) link.send(obj);
  }

  _closeAllPeers() {
    for (const link of this._peers.values()) {
      try {
        link.close();
      } catch (_) {}
    }
    this._peers.clear();
  }

  _maybeStartGuestRtc(room) {
    if (!this._lan || this._lan.isHost) return;
    if (this._guestOfferSent) return;
    const hostId = room?.hostId;
    if (!hostId || hostId === this._lan.playerId) return;
    this._guestOfferSent = true;
    void this._guestConnectToHost(hostId);
  }

  async _guestConnectToHost(hostId) {
    const lan = this._lan;
    if (!lan) return;

    const link = new RtcLink({
      isHost: false,
      remoteId: hostId,
      onMessage: (obj) => this.onPeerMessage(obj, hostId),
      onOpen: () => this.onPeerOpen(hostId),
      onClose: () => {},
      onIceCandidate: (candidate) => {
        if (!candidate.candidate) return;
        try {
          lan.sendSignal({
            to: hostId,
            payload: { kind: 'ice', candidate },
          });
        } catch (_) {}
      },
    });
    this._peers.set(hostId, link);

    try {
      const sdp = await link.createOffer();
      lan.sendSignal({
        to: hostId,
        payload: { kind: 'offer', sdp },
      });
    } catch (err) {
      this.onError(err?.message || String(err));
      link.close();
      this._peers.delete(hostId);
      this._guestOfferSent = false;
    }
  }

  /**
   * @param {{ from: string, payload: any }} msg
   */
  async _onSignal(msg) {
    const lan = this._lan;
    if (!lan || !msg?.payload) return;
    const from = msg.from;
    const { kind, sdp, candidate } = msg.payload;

    if (kind === 'offer' && lan.isHost) {
      if (this._peers.has(from) || this._offerHandled.has(from)) return;
      this._offerHandled.add(from);
      await this._hostAcceptOffer(from, sdp);
      return;
    }

    if (kind === 'answer' && !lan.isHost) {
      const link = this._peers.get(from) || this._peers.get(lan.room?.hostId);
      if (!link) return;
      try {
        await link.acceptAnswer(sdp);
      } catch (err) {
        this.onError(err?.message || String(err));
      }
      return;
    }

    if (kind === 'ice') {
      const link = this._peers.get(from);
      if (!link) return;
      try {
        await link.addIceCandidate(candidate);
      } catch (_) {
        /* ignore stale ICE */
      }
    }
  }

  async _hostAcceptOffer(remoteId, sdp) {
    const lan = this._lan;
    if (!lan) return;

    const link = new RtcLink({
      isHost: true,
      remoteId,
      onMessage: (obj) => this.onPeerMessage(obj, remoteId),
      onOpen: () => this.onPeerOpen(remoteId),
      onClose: () => {
        this._peers.delete(remoteId);
        this._offerHandled.delete(remoteId);
      },
      onIceCandidate: (c) => {
        if (!c.candidate) return;
        try {
          lan.sendSignal({
            to: remoteId,
            payload: { kind: 'ice', candidate: c },
          });
        } catch (_) {}
      },
    });
    this._peers.set(remoteId, link);

    try {
      const answer = await link.acceptOffer(sdp);
      lan.sendSignal({
        to: remoteId,
        payload: { kind: 'answer', sdp: answer },
      });
    } catch (err) {
      this.onError(err?.message || String(err));
      link.close();
      this._peers.delete(remoteId);
      this._offerHandled.delete(remoteId);
    }
  }
}
