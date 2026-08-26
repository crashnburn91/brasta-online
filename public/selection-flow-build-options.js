(() => {
  if (window.__BRASTA_SELECTION_BUILD_FIX__) return;
  window.__BRASTA_SELECTION_BUILD_FIX__ = true;

  const SUITS = new Set(['♣', '♦', '♥', '♠']);

  function parseCard(label) {
    const text = String(label || '').trim();
    const suit = text.slice(-1);
    if (!SUITS.has(suit)) return null;
    const rank = text.slice(0, -1).trim().toUpperCase();
    const value = rank === 'A' ? 1 : /^\d+$/.test(rank) ? Number(rank) : null;
    return { label: text, rank, value };
  }

  function buildToken(build) {
    const label = build?.querySelector('.build-label')?.textContent || '';
    const match = label.toUpperCase().match(/BUILD\s+(10|[1-9]|Q|K)/);
    if (!match) return null;
    return /^\d+$/.test(match[1]) ? Number(match[1]) : match[1];
  }

  function selectedHand() {
    const button = document.querySelector('.hand .card.selected[data-card][aria-label]');
    return button ? { button, card: parseCard(button.getAttribute('aria-label')) } : null;
  }

  function handCards() {
    return Array.from(document.querySelectorAll('.hand .card[data-card][aria-label]'))
      .map((button) => ({ button, card: parseCard(button.getAttribute('aria-label')) }))
      .filter((item) => item.card);
  }

  function selectedLoose() {
    return Array.from(document.querySelectorAll('.loose-row .card.selection-v2-selected[aria-label]'))
      .map((button) => ({ button, card: parseCard(button.getAttribute('aria-label')) }))
      .filter((item) => item.card);
  }

  function selectedBuild() {
    return document.querySelector('.build.selection-v2-selected[data-build]');
  }

  function retainedMatch(token, excludingButton) {
    return handCards().some(({ button, card }) => button !== excludingButton && (typeof token === 'number' ? card.value === token : card.rank === token));
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

  function addToBuildValid(card, handButton, build, loose) {
    const token = buildToken(build);
    if (token == null || !retainedMatch(token, handButton)) return false;
    if (typeof token === 'number') {
      if (card.value == null || loose.some((item) => item.card.value == null)) return false;
      return canPartition([card.value, ...loose.map((item) => item.card.value)], token);
    }
    return card.rank === token && loose.every((item) => item.card.rank === token);
  }

  function captureBuildValid(card, build, loose) {
    const token = buildToken(build);
    if (token == null) return false;
    const matches = typeof token === 'number' ? card.value === token : card.rank === token;
    if (!matches) return false;
    if (!loose.length) return true;
    if (typeof token === 'number') {
      if (loose.some((item) => item.card.value == null)) return false;
      return canPartition(loose.map((item) => item.card.value), token);
    }
    return loose.every((item) => item.card.rank === token);
  }

  function execute(type, buildId, looseLabels) {
    const native = document.querySelector(`[data-legal="${type}"]`);
    if (!native) return;
    native.click();
    setTimeout(() => {
      if (buildId) {
        const choice = Array.from(document.querySelectorAll('[data-buildchoice]'))
          .find((el) => el.dataset.buildchoice === buildId);
        choice?.click();
      }
      let i = 0;
      const next = () => {
        if (i >= looseLabels.length) return;
        const label = looseLabels[i++];
        const target = Array.from(document.querySelectorAll('.loose-row .card[data-card][aria-label]'))
          .find((el) => el.getAttribute('aria-label') === label);
        target?.click();
        setTimeout(next, 0);
      };
      next();
    }, 0);
  }

  function makeButton(label, type, buildId, looseLabels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary selection-v2-action';
    button.textContent = label;
    button.onclick = () => execute(type, buildId, looseLabels);
    return button;
  }

  function enhance() {
    const panel = Array.from(document.querySelectorAll('.action-panel')).find((el) => !el.classList.contains('opening-panel'));
    const host = panel?.querySelector('[data-selection-v2-options]');
    const hand = selectedHand();
    if (!panel || !host || !hand?.card) return;

    const loose = selectedLoose();
    const build = selectedBuild();
    const replacements = [];

    if (build && captureBuildValid(hand.card, build, loose)) {
      replacements.push(makeButton('Capture', 'CAPTURE_BUILD', build.dataset.build || '', loose.map((item) => item.card.label)));
    }

    if (!build && loose.length) {
      for (const candidate of document.querySelectorAll('.build[data-build]')) {
        if (!addToBuildValid(hand.card, hand.button, candidate, loose)) continue;
        const token = buildToken(candidate);
        replacements.push(makeButton(`Add to Build ${token}`, 'ADD_TO_BUILD', candidate.dataset.build || '', loose.map((item) => item.card.label)));
      }
    }

    if (!replacements.length) return;
    host.replaceChildren(...replacements);
  }

  function schedule() {
    setTimeout(enhance, 60);
    setTimeout(enhance, 160);
  }

  document.addEventListener('click', schedule, false);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
