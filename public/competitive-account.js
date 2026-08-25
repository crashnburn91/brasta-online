(() => {
  if (window.__BRASTA_COMPETITIVE_ACCOUNT__) return;
  window.__BRASTA_COMPETITIVE_ACCOUNT__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  let one = null;
  let two = null;
  let loading = false;
  let loadedAt = 0;

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  function summary(status) {
    if (!status) return 'Loading…';
    return status.rankName === 'Unranked'
      ? `Placement ${Math.min(status.placementGames, 5)} / 5`
      : `${status.wins}W · ${status.losses}L${status.currentStreak ? ` · ${status.currentStreak} streak` : ''}`;
  }

  function rankRow(label, status) {
    return `<div class="account-competitive-row"><span>${label}</span><b>${status?.rankName || 'Unranked'}</b><small>${summary(status)}</small></div>`;
  }

  function render() {
    const card = document.querySelector('.account-status-card');
    if (!card || !token()) return;
    if ((!one || !two) && !loading) void load();
    card.innerHTML = `<div class="account-competitive-heading">Competitive profiles</div>${rankRow('Ranked 1v1', one)}${rankRow('Ranked 2v2', two)}`;
  }

  async function fetchStatus(accessToken, mode) {
    const response = await fetch('/api/competitive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'profile', mode }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? data.competitive || null : null;
  }

  async function load(force = false) {
    const accessToken = token();
    if (!accessToken || loading) return;
    if (!force && one && two && Date.now() - loadedAt < 15000) return render();
    loading = true;
    try {
      const [nextOne, nextTwo] = await Promise.all([
        fetchStatus(accessToken, '1v1'),
        fetchStatus(accessToken, '2v2'),
      ]);
      one = nextOne;
      two = nextTwo;
      loadedAt = Date.now();
    } catch {}
    loading = false;
    render();
  }

  function resetAndLoad() {
    one = null;
    two = null;
    loadedAt = 0;
    if (token()) void load(true);
  }

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('.account-dock')) {
      window.setTimeout(render, 0);
      window.setTimeout(render, 80);
    }
  });
  window.addEventListener('brasta-auth-changed', resetAndLoad);
  window.addEventListener('brasta-competitive-updated', resetAndLoad);

  if (token()) void load();
})();
