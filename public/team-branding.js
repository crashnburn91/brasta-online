(() => {
  if (window.__BRASTA_TEAM_BRANDING__) return;
  window.__BRASTA_TEAM_BRANDING__ = true;

  let queued = false;

  function textNodes(root) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) out.push(node);
    return out;
  }

  function playerInfo() {
    const teams = { A: [], B: [] };
    document.querySelectorAll('.player-chip').forEach((chip) => {
      const text = (chip.textContent || '').replace(/\s+/g, ' ').trim();
      const match = text.match(/^(.*?)\s+Team\s+([AB])\b/i);
      if (!match) return;
      const name = match[1].replace(/\s*(YOU|Dealer|D)\s*$/i, '').trim();
      const team = match[2].toUpperCase();
      if (name && !teams[team].includes(name)) teams[team].push(name);
    });
    return teams;
  }

  function brandPlayerCards() {
    document.querySelectorAll('.player-chip').forEach((chip) => {
      let team = chip.dataset.brastaTeam || '';
      if (!team) {
        const text = chip.textContent || '';
        const match = text.match(/\bTeam\s+([AB])\b/i);
        if (!match) return;
        team = match[1].toUpperCase();
        chip.dataset.brastaTeam = team;
      }

      chip.classList.toggle('team-blue-player', team === 'A');
      chip.classList.toggle('team-red-player', team === 'B');

      for (const node of textNodes(chip)) {
        if (!/\bTeam\s+[AB]\b/i.test(node.nodeValue || '')) continue;
        const parent = node.parentElement;
        node.nodeValue = (node.nodeValue || '').replace(/\s*Team\s+[AB]\b/ig, '');
        parent?.classList.add('team-colored-name');
      }
    });
  }

  function mostLikelyActor(team, teams) {
    const last = document.querySelector('.last-move-banner');
    const text = (last?.textContent || '').replace(/^\s*LAST MOVE\s*/i, '').trim();
    if (text) {
      for (const name of teams[team]) {
        if (text.toLowerCase().startsWith(name.toLowerCase())) return name;
      }
    }
    return teams[team][0] || (team === 'A' ? 'Blue Team' : 'Red Team');
  }

  function rewriteEventBanners(teams) {
    const selectors = '.event,.event-banner,.round-event,.turn-event,.game-event,.last-hand-banner';
    document.querySelectorAll(selectors).forEach((banner) => {
      for (const node of textNodes(banner)) {
        let text = node.nodeValue || '';
        if (/Team A/i.test(text)) text = text.replace(/Team A/gi, mostLikelyActor('A', teams));
        if (/Team B/i.test(text)) text = text.replace(/Team B/gi, mostLikelyActor('B', teams));
        node.nodeValue = text;
      }
    });
  }

  function rewriteGeneralTeamNames() {
    const app = document.getElementById('app');
    if (!app) return;
    for (const node of textNodes(app)) {
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest('.player-chip,.live-score-strip,.event,.event-banner,.round-event,.turn-event,.game-event,.last-hand-banner')) continue;
      let text = node.nodeValue || '';
      if (/Team A/i.test(text)) text = text.replace(/Team A/gi, 'Blue Team');
      if (/Team B/i.test(text)) text = text.replace(/Team B/gi, 'Red Team');
      node.nodeValue = text;
    }
  }

  function enhance() {
    queued = false;
    const teams = playerInfo();
    brandPlayerCards();
    rewriteEventBanners(teams);
    rewriteGeneralTeamNames();
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    const root = document.getElementById('app') || document.body;
    new MutationObserver(queueEnhance).observe(root, { childList: true, subtree: true, characterData: true });
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
