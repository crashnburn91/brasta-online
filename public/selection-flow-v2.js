(() => {
  if (window.__BRASTA_SELECTION_FLOW_V2__) return;
  window.__BRASTA_SELECTION_FLOW_V2__ = true;

  const SUITS = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades' };
  const stagedLoose = new Set();
  let stagedBuildId = '';
  let queued = false;
  let busy = false;
  let lastMoveText = null;

  function parseCard(label) {
    const text = String(label || '').trim();
    const suit = SUITS[text.slice(-1)];
    if (!suit) return null;
    const rank = text.slice(0, -1).trim().toUpperCase();
    const value = rank === 'A' ? 1 : /^\d+$/.test(rank) ? Number(rank) : null;
    return { label: text, rank, value };
  }

  function handButtons() {
    return Array.from(document.querySelectorAll('.hand .card[data-card][aria-label]'));
  }

  function handCards() {
    return handButtons().map((button) => ({ button, card: parseCard(button.getAttribute('aria-label')) })).filter((item) => item.card);
  }

  function selectedHandButton() {
    return document.querySelector('.hand .card.selected[data-card][aria-label]');
  }

  function stagedLooseCards() {
    return Array.from(stagedLoose).map(parseCard).filter(Boolean);
  }

  function buildElement() {
    if (!stagedBuildId) return null;
    return Array.from(document.querySelectorAll('.build[data-build]')).find((el) => el.dataset.build === stagedBuildId) || null;
  }

  function buildToken() {
    const label = buildElement()?.querySelector('.build-label')?.textContent || '';
    const match = label.toUpperCase().match(/BUILD\s+(10|[1-9]|Q|K)/);
    if (!match) return null;
    return /^\d+$/.test(match[1]) ? Number(match[1]) : match[1];
  }

  function canPartition(values, target) {
    if (!values.length || target <= 0) return false;
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum % target !== 0) return false;
    const sorted = [...values].sort((a, b) => b - a);
    const groups = sum / target;
    const buckets = Array.from({ length: groups }, () => 0);
    function place(i) {
      if (i >= sorted.length) return buckets.every((v) => v === target);
      const value = sorted[i];
      const seen = new Set();
      for (let b = 0; b < buckets.length; b++) {
        if (seen.has(buckets[b])) continue;
        seen.add(buckets[b]);
        if (buckets[b] + value > target) continue;
        buckets[b] += value;
        if (place(i + 1)) return true;
        buckets[b] -= value;
        if (buckets[b] === 0) break;
      }
      return false;
    }
    return place(0);
  }

  function retainedMatch(token, excludingButton) {
    return handCards().some(({ button, card }) => button !== excludingButton && (typeof token === 'number' ? card.value === token : card.rank === token));
  }

  function looseCaptureValid(card) {
    const loose = stagedLooseCards();
    if (!loose.length || card.rank === 'J') return false;
    if (loose.length === 1 && loose[0].rank === card.rank) return true;
    if (card.value != null) return loose.every((c) => c.value != null) && canPartition(loose.map((c) => c.value), card.value);
    if (card.rank === 'Q' || card.rank === 'K') return loose.every((c) => c.rank === card.rank);
    return false;
  }

  function looseBuildTargets(card, button) {
    const loose = stagedLooseCards();
    if (!loose.length || card.rank === 'J') return [];
    const candidates = new Set();
    for (const item of handCards()) {
      if (item.button === button) continue;
      if (item.card.value != null) candidates.add(item.card.value);
      else if (item.card.rank === 'Q' || item.card.rank === 'K') candidates.add(item.card.rank);
    }
    return Array.from(candidates).filter((token) => {
      if (typeof token === 'number') {
        return card.value != null && loose.every((c) => c.value != null) && canPartition([card.value, ...loose.map((c) => c.value)], token);
      }
      return card.rank === token && loose.every((c) => c.rank === token);
    });
  }

  function buildActions(card, button) {
    const token = buildToken();
    if (token == null || card.rank === 'J') return [];
    const loose = stagedLooseCards();
    const out = [];
    const matches = typeof token === 'number' ? card.value === token : card.rank === token;
    const extraCaptureOK = !loose.length || (typeof token === 'number'
      ? loose.every((c) => c.value != null) && canPartition(loose.map((c) => c.value), token)
      : loose.every((c) => c.rank === token));
    if (matches && extraCaptureOK) out.push({ type: 'CAPTURE_BUILD', label: 'Capture' });

    if (retainedMatch(token, button)) {
      const addOK = typeof token === 'number'
        ? card.value != null && loose.every((c) => c.value != null) && canPartition([card.value, ...loose.map((c) => c.value)], token)
        : card.rank === token && loose.every((c) => c.rank === token);
      if (addOK) out.push({ type: 'ADD_TO_BUILD', label: 'Add to Build' });
    }

    if (!loose.length && typeof token === 'number' && card.value != null) {
      const next = token + card.value;
      if (next <= 10 && retainedMatch(next, button)) out.push({ type: 'RAISE_BUILD', label: `Raise to ${next}` });
    }
    return out;
  }

  function optionsFor(button, card) {
    if (!stagedLoose.size && !stagedBuildId) return [];
    if (stagedBuildId) return buildActions(card, button);
    const out = [];
    if (looseCaptureValid(card)) out.push({ type: 'CAPTURE_LOOSE', label: 'Capture' });
    for (const target of looseBuildTargets(card, button)) out.push({ type: 'MAKE_BUILD', label: `Build ${target}` });
    return out;
  }

  function actionPanel() {
    return Array.from(document.querySelectorAll('.action-panel')).find((panel) => !panel.classList.contains('opening-panel')) || null;
  }

  function clearSelection() {
    stagedLoose.clear();
    stagedBuildId = '';
  }

  function pruneSelection() {
    const liveLoose = new Set(Array.from(document.querySelectorAll('.loose-row .card[aria-label]')).map((el) => el.getAttribute('aria-label') || ''));
    for (const label of Array.from(stagedLoose)) {
      if (!liveLoose.has(label)) stagedLoose.delete(label);
    }
    if (stagedBuildId && !Array.from(document.querySelectorAll('.build[data-build]')).some((el) => el.dataset.build === stagedBuildId)) {
      stagedBuildId = '';
    }
  }

  function syncSelectionLifecycle() {
    const banner = document.querySelector('.last-move-banner');
    const currentMove = (banner?.textContent || '').trim();
    if (currentMove && lastMoveText !== null && currentMove !== lastMoveText) {
      clearSelection();
      busy = false;
      delete document.documentElement.dataset.selectionV2Replay;
    }
    if (currentMove) lastMoveText = currentMove;
    pruneSelection();
  }

  window.__BRASTA_CLEAR_SELECTION_V2__ = () => {
    clearSelection();
    busy = false;
    delete document.documentElement.dataset.selectionV2Replay;
    queueEnhance();
  };

  function enableBoard() {
    if (!document.querySelector('.table') || document.querySelector('.topbar .spectator-pill')) return;
    document.querySelectorAll('.loose-row .card[aria-label]').forEach((card) => {
      const label = card.getAttribute('aria-label') || '';
      card.disabled = false;
      card.classList.add('selection-v2-probe');
      card.classList.toggle('selection-v2-selected', stagedLoose.has(label));
      card.dataset.selectionV2Loose = label;
    });
    document.querySelectorAll('.build[data-build]').forEach((build) => {
      const id = build.dataset.build || '';
      build.classList.add('selection-v2-probe');
      build.classList.toggle('selection-v2-selected', !!id && stagedBuildId === id);
      build.dataset.selectionV2Build = id;
      build.setAttribute('aria-disabled', 'false');
      build.tabIndex = 0;
    });
  }

  function renderOptions() {
    const panel = actionPanel();
    if (!panel) return;
    let host = panel.querySelector('[data-selection-v2-options]');
    const hasBoardSelection = !!stagedLoose.size || !!stagedBuildId;
    panel.classList.toggle('selection-v2-has-target', hasBoardSelection);

    const playLoose = panel.querySelector('[data-legal="PLAY_LOOSE"]');
    if (playLoose) playLoose.classList.toggle('selection-v2-hide-play-loose', hasBoardSelection);

    if (!hasBoardSelection) {
      host?.remove();
      return;
    }
    if (!host) {
      host = document.createElement('div');
      host.className = 'selection-v2-options';
      host.dataset.selectionV2Options = '1';
      const actionsRow = panel.querySelector('.button-row.actions');
      if (actionsRow) actionsRow.appendChild(host);
      else panel.appendChild(host);
    }
    host.replaceChildren();

    const selected = selectedHandButton();
    if (selected) {
      const card = parseCard(selected.getAttribute('aria-label'));
      const options = card ? optionsFor(selected, card) : [];
      if (!options.length) {
        const note = document.createElement('span');
        note.className = 'selection-v2-note';
        note.textContent = 'No valid action for this selection.';
        host.appendChild(note);
      } else {
        for (const option of options) host.appendChild(makeOptionButton(selected, option));
      }
      return;
    }

    const options = [];
    for (const { button, card } of handCards()) {
      for (const option of optionsFor(button, card)) options.push({ button, card, option });
    }
    if (!options.length) {
      const note = document.createElement('span');
      note.className = 'selection-v2-note';
      note.textContent = 'No card in your hand can use this selection.';
      host.appendChild(note);
      return;
    }
    for (const item of options) {
      const option = { ...item.option, label: `${item.card.label} · ${item.option.label}` };
      host.appendChild(makeOptionButton(item.button, option));
    }
  }

  function makeOptionButton(handButton, option) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary selection-v2-action';
    button.textContent = option.label;
    button.onclick = () => executeOption(handButton, option.type);
    return button;
  }

  function findNativeAction(type) {
    return document.querySelector(`[data-legal="${type}"]`);
  }

  function finishReplay(type) {
    const submit = document.querySelector('.action-panel [data-submit]');
    if (submit) {
      // We have reconstructed the exact board-first selection in the native pending-action UI.
      // Submit only now, after every staged target has been replayed.
      submit.click();
    }
    delete document.documentElement.dataset.selectionV2Replay;
    busy = false;
  }

  function replayTargets(type) {
    const looseLabels = Array.from(stagedLoose);
    const buildId = stagedBuildId;
    window.setTimeout(() => {
      if (buildId) {
        const choice = Array.from(document.querySelectorAll('[data-buildchoice]')).find((el) => el.dataset.buildchoice === buildId);
        choice?.click();
      }
      let i = 0;
      const clickNext = () => {
        if (i >= looseLabels.length) {
          window.setTimeout(() => finishReplay(type), 0);
          return;
        }
        const label = looseLabels[i++];
        const target = Array.from(document.querySelectorAll('.loose-row .card[data-card][aria-label]')).find((el) => el.getAttribute('aria-label') === label);
        target?.click();
        window.setTimeout(clickNext, 0);
      };
      clickNext();
    }, 0);
  }

  function executeOption(handButton, type) {
    if (busy) return;
    busy = true;
    document.documentElement.dataset.selectionV2Replay = '1';
    if (!handButton.classList.contains('selected')) handButton.click();
    const waitForAction = (tries = 0) => {
      const native = findNativeAction(type);
      if (native) {
        native.click();
        replayTargets(type);
        return;
      }
      if (tries > 20) {
        delete document.documentElement.dataset.selectionV2Replay;
        busy = false;
        return;
      }
      window.setTimeout(() => waitForAction(tries + 1), 20);
    };
    window.setTimeout(() => waitForAction(), 0);
  }

  function enhance() {
    queued = false;
    if (!document.querySelector('.table')) {
      clearSelection();
      delete document.documentElement.dataset.selectionV2Replay;
      return;
    }
    syncSelectionLifecycle();
    enableBoard();
    renderOptions();
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function onBoardClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || busy) return;
    const loose = target.closest('[data-selection-v2-loose]');
    if (loose) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const label = loose.dataset.selectionV2Loose || '';
      if (!label) return;
      if (stagedLoose.has(label)) stagedLoose.delete(label); else stagedLoose.add(label);
      queueEnhance();
      return;
    }
    const build = target.closest('[data-selection-v2-build]');
    if (build) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const id = build.dataset.selectionV2Build || '';
      if (!id) return;
      stagedBuildId = stagedBuildId === id ? '' : id;
      queueEnhance();
    }
  }

  function onHandClick(event) {
    const target = event.target instanceof Element ? event.target.closest('.hand .card[data-card]') : null;
    if (!target) return;
    window.setTimeout(queueEnhance, 0);
  }

  function start() {
    document.addEventListener('click', onBoardClick, true);
    document.addEventListener('click', onHandClick, false);
    new MutationObserver(queueEnhance).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
