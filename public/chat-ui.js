(() => {
  'use strict';

  if (window.__BRASTA_MATCH_CHAT_UI__) return;
  window.__BRASTA_MATCH_CHAT_UI__ = true;

  const MAX_MESSAGES = 50;
  const MAX_CHARS = 180;
  const MAX_DATE_MS = 8_640_000_000_000_000;
  const timeFormatter = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
  const histories = new Map();
  let context = window.__BRASTA_CHAT_CONTEXT__ || {
    active: false,
    roomCode: '',
    mode: null,
    role: null,
    seat: null,
    name: '',
    status: 'disconnected',
  };
  let currentRoom = '';
  let open = false;
  let unread = 0;
  let queued = false;
  let lastSubmitAt = 0;
  let statusTimer = null;
  let backdrop = null;
  let drawer = null;
  let messageList = null;
  let form = null;
  let input = null;
  let sendButton = null;
  let status = null;
  let readOnlyNote = null;
  let roomLabel = null;

  function normalizeCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function cleanText(value, max = MAX_CHARS) {
    return Array.from(String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
      .slice(0, max)
      .join('');
  }

  function normalizeMessage(raw, expectedRoom) {
    if (!raw || typeof raw !== 'object') return null;
    const roomCode = normalizeCode(raw.roomCode);
    const seat = Number(raw.seat);
    const text = cleanText(raw.text);
    const name = cleanText(raw.name, 24);
    const id = String(raw.id || '').slice(0, 80);
    const at = Number(raw.at);
    if (!id || !roomCode || roomCode !== expectedRoom || ![1, 2, 3, 4].includes(seat) || !text || !name || !Number.isFinite(at) || at < 0 || at > MAX_DATE_MS) return null;
    return { id, roomCode, seat, name, text, at };
  }

  function messagesFor(roomCode) {
    return histories.get(roomCode) || [];
  }

  function setHistory(detail) {
    const roomCode = normalizeCode(detail?.roomCode);
    if (!roomCode) return;
    const seen = new Set();
    const messages = (Array.isArray(detail?.messages) ? detail.messages : [])
      .map((message) => normalizeMessage(message, roomCode))
      .filter((message) => {
        if (!message || seen.has(message.id)) return false;
        seen.add(message.id);
        return true;
      })
      .sort((a, b) => a.at - b.at)
      .slice(-MAX_MESSAGES);
    histories.set(roomCode, messages);
    if (roomCode === currentRoom && open) renderMessages(true);
  }

  function addMessage(raw) {
    const roomCode = normalizeCode(raw?.roomCode);
    if (!roomCode) return;
    const message = normalizeMessage(raw, roomCode);
    if (!message) return;
    const messages = messagesFor(roomCode);
    if (messages.some((item) => item.id === message.id)) return;
    histories.set(roomCode, [...messages, message].sort((a, b) => a.at - b.at).slice(-MAX_MESSAGES));

    if (roomCode === currentRoom) {
      const own = context.role === 'player' && Number(context.seat) === message.seat;
      if (!open && !own) unread = Math.min(unread + 1, 99);
      if (open) renderMessages(true);
      updateTriggers();
    }
  }

  function teamForSeat(seat) {
    return Number(seat) % 2 === 1 ? 'A' : 'B';
  }

  function formatTime(value) {
    try {
      return timeFormatter.format(new Date(value));
    } catch {
      return '';
    }
  }

  function renderMessages(scrollToLatest = false) {
    if (!messageList) return;
    const messages = messagesFor(currentRoom);
    messageList.replaceChildren();

    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'match-chat-empty';
      empty.innerHTML = '<span aria-hidden="true">♣</span><b>No messages yet</b><small>Start the table talk.</small>';
      messageList.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const message of messages) {
      const own = context.role === 'player' && Number(context.seat) === message.seat;
      const team = teamForSeat(message.seat);
      const item = document.createElement('article');
      item.className = `match-chat-message team-${team}${own ? ' own' : ''}`;
      item.dataset.messageId = message.id;

      const meta = document.createElement('div');
      meta.className = 'match-chat-message-meta';
      const sender = document.createElement('b');
      sender.textContent = own ? 'You' : message.name;
      const seat = document.createElement('span');
      seat.className = 'match-chat-seat';
      seat.textContent = `Seat ${message.seat} · Team ${team}`;
      const time = document.createElement('time');
      time.dateTime = new Date(message.at).toISOString();
      time.textContent = formatTime(message.at);
      meta.append(sender, seat, time);

      const copy = document.createElement('p');
      copy.textContent = message.text;
      item.append(meta, copy);
      fragment.appendChild(item);
    }
    messageList.appendChild(fragment);
    if (scrollToLatest || open) requestAnimationFrame(() => { messageList.scrollTop = messageList.scrollHeight; });
  }

  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = String(message || '');
    status.classList.toggle('error', error && !!message);
    if (statusTimer) window.clearTimeout(statusTimer);
    if (message) {
      statusTimer = window.setTimeout(() => {
        if (!status) return;
        status.textContent = '';
        status.classList.remove('error');
      }, 3200);
    }
  }

  function updateComposer() {
    if (!form || !input || !sendButton || !readOnlyNote) return;
    const spectator = context.role === 'spectator';
    const connected = context.status === 'connected';
    form.hidden = spectator;
    readOnlyNote.hidden = !spectator;
    input.disabled = spectator || !connected;
    sendButton.disabled = spectator || !connected;
    input.placeholder = connected ? 'Message the table…' : 'Reconnecting…';
  }

  function ensureShell() {
    if (backdrop?.isConnected) return;

    backdrop = document.createElement('div');
    backdrop.className = 'match-chat-backdrop';
    backdrop.hidden = true;

    drawer = document.createElement('section');
    drawer.className = 'match-chat-drawer';
    drawer.id = 'brasta-match-chat';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'brasta-match-chat-title');
    drawer.innerHTML = `
      <header class="match-chat-header">
        <div class="match-chat-mark" aria-hidden="true">B</div>
        <div>
          <div class="match-chat-eyebrow">BRASTA SOCIAL</div>
          <h2 id="brasta-match-chat-title">Match Chat</h2>
          <p data-match-chat-room>Room</p>
        </div>
        <button type="button" class="match-chat-close" aria-label="Close match chat">×</button>
      </header>
      <div class="match-chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="match-chat-status" aria-live="polite"></div>
      <div class="match-chat-readonly" hidden>Spectators can read match chat. Only seated players can send messages.</div>
      <form class="match-chat-form">
        <label class="match-chat-sr-only" for="brasta-match-chat-input">Message the table</label>
        <input id="brasta-match-chat-input" type="text" maxlength="${MAX_CHARS}" autocomplete="off" enterkeyhint="send" placeholder="Message the table…">
        <button type="submit">Send</button>
      </form>`;

    backdrop.appendChild(drawer);
    document.body.appendChild(backdrop);

    messageList = drawer.querySelector('.match-chat-messages');
    form = drawer.querySelector('.match-chat-form');
    input = drawer.querySelector('#brasta-match-chat-input');
    sendButton = form?.querySelector('button[type="submit"]') || null;
    status = drawer.querySelector('.match-chat-status');
    readOnlyNote = drawer.querySelector('.match-chat-readonly');
    roomLabel = drawer.querySelector('[data-match-chat-room]');

    drawer.querySelector('.match-chat-close')?.addEventListener('click', closeChat);
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) closeChat();
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (context.role !== 'player' || context.status !== 'connected' || !input) return;
      const text = cleanText(input.value);
      if (!text) return;
      const now = Date.now();
      if (now - lastSubmitAt < 1_000) {
        setStatus('Wait a moment before sending another message.', true);
        return;
      }
      lastSubmitAt = now;
      input.value = '';
      setStatus('');
      window.dispatchEvent(new CustomEvent('brasta-send-chat', { detail: { text } }));
    });
  }

  function updateTriggers() {
    document.querySelectorAll('.match-chat-trigger').forEach((button) => {
      const badge = button.querySelector('.match-chat-unread');
      if (badge) {
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.hidden = unread < 1;
      }
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.setAttribute('aria-label', unread ? `Open match chat, ${unread} unread` : 'Open match chat');
    });

    document.querySelectorAll('.mobile-header-menu').forEach((button) => {
      let badge = button.querySelector('.match-chat-mobile-unread');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'match-chat-mobile-unread';
        badge.hidden = true;
        button.appendChild(badge);
      }
      const label = unread > 9 ? '9+' : String(unread);
      if (badge.textContent !== label) badge.textContent = label;
      badge.hidden = unread < 1;
      button.setAttribute('aria-label', unread ? `Open match menu, ${unread} unread chat message${unread === 1 ? '' : 's'}` : 'Open match menu');
    });

    document.querySelectorAll('.match-chat-menu-item').forEach(updateMobileMenuItem);
  }

  function openChat() {
    if (!context.active || !currentRoom) return;
    ensureShell();
    open = true;
    unread = 0;
    backdrop.hidden = false;
    document.body.classList.add('brasta-chat-open');
    renderMessages(true);
    updateComposer();
    updateTriggers();
    if (context.role === 'player' && window.matchMedia('(min-width: 801px)').matches) {
      window.setTimeout(() => input?.focus(), 80);
    }
  }

  function closeChat() {
    open = false;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('brasta-chat-open');
    updateTriggers();
  }

  function buildTrigger() {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'match-chat-trigger';
    trigger.setAttribute('aria-controls', 'brasta-match-chat');
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    trigger.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 4.5h14.5A2.25 2.25 0 0 1 21.5 6.75v8.5a2.25 2.25 0 0 1-2.25 2.25H11l-4.55 3.03a.75.75 0 0 1-1.17-.62V17.4A2.25 2.25 0 0 1 2.5 15.25v-8.5A2.25 2.25 0 0 1 4.75 4.5Z"/></svg>
      <span class="match-chat-unread" hidden>0</span>`;
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      open ? closeChat() : openChat();
    });
    return trigger;
  }

  function buildMobileMenuItem() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'match-menu-item match-chat-menu-item';
    button.setAttribute('role', 'menuitem');
    button.innerHTML = '<span>Match Chat</span><b class="match-chat-menu-count" hidden>0</b>';
    button.addEventListener('click', () => {
      document.querySelector('[data-match-menu-panel]')?.setAttribute('hidden', '');
      document.querySelector('[data-match-menu-toggle]')?.setAttribute('aria-expanded', 'false');
      document.querySelector('.mobile-header-menu')?.setAttribute('aria-expanded', 'false');
      openChat();
    });
    return button;
  }

  function updateMobileMenuItem(item) {
    const count = item?.querySelector('.match-chat-menu-count');
    if (!count) return;
    const label = unread > 9 ? '9+' : String(unread);
    if (count.textContent !== label) count.textContent = label;
    count.hidden = unread < 1;
  }

  function shouldShow() {
    return Boolean(context.active)
      && Boolean(currentRoom)
      && Boolean(document.querySelector('.topbar .room-pill'))
      && Boolean(document.querySelector('.players'));
  }

  function enhance() {
    queued = false;
    ensureShell();

    const nextRoom = normalizeCode(context.roomCode);
    if (nextRoom && nextRoom !== currentRoom) {
      currentRoom = nextRoom;
      unread = 0;
      closeChat();
      const pending = window.__BRASTA_CHAT_HISTORY__;
      if (normalizeCode(pending?.roomCode) === currentRoom) setHistory(pending);
    }

    if (!shouldShow()) {
      document.querySelectorAll('.match-chat-trigger').forEach((node) => node.remove());
      document.querySelectorAll('.match-chat-menu-item').forEach((node) => node.remove());
      unread = 0;
      closeChat();
      return;
    }

    const menu = document.querySelector('[data-match-menu]');
    const menuToggle = menu?.querySelector('[data-match-menu-toggle]');
    if (menu && menuToggle && !menu.querySelector('.match-chat-trigger')) {
      menu.insertBefore(buildTrigger(), menuToggle);
    }
    if (window.matchMedia('(max-width: 700px)').matches) {
      const actionList = menu?.querySelector('[data-match-menu-actions]');
      let menuItem = actionList?.querySelector('.match-chat-menu-item');
      if (actionList && !menuItem) {
        menuItem = buildMobileMenuItem();
        actionList.insertBefore(menuItem, actionList.firstChild);
      }
      updateMobileMenuItem(menuItem);
    } else {
      menu?.querySelector('.match-chat-menu-item')?.remove();
    }

    if (roomLabel) {
      const viewer = context.role === 'spectator' ? 'Spectator view' : `Playing as ${context.name || 'Player'}`;
      roomLabel.textContent = `Room ${currentRoom} · ${viewer}`;
    }
    if (open && backdrop) backdrop.hidden = false;
    updateComposer();
    if (open) renderMessages(false);
    updateTriggers();
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    ensureShell();
    const pendingHistory = window.__BRASTA_CHAT_HISTORY__;
    if (pendingHistory) setHistory(pendingHistory);

    window.addEventListener('brasta-chat-context', (event) => {
      context = event.detail || context;
      queueEnhance();
    });
    window.addEventListener('brasta-chat-history', (event) => setHistory(event.detail || {}));
    window.addEventListener('brasta-chat-message', (event) => addMessage(event.detail || {}));
    window.addEventListener('brasta-chat-error', (event) => setStatus(event.detail?.message || 'Could not send that message.', true));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) closeChat();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && open) {
        unread = 0;
        updateTriggers();
      }
    });

    const app = document.getElementById('app');
    if (app) new MutationObserver(queueEnhance).observe(app, { childList: true, subtree: true });
    const siteNav = document.querySelector('.brasta-site-nav-inner');
    if (siteNav) new MutationObserver(queueEnhance).observe(siteNav, { childList: true, subtree: true });
    window.addEventListener('resize', queueEnhance, { passive: true });
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
