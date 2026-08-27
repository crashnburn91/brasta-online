(() => {
  if (window.__BRASTA_DEALER_MARKER__) return;
  window.__BRASTA_DEALER_MARKER__ = true;

  let scheduled = false;

  function enhance() {
    scheduled = false;
    const players = document.querySelector('.players');
    if (!players) return;

    const chips = Array.from(players.querySelectorAll('.player-chip'));
    if (!chips.length) return;

    chips.forEach((chip) => {
      chip.classList.remove('dealer-position');
      chip.querySelector('.dealer-button')?.remove();
    });

    const starterIndex = chips.findIndex((chip) => chip.dataset.starter === '1');
    if (starterIndex < 0) return;

    const dealerIndex = (starterIndex - 1 + chips.length) % chips.length;
    const dealerChip = chips[dealerIndex];
    dealerChip.classList.add('dealer-position');

    const button = document.createElement('span');
    button.className = 'dealer-button';
    button.textContent = 'D';
    button.title = 'Dealer for this round';
    button.setAttribute('aria-label', 'Dealer for this round');
    dealerChip.appendChild(button);
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    const app = document.getElementById('app');
    if (!app) {
      setTimeout(start, 50);
      return;
    }
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(app, { childList: true, subtree: true });
    enhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
