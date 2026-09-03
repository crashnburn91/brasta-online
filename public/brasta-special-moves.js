(() => {
  'use strict';
  if (window.__BRASTA_SPECIAL_MOVE_EFFECTS__) return;
  window.__BRASTA_SPECIAL_MOVE_EFFECTS__ = true;

  const hapticKeys = new Set();
  let syncQueued = false;

  const flightSuits = ['♠', '♦', '♣', '♥', '♦', '♠', '♥', '♣'];
  const burstSuits = ['♠', '♦', '♣', '♥', '♠', '♦', '♣', '♥', '♦', '♠', '♥', '♣'];

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    })[character]);
  }

  function eventTeam(banner, text) {
    const stored = String(banner.dataset.eventTeam || banner.dataset.brastaEventTeam || '').toUpperCase();
    if (stored === 'A' || stored === 'B') return stored;
    const match = String(text || '').match(/\bTeam\s+([AB])\b/i);
    return match ? match[1].toUpperCase() : '';
  }

  function playerNames() {
    return Array.from(document.querySelectorAll('.player-chip .player-name'))
      .map((node) => String(node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
  }

  function eventActor(team) {
    const lastMove = String(document.querySelector('.last-move-banner b')?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    const normalizedMove = lastMove.toLowerCase();

    for (const name of playerNames()) {
      const normalizedName = name.toLowerCase();
      if (normalizedMove.startsWith(`${normalizedName} `) || normalizedMove.includes(`${normalizedName} called burn`)) {
        return name;
      }
    }

    const actionMatch = lastMove.match(/^(.+?)\s+(?:captured|called burn|swept)\b/i);
    if (actionMatch?.[1]) return actionMatch[1].trim();
    return team === 'A' ? 'Blue Team' : team === 'B' ? 'Red Team' : 'Brasta';
  }

  function flightCardsMarkup() {
    return flightSuits.map((suit) => {
      const red = suit === '♦' || suit === '♥' ? ' red' : '';
      return `<span class="brasta-flight-card${red}"><b>${suit}</b></span>`;
    }).join('');
  }

  function burstMarkup() {
    return burstSuits.map((suit) => {
      const red = suit === '♦' || suit === '♥' ? ' red' : '';
      return `<i class="brasta-suit-particle${red}">${suit}</i>`;
    }).join('');
  }

  function comboMarkup(text) {
    const badges = [];
    if (/BIG\s*2/i.test(text)) badges.push('<span class="brasta-combo-medallion">BIG 2</span>');
    if (/BIG\s*10/i.test(text)) badges.push('<span class="brasta-combo-medallion">BIG 10</span>');
    return badges.length ? badges.join('') : '<span>Board cleared</span>';
  }

  function scheduleHaptic(banner) {
    const key = `${banner.dataset.eventSeq || ''}|brasta`;
    if (!key || hapticKeys.has(key)) return;
    hapticKeys.add(key);
    while (hapticKeys.size > 80) hapticKeys.delete(hapticKeys.values().next().value);

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof navigator.vibrate !== 'function') return;
    window.setTimeout(() => {
      if (!banner.isConnected || document.visibilityState !== 'visible') return;
      try { navigator.vibrate(42); } catch {}
    }, 480);
  }

  function decorateBrasta(banner, rawText) {
    if (banner.dataset.brastaEffectKind === 'brasta') return;
    const team = eventTeam(banner, rawText);
    const actor = eventActor(team);
    const hasBig2 = /BIG\s*2/i.test(rawText);
    const hasBig10 = /BIG\s*10/i.test(rawText);
    const combination = [hasBig2 ? 'Big 2' : '', hasBig10 ? 'Big 10' : ''].filter(Boolean);
    const combinationLabel = combination.length ? ` with ${combination.join(' and ')}` : '';

    banner.dataset.brastaEffectKind = 'brasta';
    banner.dataset.brastaRawEvent = rawText;
    banner.classList.add('brasta-crest-event');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', `${actor} scored a Brasta for 10 points${combinationLabel}.`);
    banner.innerHTML = `
      <span class="brasta-crest-vignette" aria-hidden="true"></span>
      <span class="brasta-card-storm" aria-hidden="true">${flightCardsMarkup()}</span>
      <span class="brasta-crest-shockwave" aria-hidden="true"></span>
      <span class="brasta-suit-burst" aria-hidden="true">${burstMarkup()}</span>
      <span class="brasta-crest-seal" aria-hidden="true">
        <span class="brasta-crest-player">${escapeHtml(actor)}</span>
        <span class="brasta-crest-suits"><i>♠</i><i>♦</i><i>♣</i><i>♥</i></span>
        <strong class="brasta-crest-title">BRASTA<em>!</em></strong>
        <span class="brasta-crest-score"><b>+10</b><small>POINTS</small></span>
        <span class="brasta-crest-footer">${comboMarkup(rawText)}</span>
      </span>`;

    scheduleHaptic(banner);
  }

  const renderers = [
    {
      name: 'brasta',
      matches: (text) => /\bBRASTA!/i.test(text),
      decorate: decorateBrasta,
    },
  ];

  function enhanceBanner(banner) {
    if (!(banner instanceof HTMLElement)) return;
    const rawText = String(banner.dataset.eventText || banner.dataset.brastaRawEvent || banner.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!rawText) return;

    const renderer = renderers.find((candidate) => candidate.matches(rawText));
    if (renderer) renderer.decorate(banner, rawText);
  }

  function sync() {
    syncQueued = false;
    document.querySelectorAll('.transient-event-overlay[data-event-seq]').forEach(enhanceBanner);
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(sync);
  }

  function boot() {
    new MutationObserver(queueSync).observe(document.body, { childList: true, subtree: true });
    queueSync();
  }

  window.BrastaSpecialMoves = Object.freeze({ refresh: queueSync });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
