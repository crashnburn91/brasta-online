(() => {
  'use strict';
  if (window.__BRASTA_SPECIAL_MOVE_EFFECTS__) return;
  window.__BRASTA_SPECIAL_MOVE_EFFECTS__ = true;

  const EFFECT_SHOW_MS = 2800;
  const BIG2_SHOW_MS = 1900;
  const BIG10_SHOW_MS = 1900;
  const POWER_PAIR_SHOW_MS = 2200;
  const BURNED_JACK_SHOW_MS = 2000;
  const JACK_SWEEP_SHOW_MS = 900;
  const JACK_SWEEP_COMBO_SHOW_MS = 620;
  const EFFECT_FADE_MS = 220;
  const hapticKeys = new Set();
  const presentedKeys = new Set();
  const jackSweepSnapshots = new Map();
  const effectQueue = [];
  let activeEffect = null;
  let syncQueued = false;

  const flightSuits = ['♠', '♦', '♣', '♥', '♦', '♠', '♥', '♣'];
  const burstSuits = ['♠', '♦', '♣', '♥', '♠', '♦', '♣', '♥', '♦', '♠', '♥', '♣'];
  const big10RushSuits = ['♠', '♥', '♣', '♦', '♣', '♥'];
  const burnedJackEmbers = [
    [-184, -82, -18, 4, 0], [-148, 94, 23, 5, 55], [-104, -132, -34, 3, 115],
    [-66, 126, 31, 4, 30], [-24, -154, -12, 6, 85], [28, 142, 19, 3, 140],
    [72, -128, 27, 5, 18], [112, 112, -25, 4, 105], [158, -88, 36, 5, 65],
    [188, 54, -31, 3, 130], [-204, 18, 17, 4, 92], [206, -18, -14, 6, 42],
    [-118, -24, 28, 3, 165], [132, 18, -22, 4, 155], [-42, 76, 35, 5, 70],
    [48, -64, -27, 3, 122],
  ];
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

    const actionMatch = lastMove.match(/^(.+?)\s+(?:captured|called burn|swept|burned)\b/i);
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

  function burnedJackEmbersMarkup() {
    return burnedJackEmbers.map(([x, y, rotation, size, delay]) =>
      `<i style="--burn-x:${x}px;--burn-y:${y}px;--burn-r:${rotation}deg;--burn-size:${size}px;--burn-delay:${delay}ms"></i>`
    ).join('');
  }

  const fallbackSweepCardFaces = [
    ['4', '♣'], ['7', '♦'], ['3', '♥'], ['A', '♠'], ['5', '♣'], ['8', '♦'],
  ];

  const suitSymbols = Object.freeze({
    clubs: '♣',
    diamonds: '♦',
    hearts: '♥',
    spades: '♠',
  });

  function suitSymbol(suit) {
    return suitSymbols[suit] || String(suit || '♠');
  }

  function isRedSuit(suit) {
    const symbol = suitSymbol(suit);
    return symbol === '♦' || symbol === '♥';
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function rememberJackSweepSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    const key = String(snapshot.key || '');
    const cards = Array.isArray(snapshot.cards) ? snapshot.cards : [];
    if (!key || !cards.length) return;
    jackSweepSnapshots.set(key, { ...snapshot, cards: cards.slice(0, 24) });
    while (jackSweepSnapshots.size > 8) jackSweepSnapshots.delete(jackSweepSnapshots.keys().next().value);
  }

  function ingestPendingJackSweepSnapshots() {
    const pending = Array.isArray(window.__BRASTA_JACK_SWEEP_SNAPSHOTS__)
      ? window.__BRASTA_JACK_SWEEP_SNAPSHOTS__
      : [];
    pending.forEach(rememberJackSweepSnapshot);
    window.__BRASTA_JACK_SWEEP_SNAPSHOTS__ = [];
  }

  function snapshotForBanner(banner) {
    const key = String(banner.dataset.eventKey || '');
    if (key && jackSweepSnapshots.has(key)) {
      const snapshot = jackSweepSnapshots.get(key);
      jackSweepSnapshots.delete(key);
      return snapshot;
    }
    return null;
  }

  function sweptLooseCount() {
    const lastMove = String(document.querySelector('.last-move-banner b')?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    const count = Number(lastMove.match(/\bswept\s+(\d+)\s+loose\s+cards?/i)?.[1] || 0);
    return Math.min(24, Math.max(1, count || 3));
  }

  function sweptJackSuit(snapshot = null) {
    if (snapshot?.jackSuit) return suitSymbol(snapshot.jackSuit);
    const lastMove = String(document.querySelector('.last-move-banner b')?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    return lastMove.match(/\b(?:with|burned)\s+J\s*([♠♦♣♥])/i)?.[1] || '♠';
  }

  function sweepCardMarkup(card, index, target, frame, combo = false) {
    const rank = String(card.rank || '•');
    const suit = suitSymbol(card.suit);
    const width = Math.max(28, Math.min(118, safeNumber(card.width, 64)));
    const height = Math.max(42, Math.min(170, safeNumber(card.height, width * 1.43)));
    const left = safeNumber(card.left, window.innerWidth * 0.5 - width * 0.5);
    const top = safeNumber(card.top, window.innerHeight * 0.57 - height * 0.5);
    const frameLeft = safeNumber(frame?.left);
    const frameTop = safeNumber(frame?.top);
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const dx = safeNumber(target?.x, centerX + 130) - centerX;
    const dy = safeNumber(target?.y, centerY) - centerY;
    const rotation = (index % 2 ? 1 : -1) * (4 + (index % 3) * 2);
    const targetRotation = rotation + (index % 2 ? 8 : -9);
    const delay = combo
      ? Math.min(110, 26 + index * 14)
      : Math.min(240, 40 + index * 32);
    const red = isRedSuit(suit) ? ' red' : '';
    return `<span class="jack-sweep-loose-card${red}" style="--sweep-left:${Math.round(left - frameLeft)}px;--sweep-top:${Math.round(top - frameTop)}px;--sweep-width:${Math.round(width)}px;--sweep-height:${Math.round(height)}px;--sweep-card-r:${rotation}deg;--sweep-to-x:${Math.round(dx)}px;--sweep-to-y:${Math.round(dy)}px;--sweep-to-r:${targetRotation}deg;--sweep-delay:${delay}ms"><span class="jack-sweep-card-corner">${escapeHtml(rank)}<i>${suit}</i></span><strong>${suit}</strong></span>`;
  }

  function sweepGeometry(snapshot, count) {
    const sourceCards = Array.isArray(snapshot?.cards) && snapshot.cards.length
      ? snapshot.cards.slice(0, 24)
      : Array.from({ length: count }, (_, index) => {
        const [rank, suit] = fallbackSweepCardFaces[index % fallbackSweepCardFaces.length];
        const width = window.innerWidth <= 600 ? 38 : 52;
        const height = Math.round(width * 1.43);
        const centerX = window.innerWidth * 0.5 + (index - Math.max(0, count - 1) / 2) * (width + 8);
        const centerY = window.innerHeight * 0.56 + (index % 2 ? 6 : -6);
        return { rank, suit, left: centerX - width / 2, top: centerY - height / 2, width, height };
      });
    const cards = sourceCards.slice().sort((a, b) => safeNumber(a.left) - safeNumber(b.left) || safeNumber(a.top) - safeNumber(b.top));
    const minLeft = Math.min(...cards.map((card) => safeNumber(card.left)));
    const maxRight = Math.max(...cards.map((card) => safeNumber(card.left) + safeNumber(card.width, 64)));
    const centerY = cards.reduce((sum, card) => sum + safeNumber(card.top) + safeNumber(card.height, 92) / 2, 0) / cards.length;
    const targetX = maxRight + Math.max(90, Math.min(140, window.innerWidth * 0.08));
    const targetY = centerY + Math.min(26, Math.max(10, window.innerHeight * 0.03));
    const jackWidth = Math.max(46, Math.min(76, Math.round((cards.reduce((sum, card) => sum + safeNumber(card.width, 64), 0) / cards.length) * 0.82)));
    const jackHeight = Math.round(jackWidth * 1.43);
    const jack = {
      startX: minLeft - jackWidth * 1.35,
      endX: targetX + jackWidth * 0.55,
      y: centerY,
      width: jackWidth,
      height: jackHeight,
    };
    const minTop = Math.min(...cards.map((card) => safeNumber(card.top)));
    const maxBottom = Math.max(...cards.map((card) => safeNumber(card.top) + safeNumber(card.height, 92)));
    const framePadding = Math.max(18, Math.min(30, window.innerWidth * 0.025));
    const frameLeft = Math.floor(Math.min(minLeft, jack.startX) - framePadding);
    const frameTop = Math.floor(Math.min(minTop, jack.y - jack.height / 2) - framePadding);
    const frameRight = Math.ceil(Math.max(maxRight, jack.endX + jack.width, targetX) + framePadding);
    const frameBottom = Math.ceil(Math.max(maxBottom, jack.y + jack.height / 2) + framePadding);
    return {
      cards,
      target: { x: targetX, y: targetY },
      jack,
      frame: {
        left: frameLeft,
        top: frameTop,
        width: Math.max(1, frameRight - frameLeft),
        height: Math.max(1, frameBottom - frameTop),
      },
    };
  }

  function sweepLooseCardsMarkup(snapshot, count, geometry, combo = false) {
    return geometry.cards.map((card, index) => sweepCardMarkup(card, index, geometry.target, geometry.frame, combo)).join('');
  }

  function jackSweepMarkup(suit, geometry) {
    const symbol = suitSymbol(suit);
    const red = isRedSuit(symbol) ? ' red' : '';
    const { startX, endX, y, width, height } = geometry.jack;
    const frameLeft = safeNumber(geometry.frame?.left);
    const frameTop = safeNumber(geometry.frame?.top);
    const dx = endX - startX;
    return `<span class="jack-sweep-jack${red}" style="--jack-start-x:${Math.round(startX - frameLeft)}px;--jack-end-x:${Math.round(endX - frameLeft)}px;--jack-start-y:${Math.round(y - frameTop)}px;--jack-width:${Math.round(width)}px;--jack-height:${Math.round(height)}px;--jack-dx:${Math.round(dx)}px;--jack-mid-dx:${Math.round(dx * 0.42)}px;--jack-near-dx:${Math.round(dx * 0.78)}px" aria-hidden="true"><span class="jack-sweep-jack-corner">J<i>${symbol}</i></span><strong>J</strong><i>${symbol}</i><span class="jack-sweep-jack-corner bottom">J<i>${symbol}</i></span></span>`;
  }

  function burnedJackSuit() {
    return sweptJackSuit();
  }

  function clubBurstMarkup() {
    return Array.from({ length: 12 }, () => '<i>♣</i>').join('');
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

  function bonusBadgesMarkup(text, primaryLabels) {
    const excluded = new Set(Array.isArray(primaryLabels) ? primaryLabels : [primaryLabels]);
    const badges = matchingBonuses(text)
      .filter((bonus) => !excluded.has(bonus.label))
      .map((bonus) => `<span class="brasta-combo-medallion">${bonus.label}</span>`);
    return badges.join('');
  }

  function brastaComboKind(bonuses) {
    const labels = new Set((bonuses || []).map((bonus) => bonus.label));
    if (labels.has('BIG 2') && labels.has('BIG 10')) return 'power-pair';
    if (labels.has('BIG 2')) return 'big2';
    if (labels.has('BIG 10')) return 'big10';
    return '';
  }

  function brastaComboKindForEvent(text) {
    return brastaComboKind(matchingBonuses(text));
  }

  function brastaComboCopyMarkup(kind, actor, totalPoints, rawText) {
    const variants = {
      big2: {
        player: 'big2-crush-player',
        title: 'big2-crush-title',
        titleMarkup: '<span>BRASTA</span><i>+</i><em>BIG 2</em>',
        score: 'big2-crush-score',
        footer: 'big2-crush-footer',
        badges: 'big2-combo-badges',
        footerLabel: 'BRASTA CLUB CRUSH',
      },
      big10: {
        player: 'big10-strike-player',
        title: 'big10-strike-title',
        titleMarkup: '<span>BRASTA</span><i>+</i><em>BIG 10</em>',
        score: 'big10-strike-score',
        footer: 'big10-strike-footer',
        badges: 'big10-combo-badges',
        footerLabel: 'BRASTA DIAMOND STRIKE',
      },
      'power-pair': {
        player: 'power-pair-player',
        title: 'power-pair-title',
        titleMarkup: '<span>BRASTA</span><i>+</i><span>POWER PAIR</span>',
        score: 'power-pair-score',
        footer: 'power-pair-footer',
        badges: 'power-pair-badges',
        footerLabel: 'BRASTA POWER PAIR',
      },
    };
    const variant = variants[kind];
    if (!variant) return '';
    return `
      <span class="brasta-combo-stamp">BRASTA! <i>♠♦♣♥</i></span>
      <span class="${variant.player}">${escapeHtml(actor)}</span>
      <strong class="${variant.title} brasta-combo-title">${variant.titleMarkup}</strong>
      <span class="${variant.score}"><b>+${totalPoints}</b><small>POINTS</small></span>
      <span class="${variant.footer}">
        <small>${variant.footerLabel}</small>
        <span class="${variant.badges}">${bonusBadgesMarkup(rawText, 'BRASTA')}</span>
      </span>`;
  }

  function brastaComboMarkup(kind, actor, totalPoints, rawText) {
    const copy = brastaComboCopyMarkup(kind, actor, totalPoints, rawText);
    if (!copy) return '';
    if (kind === 'big2') return `
      <span class="big2-crush-vignette" aria-hidden="true"></span>
      <span class="big2-crush-floor" aria-hidden="true"></span>
      <span class="big2-club-pincers" aria-hidden="true"><i>♣</i><i>♣</i></span>
      <span class="big2-club-shockwave" aria-hidden="true">♣</span>
      <span class="big2-club-burst" aria-hidden="true">${clubBurstMarkup()}</span>
      <span class="big2-crush-lockup brasta-combo-lockup" aria-hidden="true">
        <span class="big2-prize-card">
          <span class="big2-card-corner">2<i>♣</i></span>
          <strong>♣</strong>
          <span class="big2-card-corner bottom">2<i>♣</i></span>
        </span>
        <span class="big2-crush-copy brasta-combo-copy">${copy}
        </span>
      </span>`;
    if (kind === 'big10') return `
      <span class="big10-strike-vignette" aria-hidden="true"></span>
      <span class="big10-strike-beam" aria-hidden="true"></span>
      <span class="big10-card-rush" aria-hidden="true">${big10FlightMarkup()}</span>
      <span class="big10-diamond-shockwave" aria-hidden="true"></span>
      <span class="big10-diamond-burst" aria-hidden="true">${diamondBurstMarkup()}</span>
      <span class="big10-strike-lockup brasta-combo-lockup" aria-hidden="true">
        <span class="big10-prize-card">
          <span class="big10-card-corner">10<i>♦</i></span>
          <strong>♦</strong>
          <span class="big10-card-corner bottom">10<i>♦</i></span>
        </span>
        <span class="big10-strike-copy brasta-combo-copy">${copy}
        </span>
      </span>`;
    return `
      <span class="power-pair-vignette" aria-hidden="true"></span>
      <span class="power-pair-club-impact" aria-hidden="true">♣</span>
      <span class="power-pair-diamond-cut" aria-hidden="true"></span>
      <span class="power-pair-shockwave" aria-hidden="true"></span>
      <span class="big2-club-burst power-pair-clubs" aria-hidden="true">${clubBurstMarkup()}</span>
      <span class="big10-diamond-burst power-pair-diamonds" aria-hidden="true">${diamondBurstMarkup()}</span>
      <span class="power-pair-lockup brasta-combo-lockup" aria-hidden="true">
        <span class="power-pair-cards">
          <span class="power-pair-card power-pair-card-big2">
            <span class="power-pair-card-corner">2<i>♣</i></span><strong>♣</strong>
            <span class="power-pair-card-corner bottom">2<i>♣</i></span>
          </span>
          <span class="power-pair-card power-pair-card-big10">
            <span class="power-pair-card-corner">10<i>♦</i></span><strong>♦</strong>
            <span class="power-pair-card-corner bottom">10<i>♦</i></span>
          </span>
        </span>
        <span class="power-pair-copy brasta-combo-copy">${copy}
        </span>
      </span>`;
  }

  function scheduleHaptic(banner) {
    const kind = banner.dataset.specialMoveKind || 'special';
    const key = `${banner.dataset.eventSeq || ''}|${kind}`;
    if (!key || hapticKeys.has(key)) return;
    hapticKeys.add(key);
    while (hapticKeys.size > 80) hapticKeys.delete(hapticKeys.values().next().value);

    const reducedMotion = document.documentElement.dataset.brastaMotion === 'reduced';
    if (reducedMotion || typeof navigator.vibrate !== 'function') return;
    window.setTimeout(() => {
      if (!banner.isConnected || document.visibilityState !== 'visible') return;
      const patterns = {
        big2: [36, 45, 68],
        big10: [18, 32, 46],
        'burned-jack': [22, 34, 76],
        'jack-sweep': [16, 26, 58],
        'power-pair': [36, 32, 56, 28, 24],
      };
      const pattern = patterns[kind] || 42;
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
    const comboKind = brastaComboKind(bonuses);
    const totalPoints = eventPoints(rawText);
    const scoringLabel = naturalList(bonuses.map((bonus) => bonus.name));

    const layer = document.createElement('div');
    layer.className = 'event brasta-crest-event brasta-effect-layer';
    if (comboKind) layer.classList.add(`brasta-combo-${comboKind}`);
    if (comboKind === 'big2') layer.classList.add('big2-crush-event');
    if (comboKind === 'big10') layer.classList.add('big10-strike-event');
    if (comboKind === 'power-pair') layer.classList.add('power-pair-event');
    if (team === 'A') layer.classList.add('team-event-blue');
    if (team === 'B') layer.classList.add('team-event-red');
    layer.dataset.eventSeq = banner.dataset.eventSeq || '';
    layer.dataset.eventText = rawText;
    layer.dataset.brastaRawEvent = rawText;
    layer.dataset.specialMoveKind = comboKind || 'brasta';
    if (team) layer.dataset.eventTeam = team;
    layer.dataset.brastaTotalPoints = String(totalPoints);
    layer.dataset.brastaCombo = comboKind;
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-label', `${actor} scored ${totalPoints} points from ${scoringLabel}.`);
    layer.innerHTML = comboKind
      ? brastaComboMarkup(comboKind, actor, totalPoints, rawText)
      : `
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
    if (!comboKind) {
      effectQueue.push({ key, layer });
    } else {
      const showMs = comboKind === 'big2'
        ? BIG2_SHOW_MS
        : comboKind === 'big10'
          ? BIG10_SHOW_MS
          : POWER_PAIR_SHOW_MS;
      effectQueue.push({ key, layer, showMs });
    }
    playNextEffect();
  }

  function decorateBig2(banner, rawText) {
    if (banner.dataset.brastaEffectKind === 'big2') return;
    const key = `${banner.dataset.eventSeq || ''}|big2`;
    banner.dataset.brastaEffectKind = 'big2';
    banner.dataset.brastaRawEvent = rawText;
    banner.classList.add('brasta-effect-source');
    banner.setAttribute('aria-hidden', 'true');
    if (!key || presentedKeys.has(key)) return;

    const team = eventTeam(banner, rawText);
    const actor = eventActor(team);
    const bonuses = matchingBonuses(rawText);
    const totalPoints = eventPoints(rawText);
    const scoringLabel = naturalList(bonuses.map((bonus) => bonus.name));
    const companionBonuses = bonuses.filter((bonus) => bonus.label !== 'BIG 2');
    const prizeLabel = companionBonuses.length === 0 ? 'CLUB CAPTURED' : 'DOUBLE PRIZE';

    const layer = document.createElement('div');
    layer.className = 'event big2-crush-event brasta-effect-layer';
    if (team === 'A') layer.classList.add('team-event-blue');
    if (team === 'B') layer.classList.add('team-event-red');
    layer.dataset.eventSeq = banner.dataset.eventSeq || '';
    layer.dataset.eventText = rawText;
    layer.dataset.brastaRawEvent = rawText;
    layer.dataset.specialMoveKind = 'big2';
    layer.dataset.brastaTotalPoints = String(totalPoints);
    if (team) layer.dataset.eventTeam = team;
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-label', `${actor} scored ${totalPoints} points from ${scoringLabel}.`);
    layer.innerHTML = `
      <span class="big2-crush-vignette" aria-hidden="true"></span>
      <span class="big2-crush-floor" aria-hidden="true"></span>
      <span class="big2-club-pincers" aria-hidden="true"><i>♣</i><i>♣</i></span>
      <span class="big2-club-shockwave" aria-hidden="true">♣</span>
      <span class="big2-club-burst" aria-hidden="true">${clubBurstMarkup()}</span>
      <span class="big2-crush-lockup" aria-hidden="true">
        <span class="big2-prize-card">
          <span class="big2-card-corner">2<i>♣</i></span>
          <strong>♣</strong>
          <span class="big2-card-corner bottom">2<i>♣</i></span>
        </span>
        <span class="big2-crush-copy">
          <span class="big2-crush-player">${escapeHtml(actor)}</span>
          <strong class="big2-crush-title">BIG <em>2</em></strong>
          <span class="big2-crush-score"><b>+${totalPoints}</b><small>POINTS</small></span>
          <span class="big2-crush-footer">
            <small>${prizeLabel}</small>
            <span class="big2-combo-badges">${bonusBadgesMarkup(rawText, 'BIG 2')}</span>
          </span>
        </span>
      </span>`;

    rememberEffect(key);
    effectQueue.push({ key, layer, showMs: BIG2_SHOW_MS });
    playNextEffect();
  }

  function decoratePowerPair(banner, rawText) {
    if (banner.dataset.brastaEffectKind === 'power-pair') return;
    const key = `${banner.dataset.eventSeq || ''}|power-pair`;
    banner.dataset.brastaEffectKind = 'power-pair';
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
    layer.className = 'event power-pair-event brasta-effect-layer';
    if (team === 'A') layer.classList.add('team-event-blue');
    if (team === 'B') layer.classList.add('team-event-red');
    layer.dataset.eventSeq = banner.dataset.eventSeq || '';
    layer.dataset.eventText = rawText;
    layer.dataset.brastaRawEvent = rawText;
    layer.dataset.specialMoveKind = 'power-pair';
    layer.dataset.brastaTotalPoints = String(totalPoints);
    if (team) layer.dataset.eventTeam = team;
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-label', `${actor} scored ${totalPoints} points from ${scoringLabel}.`);
    layer.innerHTML = `
      <span class="power-pair-vignette" aria-hidden="true"></span>
      <span class="power-pair-club-impact" aria-hidden="true">♣</span>
      <span class="power-pair-diamond-cut" aria-hidden="true"></span>
      <span class="power-pair-shockwave" aria-hidden="true"></span>
      <span class="big2-club-burst power-pair-clubs" aria-hidden="true">${clubBurstMarkup()}</span>
      <span class="big10-diamond-burst power-pair-diamonds" aria-hidden="true">${diamondBurstMarkup()}</span>
      <span class="power-pair-lockup" aria-hidden="true">
        <span class="power-pair-cards">
          <span class="power-pair-card power-pair-card-big2">
            <span class="power-pair-card-corner">2<i>♣</i></span><strong>♣</strong>
            <span class="power-pair-card-corner bottom">2<i>♣</i></span>
          </span>
          <span class="power-pair-card power-pair-card-big10">
            <span class="power-pair-card-corner">10<i>♦</i></span><strong>♦</strong>
            <span class="power-pair-card-corner bottom">10<i>♦</i></span>
          </span>
        </span>
        <span class="power-pair-copy">
          <span class="power-pair-player">${escapeHtml(actor)}</span>
          <strong class="power-pair-title"><span>BIG <em>2</em></span><i>+</i><span>BIG <em>10</em></span></strong>
          <span class="power-pair-score"><b>+${totalPoints}</b><small>POINTS</small></span>
          <span class="power-pair-footer">
            <small>POWER PAIR</small>
            <span class="power-pair-badges">${bonusBadgesMarkup(rawText, ['BIG 2', 'BIG 10'])}</span>
          </span>
        </span>
      </span>`;

    rememberEffect(key);
    effectQueue.push({ key, layer, showMs: POWER_PAIR_SHOW_MS });
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

  function decorateBurnedJack(banner, rawText) {
    if (banner.dataset.brastaEffectKind === 'burned-jack') return;
    const key = `${banner.dataset.eventSeq || ''}|burned-jack`;
    banner.dataset.brastaEffectKind = 'burned-jack';
    banner.dataset.brastaRawEvent = rawText;
    banner.classList.add('brasta-effect-source');
    banner.setAttribute('aria-hidden', 'true');
    if (!key || presentedKeys.has(key)) return;

    const team = eventTeam(banner, rawText);
    const actor = eventActor(team);
    const suit = burnedJackSuit();
    const redSuit = suit === '♦' || suit === '♥';
    const teamLabel = team ? `Team ${team}` : actor;

    const layer = document.createElement('div');
    layer.className = 'event burned-jack-event brasta-effect-layer';
    if (team === 'A') layer.classList.add('team-event-blue');
    if (team === 'B') layer.classList.add('team-event-red');
    layer.dataset.eventSeq = banner.dataset.eventSeq || '';
    layer.dataset.eventText = rawText;
    layer.dataset.brastaRawEvent = rawText;
    layer.dataset.specialMoveKind = 'burned-jack';
    layer.dataset.brastaTotalPoints = '-10';
    if (team) layer.dataset.eventTeam = team;
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-label', `${actor} burned the Jack. ${teamLabel} loses 10 points.`);
    layer.innerHTML = `
      <span class="burned-jack-vignette" aria-hidden="true"></span>
      <span class="burned-jack-lockup" aria-hidden="true">
        <span class="burned-jack-card-stage">
          <span class="burned-jack-heat-ring"></span>
          <span class="burned-jack-embers">${burnedJackEmbersMarkup()}</span>
          <span class="burned-jack-card${redSuit ? ' red' : ''}">
            <span class="burned-jack-card-corner">J<i>${suit}</i></span>
            <strong class="burned-jack-face">J</strong>
            <i class="burned-jack-card-suit">${suit}</i>
            <span class="burned-jack-card-corner bottom">J<i>${suit}</i></span>
            <span class="burned-jack-char"></span>
            <strong class="burned-jack-brand">BURNED</strong>
          </span>
        </span>
        <span class="burned-jack-copy">
          <span class="burned-jack-player">${escapeHtml(actor)}</span>
          <strong class="burned-jack-title"><span>JACK</span> BURNED</strong>
          <span class="burned-jack-score"><b>−10</b><small>POINTS</small></span>
          <span class="burned-jack-footer">JACK LEFT LOOSE</span>
        </span>
      </span>`;

    rememberEffect(key);
    effectQueue.push({ key, layer, showMs: BURNED_JACK_SHOW_MS });
    playNextEffect();
  }

  function decorateJackSweep(banner, rawText) {
    if (banner.dataset.brastaEffectKind === 'jack-sweep') return;

    const key = `${banner.dataset.eventSeq || ''}|jack-sweep`;
    banner.dataset.brastaEffectKind = 'jack-sweep';
    banner.dataset.brastaRawEvent = rawText;
    banner.classList.add('brasta-effect-source');
    banner.setAttribute('aria-hidden', 'true');
    if (!key || presentedKeys.has(key)) return;

    const team = eventTeam(banner, rawText);
    const actor = eventActor(team);
    const snapshot = snapshotForBanner(banner);
    const count = snapshot?.cards?.length || sweptLooseCount();
    const suit = sweptJackSuit(snapshot);
    const geometry = sweepGeometry(snapshot, count);
    const hasReward = /\bBIG\s*(?:2|10)\b/i.test(rawText);

    const layer = document.createElement('div');
    layer.className = 'event jack-sweep-event brasta-effect-layer';
    if (team === 'A') layer.classList.add('team-event-blue');
    if (team === 'B') layer.classList.add('team-event-red');
    if (hasReward) layer.classList.add('jack-sweep-combo');
    layer.style.setProperty('--jack-sweep-frame-left', `${Math.round(geometry.frame.left)}px`);
    layer.style.setProperty('--jack-sweep-frame-top', `${Math.round(geometry.frame.top)}px`);
    layer.style.setProperty('--jack-sweep-frame-width', `${Math.round(geometry.frame.width)}px`);
    layer.style.setProperty('--jack-sweep-frame-height', `${Math.round(geometry.frame.height)}px`);
    layer.style.setProperty('--jack-sweep-y', `${Math.round(geometry.jack.y - geometry.frame.top)}px`);
    layer.style.setProperty('--jack-sweep-start-x', `${Math.round(geometry.jack.startX - geometry.frame.left)}px`);
    layer.style.setProperty('--jack-sweep-trail-width', `${Math.round(geometry.jack.endX - geometry.jack.startX)}px`);
    layer.style.setProperty('--jack-sweep-caption-x', `${Math.round((geometry.jack.startX + geometry.jack.endX) / 2 - geometry.frame.left)}px`);
    layer.style.setProperty('--jack-sweep-caption-y', `${Math.round(geometry.jack.y + geometry.jack.height * 0.7 - geometry.frame.top)}px`);
    layer.dataset.eventSeq = banner.dataset.eventSeq || '';
    layer.dataset.eventKey = banner.dataset.eventKey || '';
    layer.dataset.eventText = rawText;
    layer.dataset.brastaRawEvent = rawText;
    layer.dataset.specialMoveKind = 'jack-sweep';
    layer.dataset.sweptCards = String(count);
    if (team) layer.dataset.eventTeam = team;
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-label', `${actor} swept ${count} loose card${count === 1 ? '' : 's'} with the Jack.`);
    layer.innerHTML = `
      <span class="jack-sweep-trail" aria-hidden="true"></span>
      <span class="jack-sweep-loose-cards" aria-hidden="true">${sweepLooseCardsMarkup(snapshot, count, geometry, hasReward)}</span>
      ${jackSweepMarkup(suit, geometry)}
      <span class="jack-sweep-caption" aria-hidden="true">JACK SWEEP</span>`;

    rememberEffect(key);
    effectQueue.push({ key, layer, showMs: hasReward ? JACK_SWEEP_COMBO_SHOW_MS : JACK_SWEEP_SHOW_MS });
    playNextEffect();
  }

  const renderers = [
    {
      name: 'jack-sweep',
      matches: (text) => /\bJack sweep\b/i.test(text),
      decorate: decorateJackSweep,
    },
    {
      name: 'burned-jack',
      matches: (text) => /\bBURNED\s+JACK!/i.test(text),
      decorate: decorateBurnedJack,
    },
    {
      name: 'brasta',
      matches: (text) => /\bBRASTA!/i.test(text),
      decorate: decorateBrasta,
    },
    {
      name: 'power-pair',
      matches: (text) => /\bBIG\s*2\b/i.test(text) && /\bBIG\s*10\b/i.test(text) && !/\bBRASTA!/i.test(text),
      decorate: decoratePowerPair,
    },
    {
      name: 'big2',
      matches: (text) => /\bBIG\s*2\b/i.test(text) && !/\bBIG\s*10\b/i.test(text) && !/\bBRASTA!/i.test(text),
      decorate: decorateBig2,
    },
    {
      name: 'big10',
      matches: (text) => /\bBIG\s*10\b/i.test(text) && !/\bBIG\s*2\b/i.test(text) && !/\bBRASTA!/i.test(text),
      decorate: decorateBig10,
    },
  ];

  function enhanceBanner(banner) {
    if (!(banner instanceof HTMLElement)) return;
    const rawText = String(banner.dataset.eventText || banner.dataset.brastaRawEvent || banner.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!rawText) return;

    const renderedKinds = new Set(String(banner.dataset.brastaEffectKinds || '').split(',').filter(Boolean));
    renderers.forEach((renderer) => {
      if (!renderer.matches(rawText) || renderedKinds.has(renderer.name)) return;
      renderer.decorate(banner, rawText);
      renderedKinds.add(renderer.name);
    });
    if (renderedKinds.size) banner.dataset.brastaEffectKinds = [...renderedKinds].join(',');
  }

  function effectKindsForEvent(text) {
    return renderers.filter((renderer) => renderer.matches(String(text || ''))).map((renderer) => renderer.name);
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
    ingestPendingJackSweepSnapshots();
    window.addEventListener('brasta-jack-sweep-snapshot', (event) => {
      rememberJackSweepSnapshot(event?.detail);
    });
    new MutationObserver(queueSync).observe(document.body, { childList: true, subtree: true });
    queueSync();
  }

  window.BrastaSpecialMoves = Object.freeze({
    refresh: queueSync,
    pointsForEvent: eventPoints,
    effectKindsForEvent,
    brastaComboKindForEvent,
    motionPreference: () => document.documentElement.dataset.brastaMotion === 'reduced' ? 'reduced' : 'full',
    captureJackSweep: rememberJackSweepSnapshot,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
