(() => {
  if (window.BrastaRankBadge) return;

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);

  function parse(rank) {
    const raw = String(rank || 'Unranked').trim();
    if (!raw || /^unranked$/i.test(raw)) return { raw: 'Unranked', tier: 'unranked', division: '' };
    const match = raw.match(/^(Bronze|Silver|Gold|Platinum|Diamond)(?:\s+(III|II|I))?$/i);
    if (match) {
      const tier = match[1].toLowerCase();
      const division = String(match[2] || '').toUpperCase();
      return { raw, tier, division };
    }
    if (/^grandmaster$/i.test(raw)) return { raw: 'Grandmaster', tier: 'grandmaster', division: '' };
    if (/^master$/i.test(raw)) return { raw: 'Master', tier: 'master', division: '' };
    return { raw, tier: 'unranked', division: '' };
  }

  function rankClass(rank) {
    return `rank-${String(rank || 'unranked').toLowerCase().replace(/\s+/g, '-')}`;
  }

  function suitText(symbol) {
    return `<text class="rank-emblem-symbol" x="32" y="35.5" text-anchor="middle" dominant-baseline="central">${symbol}</text>`;
  }

  function divisionText(division) {
    return `<text class="rank-division-symbol" x="32" y="37.5" text-anchor="middle">${division}</text>`;
  }

  function symbolFor(tier) {
    if (tier === 'bronze') return suitText('♠');
    if (tier === 'silver') return suitText('♦');
    if (tier === 'gold') return suitText('♥');
    if (tier === 'platinum') return suitText('♣');
    if (tier === 'diamond') {
      return `<g class="rank-emblem-gem" aria-hidden="true">
        <path d="M32 19 44 31 32 46 20 31Z"/>
        <path d="M20 31h24M32 19v27M20 31l12-7 12 7M20 31l12 15 12-15"/>
      </g>`;
    }
    if (tier === 'master') {
      return `<g class="rank-emblem-crown" aria-hidden="true">
        <path d="M19 39 21 24 29 31 32 20 36 31 44 24 46 39Z"/>
        <path d="M21 39h25"/>
      </g>`;
    }
    if (tier === 'grandmaster') {
      return `<g class="rank-emblem-crown rank-emblem-crown-grand" aria-hidden="true">
        <path d="M17 40 20 22 28 30 32 17 37 30 45 22 48 40Z"/>
        <path d="M20 40h28"/>
        <path d="M32 20 36 25 32 30 28 25Z"/>
      </g>`;
    }
    return suitText('♠');
  }

  function centralMark(info) {
    if (info.division === 'III' || info.division === 'II') return divisionText(info.division);
    return symbolFor(info.tier);
  }

  function emblem(rank, size = 'medium') {
    const info = parse(rank);
    return `<svg class="rank-emblem rank-emblem-${esc(size)} rank-tier-${info.tier}" viewBox="0 0 64 70" role="img" aria-label="${esc(info.raw)} rank badge">
      <path class="rank-shield" d="M32 5 52 13.5v25.8c0 10.7-7.4 19.4-20 25.6-12.6-6.2-20-14.9-20-25.6V13.5Z"/>
      <path class="rank-shield-inner" d="M32 10 47.2 16.5v21.9c0 7.9-5.5 14.7-15.2 20-9.7-5.3-15.2-12.1-15.2-20V16.5Z"/>
      <g class="rank-symbol-wrap">${centralMark(info)}</g>
    </svg>`;
  }

  function render(rank, options = {}) {
    const info = parse(rank);
    const size = options.size || 'medium';
    const label = options.label == null ? info.raw : String(options.label);
    const extra = options.className ? ` ${esc(options.className)}` : '';
    return `<span class="rank-badge rank-visual rank-size-${esc(size)} ${rankClass(info.raw)}${extra}" title="${esc(info.raw)}">
      ${emblem(info.raw, size)}
      <span class="rank-badge-copy">${esc(label)}</span>
    </span>`;
  }

  window.BrastaRankBadge = { parse, rankClass, emblem, render };
})();
