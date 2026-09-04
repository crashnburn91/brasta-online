(() => {
  'use strict';
  if (window.__BRASTA_ACHIEVEMENT_FILTER__) return;
  window.__BRASTA_ACHIEVEMENT_FILTER__ = true;

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unlocked', label: 'Unlocked' },
    { key: 'locked', label: 'Locked' },
  ];

  function achievementItems(panel) {
    return [...panel.querySelectorAll('.ppg-achievement-list > .ppg-achievement')];
  }

  function counts(panel) {
    const items = achievementItems(panel);
    const unlocked = items.filter((item) => item.classList.contains('complete')).length;
    return { all: items.length, unlocked, locked: items.length - unlocked };
  }

  function applyFilter(panel, key) {
    const items = achievementItems(panel);
    panel.dataset.achievementFilter = key;

    let visible = 0;
    items.forEach((item) => {
      const complete = item.classList.contains('complete');
      const show = key === 'all' || (key === 'unlocked' && complete) || (key === 'locked' && !complete);
      item.hidden = !show;
      if (show) visible += 1;
    });

    panel.querySelectorAll('[data-achievement-filter]').forEach((button) => {
      const active = button.dataset.achievementFilter === key;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const empty = panel.querySelector('[data-achievement-filter-empty]');
    if (empty) {
      empty.hidden = visible !== 0;
      const label = key === 'unlocked' ? 'No unlocked achievements yet.' : key === 'locked' ? 'No locked achievements remain.' : 'No achievements to show.';
      empty.textContent = label;
    }
  }

  function enhancePanel(panel) {
    if (!(panel instanceof HTMLElement)) return;
    const list = panel.querySelector('.ppg-achievement-list');
    const summary = panel.querySelector('.ppg-achievement-summary');
    if (!list || !summary) return;

    const currentCounts = counts(panel);
    let controls = panel.querySelector('.ppg-achievement-filters');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'ppg-achievement-filters';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'Filter achievements');
      summary.insertAdjacentElement('afterend', controls);
    }

    controls.innerHTML = FILTERS.map(({ key, label }) => (
      `<button type="button" data-achievement-filter="${key}" aria-pressed="false">${label}<span>${currentCounts[key]}</span></button>`
    )).join('');

    let empty = panel.querySelector('[data-achievement-filter-empty]');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'ppg-achievement-filter-empty';
      empty.dataset.achievementFilterEmpty = 'true';
      empty.hidden = true;
      list.insertAdjacentElement('afterend', empty);
    }

    controls.querySelectorAll('[data-achievement-filter]').forEach((button) => {
      button.addEventListener('click', () => applyFilter(panel, button.dataset.achievementFilter || 'all'));
    });

    const selected = panel.dataset.achievementFilter || 'all';
    applyFilter(panel, selected);
  }

  function scan() {
    document.querySelectorAll('[data-ppg-panel="achievements"], [data-account-ppg-panel="achievements"]').forEach(enhancePanel);
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan();
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();