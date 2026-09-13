'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { SEASON_ONE, SEASON_REWARDS, SEASON_SETS, seasonTier, type SeasonReward } from '../../lib/season-catalog';
import type { SeasonPassState } from '../../lib/season-pass';
import RewardArtwork from './RewardArtwork';

type AccountState = 'loading' | 'signed-out' | 'ready' | 'unavailable';

export default function SeasonPassPreview() {
  const [xp, setXp] = useState(1250);
  const [premium, setPremium] = useState(false);
  const [accountState, setAccountState] = useState<AccountState>('loading');
  const [liveState, setLiveState] = useState<SeasonPassState | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [equipBusy, setEquipBusy] = useState(false);
  const [equipMessage, setEquipMessage] = useState('');
  const [filter, setFilter] = useState('All rewards');
  const [selectedSetId, setSelectedSetId] = useState('all');
  const [selected, setSelected] = useState(SEASON_REWARDS[1]);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const detailClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAccountState('unavailable');
      return;
    }

    let alive = true;
    let requestVersion = 0;

    const loadAccountState = async (session: { access_token?: string } | null) => {
      const version = ++requestVersion;
      if (!session?.access_token) {
        if (!alive || version !== requestVersion) return;
        setLiveState(null);
        setAccessToken('');
        setAccountState('signed-out');
        return;
      }

      setAccountState('loading');
      setAccessToken(session.access_token);
      try {
        const response = await fetch('/api/season-pass', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({})) as { state?: SeasonPassState };
        if (!alive || version !== requestVersion) return;
        if (response.ok && data.state) {
          setLiveState(data.state);
          setXp(data.state.progress.xp);
          setPremium(data.state.premiumUnlocked);
          setAccountState('ready');
        } else {
          setLiveState(null);
          setAccountState(response.status === 401 ? 'signed-out' : 'unavailable');
        }
      } catch {
        if (!alive || version !== requestVersion) return;
        setLiveState(null);
        setAccountState('unavailable');
      }
    };

    void supabase.auth.getSession().then(({ data }) => loadAccountState(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadAccountState(session);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const accountBacked = accountState === 'ready' && Boolean(liveState);
  const catalogRewards = liveState?.rewards?.length ? liveState.rewards : SEASON_REWARDS;
  const displayXp = liveState?.progress.xp ?? xp;
  const tier = liveState?.progress.tier ?? seasonTier(xp);
  const premiumUnlocked = liveState?.premiumUnlocked ?? premium;
  const premiumCount = catalogRewards.filter(r => r.premium).length;
  const visible = catalogRewards.filter(r => filter === 'All rewards' || (filter === 'Free' ? !r.premium : r.premium));
  const groups = Object.entries(SEASON_SETS)
    .filter(([id]) => selectedSetId === 'all' || id === selectedSetId)
    .map(([id, set]) => ({ id, ...set, rewards: visible.filter(r => r.setId === id) }))
    .filter(group => group.rewards.length > 0);
  const selectedSet = SEASON_SETS[selected.setId];
  const relatedRewards = catalogRewards.filter(r => r.setId === selected.setId && r.id !== selected.id);
  const selectedSlot = {
    'Card back': 'card_back',
    'Table felt': 'table_felt',
    'Avatar frame': 'avatar_frame',
    'Profile title': 'profile_title',
  } as const;
  const selectedEquipmentSlot = selectedSlot[selected.kind];
  const selectedOwned = accountBacked && Boolean(liveState?.ownedRewardIds.includes(selected.id));
  const selectedEquipped = accountBacked && liveState?.equipment[selectedEquipmentSlot] === selected.id;

  async function equipSelected(rewardId: string | null) {
    if (!accessToken || !accountBacked || equipBusy) return;
    setEquipBusy(true);
    setEquipMessage('Saving…');
    try {
      const response = await fetch('/api/season-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'equip', slot: selectedEquipmentSlot, rewardId }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as { state?: SeasonPassState; error?: string };
      if (!response.ok || !data.state) throw new Error(data.error || 'Could not save this selection.');
      setLiveState(data.state);
      setXp(data.state.progress.xp);
      setPremium(data.state.premiumUnlocked);
      setEquipMessage(rewardId ? 'Equipped on your account.' : 'Returned to the Brasta original.');
      window.dispatchEvent(new CustomEvent('brasta-season-pass-equipment-changed', { detail: data.state }));
    } catch (error) {
      setEquipMessage(error instanceof Error ? error.message : 'Could not save this selection.');
    } finally {
      setEquipBusy(false);
    }
  }

  function inspectReward(reward: SeasonReward) {
    setSelected(reward);
    setEquipMessage('');
    if (!detailDialog.current?.open) detailDialog.current?.showModal();
    detailDialog.current?.scrollTo({ top: 0 });
    detailClose.current?.focus();
  }
  return <main className="sp-page">
    <nav className="sp-nav"><a href="/">← Back to Brasta</a><span>{accountBacked ? 'ACCOUNT PREVIEW' : 'DESIGN PREVIEW'}</span></nav>
    <header className="sp-hero">
      <div><p className="sp-eyebrow">SEASON 01 · 8 WEEKS</p><h1>The Golden<br /><em>Table.</em></h1>
        <p className="sp-lead">Make every hand your own.</p><p>Five complete sets. Collect matching card backs, table felts, avatar frames, and profile titles with their own badges.</p>
        <div className="sp-facts"><span>Cosmetics only</span><span>Keep unlocked rewards</span><span>Account-backed progress</span></div>
      </div>
      <div className="sp-showcase"><div className="sp-showcase-art"><RewardArtwork reward={selected} eager /></div><p className="sp-set-label">{selectedSet.name} set</p><p>{selected.kind}</p><h2>{selected.name}</h2><p>{selected.description}</p><button className="sp-inspect" onClick={() => inspectReward(selected)}>View artwork</button></div>
    </header>
    <section className="sp-progress" aria-label={accountBacked ? 'Your season progress' : 'Example season progress'}><div><span>{accountBacked ? 'YOUR PROGRESS' : 'EXAMPLE PROGRESS'}</span><h2>Tier {tier} <small>/ {liveState?.season.tiers ?? SEASON_ONE.tiers}</small></h2></div><div className="sp-progress-body"><div className="sp-progress-label"><b>{displayXp.toLocaleString()} Season XP</b><span>{accountBacked ? (liveState?.progress.xpToNextTier ? `${liveState.progress.xpToNextTier} XP to tier ${tier + 1}` : 'All tiers reached') : (tier === 12 ? 'All tiers reached' : `${(tier + 1) * 250 - xp} XP to tier ${tier + 1}`)}</span></div><progress value={displayXp} max={(liveState?.season.tiers ?? SEASON_ONE.tiers) * (liveState?.season.xpPerTier ?? SEASON_ONE.xpPerTier)} aria-label={accountBacked ? 'Your Season XP' : 'Example Season XP'} /></div></section>
    <section className="sp-preview-controls" aria-label={accountBacked ? 'Season account status' : 'Preview controls'}><div><b>{accountBacked ? 'Account progress' : 'Try the reward track'}</b><p>{accountBacked ? 'Progress and owned rewards are synced to your Brasta account.' : 'Sample progress only. Sign in to sync progress; this preview does not purchase or unlock account items.'}</p></div>{accountBacked ? <div className="sp-live-status"><span>{premiumUnlocked ? 'Premium pass active' : 'Free track'}</span><span>{liveState?.ownedRewardIds.length || 0} rewards owned</span></div> : <><label>Season XP<input type="range" min="0" max="3000" step="250" value={xp} onChange={e => setXp(Number(e.target.value))} /></label><label className="sp-toggle"><input type="checkbox" checked={premium} onChange={e => setPremium(e.target.checked)} />Preview Premium</label></>}</section>
    <section className="sp-catalog"><div className="sp-catalog-head"><div><p className="sp-eyebrow">BUILD. CAPTURE. COLLECT.</p><h2>Your season sets</h2><p className="sp-catalog-hint">Each set includes one card back, table felt, avatar frame, and badge/title. Each piece unlocks at its shown tier.</p></div>
      <div className="sp-catalog-controls">
        <label className="sp-set-picker">Cosmetic set<select value={selectedSetId} onChange={e => setSelectedSetId(e.target.value)}><option value="all">All sets</option>{Object.entries(SEASON_SETS).map(([id, set]) => <option key={id} value={id}>{set.name}</option>)}</select></label>
        <div className="sp-filters" aria-label="Filter rewards">{['All rewards', 'Free', 'Premium'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>
      </div>
    </div>
      {groups.map(group => <section className={`sp-set-group sp-set-${group.id}`} key={group.id} aria-labelledby={`sp-set-${group.id}`}>
        <header className="sp-set-heading"><div><h3 id={`sp-set-${group.id}`}>{group.name}</h3><p>{group.description}</p></div><span>{group.rewards.length} {group.rewards.length === 1 ? 'cosmetic' : 'cosmetics'}</span></header>
        <div className="sp-grid">{group.rewards.map(r => {
        const owned = liveState?.ownedRewardIds.includes(r.id) || false;
        const available = accountBacked ? owned : tier >= r.tier && (!r.premium || premiumUnlocked);
        const status = available ? (accountBacked ? '✓ Owned' : '✓ Available in preview') : tier < r.tier ? `Reach tier ${r.tier}` : r.premium && !premiumUnlocked ? 'Premium reward' : accountBacked ? 'Awaiting server award' : 'Not available';
        const equipped = accountBacked && liveState?.equipment[selectedSlot[r.kind]] === r.id;
        return <button key={r.id} className={`sp-reward ${selected.id === r.id ? 'sp-selected' : ''}`} aria-label={`View ${r.name}, ${r.kind}, tier ${r.tier}, ${r.premium ? 'Premium' : 'Free'}`} aria-haspopup="dialog" onClick={() => inspectReward(r)}>
          <div className="sp-reward-meta"><span>TIER {r.tier}</span><b>{r.premium ? 'PREMIUM' : 'FREE'}</b></div><div className="sp-reward-art"><RewardArtwork reward={r} /></div><small>{r.kind === 'Profile title' ? 'Profile title + badge' : r.kind}</small><h3>{r.name}</h3><span className={`sp-status ${available ? 'sp-ready' : ''}`}>{status}</span>
          {equipped ? <span className="sp-equipped-mark">Equipped</span> : null}
        </button>;
        })}</div>
      </section>)}
      {groups.length === 0 ? <div className="sp-empty-set" role="status"><p>No rewards in this set match the selected filter.</p><button className="sp-inspect" onClick={() => setFilter('All rewards')}>Show all rewards in this set</button></div> : null}
    </section>
    <section className="sp-offer"><div><p className="sp-eyebrow">PREMIUM SEASON PASS</p><h2>A little more Brasta.</h2><p>{premiumCount} premium cosmetics, plus the free reward track. Buying later in the season includes premium rewards for tiers you have already reached.</p></div><div><strong>$4.99</strong><span>One purchase · No automatic renewal</span><button disabled>Purchases open at launch</button></div></section>
    <footer className="sp-footer">Season dates, artwork, and XP pacing are proposed. Earned cosmetics stay in your collection after the season ends.</footer>
    <dialog className="sp-detail" ref={detailDialog} aria-labelledby="sp-detail-title" aria-describedby="sp-detail-description">
      <button className="sp-detail-close" ref={detailClose} aria-label="Close artwork preview" onClick={() => detailDialog.current?.close()} autoFocus>×</button>
      <div className="sp-detail-art"><RewardArtwork reward={selected} eager /></div>
      <p className="sp-set-label">{selectedSet.name} set</p>
      <p className="sp-eyebrow">{selected.kind} · Tier {selected.tier} · {selected.premium ? 'Premium' : 'Free'}</p>
      <h2 id="sp-detail-title">{selected.name}</h2>
      <p id="sp-detail-description">{selected.description}</p>
      {selected.kind === 'Profile title' ? <p className="sp-title-includes">One reward includes this title and its matching badge. They equip together; you can display one profile title at a time.</p> : null}
      {accountBacked ? <section className="sp-equip-panel" aria-label={`Equip ${selected.name}`}>
        <p className="sp-equip-status">{selectedOwned ? (selectedEquipped ? 'This reward is equipped on your account.' : 'This reward is owned and ready to equip.') : 'This reward will appear here after the server awards it to your account.'}</p>
        <div className="sp-equip-actions">
          <button className="sp-inspect" type="button" disabled={!selectedOwned || selectedEquipped || equipBusy} onClick={() => void equipSelected(selected.id)}>{equipBusy ? 'Saving…' : selectedEquipped ? 'Equipped' : 'Equip reward'}</button>
          {selectedEquipped ? <button className="sp-inspect sp-secondary-action" type="button" disabled={equipBusy} onClick={() => void equipSelected(null)}>Use Brasta original</button> : null}
        </div>
        <p className="sp-equip-message" role="status" aria-live="polite">{equipMessage}</p>
      </section> : null}
      <section className="sp-set-related" aria-label={`More from the ${selectedSet.name} set`}>
        <h3>Also in {selectedSet.name}</h3>
        {relatedRewards.map(reward => <button className="sp-matching-reward" key={reward.id} onClick={() => inspectReward(reward)}>
          <RewardArtwork reward={reward} eager />
          <span><small>{reward.kind === 'Profile title' ? 'Profile title + badge' : reward.kind} · Tier {reward.tier} · {reward.premium ? 'Premium' : 'Free'}</small><strong>{reward.name}</strong><span>View artwork →</span></span>
        </button>)}
      </section>
      <p className="sp-detail-note">Open your profile to change your frame, choose card backs and felts in Table, or equip a badge and title in Titles. Premium styles are available during beta; selections are saved in this browser.</p>
    </dialog>
  </main>;
}
