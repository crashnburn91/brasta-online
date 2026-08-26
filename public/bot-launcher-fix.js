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

  function normalizedText(el) {
    return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function findVisiblePlayCard() {
    const candidates = Array.from(document.querySelectorAll('button,a,[role="button"],div'));
    const exact = candidates.filter((el) => {
      const text = normalizedText(el);
      if (!/^🤖?\s*Play vs Bot(?:\s+Practice a private 1v1 match)?$/i.test(text)) return false;
      const rect = el.getBoundingClientRect?.();
      return !rect || (rect.width > 0 && rect.height > 0);
    });
    if (!exact.length) return null;

    // Prefer the smallest matching visible element so we get the actual card/row, not a large ancestor.
    exact.sort((a, b) => {
      const ar = a.getBoundingClientRect?.();
      const br = b.getBoundingClientRect?.();
      return ((ar?.width || 9999) * (ar?.height || 9999)) - ((br?.width || 9999) * (br?.height || 9999));
    });
    return exact[0];
  }

  function findLearnCard(playCard) {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,strong'));
    const heading = headings.find((el) => /^learn brasta$/i.test(normalizedText(el)));
    if (!heading || !playCard) return null;

    let node = playCard;
    while (node && node !== document.body) {
      if (node.contains(heading)) return node;
      node = node.parentElement;
    }
    return heading.parentElement?.parentElement || heading.parentElement || null;
  }

  function ensureStyles() {
    if (document.getElementById('brasta-bot-launcher-style')) return;
    const style = document.createElement('style');
    style.id = 'brasta-bot-launcher-style';
    style.textContent = `
      [data-bot-difficulty]{display:none!important}
      .bot-difficulty-panel{display:block!important;visibility:visible!important;opacity:1!important;margin:14px 0 10px;padding:12px 14px;border:1px solid rgba(224,188,86,.34);border-radius:18px;background:rgba(7,27,19,.5)}
      .bot-difficulty-label{display:block!important;margin-bottom:9px;font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#d6bd76}
      .bot-difficulty-options{display:grid!important;grid-template-columns:1fr 1fr;gap:8px}
      .bot-difficulty-options button{display:flex!important;align-items:center;justify-content:center;visibility:visible!important;opacity:1!important;min-height:44px;width:100%;border-radius:14px;border:1px solid rgba(224,188,86,.34);background:rgba(8,40,27,.74);font-weight:800;color:#f5f0df}
      .bot-difficulty-options button.active{background:#dfbd59;color:#18160f;border-color:#f0d477;box-shadow:0 0 0 1px rgba(240,212,119,.18) inset}
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
    const playCard = findVisiblePlayCard();
    if (!playCard) return;
    const learnCard = findLearnCard(playCard);
    if (!learnCard) return;

    document.querySelectorAll('[data-bot-difficulty]').forEach((el) => el.remove());

    let panel = document.querySelector('.bot-difficulty-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'bot-difficulty-panel';
      panel.innerHTML = '<span class="bot-difficulty-label">Bot difficulty</span><div class="bot-difficulty-options"><button type="button" data-bot-difficulty-choice="normal">Normal</button><button type="button" data-bot-difficulty-choice="hard">Hard</button></div>';
      panel.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-bot-difficulty-choice]') : null;
        if (!(button instanceof HTMLElement)) return;
        setDifficulty(button.dataset.botDifficultyChoice || 'normal');
        syncButtons(panel);
      });
    }

    // Always re-anchor it directly above the visible Play vs Bot card.
    if (playCard.parentElement && panel.nextElementSibling !== playCard) {
      playCard.parentElement.insertBefore(panel, playCard);
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
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const playCard = target.closest('[data-play-bot]') || target.closest('button,a,[role="button"],div');
    if (!playCard || !/^🤖?\s*Play vs Bot/i.test(normalizedText(playCard))) return;

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
    setTimeout(ensureDifficultyPanel, 250);
    setTimeout(ensureDifficultyPanel, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
