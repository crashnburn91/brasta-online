(() => {
  if (window.__BRASTA_COMPETITIVE_ACCOUNT__) return;
  window.__BRASTA_COMPETITIVE_ACCOUNT__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  let status = null;
  let loading = false;
  let loadedAt = 0;

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  function render() {
    const card = document.querySelector('.account-status-card');
    if (!card || !token()) return;
    if (!status) {
      if (!loading) void load();
      return;
    }
    const unranked = status.rankName === 'Unranked';
    card.innerHTML = `<span>Ranked 1v1</span><b>${status.rankName}</b><small>${unranked ? `Placement ${Math.min(status.placementGames, 5)} / 5` : `${status.wins}W · ${status.losses}L${status.currentStreak ? ` · ${status.currentStreak} win streak` : ''}`}</small>`;
  }

  async function load(force = false) {
    const accessToken = token();
    if (!accessToken || loading) return;
    if (!force && status && Date.now() - loadedAt < 15000) return render();
    loading = true;
    try {
      const response = await fetch('/api/competitive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'profile' }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.competitive) {
        status = data.competitive;
        loadedAt = Date.now();
      }
    } catch {}
    loading = false;
    render();
  }

  const observer = new MutationObserver(render);
  function boot() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    render();
  }

  window.addEventListener('brasta-auth-changed', (event) => {
    status = null;
    loadedAt = 0;
    if (event?.detail?.signedIn) void load(true);
  });
  window.addEventListener('brasta-competitive-updated', () => {
    status = null;
    loadedAt = 0;
    void load(true);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
