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
  let attachedSocket = null;
  let lastSentAt = 0;
  let queued = false;

  function socket() {
    const ws = window.__BRASTA_PRIMARY_GAME_SOCKET__;
    return ws && ws.readyState === WebSocket.OPEN ? ws : null;
  }

  function attachSocket() {
    const ws = window.__BRASTA_PRIMARY_GAME_SOCKET__;
    if (!ws || ws === attachedSocket) return;
    attachedSocket = ws;
    ws.addEventListener('message', onSocketMessage);
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

  function showBubble(seat, item, name) {
    const player = document.querySelector(`.player-chip[data-seat="${seat}"]`);
    if (!(player instanceof HTMLElement)) return;

    const old = player.querySelector('.player-emote-bubble');
    old?.remove();
    const previousTimer = bubbleTimers.get(seat);
    if (previousTimer) window.clearTimeout(previousTimer);

    const bubble = document.createElement('div');
    bubble.className = 'player-emote-bubble';
    bubble.setAttribute('aria-label', `${name || 'Player'}: ${item.label}`);
    bubble.innerHTML = `<span class="player-emote-glyph" aria-hidden="true">${item.glyph}</span><span class="player-emote-label">${item.label}</span>`;
    player.appendChild(bubble);

    requestAnimationFrame(() => bubble.classList.add('show'));
    const timer = window.setTimeout(() => {
      bubble.classList.remove('show');
      bubble.classList.add('leaving');
      window.setTimeout(() => bubble.remove(), 220);
      bubbleTimers.delete(seat);
    }, 2800);
    bubbleTimers.set(seat, timer);
  }

  function closeTray() {
    document.querySelectorAll('.emote-tray.open').forEach((tray) => tray.classList.remove('open'));
    document.querySelectorAll('.emote-trigger[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  function sendEmote(id) {
    const item = byId.get(id);
    const ws = socket();
    if (!item || !ws) return;
    const now = Date.now();
    if (now - lastSentAt < 2000) return;
    lastSentAt = now;
    try { ws.send(JSON.stringify({ type: 'EMOTE', emote: id })); } catch {}
    closeTray();
  }

  function buildControl() {
    const control = document.createElement('div');
    control.className = 'emote-control';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'emote-trigger';
    trigger.setAttribute('aria-label', 'Send emote');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span aria-hidden="true">☺</span>';

    const tray = document.createElement('div');
    tray.className = 'emote-tray';
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
      const next = !tray.classList.contains('open');
      closeTray();
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
    attachSocket();

    const row = document.querySelector('[data-game-action-row]');
    if (!row || !shouldShow()) {
      document.querySelectorAll('.emote-control').forEach((node) => node.remove());
      return;
    }
    if (row.querySelector('.emote-control')) return;

    const control = buildControl();
    const burn = row.querySelector('.burn-call-button');
    if (burn) row.insertBefore(control, burn);
    else row.appendChild(control);
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
    window.setInterval(attachSocket, 1000);
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
