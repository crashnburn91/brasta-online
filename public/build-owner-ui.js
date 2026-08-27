(() => {
  if (window.__BRASTA_BUILD_OWNER_UI__) return;
  window.__BRASTA_BUILD_OWNER_UI__ = true;

  let queued = false;

  function playerNameForSeat(seat) {
    for (const chip of document.querySelectorAll('.player-chip')) {
      const structuredSeat = Number(chip.dataset.seat || 0);
      const legacySeatLabel = chip.querySelector('.seat-label')?.textContent?.trim();
      const matchesSeat = structuredSeat === Number(seat) || legacySeatLabel === `Seat ${seat}`;
      if (!matchesSeat) continue;
      return chip.querySelector('.player-name')?.textContent?.trim()
        || chip.querySelector('b')?.textContent?.trim()
        || '';
    }
    return '';
  }

  function initialsForName(name, seat) {
    const clean = String(name || '').trim();
    if (!clean || clean === `Seat ${seat}`) return `S${seat}`;

    const parts = clean.split(/[\s._-]+/).filter(Boolean);
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }

    const compact = (parts[0] || clean).replace(/[^a-z0-9]/gi, '');
    return (compact.slice(0, 2) || `S${seat}`).toUpperCase();
  }

  function enhance() {
    queued = false;
    const owners = window.__BRASTA_BUILD_OWNERS__;
    if (!(owners instanceof Map)) return;

    document.querySelectorAll('.build[data-build]').forEach((el) => {
      const id = el.getAttribute('data-build') || '';
      const seat = owners.get(id);
      el.classList.remove('build-owner-seat-1', 'build-owner-seat-2', 'build-owner-seat-3', 'build-owner-seat-4');

      let badge = el.querySelector('.build-owner-badge');
      if (!seat) {
        badge?.remove();
        return;
      }

      const playerName = playerNameForSeat(seat);
      const initials = initialsForName(playerName, seat);

      el.classList.add(`build-owner-seat-${seat}`);
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'build-owner-badge';
        el.appendChild(badge);
      }
      badge.textContent = initials;
      badge.title = playerName ? `Owned by ${playerName}` : `Owned by Seat ${seat}`;
      badge.setAttribute('aria-label', badge.title);
    });
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    const app = document.getElementById('app');
    if (!app) {
      setTimeout(start, 50);
      return;
    }
    new MutationObserver(queueEnhance).observe(app, { childList: true, subtree: true });
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
