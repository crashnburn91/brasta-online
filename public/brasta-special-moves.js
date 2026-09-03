(() => {
  'use strict';
  if (window.__BRASTA_SPECIAL_MOVE_EFFECTS__) return;
  window.__BRASTA_SPECIAL_MOVE_EFFECTS__ = true;

  const EFFECT_SHOW_MS = 2800;
  const BIG10_SHOW_MS = 1900;
  const EFFECT_FADE_MS = 220;
  const hapticKeys = new Set();
  const presentedKeys = new Set();
  const effectQueue = [];
  let activeEffect = null;
  let syncQueued = false;

  const flightSuits = ['♠', '♦', '♣', '♥', '♦', '♠', '♥', '♣'];
  const burstSuits = ['♠', '♦', '♣', '♥', '♠', '♦', '♣', '♥', '♦', '♠', '♥', '♣'];
  const big10RushSuits = ['♠', '♥', '♣', '♦', '♣', '♥'];
  const scoringBonuses = Object.freeze([
    { name: 'a Brasta', label: 'BRASTA', pattern: /\bBRASTA!/i },
    { name: 'Big 2', label: 'BIG 2', pattern: /\bBIG\s*2\b/i },
    { name: 'Big 10', label: 'BIG 10', pattern: /\bBIG\s*10\b/i },
    { name: 'Last Pickup', label: 'LAST PICKUP', pattern: /\bLAST\s+PICKUP!/i },
  ]);

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

  function big10FlightMarkup() {
    return big10RushSuits.map((suit) => {
      const red = suit === '♦' || suit === '♥' ? ' red' : '';
      return `<i class="big10-rush-card${red}"><b>${suit}</b></i>`;
    }).join('');
  }

  function diamondBurstMarkup() {
    return Array.from({ length: 12 }, () => '<i>♦</i>').join('');
  }

  function matchingBonuses(text) {
    const value = String(text || '');
    return scoringBonuses.filter((bonus) => bonus.pattern.test(value));
  }

  function eventPoints(text) {
    return Math.max(10, matchingBonuses(text).length * 10);
  }

  function naturalList(items) {
    if (items.length < 2) return items[0] || '';
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
  }

  function bonusBadgesMarkup(text, primaryLabel) {
    const badges = matchingBonuses(text)
      .filter((bonus) => bonus.label !== primaryLabel)
      .map((bonus) => `<span class="brasta-combo-medallion">${bonus.label}</span>`);
    return badges.join('');
  }

  function scheduleHaptic(banner) {
    const kind = banner.dataset.specialMoveKind || 'special';
    const key = `${banner.dataset.eventSeq || ''}|${kind}`;
    if (!key || hapticKeys.has(key)) return;
    hapticKeys.add(key);
    while (hapticKeys.size > 80) hapticKeys.delete(hapticKeys.values().next().value);

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof navigator.vibrate !== 'function') return;
    window.setTimeout(() => {
      if (!banner.isConnected || document.visibilityState !== 'visible') return;
      const pattern = kind === 'big10' ? [18, 32, 46] : 42;
      try { navigator.vibrate(pattern); } catch {}
    }, 480);
  }

  function rememberEffect(key) {
    presentedKeys.add(key);
    while (presentedKeys.size > 80) presentedKeys.delete(presentedKeys.values().next().value);
  }

  function playNextEffect() {
    if (activeEffect || !effectQueue.length) return;
    const next = effectQueue.shift();
    if (!next?.layer) return;

    activeEffect = next;
    document.body.append(next.layer);
    scheduleHaptic(next.layer);

    window.setTimeout(() => {
      next.layer.classList.add('brasta-event-leaving');
      window.setTimeout(() => {
        next.layer.remove();
        if (activeEffect?.key === next.key) activeEffect = null;
        playNextEffect();
      }, EFFECT_FADE_MS);
    }, next.showMs || EFFECT_SHOW_MS);
  }

  function decorateBrasta(banner, rawText) {
    if (banner.dataset.brastaEffectKind === 'brasta') return;
    const key = `${banner.dataset.eventSeq || ''}|brasta`;
    banner.dataset.brastaEffectKind = 'brasta';
    banner.dataset.brastaRawEvent = rawText;
    banner.classList.add('brasta-effect-source');
    banner.setAttribute('aria-hidden', 'true');
    if (!key || presentedKeys.has(key)) return;

    const team = eventTeam(banner, rawText);
    const actor = eventActor(team);
    const bonuses = matchingBonuses(rawText);
    const totalPoints = eventPoints(rawText);
    const scoringLabel = naturalList(bonuses.map((bonus) => bonus.name));

    const layer = document.createElement('div');
    layer.className = 'event brasta-crest-event brasta-effect-layer';
    if (team === 'A') layer.classList.add('team-event-blue');
    if (team === 'B') layer.classList.add('team-event-red');
    layer.dataset.eventSeq = banner.dataset.eventSeq || '';
    layer.dataset.eventText = rawText;
    layer.dataset.brastaRawEvent = rawText;
    layer.dataset.specialMoveKind = 'brasta';
    if (team) layer.dataset.eventTeam = team;
    layer.dataset.brastaTotalPoints = String(totalPoints);
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-label', `${actor} scored ${totalPoints} points from ${scoringLabel}.`);
    layer.innerHTML = `
      <span class="brasta-crest-vignette" aria-hidden="true"></span>
      <span class="brasta-card-storm" aria-hidden="true">${flightCardsMarkup()}</span>
      <span class="brasta-crest-shockwave" aria-hidden="true"></span>
      <span class="brasta-suit-burst" aria-hidden="true">${burstMarkup()}</span>
      <span class="brasta-crest-seal" aria-hidden="true">
        <span class="brasta-crest-player">${escapeHtml(actor)}</span>
        <span class="brasta-crest-suits"><i>♠</i><i>♦</i><i>♣</i><i>♥</i></span>
        <strong class="brasta-crest-title">BRASTA<em>!</em></strong>
        <span class="brasta-crest-score"><b>+${totalPoints}</b><small>POINTS</small></span>
        <span class="brasta-crest-footer">${bonusBadgesMarkup(rawText, 'BRASTA') || '<span>Board cleared</span>'}</span>
      </span>`;

    rememberEffect(key);
    effectQueue.push({ key, layer });
    playNextEffect();
  }

  function decorateBig10(banner, rawText) {
    if (banner.dataset.brastaEffectKind === 'big10') return;
    const key = `${banner.dataset.eventSeq || ''}|big10`;
    banner.dataset.brastaEffectKind = 'big10';
    banner.dataset.brastaRawEvent = rawText;
    banner.classList.add('brasta-effect-source');
    banner.setAttribute('aria-hidden', 'true');
    if (!key || presentedKeys.has(key)) return;

    const team = eventTeam(banner, rawText);
    const actor = eventActor(team);
    const bonuses = matchingBonuses(rawText);
    const totalPoints = eventPoints(rawText);
    const scoringLabel = naturalList(bonuses.map((bonus) => bonus.name));
    const companionBonuses = bonuses.filter((bonus) => bonus.label !== 'BIG 10');
    const prizeLabel = companionBonuses.length === 0
      ? 'DIAMOND CAPTURED'
      : companionBonuses.length === 1
        ? 'DOUBLE PRIZE'
        : 'TRIPLE PRIZE';

    const layer = document.createElement('div');
    layer.className = 'event big10-strike-event brasta-effect-layer';
    if (team === 'A') layer.classList.add('team-event-blue');
    if (team === 'B') layer.classList.add('team-event-red');
    layer.dataset.eventSeq = banner.dataset.eventSeq || '';
    layer.dataset.eventText = rawText;
    layer.dataset.brastaRawEvent = rawText;
    layer.dataset.specialMoveKind = 'big10';
    layer.dataset.brastaTotalPoints = String(totalPoints);
    if (team) layer.dataset.eventTeam = team;
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-label', `${actor} scored ${totalPoints} points from ${scoringLabel}.`);
    layer.innerHTML = `
      <span class="big10-strike-vignette" aria-hidden="true"></span>
      <span class="big10-strike-beam" aria-hidden="true"></span>
      <span class="big10-card-rush" aria-hidden="true">${big10FlightMarkup()}</span>
      <span class="big10-diamond-shockwave" aria-hidden="true"></span>
      <span class="big10-diamond-burst" aria-hidden="true">${diamondBurstMarkup()}</span>
      <span class="big10-strike-lockup" aria-hidden="true">
        <span class="big10-prize-card">
          <span class="big10-card-corner">10<i>♦</i></span>
          <strong>♦</strong>
          <span class="big10-card-corner bottom">10<i>♦</i></span>
        </span>
        <span class="big10-strike-copy">
          <span class="big10-strike-player">${escapeHtml(actor)}</span>
          <strong class="big10-strike-title">BIG <em>10</em></strong>
          <span class="big10-strike-score"><b>+${totalPoints}</b><small>POINTS</small></span>
          <span class="big10-strike-footer">
            <small>${prizeLabel}</small>
            <span class="big10-combo-badges">${bonusBadgesMarkup(rawText, 'BIG 10')}</span>
          </span>
        </span>
      </span>`;

    rememberEffect(key);
    effectQueue.push({ key, layer, showMs: BIG10_SHOW_MS });
    playNextEffect();
  }

  const renderers = [
    {
      name: 'brasta',
      matches: (text) => /\bBRASTA!/i.test(text),
      decorate: decorateBrasta,
    },
    {
      name: 'big10',
      matches: (text) => /\bBIG\s*10\b/i.test(text) && !/\bBRASTA!/i.test(text),
      decorate: decorateBig10,
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

  window.BrastaSpecialMoves = Object.freeze({ refresh: queueSync, pointsForEvent: eventPoints });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
