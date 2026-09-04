(() => {
  'use strict';
  if (window.__BRASTA_EMOTE_UI__) return;
  window.__BRASTA_EMOTE_UI__ = true;

  const EMOTES = [
    { id: 'wink', glyph: '😉', label: 'Wink' },
    { id: 'nod', glyph: '🙂', label: 'Nod' },
    { id: 'thumbs_up', glyph: '👍', label: 'Thumbs Up' },
    { id: 'thumbs_down', glyph: '👎', label: 'Thumbs Down' },
    { id: 'eyebrow', glyph: '🤨', label: 'Eyebrow' },
    { id: 'laugh', glyph: '😂', label: 'Laugh' },
    { id: 'wow', glyph: '😮', label: 'Wow' },
    { id: 'thinking', glyph: '🤔', label: 'Thinking' },
  ];
  const byId = new Map(EMOTES.map((item) => [item.id, item]));
  const bubbleTimers = new Map();
  const activeBubbles = new Map();
  let trayOpen = false;
  let attachedSocket = null;
  let humanSocket = null;
  let lastSentAt = 0;
  let queued = false;

  function markSocketFromPayload(ws, payload) {
    if (!ws || !payload || typeof payload.type !== 'string') return;
    if (payload.type === 'CREATE_ROOM') {
      ws.__brastaEmoteHumanSocket = true;
      ws.__brastaEmoteBotSocket = false;
      humanSocket = ws;
      attachSocket(ws);
      return;
    }
    if (payload.type === 'JOIN_ROOM') {
      const name = String(payload.name || '').trim();
      if (name.startsWith('Brasta Bot')) {
        ws.__brastaEmoteBotSocket = true;
        ws.__brastaEmoteHumanSocket = false;
        return;
      }
      ws.__brastaEmoteHumanSocket = true;
      ws.__brastaEmoteBotSocket = false;
      humanSocket = ws;
      attachSocket(ws);
      return;
    }
    if (payload.type === 'SPECTATE_ROOM') {
      ws.__brastaEmoteHumanSocket = false;
    }
  }

  const previousSend = WebSocket.prototype.send;
  if (!WebSocket.prototype.__brastaEmoteSendPatched) {
    Object.defineProperty(WebSocket.prototype, '__brastaEmoteSendPatched', { value: true });
    WebSocket.prototype.send = function patchedBrastaEmoteSend(data) {
      try { markSocketFromPayload(this, JSON.parse(String(data || ''))); } catch {}
      return previousSend.call(this, data);
    };
  }

  function socket() {
    if (humanSocket?.readyState === WebSocket.OPEN && !humanSocket.__brastaEmoteBotSocket) return humanSocket;

    const primary = window.__BRASTA_PRIMARY_GAME_SOCKET__;
    if (primary?.__brastaBurnPlayerSocket && !primary?.__brastaBurnBotSocket && primary.readyState === WebSocket.OPEN) {
      humanSocket = primary;
      attachSocket(primary);
      return primary;
    }

    if (primary?.__brastaEmoteHumanSocket && !primary?.__brastaEmoteBotSocket && primary.readyState === WebSocket.OPEN) {
      humanSocket = primary;
      attachSocket(primary);
      return primary;
    }
    return null;
  }

  function attachSocket(ws) {
    if (!ws || ws === attachedSocket || ws.__brastaEmoteBotSocket || ws.__brastaBurnBotSocket) return;
    attachedSocket = ws;
    ws.addEventListener('message', onSocketMessage);
    ws.addEventListener('close', () => {
      if (attachedSocket === ws) attachedSocket = null;
      if (humanSocket === ws) humanSocket = null;
    });
  }

  function onSocketMessage(event) {
    let message;
    try { message = JSON.parse(String(event.data || '')); } catch { return; }
    if (message?.type !== 'EMOTE' || !message.event) return;
    const payload = message.event;
    const seat = Number(payload.seat);
    const item = byId.get(String(payload.emote || ''));
    if (!item || !Number.isFinite(seat)) return;
    showBubble(seat, item, String(payload.name || ''));
  }

  function renderActiveBubble(seat) {
    const active = activeBubbles.get(seat);
    if (!active) return;

    const remaining = active.expiresAt - Date.now();
    if (remaining <= 0) {
      activeBubbles.delete(seat);
      const timer = bubbleTimers.get(seat);
      if (timer) window.clearTimeout(timer);
      bubbleTimers.delete(seat);
      document.querySelectorAll(`.player-chip[data-seat="${seat}"] .player-emote-bubble`).forEach((node) => node.remove());
      return;
    }

    const player = document.querySelector(`.player-chip[data-seat="${seat}"]`);
    if (!(player instanceof HTMLElement)) return;

    let bubble = player.querySelector('.player-emote-bubble');
    if (!(bubble instanceof HTMLElement) || bubble.dataset.emote !== active.item.id) {
      bubble?.remove();
      bubble = document.createElement('div');
      bubble.className = 'player-emote-bubble';
      bubble.dataset.emote = active.item.id;
      bubble.setAttribute('aria-label', `${active.name || 'Player'}: ${active.item.label}`);
      bubble.innerHTML = `<span class="player-emote-glyph" aria-hidden="true">${active.item.glyph}</span><span class="player-emote-label">${active.item.label}</span>`;
      player.appendChild(bubble);
      requestAnimationFrame(() => bubble?.classList.add('show'));
    } else if (!bubble.classList.contains('show')) {
      bubble.classList.add('show');
    }
  }

  function showBubble(seat, item, name) {
    const previousTimer = bubbleTimers.get(seat);
    if (previousTimer) window.clearTimeout(previousTimer);

    activeBubbles.set(seat, {
      item,
      name,
      expiresAt: Date.now() + 3200,
    });
    renderActiveBubble(seat);

    const timer = window.setTimeout(() => {
      const playerBubble = document.querySelector(`.player-chip[data-seat="${seat}"] .player-emote-bubble`);
      if (playerBubble instanceof HTMLElement) {
        playerBubble.classList.remove('show');
        playerBubble.classList.add('leaving');
        window.setTimeout(() => playerBubble.remove(), 220);
      }
      activeBubbles.delete(seat);
      bubbleTimers.delete(seat);
    }, 3200);
    bubbleTimers.set(seat, timer);
  }

  function restoreActiveBubbles() {
    for (const seat of activeBubbles.keys()) renderActiveBubble(seat);
  }

  function closeTray() {
    trayOpen = false;
    document.querySelectorAll('.emote-tray.open').forEach((tray) => tray.classList.remove('open'));
    document.querySelectorAll('.emote-trigger[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  function sendEmote(id) {
    const item = byId.get(id);
    if (!item) return;
    closeTray();
    const now = Date.now();
    if (now - lastSentAt < 2000) return;
    lastSentAt = now;
    window.dispatchEvent(new CustomEvent('brasta-send-emote', { detail: { emote: id } }));
  }

  function buildControl() {
    const control = document.createElement('div');
    control.className = 'emote-control';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'emote-trigger';
    trigger.setAttribute('aria-label', 'Send emote');
    trigger.setAttribute('aria-expanded', trayOpen ? 'true' : 'false');
    trigger.innerHTML = '<span aria-hidden="true">☺</span>';

    const tray = document.createElement('div');
    tray.className = trayOpen ? 'emote-tray open' : 'emote-tray';
    tray.setAttribute('role', 'menu');
    tray.setAttribute('aria-label', 'Brasta emotes');

    for (const item of EMOTES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'emote-option';
      button.dataset.emote = item.id;
      button.setAttribute('role', 'menuitem');
      button.setAttribute('aria-label', item.label);
      button.title = item.label;
      button.innerHTML = `<span aria-hidden="true">${item.glyph}</span><small>${item.label}</small>`;
      button.onclick = (event) => {
        event.stopPropagation();
        sendEmote(item.id);
      };
      tray.appendChild(button);
    }

    trigger.onclick = (event) => {
      event.stopPropagation();
      const next = !trayOpen;
      closeTray();
      trayOpen = next;
      tray.classList.toggle('open', next);
      trigger.setAttribute('aria-expanded', next ? 'true' : 'false');
    };

    control.append(trigger, tray);
    return control;
  }

  function shouldShow() {
    return !!document.querySelector('.topbar .room-pill')
      && !!document.querySelector('.table')
      && !document.querySelector('.topbar .spectator-pill');
  }

  function enhance() {
    queued = false;
    socket();
    restoreActiveBubbles();

    const row = document.querySelector('[data-game-action-row]');
    if (!row || !shouldShow()) {
      document.querySelectorAll('.emote-control').forEach((node) => node.remove());
      return;
    }

    const existing = row.querySelector('.emote-control');
    if (existing) {
      const tray = existing.querySelector('.emote-tray');
      const trigger = existing.querySelector('.emote-trigger');
      tray?.classList.toggle('open', trayOpen);
      trigger?.setAttribute('aria-expanded', trayOpen ? 'true' : 'false');
      return;
    }

    const control = buildControl();
    const panel = row.querySelector('.action-panel');
    if (panel) row.insertBefore(control, panel);
    else row.insertBefore(control, row.firstChild);
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.emote-control')) closeTray();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTray();
  });

  function start() {
    new MutationObserver(queueEnhance).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('brasta-emote-received', (rawEvent) => {
      const payload = rawEvent.detail || {};
      const seat = Number(payload.seat);
      const item = byId.get(String(payload.emote || ''));
      if (!item || !Number.isFinite(seat)) return;
      showBubble(seat, item, String(payload.name || ''));
    });
    window.setInterval(() => socket(), 1000);
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
