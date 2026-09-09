'use client';

import { useRef, useState } from 'react';
import { SEASON_ONE, SEASON_REWARDS, seasonTier, type SeasonReward } from '../../lib/season-catalog';
import RewardArtwork from './RewardArtwork';

export default function SeasonPassPreview() {
  const [xp, setXp] = useState(1250);
  const [premium, setPremium] = useState(false);
  const [filter, setFilter] = useState('All rewards');
  const [selected, setSelected] = useState(SEASON_REWARDS[1]);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const tier = seasonTier(xp);
  const premiumCount = SEASON_REWARDS.filter(r => r.premium).length;
  const visible = SEASON_REWARDS.filter(r => filter === 'All rewards' || (filter === 'Free' ? !r.premium : r.premium));
  function inspectReward(reward: SeasonReward) {
    setSelected(reward);
    detailDialog.current?.showModal();
  }
  return <main className="sp-page">
    <nav className="sp-nav"><a href="/">← Back to Brasta</a><span>DESIGN PREVIEW</span></nav>
    <header className="sp-hero">
      <div><p className="sp-eyebrow">SEASON 01 · 8 WEEKS</p><h1>The Golden<br /><em>Table.</em></h1>
        <p className="sp-lead">Make every hand your own.</p><p>Collect card designs, profile badges, and finishing touches inspired by Brasta’s green and gold.</p>
        <div className="sp-facts"><span>Cosmetics only</span><span>Keep unlocked rewards</span><span>One account, every device</span></div>
      </div>
      <div className="sp-showcase"><div className="sp-showcase-art"><RewardArtwork reward={selected} eager /></div><p>{selected.kind}</p><h2>{selected.name}</h2><p>{selected.description}</p><button className="sp-inspect" onClick={() => inspectReward(selected)}>View artwork</button></div>
    </header>
    <section className="sp-progress" aria-label="Example season progress"><div><span>EXAMPLE PROGRESS</span><h2>Tier {tier} <small>/ {SEASON_ONE.tiers}</small></h2></div><div className="sp-progress-body"><div className="sp-progress-label"><b>{xp.toLocaleString()} Season XP</b><span>{tier === 12 ? 'All tiers reached' : `${(tier + 1) * 250 - xp} XP to tier ${tier + 1}`}</span></div><progress value={xp} max={3000} aria-label="Example Season XP" /></div></section>
    <section className="sp-preview-controls" aria-label="Preview controls"><div><b>Try the reward track</b><p>Sample progress only. This preview does not purchase or unlock account items.</p></div><label>Season XP<input type="range" min="0" max="3000" step="250" value={xp} onChange={e => setXp(Number(e.target.value))} /></label><label className="sp-toggle"><input type="checkbox" checked={premium} onChange={e => setPremium(e.target.checked)} />Preview Premium</label></section>
    <section className="sp-catalog"><div className="sp-catalog-head"><div><p className="sp-eyebrow">BUILD. CAPTURE. COLLECT.</p><h2>Your season rewards</h2><p className="sp-catalog-hint">Select a cosmetic to explore its details.</p></div><div className="sp-filters" aria-label="Filter rewards">{['All rewards', 'Free', 'Premium'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div></div>
      <div className="sp-grid">{visible.map(r => {
        const available = tier >= r.tier && (!r.premium || premium);
        return <button key={r.id} className={`sp-reward ${selected.id === r.id ? 'sp-selected' : ''}`} aria-label={`View ${r.name}, ${r.kind}, tier ${r.tier}, ${r.premium ? 'Premium' : 'Free'}`} aria-haspopup="dialog" onClick={() => inspectReward(r)}>
          <div className="sp-reward-meta"><span>TIER {r.tier}</span><b>{r.premium ? 'PREMIUM' : 'FREE'}</b></div><div className="sp-reward-art"><RewardArtwork reward={r} /></div><small>{r.kind}</small><h3>{r.name}</h3><span className={`sp-status ${available ? 'sp-ready' : ''}`}>{available ? '✓ Available in preview' : tier < r.tier ? `Reach tier ${r.tier}` : 'Premium reward'}</span>
        </button>;
      })}</div>
    </section>
    <section className="sp-offer"><div><p className="sp-eyebrow">PREMIUM SEASON PASS</p><h2>A little more Brasta.</h2><p>{premiumCount} premium cosmetics, plus the free reward track. Buying later in the season includes premium rewards for tiers you have already reached.</p></div><div><strong>$4.99</strong><span>One purchase · No automatic renewal</span><button disabled>Purchases open at launch</button></div></section>
    <footer className="sp-footer">Season dates, artwork, and XP pacing are proposed. Earned cosmetics stay in your collection after the season ends.</footer>
    <dialog className="sp-detail" ref={detailDialog} aria-labelledby="sp-detail-title" aria-describedby="sp-detail-description">
      <button className="sp-detail-close" aria-label="Close artwork preview" onClick={() => detailDialog.current?.close()} autoFocus>×</button>
      <div className="sp-detail-art"><RewardArtwork reward={selected} eager /></div>
      <p className="sp-eyebrow">{selected.kind} · Tier {selected.tier} · {selected.premium ? 'Premium' : 'Free'}</p>
      <h2 id="sp-detail-title">{selected.name}</h2>
      <p id="sp-detail-description">{selected.description}</p>
      <p className="sp-detail-note">{selected.kind === 'Card faces' ? 'Ace design preview. Full deck artwork is still in development.' : 'Artwork preview. Equipping cosmetics will be available at launch.'}</p>
    </dialog>
  </main>;
}
