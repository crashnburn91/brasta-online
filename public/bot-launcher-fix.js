(() => {
  'use strict';
  if (window.__BRASTA_BOT_LAUNCHER_FIX__) return;
  window.__BRASTA_BOT_LAUNCHER_FIX__ = true;

  const DIFFICULTY_KEY = 'brasta-bot-difficulty';
  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const LAST_NAME_KEY = 'brasta-online-last-name';

  function difficulty() {
    try { return localStorage.getItem(DIFFICULTY_KEY) === 'hard' ? 'hard' : 'normal'; }
    catch { return 'normal'; }
  }

  function setDifficulty(value) {
    try { localStorage.setItem(DIFFICULTY_KEY, value === 'hard' ? 'hard' : 'normal'); } catch {}
  }

  function ensureStyles() {
    if (document.getElementById('brasta-bot-launcher-style')) return;
    const style = document.createElement('style');
    style.id = 'brasta-bot-launcher-style';
    style.textContent = `
      [data-bot-difficulty]{display:none!important}
      .learn-brasta-actions .bot-difficulty-panel{display:block!important;margin:0;padding:11px 13px;border:1px solid #d8b75e66;border-radius:12px;background:linear-gradient(135deg,#123428,#0a241b);box-sizing:border-box}
      .learn-brasta-actions .bot-difficulty-label{display:block;margin:0 0 8px;color:#d8b75e;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
      .learn-brasta-actions .bot-difficulty-options{display:grid!important;grid-template-columns:1fr 1fr;gap:8px;width:100%}
      .learn-brasta-actions .bot-difficulty-options button{display:flex!important;visibility:visible!important;opacity:1!important;align-items:center!important;justify-content:center!important;width:100%!important;min-height:38px!important;margin:0!important;padding:8px 12px!important;border:1px solid #d8b75e55!important;border-radius:9px!important;background:#0d2a20!important;color:#f8f1d2!important;font:inherit!important;font-size:12px!important;font-weight:800!important;cursor:pointer!important}
      .learn-brasta-actions .bot-difficulty-options button.active{border-color:#f0d77f!important;background:linear-gradient(180deg,#ead06d,#cda33d)!important;color:#211906!important;box-shadow:inset 0 1px 0 #fff7,0 4px 10px #0003!important}
    `;
    document.head.appendChild(style);
  }

  function syncButtons(panel) {
    const current = difficulty();
    panel.querySelectorAll('[data-bot-difficulty-choice]').forEach((button) => {
      const active = button.dataset.botDifficultyChoice === current;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function ensureDifficultyPanel() {
    ensureStyles();

    // product-surface.css visually renames the legacy local card to “Learn Brasta”.
    // The stable DOM identity is the card containing [data-newmode].
    const learnCard = document.querySelector('.landing-card:has([data-newmode])');
    if (!learnCard) return;

    const actions = learnCard.querySelector('.learn-brasta-actions');
    const botButton = actions?.querySelector('.learn-bot-launch, [data-play-bot]');
    if (!actions || !botButton) return;

    document.querySelectorAll('[data-bot-difficulty]').forEach((el) => el.remove());

    let panel = actions.querySelector('.bot-difficulty-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'bot-difficulty-panel';
      panel.innerHTML = '<span class="bot-difficulty-label">Bot Difficulty</span><div class="bot-difficulty-options"><button type="button" data-bot-difficulty-choice="normal">Normal</button><button type="button" data-bot-difficulty-choice="hard">Hard</button></div>';
      panel.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-bot-difficulty-choice]') : null;
        if (!(button instanceof HTMLElement)) return;
        setDifficulty(button.dataset.botDifficultyChoice || 'normal');
        syncButtons(panel);
      });
    }

    if (panel.parentElement !== actions || panel.nextElementSibling !== botButton) {
      actions.insertBefore(panel, botButton);
    }
    syncButtons(panel);
  }

  function preferredGuestName() {
    try {
      const signedIn = !!localStorage.getItem(AUTH_TOKEN_KEY);
      if (!signedIn) return 'Player';
      const saved = String(localStorage.getItem(LAST_NAME_KEY) || '').trim();
      return saved.slice(0, 24) || 'Player';
    } catch { return 'Player'; }
  }

  document.addEventListener('click', (event) => {
    const playBot = event.target instanceof Element ? event.target.closest('[data-play-bot]') : null;
    if (!playBot) return;
    const input = document.querySelector('#create-name');
    if (input instanceof HTMLInputElement && !input.value.trim()) {
      input.value = preferredGuestName();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, true);

  function boot() {
    const root = document.getElementById('app') || document.body;
    let queued = false;
    const refresh = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        ensureDifficultyPanel();
      });
    };
    new MutationObserver(refresh).observe(root, { childList: true, subtree: true });
    ensureDifficultyPanel();
    window.setTimeout(ensureDifficultyPanel, 100);
    window.setTimeout(ensureDifficultyPanel, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
