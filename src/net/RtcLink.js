/**
 * Minimal WebRTC DataChannel helper (browser). Safe no-ops / clear errors in Node.
 */
import { getRtcConfiguration } from './rtcConfig.js';

function rtcUnavailable() {
  return typeof RTCPeerConnection === 'undefined';
}

export class RtcLink {
  /**
   * @param {{
   *   isHost: boolean,
   *   remoteId?: string,
   *   onMessage?: (obj: any) => void,
   *   onOpen?: () => void,
   *   onClose?: () => void,
   *   onIceCandidate?: (c: { candidate: string|null, sdpMid: string|null, sdpMLineIndex: number|null }) => void,
   *   iceServers?: RTCIceServer[],
   * }} opts
   */
  constructor(opts) {
    this.isHost = !!opts.isHost;
    this.remoteId = opts.remoteId || null;
    this.onMessage = opts.onMessage || (() => {});
    this.onOpen = opts.onOpen || (() => {});
    this.onClose = opts.onClose || (() => {});
    this.onIceCandidate = opts.onIceCandidate || (() => {});
    this._iceServers = opts.iceServers;
    /** @type {RTCPeerConnection|null} */
    this.pc = null;
    /** @type {RTCDataChannel|null} */
    this.channel = null;
    this._ready = false;
    this._closed = false;
    this._remoteSet = false;
    /** @type {RTCIceCandidateInit[]} */
    this._pendingIce = [];
  }

  get ready() {
    return this._ready && !!this.channel && this.channel.readyState === 'open';
  }

  _ensurePc() {
    if (rtcUnavailable()) {
      throw new Error('WebRTC (RTCPeerConnection) is not available in this environment');
    }
    if (this.pc) return this.pc;
    const config = this._iceServers
      ? { iceServers: this._iceServers }
      : getRtcConfiguration();
    const pc = new RTCPeerConnection(config);
    this.pc = pc;

    pc.onicecandidate = (ev) => {
      if (this._closed) return;
      const c = ev.candidate;
      if (!c) {
        this.onIceCandidate({ candidate: null, sdpMid: null, sdpMLineIndex: null });
        return;
      }
      this.onIceCandidate({
        candidate: c.candidate,
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
      });
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._ready = false;
        this.onClose();
      }
    };

    pc.ondatachannel = (ev) => {
      this._bindChannel(ev.channel);
    };

    return pc;
  }

  /** @param {RTCDataChannel} ch */
  _bindChannel(ch) {
    this.channel = ch;
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => {
      this._ready = true;
      this.onOpen();
    };
    ch.onclose = () => {
      this._ready = false;
      this.onClose();
    };
    ch.onerror = () => {
      /* surface via onClose if channel dies */
    };
    ch.onmessage = (ev) => {
      let obj;
      try {
        obj = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.onMessage(obj);
    };
  }

  /**
   * Guest: create offer + ordered datachannel `sbarg`.
   * @returns {Promise<RTCSessionDescriptionInit>}
   */
  async createOffer() {
    const pc = this._ensurePc();
    const ch = pc.createDataChannel('sbarg', { ordered: true });
    this._bindChannel(ch);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return pc.localDescription.toJSON ? pc.localDescription.toJSON() : {
      type: pc.localDescription.type,
      sdp: pc.localDescription.sdp,
    };
  }

  /**
   * Host: accept remote offer, return answer.
   * @param {RTCSessionDescriptionInit} offer
   * @returns {Promise<RTCSessionDescriptionInit>}
   */
  async acceptOffer(offer) {
    const pc = this._ensurePc();
    await pc.setRemoteDescription(offer);
    this._remoteSet = true;
    await this._flushIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return pc.localDescription.toJSON ? pc.localDescription.toJSON() : {
      type: pc.localDescription.type,
      sdp: pc.localDescription.sdp,
    };
  }

  /**
   * Guest: apply host answer.
   * @param {RTCSessionDescriptionInit} answer
   */
  async acceptAnswer(answer) {
    const pc = this._ensurePc();
    await pc.setRemoteDescription(answer);
    this._remoteSet = true;
    await this._flushIce();
  }

  async _flushIce() {
    const pc = this.pc;
    if (!pc) return;
    const pending = this._pendingIce.splice(0);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (_) {
        /* ignore stale */
      }
    }
  }

  /**
   * @param {RTCIceCandidateInit|null} candidate
   */
  async addIceCandidate(candidate) {
    if (!candidate || candidate.candidate == null) return;
    if (!this._remoteSet) {
      this._pendingIce.push(candidate);
      return;
    }
    const pc = this._ensurePc();
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      // Ignore late/duplicate candidates after close
      if (!this._closed) throw err;
    }
  }

  /** JSON over the datachannel when open. */
  send(obj) {
    if (!this.ready) return false;
    this.channel.send(JSON.stringify(obj));
    return true;
  }

  close() {
    this._closed = true;
    this._ready = false;
    try {
      this.channel?.close();
    } catch (_) {}
    try {
      this.pc?.close();
    } catch (_) {}
    this.channel = null;
    this.pc = null;
  }
}
