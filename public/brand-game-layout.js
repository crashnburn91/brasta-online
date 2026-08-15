(() => {
  function enhanceGameLayout() {
    const app = document.getElementById('app');
    const main = app?.querySelector(':scope > main');
    if (!app || !main || main.classList.contains('lobby') || main.classList.contains('lab') || main.dataset.brandLayout === '1') return;
    const table = main.querySelector('.table');
    const players = main.querySelector('.players');
    if (!table || !players) return;

    main.dataset.brandLayout = '1';
    main.classList.add('brand-game-shell');

    const notices = Array.from(main.children).filter((el) => el instanceof HTMLElement && (el.classList.contains('error') || el.classList.contains('notice')));
    const event = main.querySelector('.event');
    const lastMove = main.querySelector('.last-move-banner');
    const hand = main.querySelector('.hand-area, .spectator-hand-note');
    const opening = main.querySelector('.opening-panel');
    const action = Array.from(main.querySelectorAll('.action-panel')).find((el) => el !== opening);

    const stage = document.createElement('section');
    stage.className = 'brand-live-stage';

    const rail = document.createElement('div');
    rail.className = 'brand-player-rail';
    rail.appendChild(players);

    const announcement = document.createElement('div');
    announcement.className = 'brand-announcement-slot';
    if (event) announcement.appendChild(event);
    else if (lastMove) announcement.appendChild(lastMove);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'brand-table-wrap';
    tableWrap.appendChild(table);

    const bottom = document.createElement('div');
    bottom.className = 'brand-bottom-deck';
    if (hand) bottom.appendChild(hand);

    const controlRail = document.createElement('div');
    controlRail.className = 'brand-control-rail';
    if (opening) controlRail.appendChild(opening);
    if (action) controlRail.appendChild(action);
    if (controlRail.children.length) bottom.appendChild(controlRail);

    stage.appendChild(rail);
    if (announcement.children.length) stage.appendChild(announcement);
    stage.appendChild(tableWrap);
    if (bottom.children.length) stage.appendChild(bottom);

    notices.forEach((n) => main.insertBefore(n, main.firstChild));
    main.appendChild(stage);
  }

  function apply() {
    enhanceGameLayout();
  }

  const observer = new MutationObserver(() => requestAnimationFrame(apply));
  const start = () => {
    apply();
    const app = document.getElementById('app');
    if (app) observer.observe(app, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
