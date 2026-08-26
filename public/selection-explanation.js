(() => {
  if (window.__BRASTA_SELECTION_EXPLANATION__) return;
  window.__BRASTA_SELECTION_EXPLANATION__ = true;

  function selectedCard() {
    const el = document.querySelector('.hand .card.selected[data-card][aria-label]');
    if (!el) return null;
    const label = (el.getAttribute('aria-label') || '').trim();
    const rank = label.slice(0, -1).trim().toUpperCase();
    const value = rank === 'A' ? 1 : /^\d+$/.test(rank) ? Number(rank) : null;
    return { label, rank, value };
  }

  function buildToken(build) {
    const text = build?.querySelector('.build-label')?.textContent || '';
    const match = text.toUpperCase().match(/BUILD\s+(10|[1-9]|Q|K)/);
    if (!match) return null;
    return /^\d+$/.test(match[1]) ? Number(match[1]) : match[1];
  }

  function matchingBuild(card) {
    if (!card) return null;
    return Array.from(document.querySelectorAll('.build[data-build]')).find((build) => {
      const token = buildToken(build);
      return typeof token === 'number' ? card.value === token : card.rank === token;
    }) || null;
  }

  function enhance() {
    const note = Array.from(document.querySelectorAll('.selection-v2-note, .compact-context-note'))
      .find((el) => /no valid action for this selection/i.test(el.textContent || ''));
    if (!note) return;

    const card = selectedCard();
    const build = matchingBuild(card);
    if (!card || !build) return;

    const token = buildToken(build);
    if (token == null) return;

    note.textContent = `You must keep a ${token} in your hand while you control Build ${token}.`;
  }

  function schedule() {
    requestAnimationFrame(enhance);
    setTimeout(enhance, 40);
  }

  document.addEventListener('click', schedule, false);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  schedule();
})();
