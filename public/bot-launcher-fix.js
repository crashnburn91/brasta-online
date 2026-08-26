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

  function isLearnHeading(el) {
    return /^learn brasta$/i.test(String(el?.textContent || '').trim());
  }

  function findLearnCard() {
    const heading = Array.from(document.querySelectorAll('h1,h2,h3,strong')).find(isLearnHeading);
    if (!heading) return null;

    const playButton = document.querySelector('[data-play-bot]');
    if (playButton) {
      let node = playButton.parentElement;
      while (node && node !== document.body) {
        if (node.contains(heading)) return node;
        node = node.parentElement;
      }
    }

    // Prefer the semantic/card shell, not the heading's immediate wrapper.
    return heading.closest('section, article, .landing-card, .home-card, .product-card') || heading.parentElement?.parentElement || heading.parentElement;
  }

  function ensureStyles() {
    if (document.getElementById('brasta-bot-launcher-style')) return;
    const style = document.createElement('style');
    style.id = 'brasta-bot-launcher-style';
    style.textContent = `
      [data-bot-difficulty]{display:none!important}
      .bot-difficulty-panel{margin:14px 0 10px;padding:12px 14px;border:1px solid rgba(224,188,86,.34);border-radius:18px;background:rgba(7,27,19,.5)}
      .bot-difficulty-label{display:block;margin-bottom:9px;font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#d6bd76}
      .bot-difficulty-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .bot-difficulty-options button{display:flex!important;align-items:center;justify-content:center;visibility:visible!important;opacity:1!important;min-height:44px;width:100%;border-radius:14px;border:1px solid rgba(224,188,86,.34);background:rgba(8,40,27,.74);font-weight:800;color:#f5f0df}
      .bot-difficulty-options button.active{background:#dfbd59;color:#18160f;border-color:#f0d477;box-shadow:0 0 0 1px rgba(240,212,119,.18) inset}
    `;
    document.head.appendChild(style);
  }

  function syncButtons(panel) {
    const current = difficulty();
    panel.querySelectorAll('[data-bot-difficulty-choice]').forEach((button) => {
      button.classList.toggle('active', button.dataset.botDifficultyChoice === current);
      button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
    });
  }

  function ensureDifficultyPanel() {
    ensureStyles();
    const learnCard = findLearnCard();
    if (!learnCard) return;

    document.querySelectorAll('[data-bot-difficulty]').forEach((el) => el.remove());
    document.querySelectorAll('.bot-difficulty-panel').forEach((el) => { if (!learnCard.contains(el)) el.remove(); });

    let panel = learnCard.querySelector('.bot-difficulty-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'bot-difficulty-panel';
      panel.innerHTML = '<span class="bot-difficulty-label">Bot difficulty</span><div class="bot-difficulty-options"><button type="button" data-bot-difficulty-choice="normal">Normal</button><button type="button" data-bot-difficulty-choice="hard">Hard</button></div>';

      // Place the difficulty selector immediately before the Play vs Bot row/card.
      const playButton = learnCard.querySelector('[data-play-bot]');
      const playRow = playButton?.closest('.button-row, [data-bot-practice-controls]') || playButton?.parentElement;
      if (playRow?.parentElement && learnCard.contains(playRow)) playRow.parentElement.insertBefore(panel, playRow);
      else if (playButton?.parentElement) playButton.parentElement.insertBefore(panel, playButton);
      else learnCard.appendChild(panel);

      panel.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-bot-difficulty-choice]') : null;
        if (!(button instanceof HTMLElement)) return;
        setDifficulty(button.dataset.botDifficultyChoice || 'normal');
        syncButtons(panel);
      });
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
