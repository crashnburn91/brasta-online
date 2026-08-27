(() => {
  if (window.__BRASTA_TEAM_BRANDING_V2__) return;
  window.__BRASTA_TEAM_BRANDING_V2__ = true;

  let queued = false;

  function textNodes(root) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) out.push(node);
    return out;
  }

  function playerCards() {
    const players = document.querySelector('.players');
    if (!players) return [];
    return Array.from(players.children).filter((el) => el instanceof HTMLElement);
  }

  function teamFromText(text) {
    const match = String(text || '').match(/\bTeam\s+([AB])\b/i);
    return match ? match[1].toUpperCase() : '';
  }

  function nameFromText(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    const match = clean.match(/^(.*?)\s+Team\s+[AB]\b/i);
    return (match?.[1] || '').replace(/\s*(YOU|Dealer|D)\s*$/i, '').trim();
  }

  function structuredTeam(card) {
    if (card.classList.contains('team-A-player') || card.querySelector('.team-A')) return 'A';
    if (card.classList.contains('team-B-player') || card.querySelector('.team-B')) return 'B';
    return '';
  }

  function structuredName(card) {
    return (card.querySelector('.player-name')?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function playerInfo() {
    const teams = { A: [], B: [] };
    for (const card of playerCards()) {
      const raw = (card.textContent || '').replace(/\s+/g, ' ').trim();
      const team = card.dataset.brastaTeam || structuredTeam(card) || teamFromText(raw);
      const name = card.dataset.brastaPlayerName || structuredName(card) || nameFromText(raw);
      if (team) card.dataset.brastaTeam = team;
      if (name) card.dataset.brastaPlayerName = name;
      if (team && name && !teams[team].includes(name)) teams[team].push(name);
    }
    return teams;
  }

  function brandPlayerCards() {
    for (const card of playerCards()) {
      const raw = (card.textContent || '').replace(/\s+/g, ' ').trim();
      const team = card.dataset.brastaTeam || structuredTeam(card) || teamFromText(raw);
      if (!team) continue;
      card.dataset.brastaTeam = team;
      card.classList.toggle('team-blue-player', team === 'A');
      card.classList.toggle('team-red-player', team === 'B');

      const name = card.dataset.brastaPlayerName || structuredName(card) || nameFromText(raw);
      if (name) card.dataset.brastaPlayerName = name;

      for (const node of textNodes(card)) {
        const original = node.nodeValue || '';
        if (!/\bTeam\s+[AB]\b/i.test(original)) continue;
        const hadName = name && original.includes(name);
        node.nodeValue = original.replace(/\s*Team\s+[AB]\b/ig, '');
        if (hadName && node.parentElement) node.parentElement.classList.add('team-colored-name');
      }

      if (name && !card.querySelector('.team-colored-name')) {
        for (const el of card.querySelectorAll('*')) {
          if ((el.textContent || '').includes(name)) {
            el.classList.add('team-colored-name');
            break;
          }
        }
      }
    }
  }

  function mostLikelyActor(team, teams) {
    const last = document.querySelector('.last-move-banner');
    const text = (last?.textContent || '').replace(/^\s*LAST MOVE\s*/i, '').trim();
    for (const name of teams[team] || []) {
      if (text.toLowerCase().startsWith(name.toLowerCase())) return name;
    }
    return (teams[team] || [])[0] || (team === 'A' ? 'Blue Team' : 'Red Team');
  }

  function actorTeamFromText(text, teams) {
    const normalized = String(text || '').toLowerCase();
    for (const team of ['A', 'B']) {
      const names = [...(teams[team] || [])].sort((a, b) => b.length - a.length);
      for (const name of names) {
        if (name && normalized.includes(name.toLowerCase())) return team;
      }
    }
    return '';
  }

  function brandSpecialEventBanner(banner, teams) {
    const text = (banner.textContent || '').replace(/\s+/g, ' ').trim();
    const isTeamEvent = /BRASTA!|Jack sweep|BIG 2|BIG 10|LAST PICKUP!/i.test(text);

    if (!isTeamEvent) {
      delete banner.dataset.brastaEventTeam;
      banner.classList.remove('team-event-blue', 'team-event-red');
      return;
    }

    const team = teamFromText(text)
      || actorTeamFromText(text, teams)
      || banner.dataset.brastaEventTeam
      || '';

    if (!team) return;

    banner.dataset.brastaEventTeam = team;
    banner.classList.toggle('team-event-blue', team === 'A');
    banner.classList.toggle('team-event-red', team === 'B');
  }

  function rewriteEventBanners(teams) {
    const selectors = '.event,.event-banner,.round-event,.turn-event,.game-event,.last-hand-banner';
    document.querySelectorAll(selectors).forEach((banner) => {
      brandSpecialEventBanner(banner, teams);
      for (const node of textNodes(banner)) {
        let text = node.nodeValue || '';
        text = text.replace(/Team A/gi, mostLikelyActor('A', teams));
        text = text.replace(/Team B/gi, mostLikelyActor('B', teams));
        node.nodeValue = text;
      }
    });
  }

  function rewriteGeneralTeamNames() {
    const app = document.getElementById('app');
    if (!app) return;
    for (const node of textNodes(app)) {
      const parent = node.parentElement;
      if (!parent || parent.closest('.players,.live-score-strip,.event,.event-banner,.round-event,.turn-event,.game-event,.last-hand-banner')) continue;
      let text = node.nodeValue || '';
      text = text.replace(/Team A/gi, 'Blue Team').replace(/Team B/gi, 'Red Team');
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