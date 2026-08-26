(() => {
  if (window.BrastaRankBadge) return;

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);

  function parse(rank) {
    const raw = String(rank || 'Unranked').trim();
    if (!raw || /^unranked$/i.test(raw)) return { raw: 'Unranked', tier: 'unranked', division: 0 };
    const match = raw.match(/^(Bronze|Silver|Gold|Platinum|Diamond)(?:\s+(III|II|I))?$/i);
    if (match) {
      const tier = match[1].toLowerCase();
      const division = match[2] === 'I' ? 3 : match[2] === 'II' ? 2 : match[2] === 'III' ? 1 : 0;
      return { raw, tier, division };
    }
    if (/^grandmaster$/i.test(raw)) return { raw: 'Grandmaster', tier: 'grandmaster', division: 0 };
    if (/^master$/i.test(raw)) return { raw: 'Master', tier: 'master', division: 0 };
    return { raw, tier: 'unranked', division: 0 };
  }

  function rankClass(rank) {
    return `rank-${String(rank || 'unranked').toLowerCase().replace(/\s+/g, '-')}`;
  }

  function suitText(symbol) {
    return `<text class="rank-emblem-symbol" x="32" y="42" text-anchor="middle" dominant-baseline="middle">${symbol}</text>`;
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

  function divisionMarks(division) {
    if (!division) return '';
    const marks = [];
    for (let i = 0; i < division; i += 1) {
      const x = 25 + (i * 7);
      marks.push(`<path class="rank-division-mark" d="M${x - 3} 61 ${x} 64 ${x + 3} 61"/>`);
    }
    return marks.join('');
  }

  function emblem(rank, size = 'medium') {
    const info = parse(rank);
    return `<svg class="rank-emblem rank-emblem-${esc(size)} rank-tier-${info.tier}" viewBox="0 0 64 70" role="img" aria-label="${esc(info.raw)} rank badge">
      <path class="rank-shield" d="M32 4 53 13v27c0 11-8 20-21 26C19 60 11 51 11 40V13Z"/>
      <path class="rank-shield-inner" d="M32 9 48 16v23c0 8-6 15-16 21-10-6-16-13-16-21V16Z"/>
      ${symbolFor(info.tier)}
      ${divisionMarks(info.division)}
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