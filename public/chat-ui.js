(() => {
  'use strict';

  if (window.__BRASTA_MATCH_CHAT_UI__) return;
  window.__BRASTA_MATCH_CHAT_UI__ = true;

  const MAX_MESSAGES = 50;
  const MAX_CHARS = 180;
  const MAX_DATE_MS = 8_640_000_000_000_000;
  const timeFormatter = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
  const histories = new Map();
  const blockedUsers = new Set();
  let context = window.__BRASTA_CHAT_CONTEXT__ || {
    active: false,
    roomCode: '',
    mode: null,
    role: null,
    seat: null,
    name: '',
    status: 'disconnected',
  };
  let capabilities = {
    policyVersion: '',
    signedIn: false,
    userId: null,
    consented: false,
    backendAvailable: true,
    canSend: false,
    restriction: null,
  };
  let currentRoom = '';
  let open = false;
  let unread = 0;
  let queued = false;
  let lastSubmitAt = 0;
  let statusTimer = null;
  let selectedMessage = null;
  let selectedSafetyButton = null;
  let blockConfirmation = false;
  let backdrop = null;
  let drawer = null;
  let messageList = null;
  let form = null;
  let input = null;
  let sendButton = null;
  let status = null;
  let readOnlyNote = null;
  let consentPanel = null;
  let consentCheckbox = null;
  let consentButton = null;
  let roomLabel = null;
  let safetySheet = null;
  let safetyTitle = null;
  let reportForm = null;
  let reportReason = null;
  let reportDetails = null;
  let blockButton = null;

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

  function safeAvatarUrl(value) {
    const raw = String(value || '').trim().slice(0, 2048);
    if (!raw) return null;
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function normalizeMessage(raw, expectedRoom) {
    if (!raw || typeof raw !== 'object') return null;
    const roomCode = normalizeCode(raw.roomCode);
    const seat = Number(raw.seat);
    const text = cleanText(raw.text);
    const name = cleanText(raw.name, 24);
    const senderId = String(raw.senderId || '').trim().slice(0, 80);
    const avatarUrl = safeAvatarUrl(raw.avatarUrl);
    const id = String(raw.id || '').slice(0, 80);
    const at = Number(raw.at);
    if (!id || !senderId || !roomCode || roomCode !== expectedRoom || ![1, 2, 3, 4].includes(seat) || !text || !name || !Number.isFinite(at) || at < 0 || at > MAX_DATE_MS) return null;
    return { id, roomCode, seat, senderId, name, avatarUrl, text, at };
  }

  function messagesFor(roomCode) {
    return (histories.get(roomCode) || []).filter((message) => !blockedUsers.has(message.senderId));
  }

  function setHistory(detail) {
    const roomCode = normalizeCode(detail?.roomCode);
    if (!roomCode) return;
    const seen = new Set();
    const messages = (Array.isArray(detail?.messages) ? detail.messages : [])
      .map((message) => normalizeMessage(message, roomCode))
      .filter((message) => {
        if (!message || seen.has(message.id) || blockedUsers.has(message.senderId)) return false;
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
    if (!message || blockedUsers.has(message.senderId)) return;
    const messages = messagesFor(roomCode);
    if (messages.some((item) => item.id === message.id)) return;
    histories.set(roomCode, [...messages, message].sort((a, b) => a.at - b.at).slice(-MAX_MESSAGES));

    if (roomCode === currentRoom) {
      const own = message.senderId === capabilities.userId;
      if (!open && !own) unread = Math.min(unread + 1, 99);
      if (open) renderMessages(true);
      updateTriggers();
    }
  }

  function removeMessage(messageId, roomCode = currentRoom) {
    const code = normalizeCode(roomCode);
    if (!code || !messageId) return;
    histories.set(code, (histories.get(code) || []).filter((message) => message.id !== messageId));
    if (selectedMessage?.id === messageId) closeSafetySheet();
    if (code === currentRoom && open) renderMessages(false);
  }

  function blockUser(userId) {
    const cleanId = String(userId || '').trim().slice(0, 80);
    if (!cleanId) return;
    blockedUsers.add(cleanId);
    for (const [roomCode, messages] of histories.entries()) {
      histories.set(roomCode, messages.filter((message) => message.senderId !== cleanId));
    }
    closeSafetySheet();
    renderMessages(false);
    setStatus('Player blocked. Their messages and friend connection were removed.');
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

  function initial(name) {
    return cleanText(name, 24).slice(0, 1).toUpperCase() || 'B';
  }

  function avatarFor(message) {
    const avatar = document.createElement('span');
    avatar.className = 'match-chat-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    if (message.avatarUrl) {
      const image = document.createElement('img');
      image.src = message.avatarUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.remove();
        avatar.textContent = initial(message.name);
      }, { once: true });
      avatar.appendChild(image);
    } else {
      avatar.textContent = initial(message.name);
    }
    return avatar;
  }

  function renderMessages(scrollToLatest = false) {
    if (!messageList) return;
    const messages = messagesFor(currentRoom);
    messageList.replaceChildren();

    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'match-chat-empty';
      empty.innerHTML = '<span aria-hidden="true">♣</span><b>No messages yet</b><small>Keep it friendly and focused on the match.</small>';
      messageList.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const message of messages) {
      const own = message.senderId === capabilities.userId;
      const team = teamForSeat(message.seat);
      const item = document.createElement('article');
      item.className = `match-chat-message team-${team}${own ? ' own' : ''}`;
      item.dataset.messageId = message.id;

      const header = document.createElement('div');
      header.className = 'match-chat-message-head';
      header.appendChild(avatarFor(message));

      const meta = document.createElement('div');
      meta.className = 'match-chat-message-meta';
      const sender = document.createElement('b');
      sender.textContent = own ? 'You' : message.name;
      const seat = document.createElement('span');
      seat.className = 'match-chat-seat';
      seat.textContent = `Seat ${message.seat}`;
      const time = document.createElement('time');
      time.dateTime = new Date(message.at).toISOString();
      time.textContent = formatTime(message.at);
      meta.append(sender, seat, time);
      header.appendChild(meta);

      if (!own) {
        const safety = document.createElement('button');
        safety.type = 'button';
        safety.className = 'match-chat-safety-button';
        safety.setAttribute('aria-label', `Report or block ${message.name}`);
        safety.setAttribute('aria-haspopup', 'dialog');
        safety.setAttribute('aria-controls', 'brasta-chat-safety-sheet');
        safety.title = 'Report or block player';
        safety.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
        safety.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openSafetySheet(message, safety);
        });
        header.appendChild(safety);
      }

      const copy = document.createElement('p');
      copy.textContent = message.text;
      item.append(header, copy);
      fragment.appendChild(item);
    }
    messageList.appendChild(fragment);
    if (scrollToLatest) requestAnimationFrame(() => { messageList.scrollTop = messageList.scrollHeight; });
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
      }, 5_000);
    }
  }

  function openAccount() {
    closeChat();
    const accountButton = document.querySelector('.account-dock');
    if (accountButton instanceof HTMLButtonElement) accountButton.click();
  }

  function updateComposer() {
    if (!form || !input || !sendButton || !readOnlyNote || !consentPanel) return;
    const spectator = context.role === 'spectator';
    const connected = context.status === 'connected';
    const signedInPlayer = context.role === 'player' && capabilities.signedIn;
    const awaitingConsent = signedInPlayer && !capabilities.consented && capabilities.backendAvailable && !capabilities.restriction;
    const canSend = context.role === 'player' && connected && capabilities.canSend;

    form.hidden = !canSend;
    consentPanel.hidden = !awaitingConsent;
    readOnlyNote.hidden = canSend || awaitingConsent;
    input.disabled = !canSend;
    sendButton.disabled = !canSend;
    input.placeholder = connected ? 'Message the table…' : 'Reconnecting…';

    if (!readOnlyNote.hidden) {
      readOnlyNote.replaceChildren();
      const copy = document.createElement('span');
      if (spectator) copy.textContent = capabilities.signedIn
        ? 'Spectators can read, report, and block. Only seated players can post.'
        : 'Spectators can read chat. Sign in to report or block a player.';
      else if (!connected) copy.textContent = 'Reconnecting to match chat…';
      else if (!capabilities.signedIn) copy.textContent = 'Sign in to post, report, or block in match chat.';
      else if (!capabilities.backendAvailable) copy.textContent = 'Match chat moderation is temporarily unavailable.';
      else if (capabilities.restriction) copy.textContent = capabilities.restriction;
      else copy.textContent = 'Match chat is read-only right now.';
      readOnlyNote.appendChild(copy);
      if (!capabilities.signedIn) {
        const signIn = document.createElement('button');
        signIn.type = 'button';
        signIn.textContent = 'Sign In';
        signIn.addEventListener('click', openAccount);
        readOnlyNote.appendChild(signIn);
      }
    }
  }

  function openSafetySheet(message, trigger = null) {
    if (!capabilities.signedIn) {
      setStatus('Sign in to report or block a player.', true);
      return;
    }
    selectedMessage = message;
    selectedSafetyButton = trigger instanceof HTMLElement ? trigger : null;
    blockConfirmation = false;
    if (safetyTitle) safetyTitle.textContent = `Safety tools for ${message.name}`;
    if (reportForm) reportForm.reset();
    if (blockButton) {
      blockButton.disabled = false;
      blockButton.textContent = 'Block Player';
    }
    if (safetySheet) {
      safetySheet.hidden = false;
      safetySheet.scrollTop = 0;
      requestAnimationFrame(() => reportReason?.focus());
    }
  }

  function closeSafetySheet(restoreFocus = true) {
    const trigger = selectedSafetyButton;
    selectedMessage = null;
    selectedSafetyButton = null;
    blockConfirmation = false;
    if (safetySheet) safetySheet.hidden = true;
    if (restoreFocus && trigger) {
      requestAnimationFrame(() => {
        if (trigger.isConnected) trigger.focus();
      });
    }
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
      <div class="match-chat-messages" role="log" aria-live="polite" aria-relevant="additions removals"></div>
      <div class="match-chat-status" aria-live="polite"></div>
      <div class="match-chat-readonly" hidden></div>
      <div class="match-chat-consent" hidden>
        <b>Before you chat</b>
        <p>Keep chat respectful. Profanity, hate, threats, sexual content, spam, and personal contact details are not allowed.</p>
        <a href="/community-guidelines" target="_blank" rel="noopener">Read the Community Guidelines</a>
        <label><input type="checkbox"> I agree to the chat rules and confirm I meet the minimum age requirement.</label>
        <button type="button" disabled>Accept &amp; Enable Chat</button>
      </div>
      <form class="match-chat-form">
        <label class="match-chat-sr-only" for="brasta-match-chat-input">Message the table</label>
        <input id="brasta-match-chat-input" type="text" maxlength="${MAX_CHARS}" autocomplete="off" enterkeyhint="send" placeholder="Message the table…">
        <button type="submit">Send</button>
      </form>
      <section id="brasta-chat-safety-sheet" class="match-chat-safety-sheet" role="dialog" aria-modal="true" aria-labelledby="brasta-chat-safety-title" hidden>
        <header><div><span>CHAT SAFETY</span><b id="brasta-chat-safety-title" data-chat-safety-title>Safety tools</b></div><button type="button" data-chat-safety-close aria-label="Close safety tools">×</button></header>
        <form data-chat-report-form>
          <label>Reason<select name="reason" required>
            <option value="">Choose a reason</option>
            <option value="harassment">Harassment or bullying</option>
            <option value="hate">Hate or discriminatory content</option>
            <option value="sexual">Sexual content</option>
            <option value="threats">Threats or self-harm encouragement</option>
            <option value="spam">Spam</option>
            <option value="personal_info">Personal information</option>
            <option value="cheating">Cheating or match manipulation</option>
            <option value="other">Other</option>
          </select></label>
          <label>Details <small>optional</small><textarea name="details" maxlength="500" placeholder="Add context for the moderation team"></textarea></label>
          <button type="submit">Submit Report</button>
        </form>
        <div class="match-chat-block-panel"><button type="button" data-chat-block>Block Player</button><small>Blocking also removes any friendship and hides this player’s messages.</small></div>
      </section>`;

    backdrop.appendChild(drawer);
    document.body.appendChild(backdrop);

    messageList = drawer.querySelector('.match-chat-messages');
    form = drawer.querySelector('.match-chat-form');
    input = drawer.querySelector('#brasta-match-chat-input');
    sendButton = form?.querySelector('button[type="submit"]') || null;
    status = drawer.querySelector('.match-chat-status');
    readOnlyNote = drawer.querySelector('.match-chat-readonly');
    consentPanel = drawer.querySelector('.match-chat-consent');
    consentCheckbox = consentPanel?.querySelector('input[type="checkbox"]') || null;
    consentButton = consentPanel?.querySelector('button') || null;
    roomLabel = drawer.querySelector('[data-match-chat-room]');
    safetySheet = drawer.querySelector('.match-chat-safety-sheet');
    safetyTitle = drawer.querySelector('[data-chat-safety-title]');
    reportForm = drawer.querySelector('[data-chat-report-form]');
    reportReason = reportForm?.querySelector('select[name="reason"]') || null;
    reportDetails = reportForm?.querySelector('textarea[name="details"]') || null;
    blockButton = drawer.querySelector('[data-chat-block]');

    drawer.querySelector('.match-chat-close')?.addEventListener('click', closeChat);
    drawer.querySelector('[data-chat-safety-close]')?.addEventListener('click', closeSafetySheet);
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) closeChat();
    });
    consentCheckbox?.addEventListener('change', () => {
      if (consentButton) consentButton.disabled = !consentCheckbox.checked;
    });
    consentButton?.addEventListener('click', () => {
      if (!consentCheckbox?.checked) return;
      consentButton.disabled = true;
      window.dispatchEvent(new CustomEvent('brasta-accept-chat-policy'));
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!capabilities.canSend || context.role !== 'player' || context.status !== 'connected' || !input) return;
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
    reportForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!selectedMessage || !reportReason?.value) return;
      window.dispatchEvent(new CustomEvent('brasta-report-chat', {
        detail: { messageId: selectedMessage.id, reason: reportReason.value, details: reportDetails?.value || '' },
      }));
      setStatus('Submitting report…');
    });
    blockButton?.addEventListener('click', () => {
      if (!selectedMessage) return;
      if (!blockConfirmation) {
        blockConfirmation = true;
        blockButton.textContent = `Confirm Block ${selectedMessage.name}`;
        return;
      }
      blockButton.disabled = true;
      window.dispatchEvent(new CustomEvent('brasta-block-chat-user', { detail: { messageId: selectedMessage.id } }));
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
      badge.textContent = unread > 9 ? '9+' : String(unread);
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
    if (capabilities.canSend && window.matchMedia('(min-width: 801px)').matches) {
      window.setTimeout(() => input?.focus(), 80);
    }
  }

  function closeChat() {
    open = false;
    closeSafetySheet(false);
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
    count.textContent = unread > 9 ? '9+' : String(unread);
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
    const pendingCapabilities = window.__BRASTA_CHAT_CAPABILITIES__;
    if (pendingCapabilities) capabilities = { ...capabilities, ...pendingCapabilities };

    window.addEventListener('brasta-chat-context', (event) => {
      context = event.detail || context;
      queueEnhance();
    });
    window.addEventListener('brasta-chat-capabilities', (event) => {
      capabilities = { ...capabilities, ...(event.detail || {}) };
      if (capabilities.consented && consentCheckbox) consentCheckbox.checked = false;
      if (consentButton) consentButton.disabled = true;
      updateComposer();
      if (open) renderMessages(false);
    });
    window.addEventListener('brasta-chat-history', (event) => setHistory(event.detail || {}));
    window.addEventListener('brasta-chat-message', (event) => addMessage(event.detail || {}));
    window.addEventListener('brasta-chat-message-removed', (event) => removeMessage(event.detail?.messageId, event.detail?.roomCode));
    window.addEventListener('brasta-chat-report-result', () => {
      closeSafetySheet();
      setStatus('Report received. The moderation team can now review it.');
    });
    window.addEventListener('brasta-chat-block-result', (event) => blockUser(event.detail?.blockedUserId));
    window.addEventListener('brasta-chat-error', (event) => {
      if (blockButton) blockButton.disabled = false;
      setStatus(event.detail?.message || 'Could not complete that chat action.', true);
    });
    window.addEventListener('brasta-auth-changed', (event) => {
      if (!event.detail?.signedIn) {
        capabilities = { ...capabilities, signedIn: false, userId: null, consented: false, canSend: false };
        updateComposer();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !open) return;
      if (safetySheet && !safetySheet.hidden) closeSafetySheet();
      else closeChat();
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
