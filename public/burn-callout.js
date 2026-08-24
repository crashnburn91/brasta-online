(() => {
  if (window.__BRASTA_BURN_CALLOUT__) return;
  window.__BRASTA_BURN_CALLOUT__ = true;

  let activeSocket = null;
  let pendingBurnId = null;
  let queued = false;

  function attachSocket(ws) {
    if (!ws || ws.__brastaBurnAttached) return;
    let path = '';
    try { path = new URL(ws.url, location.href).pathname; } catch {}
    if (path !== '/api/ws') return;
    ws.__brastaBurnAttached = true;
    activeSocket = ws;
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'BURN_OPTIONS') {
        pendingBurnId = String(message.burnId || '');
        showOptions(Array.isArray(message.options) ? message.options : []);
      } else if (message.type === 'BURN_RESULT') {
        closeOptions();
        showToast(String(message.message || 'No valid burn to call.'));
      } else if (message.type === 'BURN_RESOLVED') {
        closeOptions();
      }
    });
    ws.addEventListener('close', () => {
      if (activeSocket === ws) activeSocket = null;
      closeOptions();
    });
  }

  const nativeSend = WebSocket.prototype.send;
  if (!WebSocket.prototype.__brastaBurnSendPatched) {
    Object.defineProperty(WebSocket.prototype, '__brastaBurnSendPatched', { value: true });
    WebSocket.prototype.send = function patchedBrastaSend(data) {
      attachSocket(this);
      return nativeSend.call(this, data);
    };
  }

  function send(payload) {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      showToast('Connection interrupted. Reconnecting…');
      return;
    }
    activeSocket.send(JSON.stringify(payload));
  }

  function callBurn() {
    send({ type: 'CALL_BURN' });
  }

  function resolveBurn(optionId) {
    if (!pendingBurnId) return;
    const burnId = pendingBurnId;
    closeOptions();
    send({ type: 'RESOLVE_BURN', burnId, optionId });
  }

  function showToast(text) {
    document.querySelector('.burn-call-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'burn-call-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2200);
  }

  function closeOptions() {
    pendingBurnId = null;
    document.querySelector('.burn-call-modal')?.remove();
  }

  function showOptions(options) {
    closeOptions();
    if (!options.length) {
      showToast('No valid burn pickup is available.');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'burn-call-modal';
    const card = document.createElement('section');
    card.className = 'burn-call-card';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'burn-call-eyebrow';
    eyebrow.textContent = 'BURN CAUGHT';
    const title = document.createElement('h2');
    title.textContent = 'Choose the pickup';
    const copy = document.createElement('p');
    copy.textContent = 'The burn is valid. Take the pickup the player should have made.';
    const list = document.createElement('div');
    list.className = 'burn-call-options';

    for (const option of options) {
      const button = document.createElement('button');
      button.className = 'primary';
      button.type = 'button';
      button.textContent = String(option.label || 'Take pickup');
      button.onclick = () => resolveBurn(String(option.id || ''));
      list.appendChild(button);
    }

    card.append(eyebrow, title, copy, list);
    modal.appendChild(card);
    document.body.appendChild(modal);
  }

  function shouldShowButton() {
    return !!document.querySelector('.topbar .room-pill')
      && !!document.querySelector('.table')
      && !document.querySelector('.topbar .spectator-pill');
  }

  function enhance() {
    queued = false;
    const existing = document.querySelector('[data-call-burn]');
    if (!shouldShowButton()) {
      existing?.remove();
      closeOptions();
      return;
    }
    if (existing) return;

    const nav = document.querySelector('.topbar nav');
    if (!nav) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'burn-call-button';
    button.dataset.callBurn = 'true';
    button.textContent = 'Call Burn';
    button.title = 'Call out the previous player for missing a legal pickup';
    button.onclick = callBurn;
    nav.prepend(button);
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    new MutationObserver(queueEnhance).observe(document.documentElement, { childList: true, subtree: true });
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
