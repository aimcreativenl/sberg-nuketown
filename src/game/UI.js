import { GUN_ICONS, KILL_LIMIT } from './constants.js';
import { hasRemoteSignalHub } from '../net/rtcConfig.js';

export class GameUI {
  constructor() {
    const el = (id) =>
      typeof document !== 'undefined' ? document.getElementById(id) : null;
    this.els = {
      start: el('start-screen'),
      hud: el('hud'),
      kills: el('stat-kills'),
      goal: el('stat-goal'),
      goalLabel: el('stat-goal-label'),
      kd: el('stat-kd'),
      fun: el('stat-fun'),
      killFeed: el('kill-feed'),
      weaponName: el('weapon-name'),
      weaponTier: el('weapon-tier'),
      healthFill: el('health-fill'),
      healthText: el('health-text'),
      ammoCurrent: el('ammo-current'),
      ammoMag: el('ammo-mag'),
      ammoWrap: el('ammo-wrap'),
      crosshair: el('crosshair'),
      hitmarker: el('hitmarker'),
      damageNumbers: el('damage-numbers'),
      streak: el('streak-callout'),
      pickup: el('pickup-toast'),
      death: el('death-overlay'),
      deathTitle: el('death-title'),
      deathBy: el('death-by'),
      deathTimer: el('death-timer'),
      pause: el('pause-overlay'),
      victory: el('victory-overlay'),
      victoryTitle: el('victory-title'),
      victorySub: el('victory-sub'),
      scoreboard: el('scoreboard'),
      miniScoreboard: el('mini-scoreboard'),
      miniScoreboardBody: el('mini-scoreboard-body'),
      miniScoreboardTitle: el('mini-sb-title'),
      flagCarry: el('flag-carry'),
      matchCallout: el('match-callout'),
      join: el('join-screen'),
      lobby: el('lobby-screen'),
    };
    this._hitTimer = 0;
    this._streakTimer = 0;
    this._killFlashTimer = 0;
    this._killConfirmTimer = 0;
    /** @type {number} performance.now() of last hitmarker (testable without DOM) */
    this.lastHitmarkerAt = 0;
    /** @type {number} performance.now() of last kill flash */
    this.lastKillFlashAt = 0;
    /** @type {number} performance.now() of last kill confirm */
    this.lastKillConfirmAt = 0;
    this.lastHitWasHeadshot = false;
    /** @type {string|null} last countdown / FIGHT label */
    this.lastMatchCallout = null;
    /** @type {number} */
    this.lastFightCalloutAt = 0;
    this._calloutKey = null;
  }

  showStart() {
    this.els.start?.classList.remove('hidden');
    this.els.hud?.classList.add('hidden');
    this.els.death?.classList.add('hidden');
    this.els.pause?.classList.add('hidden');
    this.els.victory?.classList.add('hidden');
    this.hideJoin();
    this.hideLobby();
    this.hideMatchCallout();
    // Reset how-to panel each visit
    document.getElementById('start-how')?.classList.add('hidden');
    document.getElementById('btn-how')?.setAttribute('aria-expanded', 'false');
  }

  showJoin() {
    this.els.start?.classList.add('hidden');
    this.els.lobby?.classList.add('hidden');
    this.els.join?.classList.remove('hidden');
    this.setJoinError('');
    // Production (Vercel→Render): invite code is enough; soften LAN host-address UI
    {
      const remote = hasRemoteSignalHub();
      const hostField = document.getElementById('join-host-input')?.closest('.lobby-field');
      const hostHint = document.getElementById('join-host-hint');
      if (hostField) hostField.classList.toggle('hidden', remote);
      if (hostHint) {
        if (remote) {
          hostHint.classList.remove('hidden');
          hostHint.textContent =
            'Online hub ready — just enter the invite code from your host.';
        } else {
          hostHint.classList.remove('hidden');
          hostHint.textContent =
            "Leave empty for same Wi‑Fi (LAN); fill for online join to host's machine.";
        }
      }
    }
    const input = document.getElementById('join-code-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
  }

  hideJoin() {
    this.els.join?.classList.add('hidden');
    this.setJoinError('');
  }

  setJoinError(msg) {
    const el = document.getElementById('join-error');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  /**
   * @param {{ code: string, modeId?: string, players?: Array<{id:string,name:string,isHost?:boolean}>, isHost?: boolean, status?: string }} state
   */
  showLobby(state = {}) {
    this.els.start?.classList.add('hidden');
    this.els.join?.classList.add('hidden');
    this.els.hud?.classList.add('hidden');
    this.els.lobby?.classList.remove('hidden');
    this.updateLobby(state);
  }

  hideLobby() {
    this.els.lobby?.classList.add('hidden');
    this.setLobbyError('');
  }

  /**
   * @param {{ code?: string, modeId?: string, players?: Array<{id:string,name:string,isHost?:boolean,team?:string}>, isHost?: boolean, status?: string }} state
   */
  updateLobby(state = {}) {
    const codeEl = document.getElementById('lobby-code');
    if (codeEl && state.code) codeEl.textContent = state.code;
    const labels = {
      deathmatch: 'Deathmatch',
      tdm: 'Team Deathmatch',
      ctf: 'Capture the Flag',
      pubg: 'Battle Royale',
    };
    const modeEl = document.getElementById('lobby-mode');
    const modeField = document.getElementById('lobby-mode-field');
    const modeSelect = document.getElementById('lobby-mode-select');
    if (state.isHost != null) {
      const isHost = !!state.isHost;
      if (modeField) modeField.classList.toggle('hidden', !isHost);
      if (modeEl) modeEl.classList.toggle('hidden', isHost);
      const startBtn = document.getElementById('btn-lobby-start');
      if (startBtn) startBtn.classList.toggle('hidden', !isHost);
    }
    if (modeEl && state.modeId) {
      modeEl.textContent = labels[state.modeId] || state.modeId;
    }
    if (modeSelect && state.modeId && modeSelect.value !== state.modeId) {
      modeSelect.value = state.modeId;
    }
    const list = document.getElementById('lobby-players');
    if (list && state.players) {
      list.innerHTML = '';
      for (const p of state.players) {
        const li = document.createElement('li');
        const teamTag = p.team ? ` [${p.team}]` : '';
        li.textContent = p.isHost ? `${p.name} (host)${teamTag}` : `${p.name}${teamTag}`;
        if (p.isHost) li.classList.add('is-host');
        if (p.team === 'alpha' || p.team === 'bravo') li.classList.add(`team-${p.team}`);
        list.appendChild(li);
      }
    }
    const status = document.getElementById('lobby-status');
    if (status && state.status != null) status.textContent = state.status;
  }

  /** In-match / lobby banner when the host disconnects (Phase 2c). */
  showHostLeft(message = 'Host left — match ended') {
    this.setLobbyError(message);
    this.showMatchCallout('HOST LEFT');
  }

  setLobbyError(msg) {
    const el = document.getElementById('lobby-error');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  showHUD() {
    this.els.start?.classList.add('hidden');
    this.els.hud?.classList.remove('hidden');
    this.els.victory?.classList.add('hidden');
    this.els.pause?.classList.add('hidden');
  }

  /**
   * Show 3 / 2 / 1 / FIGHT! center callout.
   * @param {string} text
   * @param {{ fight?: boolean }} [opts]
   */
  showMatchCallout(text, opts = {}) {
    const label = String(text || '');
    this.lastMatchCallout = label;
    if (label === 'FIGHT!' || opts.fight) {
      this.lastFightCalloutAt =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
    const el = this.els.matchCallout;
    if (!el) return;
    // Retrigger animation when number changes
    if (this._calloutKey !== label) {
      el.classList.add('hidden');
      void el.offsetWidth;
      this._calloutKey = label;
    }
    el.textContent = label;
    el.classList.toggle('fight', !!opts.fight || label === 'FIGHT!');
    el.classList.remove('hidden');
  }

  hideMatchCallout() {
    this.els.matchCallout?.classList.add('hidden');
    this._calloutKey = null;
  }

  /**
   * @param {object} player
   * @param {{ modeId?: string, teamKills?: { alpha?: number, bravo?: number }|null, goalLimit?: number }} [match]
   */
  updateStats(player, match = {}) {
    this.els.kills.textContent = String(player.kills);
    const modeId = match.modeId || 'deathmatch';
    const teamKills = match.teamKills;
    const captures = match.captures;
    const limit = match.goalLimit || KILL_LIMIT;
    if (this.els.goalLabel) {
      this.els.goalLabel.textContent =
        modeId === 'pubg'
          ? 'ALIVE'
          : modeId === 'ctf' && captures
            ? 'CAPS'
            : modeId === 'tdm' && teamKills
              ? 'TEAM'
              : 'GOAL';
    }
    if (this.els.goal) {
      if (modeId === 'pubg') {
        this.els.goal.textContent = String(match.aliveCount ?? 0);
      } else if (modeId === 'ctf' && captures) {
        this.els.goal.textContent = `${captures.alpha ?? 0}–${captures.bravo ?? 0}`;
      } else if (modeId === 'tdm' && teamKills) {
        this.els.goal.textContent = `${teamKills.alpha ?? 0}–${teamKills.bravo ?? 0}`;
      } else {
        this.els.goal.textContent = `${player.kills}/${limit}`;
      }
    }
    this.els.kd.textContent = player.kd;
    this.els.fun.textContent = String(player.funPoints);
    const pct = Math.max(0, (player.health / player.maxHealth) * 100);
    this.els.healthFill.style.width = `${pct}%`;
    this.els.healthText.textContent = String(Math.ceil(player.health));
    if (pct < 30) this.els.hud.classList.add('low-hp');
    else this.els.hud.classList.remove('low-hp');
  }

  updateWeapon(weapon, index, ammo) {
    this.els.weaponName.textContent = weapon.name.toUpperCase();
    // Slot hint: 1 Pistol · 2 M16
    const slot = (index ?? 0) + 1;
    if (this.els.weaponTier) {
      this.els.weaponTier.textContent = `[${slot}]`;
    }
    this.els.ammoCurrent.textContent = String(ammo.current);
    this.els.ammoMag.textContent = String(ammo.mag);
    const low = ammo.current <= Math.max(2, Math.floor(ammo.mag * 0.25));
    this.els.ammoWrap?.classList.toggle('low-ammo', low);
    this.els.ammoWrap?.classList.toggle('empty-ammo', ammo.current <= 0);
  }

  setADS(on) {
    this.els.crosshair.classList.toggle('ads', on);
  }

  /** Expand crosshair briefly on fire (and on hit) for feedback */
  pulseCrosshair(ms = 90) {
    this.els.crosshair?.classList.add('fire');
    clearTimeout(this._chTimer);
    this._chTimer = setTimeout(() => this.els.crosshair?.classList.remove('fire'), ms);
  }

  showHitmarker(headshot = false) {
    this.lastHitmarkerAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lastHitWasHeadshot = !!headshot;
    const hm = this.els.hitmarker;
    if (hm) {
      hm.classList.remove('hidden');
      hm.classList.toggle('headshot', !!headshot);
      // Restart pop animation
      hm.style.animation = 'none';
      void hm.offsetWidth;
      hm.style.animation = '';
      clearTimeout(this._hitTimer);
      this._hitTimer = setTimeout(() => hm.classList.add('hidden'), headshot ? 160 : 120);
    }
    // Crosshair gap pulse on hit (not only on fire)
    this.pulseCrosshair(headshot ? 140 : 110);
  }

  showDamageNumber(damage, headshot = false) {
    const root = this.els.damageNumbers;
    if (!root || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'dmg-num' + (headshot ? ' head' : '');
    el.textContent = headshot ? `${damage}!` : String(damage);
    // Slight random offset from center
    const ox = (Math.random() - 0.5) * 80;
    const oy = (Math.random() - 0.5) * 40 - 20;
    el.style.left = `calc(50% + ${ox}px)`;
    el.style.top = `calc(50% + ${oy}px)`;
    root.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  /** Brief screen flash / juice when the player gets a kill */
  showKillFlash() {
    this.lastKillFlashAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (typeof document === 'undefined') return;
    const app = document.getElementById('app');
    if (!app) return;
    // CSS-only flash — never leave inline brightness stuck (was compounding overexposure)
    app.style.filter = '';
    app.classList.remove('kill-flash');
    void app.offsetWidth;
    app.classList.add('kill-flash');
    clearTimeout(this._killFlashTimer);
    this._killFlashTimer = setTimeout(() => {
      app.classList.remove('kill-flash');
      app.style.filter = '';
    }, 120);
  }

  /** Short "ELIMINATED" / kill confirm callout (uses streak slot if free-ish) */
  showKillConfirm(label = 'ELIMINATED!') {
    this.lastKillConfirmAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const streak = this.els.streak;
    if (!streak) return;
    // Prefer not to stomp an active multi-kill streak banner
    if (!streak.classList.contains('hidden') && streak.dataset?.priority === 'streak') {
      return;
    }
    streak.textContent = label;
    streak.dataset.priority = 'kill';
    streak.classList.remove('hidden');
    clearTimeout(this._killConfirmTimer);
    this._killConfirmTimer = setTimeout(() => {
      if (streak.dataset.priority === 'kill') {
        streak.classList.add('hidden');
        delete streak.dataset.priority;
      }
    }, 700);
  }

  addStatusFeed(text) {
    const root = this.els.killFeed;
    if (!root || typeof document === 'undefined' || !text) return;
    const el = document.createElement('div');
    el.className = 'kill-entry ctf';
    el.textContent = String(text);
    root.prepend(el);
    while (root.children.length > 6) {
      root.lastChild.remove();
    }
    setTimeout(() => el.remove(), 5000);
  }

  setFlagCarry(on) {
    this.els.flagCarry?.classList.toggle('hidden', !on);
  }

  addKillFeed(killer, victim, weaponId, isYouKiller, isYouVictim) {
    const icon = GUN_ICONS[weaponId] || '·';
    const el = document.createElement('div');
    el.className = 'kill-entry';
    const k = isYouKiller ? `<span class="you">YOU</span>` : killer;
    const v = isYouVictim ? `<span class="you">YOU</span>` : victim;
    el.innerHTML = `${k}<span class="gun">${icon}</span>${v}`;
    this.els.killFeed.prepend(el);
    while (this.els.killFeed.children.length > 6) {
      this.els.killFeed.lastChild.remove();
    }
    setTimeout(() => el.remove(), 5000);
  }

  showStreak(count) {
    const labels = {
      3: '3 IN A ROW!',
      5: '5 STREAK!',
      7: 'UNSTOPPABLE!',
      10: 'PASTEL LEGEND!',
    };
    const text = labels[count];
    if (!text) return;
    const streak = this.els.streak;
    if (!streak) return;
    streak.textContent = text;
    streak.dataset.priority = 'streak';
    streak.classList.remove('hidden');
    clearTimeout(this._streakTimer);
    clearTimeout(this._killConfirmTimer);
    this._streakTimer = setTimeout(() => {
      streak.classList.add('hidden');
      delete streak.dataset.priority;
    }, 1800);
  }

  showPickupToast() {
    if (!this.els.pickup) return;
    this.els.pickup.classList.remove('hidden');
    // reflow animation
    this.els.pickup.style.animation = 'none';
    void this.els.pickup.offsetWidth;
    this.els.pickup.style.animation = '';
    setTimeout(() => this.els.pickup.classList.add('hidden'), 900);
  }

  /**
   * Combat callout for bot events (reload vulnerability, etc.)
   * Reuses pickup toast styling when present; always sets lastBotToast for tests.
   */
  showBotToast(message) {
    this.lastBotToast = String(message || '');
    this.lastBotToastAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const el = this.els.pickup;
    if (!el) return;
    const prev = el.textContent;
    el.textContent = this.lastBotToast;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this._botToastTimer);
    this._botToastTimer = setTimeout(() => {
      el.classList.add('hidden');
      if (prev) el.textContent = prev;
    }, 1400);
  }

  showDeath(killerName, seconds, opts = {}) {
    this.els.death.classList.remove('hidden');
    if (this.els.deathTitle) {
      this.els.deathTitle.textContent = opts.eliminated ? 'ELIMINATED' : 'DOWN!';
    }
    this.els.deathBy.textContent = `Taken out by ${killerName}`;
    if (opts.eliminated) {
      this.els.deathTimer.textContent = 'Waiting for the match to end…';
    } else {
      this.els.deathTimer.textContent = `Respawning in ${Math.ceil(seconds)}…`;
    }
  }

  updateDeathTimer(seconds, opts = {}) {
    if (opts.eliminated) {
      this.els.deathTimer.textContent = 'Waiting for the match to end…';
      return;
    }
    this.els.deathTimer.textContent = `Respawning in ${Math.ceil(seconds)}…`;
  }

  hideDeath() {
    this.els.death.classList.add('hidden');
  }

  showPause(show) {
    this.els.pause.classList.toggle('hidden', !show);
  }

  /**
   * @param {Array<object>} entries
   * @param {boolean} playerWon
   * @param {{ modeId?: string, modeName?: string, teamKills?: object, winnerTeam?: string, goalLimit?: number }} [match]
   */
  showVictory(entries, playerWon, match = {}) {
    this.els.victory.classList.remove('hidden');
    this.els.hud.classList.add('hidden');
    this.els.victoryTitle.textContent = playerWon ? 'VICTORY!' : 'MATCH OVER';
    const limit = match.goalLimit || KILL_LIMIT;
    const tk = match.teamKills;
    const caps = match.captures;
    if (match.modeId === 'ctf' && caps) {
      const teamName = match.winnerTeam === 'bravo' ? 'Bravo' : 'Alpha';
      const score = `${caps.alpha ?? 0}–${caps.bravo ?? 0}`;
      this.els.victorySub.textContent = playerWon
        ? `${teamName} wins CTF ${score} — You rule S'Berg Nuketown!`
        : `${teamName} wins CTF ${score} — rematch?`;
    } else if (match.modeId === 'tdm' && tk) {
      const teamName = match.winnerTeam === 'bravo' ? 'Bravo' : 'Alpha';
      const score = `${tk.alpha ?? 0}–${tk.bravo ?? 0}`;
      this.els.victorySub.textContent = playerWon
        ? `${teamName} wins ${score} — You rule S'Berg Nuketown!`
        : `${teamName} wins ${score} — rematch?`;
    } else if (match.modeId === 'pubg') {
      this.els.victorySub.textContent = playerWon
        ? 'Last standing — You rule S\'Berg Nuketown!'
        : 'You were eliminated — rematch?';
    } else {
      this.els.victorySub.textContent = playerWon
        ? `First to ${limit} — You rule S'Berg Nuketown!`
        : 'Better luck next round — rematch?';
    }

    const teamMode = match.modeId === 'tdm' || match.modeId === 'ctf';
    const rows = [
      teamMode
        ? `<div class="sb-row head"><span>PLAYER</span><span>TEAM</span><span>K</span><span>D</span><span>K/D</span></div>`
        : `<div class="sb-row head"><span>PLAYER</span><span>K</span><span>D</span><span>K/D</span><span>FUN</span></div>`,
    ];
    for (const e of entries) {
      const kd = e.deaths === 0 ? e.kills.toFixed(2) : (e.kills / e.deaths).toFixed(2);
      const cls = ['sb-row'];
      if (e.isPlayer) cls.push('player');
      if (e.team === 'alpha' || e.team === 'bravo') cls.push(`team-${e.team}`);
      if (teamMode) {
        rows.push(
          `<div class="${cls.join(' ')}"><span>${e.name}</span><span>${e.team || '—'}</span><span>${e.kills}</span><span>${e.deaths}</span><span>${kd}</span></div>`
        );
      } else {
        rows.push(
          `<div class="${cls.join(' ')}"><span>${e.name}</span><span>${e.kills}</span><span>${e.deaths}</span><span>${kd}</span><span>${e.funPoints}</span></div>`
        );
      }
    }
    this.els.scoreboard.innerHTML = rows.join('');
  }

  hideVictory() {
    this.els.victory.classList.add('hidden');
  }

  /** Mid-match overlay while Tab is held */
  showMiniScoreboard(entries, show, match = {}) {
    const root = this.els.miniScoreboard;
    const body = this.els.miniScoreboardBody;
    if (!root || !body) return;
    if (!show) {
      root.classList.add('hidden');
      return;
    }
    if (!entries) {
      root.classList.remove('hidden');
      return;
    }
    const title = this.els.miniScoreboardTitle;
    const limit = match.goalLimit || KILL_LIMIT;
    const tk = match.teamKills;
    const caps = match.captures;
    if (title) {
      if (match.modeId === 'ctf' && caps) {
        title.textContent = `CAPTURE THE FLAG · ${caps.alpha ?? 0}–${caps.bravo ?? 0} / ${limit}`;
      } else if (match.modeId === 'tdm' && tk) {
        title.textContent = `TEAM DEATHMATCH · ${tk.alpha ?? 0}–${tk.bravo ?? 0} / ${limit}`;
      } else if (match.modeId === 'pubg') {
        title.textContent = `BATTLE ROYALE · ${match.aliveCount ?? 0} ALIVE`;
      } else {
        title.textContent = `SCOREBOARD · FIRST TO ${limit}`;
      }
    }
    const teamMode = match.modeId === 'tdm' || match.modeId === 'ctf';
    const rows = [
      teamMode
        ? `<div class="mini-sb-row head"><span>#</span><span>PLAYER</span><span>TEAM</span><span>K</span><span>D</span></div>`
        : `<div class="mini-sb-row head"><span>#</span><span>PLAYER</span><span>K</span><span>D</span><span>FUN</span></div>`,
    ];
    entries.forEach((e, i) => {
      const cls = ['mini-sb-row'];
      if (e.isPlayer) cls.push('player');
      if (e.team === 'alpha' || e.team === 'bravo') cls.push(`team-${e.team}`);
      if (teamMode) {
        rows.push(
          `<div class="${cls.join(' ')}"><span>${i + 1}</span><span>${e.name}</span><span>${e.team || '—'}</span><span>${e.kills}</span><span>${e.deaths}</span></div>`
        );
      } else {
        rows.push(
          `<div class="${cls.join(' ')}"><span>${i + 1}</span><span>${e.name}</span><span>${e.kills}</span><span>${e.deaths}</span><span>${e.funPoints}</span></div>`
        );
      }
    });
    body.innerHTML = rows.join('');
    root.classList.remove('hidden');
  }
}
