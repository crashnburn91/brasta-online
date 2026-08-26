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

  function playerCards() {
    const explicit = Array.from(document.querySelectorAll('.player-chip'));
    if (explicit.length) return explicit;
    const players = document.querySelector('.players');
    return players ? Array.from(players.children).filter((el) => el instanceof HTMLElement) : [];
  }

  function getTeamFromCard(card) {
    const saved = card.dataset.brastaTeam || '';
    if (saved === 'A' || saved === 'B') return saved;
    const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/\bTeam\s+([AB])\b/i);
    if (!match) return '';
    const team = match[1].toUpperCase();
    card.dataset.brastaTeam = team;
    return team;
  }

  function getPlayerName(card) {
    const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/^(.*?)\s+Team\s+[AB]\b/i);
    return (match?.[1] || '').replace(/\s*(YOU|Dealer|D)\s*$/i, '').trim();
  }

  function playerInfo() {
    const teams = { A: [], B: [] };
    for (const card of playerCards()) {
      const team = getTeamFromCard(card);
      const name = getPlayerName(card);
      if (team && name && !teams[team].includes(name)) teams[team].push(name);
    }
    return teams;
  }

  function brandPlayerCards() {
    for (const card of playerCards()) {
      const team = getTeamFromCard(card);
      if (!team) continue;

      card.classList.toggle('team-blue-player', team === 'A');
      card.classList.toggle('team-red-player', team === 'B');

      const name = getPlayerName(card);
      for (const node of textNodes(card)) {
        const raw = node.nodeValue || '';
        if (/\bTeam\s+[AB]\b/i.test(raw)) {
          node.nodeValue = raw.replace(/\s*Team\s+[AB]\b/ig, '');
        }
      }

      if (name) {
        for (const el of card.querySelectorAll('*')) {
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.nodeValue || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (ownText.includes(name)) {
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
      if (parent.closest('.players,.live-score-strip,.event,.event-banner,.round-event,.turn-event,.game-event,.last-hand-banner')) continue;
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
