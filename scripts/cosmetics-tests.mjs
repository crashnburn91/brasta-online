import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const catalogSource = ts.transpileModule(readFileSync('lib/season-catalog.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { SEASON_REWARDS, SEASON_SETS } = await import('data:text/javascript;base64,' + Buffer.from(catalogSource).toString('base64'));
const slotKinds = { cardBack: 'Card back', tableFelt: 'Table felt', profileTitle: 'Profile title', avatarFrame: 'Avatar frame' };

const storageKey = 'brasta-beta-cosmetics-v1';
const ownSelector = '.player-card[data-you="1"]';
const badge = { key: 'founder', name: 'Founder', tier: 'standard', icon: 'B', unlocked: true, description: 'An earned title.' };
const card = (name, self = false) => `<div class="player-chip player-card" data-player-profile="${name}" ${self ? 'data-you="1"' : ''}>
  <div class="player-card-top"><div class="player-card-identity"><div class="player-name-line"><b class="player-name">${name}</b></div></div></div>
</div>`;
const profile = (name) => `<section class="player-profile-modal"><div class="player-profile-head"><div class="player-profile-avatar"><span class="brasta-avatar-portrait">${name[0]}</span></div><div class="player-profile-identity"><h2 id="player-profile-title">${name}</h2></div></div><div class="player-profile-ranks"></div></section>`;

async function fixture(t, { accountPhoto = '', avatarResponse, saved, equipError = false, collectionError = false, accountState, seasonResponse } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <button class="account-dock" data-brasta-username="Tester"><span class="brasta-avatar-shell">${accountPhoto ? `<img class="brasta-avatar-portrait" src="${accountPhoto}">` : '<span class="account-avatar-fallback brasta-avatar-portrait">T</span>'}</span></button>
    <div class="players">${card('Tester', true)}${card('Opponent')}</div>
    <section class="account-modal"><div class="account-profile-head"><div class="account-portrait-controls"><span class="brasta-avatar-shell"><span class="account-profile-avatar brasta-avatar-portrait">T</span></span><button type="button" data-cosmetics-frame-open aria-haspopup="dialog">Change frame</button></div><div><h2>Tester</h2></div></div><div class="account-experience-card">Experience</div></section>
    ${profile('Tester')}${profile('Opponent')}
  </body></html>`, { url: 'https://beta.brasta.app/', runScripts: 'outside-only' });
  const observers = [];
  t.after(() => { observers.forEach((observer) => observer.disconnect()); dom.window.close(); });
  const { window } = dom;
  const { document } = window;
  const MutationObserver = window.MutationObserver;
  window.MutationObserver = class extends MutationObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  // Let JSDOM deliver DOMContentLoaded before starting the actual client scripts.
  await new Promise(setImmediate);
  const frames = [];
  window.requestAnimationFrame = (callback) => frames.push(callback);
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  window.BRASTA_SEASON_CATALOG = { rewards: SEASON_REWARDS, sets: SEASON_SETS };
  // Build the existing account profile shell before exercising guest previews
  // or authenticated cosmetics. The progression script owns those base tabs.
  window.localStorage.setItem('brasta-auth-access-token', 'fixture-token');
  const requests = [];
  let earned = badge;
  window.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : {};
    requests.push({ url, ...body });
    if (url === '/api/season-pass') {
      if (seasonResponse) return seasonResponse(body,options.headers.Authorization);
      if (body.action === 'equip') {
        accountState.equipment[body.slot] = body.rewardId;
        if (body.slot === 'profile_title') accountState.titleSource = body.rewardId ? 'season' : 'none';
      }
      return { ok: true, json: async () => JSON.parse(JSON.stringify({ state: accountState })) };
    }
    if (url === '/api/player-avatar') {
      const result = avatarResponse ? await avatarResponse(body.username) : { avatarUrl: null };
      return { ok: true, json: async () => result };
    }
    if (url === '/api/player-profile') return { ok: true, json: async () => ({ profile: { username: body.username } }) };
    if ((body.action === 'equip' && equipError) || (body.action === 'collection' && collectionError)) return { ok: false, json: async () => ({ error: 'Temporarily unavailable' }) };
    if (body.action === 'equip') {
      earned = body.badgeKey === 'founder' ? badge : null;
      if (accountState) { accountState.equipment.profile_title = null; accountState.titleSource = earned ? 'earned' : 'none'; }
    }
    return { ok: true, json: async () => ({ equipped: earned, isSelf: body.username === 'Tester' || body.action === 'equip', badges: { equipped: earned, items: [badge, { key: 'locked', name: 'Locked title', unlocked: false }] } }) };
  };
  for (const file of ['player-cards.css', 'player-card-avatars.css', 'player-card-identity.css', 'player-progression.css', 'profile-badges.css', 'cosmetics.css']) {
    const style = document.createElement('style');
    style.textContent = readFileSync(`public/${file}`, 'utf8');
    document.head.appendChild(style);
  }
  if (saved) window.localStorage.setItem(storageKey, JSON.stringify(saved));
  for (const file of ['player-progression.js', 'profile-badges.js', 'player-card-avatars.js', 'cosmetics.js']) {
    if (file === 'profile-badges.js' && !accountState && !seasonResponse) window.localStorage.removeItem('brasta-auth-access-token');
    window.eval(readFileSync(`public/${file}`, 'utf8'));
  }
  async function settle() {
    for (let round = 0; round < 20; round++) {
      await new Promise(setImmediate);
      if (!frames.length) return;
      for (const callback of frames.splice(0)) callback();
    }
    assert.fail('Cosmetics and avatar observers did not settle; the UI is still rewriting itself.');
  }
  async function select(slot, value) {
    const account = document.querySelector('.account-modal');
    let button;
    if (slot === 'profileTitle') {
      account.querySelector('[data-profile-badges-tab]').click();
      button = value ? account.querySelector(`[data-badge-equip="${value}"]`) : account.querySelector('[data-badge-unequip]');
    } else if (slot === 'avatarFrame') {
      account.querySelector('[data-cosmetics-frame-open]').click();
      button = document.querySelector(`.cosmetic-frame-dialog [data-cosmetics-equip="${value}"]`);
    } else {
      account.querySelector('[data-cosmetics-table-tab]').click();
      button = account.querySelector(`[data-cosmetics-kind="${slot}"][data-cosmetics-equip="${value}"]`);
    }
    assert(button, `Missing equipment control: ${slot}/${value}`);
    button.click();
    await settle();
    if (slot === 'avatarFrame') document.querySelector('.cosmetic-frame-dialog .cosmetic-done').click();
  }
  await settle();
  return { window, document, requests, settle, select };
}

test('Titles equips one badge and title, preserves usernames, and Remove leaves no title', async (t) => {
  const { document, window, requests, select, settle } = await fixture(t);
  const own = document.querySelector(ownSelector);
  for (const { id } of SEASON_REWARDS.filter((reward) => reward.kind === 'Profile title')) {
    await select('profileTitle', id);
    assert.equal(own.querySelector('.beta-cosmetic-badge-art').getAttribute('src'), `/cosmetics/season-1/${id}.svg?v=3`);
    assert.equal(own.querySelectorAll('[data-beta-cosmetic-title]').length, 1);
    assert.equal(document.querySelector('.account-profile-head h2').textContent, 'Tester');
    assert.equal(document.querySelector('.player-profile-identity h2').textContent, 'Tester');
    assert.equal(document.querySelector('.player-card:not([data-you]) [data-beta-cosmetic-title]'), null);
    assert.equal(document.querySelectorAll('.player-profile-head[data-beta-cosmetic-self]').length, 1);
    assert.equal(window.getComputedStyle(own.querySelector('[data-player-card-profile-badge]')).display, 'none');
  }
  assert(requests.filter((request) => request.action === 'collection').every((request) => ['Tester', 'Opponent'].includes(request.username)));
  document.querySelector('.account-modal [data-badge-unequip]').click();
  await settle();
  assert.equal(document.querySelector('[data-beta-cosmetic-title]'), null);
  assert.equal(window.getComputedStyle(own.querySelector('[data-player-card-profile-badge]')).display, 'none');
  assert.equal(document.querySelector('.account-modal .profile-badge-hero b').textContent, 'None');
  assert.equal(JSON.parse(window.localStorage.getItem(storageKey)).titleSource, 'none');
  assert.equal(requests.filter((request) => request.action === 'equip').length, 0, 'Local cosmetic choices must not grant server titles');
});

test('the former Velvet Conservatory slots now equip the Royal Crown artwork', async (t) => {
  const { document, select } = await fixture(t);
  assert.match(document.querySelector('[data-cosmetics-equip="velvet_club"]').textContent, /Royal Crown/);
  assert.match(document.querySelector('[data-cosmetics-equip="woven_green"]').textContent, /Royal Crown Felt/);
  await select('cardBack', 'velvet_club');
  await select('tableFelt', 'woven_green');
  assert.equal(document.documentElement.dataset.brastaCardBack, 'velvet_club');
  assert.equal(document.documentElement.dataset.brastaTableFelt, 'woven_green');
  assert.match(document.documentElement.style.getPropertyValue('--brasta-card-back-art'), /velvet_club\.svg/);
  assert.match(document.documentElement.style.getPropertyValue('--brasta-table-felt-art'), /woven_green\.svg/);
});

test('a fetched photo survives DOM changes and switching or removing every frame', async (t) => {
  const { document, requests, settle, select } = await fixture(t, {
    avatarResponse: async (username) => ({ avatarUrl: `https://example.test/${username}.jpg` }),
  });
  const own = document.querySelector(ownSelector);
  const photo = own.querySelector('.player-card-avatar img');
  assert.equal(photo.src, 'https://example.test/Tester.jpg');
  for (const frame of [...SEASON_REWARDS.filter((reward) => reward.kind === 'Avatar frame').map((reward) => reward.id), '']) {
    await select('avatarFrame', frame);
    document.body.appendChild(document.createElement('div'));
    await settle();
    assert.equal(own.querySelector('.player-card-avatar img'), photo, 'Loaded photo was replaced during a cosmetic update');
  }
  assert.equal(requests.filter((request) => request.url === '/api/player-avatar' && request.username === 'Tester').length, 1);
});

test('own card uses the account photo and reserves an unclipped frame only for self', async (t) => {
  const { document, window, settle } = await fixture(t, { accountPhoto: 'https://example.test/provider-photo.jpg' });
  const ownAvatar = document.querySelector(`${ownSelector} .player-card-avatar`);
  assert.equal(ownAvatar.querySelector('img').src, 'https://example.test/provider-photo.jpg');
  const opponentAvatar = document.querySelector('.player-card:not([data-you]) .player-card-avatar');
  assert.equal(opponentAvatar.querySelector('img'), null);
  assert.equal(window.getComputedStyle(ownAvatar).overflow, 'visible');
  assert.equal(window.getComputedStyle(opponentAvatar).overflow, 'hidden');
  document.querySelector('.account-dock img').src = 'https://example.test/new-photo.jpg';
  await settle();
  assert.equal(ownAvatar.querySelector('img').src, 'https://example.test/new-photo.jpg');
});

test('a late lookup cannot replace a newly selected photo', async (t) => {
  let resolveLookup;
  const lookup = new Promise((resolve) => { resolveLookup = resolve; });
  const { document, window, settle } = await fixture(t, {
    avatarResponse: (username) => username === 'Tester' ? lookup : { avatarUrl: null },
  });
  window.dispatchEvent(new window.CustomEvent('brasta-profile-avatar-changed', { detail: { avatarUrl: 'https://example.test/updated.jpg' } }));
  await settle();
  const photo = document.querySelector(`${ownSelector} .player-card-avatar img`);
  resolveLookup({ avatarUrl: 'https://example.test/outdated.jpg' });
  await settle();
  assert.equal(document.querySelector(`${ownSelector} .player-card-avatar img`), photo);
  assert.equal(photo.src, 'https://example.test/updated.jpg');
});

test('failed images fall back once and invalid saved reward IDs are ignored', async (t) => {
  const { document, window, settle } = await fixture(t, {
    avatarResponse: async () => ({ avatarUrl: 'https://example.test/unavailable.jpg' }),
    saved: { profileTitle: '../../invalid', avatarFrame: 'missing-frame' },
  });
  const ownAvatar = document.querySelector(`${ownSelector} .player-card-avatar`);
  ownAvatar.querySelector('img').dispatchEvent(new window.Event('error'));
  await settle();
  assert.equal(ownAvatar.querySelector('img'), null);
  assert.equal(ownAvatar.querySelector('.player-card-avatar-fallback').textContent, 'T');
  assert.equal(document.documentElement.hasAttribute('data-brasta-avatar-frame'), false);
  assert.equal(document.querySelector('[data-beta-cosmetic-title]'), null);
});

test('every set has matching equipment in the integrated controls and only Golden Spade is free', async (t) => {
  const { document, window, select } = await fixture(t, { accountPhoto: 'https://example.test/provider-photo.jpg' });
  assert.equal(SEASON_REWARDS.length, 20);
  assert.equal(new Set(SEASON_REWARDS.map((reward) => reward.id)).size, 20);
  assert.deepEqual(readdirSync('public/cosmetics/season-1').filter((file) => file.endsWith('.svg')).sort(), SEASON_REWARDS.map((reward) => `${reward.id}.svg`).sort());
  assert.equal(document.querySelector('.brasta-cosmetics-launcher, .brasta-cosmetics-modal'), null);
  const photo = document.querySelector(`${ownSelector} .player-card-avatar img`);
  const account = document.querySelector('.account-modal');
  for (const [setId, set] of Object.entries(SEASON_SETS)) {
    const rewards = SEASON_REWARDS.filter((reward) => reward.setId === setId);
    assert.deepEqual(rewards.map((reward) => reward.kind).sort(), Object.values(slotKinds).sort(), `${set.name} needs one reward of each kind`);
    assert(rewards.every((reward) => reward.premium === (setId !== 'gilded_court')), `${set.name} access is inconsistent`);
    const expected = Object.fromEntries(Object.entries(slotKinds).map(([slot, kind]) => [slot, rewards.find((reward) => reward.kind === kind).id]));
    assert.equal(rewards.find((reward) => reward.kind === 'Table felt').matchingCardBackId, expected.cardBack);
    for (const [slot, id] of Object.entries(expected)) await select(slot, id);
    assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)), { ...expected, titleSource: 'season' });
    assert.equal(document.querySelector(`${ownSelector} .player-card-avatar img`), photo);
    assert.equal(account.querySelector('.profile-badge-hero b').textContent, rewards.find((reward) => reward.kind === 'Profile title').name);
    assert.equal(account.querySelector('[data-cosmetics-equip="' + expected.tableFelt + '"] .cosmetic-access').textContent, setId === 'gilded_court' ? 'Free track' : 'Premium');
    assert.equal(account.querySelectorAll('.profile-badge-card.equipped').length, 1);
  }
});

test('retired badges and face choices are removed from saved equipment without clearing valid choices', async (t) => {
  for (const id of ['golden_guest', 'four_suits', 'season_regular', 'season_keepsake']) {
    const { document, window } = await fixture(t, { saved: { cardBack: 'velvet_club', tableFelt: 'woven_green', profileTitle: id, avatarFrame: 'laurel', cardFaces: 'ivory_faces' } });
    assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)), { cardBack: 'velvet_club', tableFelt: 'woven_green', profileTitle: null, avatarFrame: 'laurel', titleSource: 'earned' });
    assert.equal(document.querySelector('[data-beta-cosmetic-title]'), null);
    assert.equal(document.querySelector('.account-modal .profile-badge-hero b').textContent, 'Founder');
  }
});

test('new equipment is Golden Spade and existing choices remain intact', async (t) => {
  const fresh = await fixture(t);
  const value = JSON.parse(fresh.window.localStorage.getItem(storageKey));
  for (const slot of Object.keys(slotKinds)) assert.equal(SEASON_REWARDS.find((item) => item.id === value[slot]).setId, 'gilded_court');
  const saved = { cardBack: 'midnight', tableFelt: 'midnight_felt', profileTitle: 'astrology_title', avatarFrame: 'astrology_frame' };
  const existing = await fixture(t, { saved });
  assert.deepEqual(JSON.parse(existing.window.localStorage.getItem(storageKey)), { ...saved, titleSource: 'season' });
});

test('Table and Titles switch cleanly with every existing profile tab; opponents have no equipment controls', async (t) => {
  const { document, settle } = await fixture(t);
  for (const modal of [document.querySelector('.account-modal'), document.querySelector('.player-profile-modal')]) {
    const table = modal.querySelector('[data-cosmetics-table-panel]');
    const titles = modal.querySelector('[data-profile-badges-panel]');
    for (const original of modal.querySelectorAll('[data-account-ppg-tab], [data-ppg-tab]')) {
      modal.querySelector('[data-cosmetics-table-tab]').click();
      assert.equal(table.hidden, false);
      assert.equal(titles.hidden, true);
      assert([...modal.querySelectorAll('[data-account-ppg-panel], [data-ppg-panel], .account-experience-card')].every((node) => node.hidden));
      modal.querySelector('[data-profile-badges-tab]').click();
      assert.equal(table.hidden, true);
      assert.equal(titles.hidden, false);
      original.click();
      assert.equal(table.hidden, true);
      assert.equal(titles.hidden, true);
      assert.equal(modal.querySelectorAll('.ppg-tabs [aria-selected="true"]').length, 1);
      await settle();
    }
  }
  const opponent = [...document.querySelectorAll('.player-profile-modal')][1];
  assert.equal(opponent.querySelector('[data-cosmetics-frame-open], [data-cosmetics-table-tab], [data-badge-equip]'), null);
  assert.equal(opponent.querySelectorAll('.has-cosmetic-art').length, 0);
});

test('an earned title replaces the cosmetic title only after a successful server update', async (t) => {
  const { document, window, select, settle } = await fixture(t);
  await select('profileTitle', 'founder');
  assert.equal(document.querySelector('.account-modal .profile-badge-hero b').textContent, 'Founder');
  assert.equal(document.querySelector('[data-beta-cosmetic-title]'), null);
  assert.notEqual(window.getComputedStyle(document.querySelector(`${ownSelector} [data-player-card-profile-badge]`)).display, 'none');
  assert.equal(JSON.parse(window.localStorage.getItem(storageKey)).titleSource, 'earned');
  await select('profileTitle', 'royal_title');
  assert.equal(document.querySelector('.account-modal .profile-badge-hero b').textContent, 'Sovereign');
  await select('profileTitle', 'founder');
  await select('profileTitle', '');
  await settle();
  assert.equal(document.querySelector('.account-modal .profile-badge-hero b').textContent, 'None');
  assert.equal(document.querySelector(`${ownSelector} [data-player-card-profile-badge]`), null);
});

test('a failed earned-title update retains the cosmetic title and valid button states', async (t) => {
  const { document, window, select } = await fixture(t, { equipError: true });
  await select('profileTitle', 'founder');
  assert.equal(document.querySelector('.account-modal .profile-badge-hero b').textContent, 'Ace of Spades');
  assert.equal(document.querySelector('.account-modal [data-badge-equip="first_seat"]').disabled, true);
  assert.equal(document.querySelector('.account-modal [data-badge-equip="founder"]').disabled, false);
  assert.equal(JSON.parse(window.localStorage.getItem(storageKey)).titleSource, 'season');
  assert.match(document.querySelector('.account-modal .profile-badge-error').textContent, /Temporarily unavailable/);
});

test('set titles remain available when earned-title loading fails', async (t) => {
  const { document, select } = await fixture(t, { collectionError: true });
  await select('profileTitle', 'golden_brasta');
  assert.equal(document.querySelector('.account-modal .profile-badge-hero b').textContent, 'Gypsy');
  assert.equal(document.querySelectorAll('.account-modal [data-badge-equip]').length, 5);
  assert.match(document.querySelector('.account-modal .profile-badge-error').textContent, /Earned titles are unavailable/);
});

test('frame chooser previews the real portrait, closes, and returns focus to its control', async (t) => {
  const { document, settle } = await fixture(t, { accountPhoto: 'https://example.test/provider-photo.jpg' });
  const trigger = document.querySelector('.account-modal [data-cosmetics-frame-open]');
  trigger.click();
  const dialog = document.querySelector('.cosmetic-frame-dialog');
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelectorAll('[data-frame-portrait] img').length, 6);
  assert([...dialog.querySelectorAll('[data-frame-portrait] img')].every((image) => image.src === 'https://example.test/provider-photo.jpg'));
  dialog.querySelector('[data-cosmetics-equip="astrology_frame"]').click();
  await settle();
  assert.equal(dialog.querySelectorAll('[aria-pressed="true"]').length, 1);
  dialog.querySelector('.cosmetic-done').click();
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, trigger);
});

test('a guest can reach Table and Titles from their own match profile', async (t) => {
  const { document, settle } = await fixture(t, { collectionError: true });
  const modal = document.querySelector('.player-profile-modal');
  modal.querySelectorAll('.ppg-tabs, .ppg-panel').forEach((node) => node.remove());
  const guest = document.createElement('div'); guest.className = 'player-profile-guest'; guest.textContent = 'Guest profile'; modal.appendChild(guest);
  await settle();
  modal.querySelector('[data-cosmetics-table-tab]').click();
  assert.equal(guest.hidden, true);
  assert.equal(modal.querySelector('[data-cosmetics-table-panel]').hidden, false);
  modal.querySelector('[data-profile-badges-tab]').click();
  assert.equal(modal.querySelector('[data-cosmetics-table-panel]').hidden, true);
  assert.equal(modal.querySelectorAll('[data-badge-equip]').length, 5);
  [...modal.querySelectorAll('.ppg-tabs button')].find((button) => button.textContent === 'Overview').click();
  assert.equal(guest.hidden, false);
  assert.equal(modal.querySelector('[data-profile-badges-panel]').hidden, true);
});

const seasonState = (overrides={}) => ({
  playerId:'player-a', season:{status:'draft'}, titleSource:'earned',
  equipment:{card_back:null,table_felt:null,avatar_frame:null,profile_title:null},
  ownedRewardIds:[], ...overrides,
});
const stateResponse = state => ({ok:true,json:async()=>JSON.parse(JSON.stringify({state}))});

test('signed-in players see owned equipment only; guest previews do not grant rewards',async(t)=>{
  const {document,window,select,requests}=await fixture(t,{accountState:seasonState()});
  assert.equal(document.documentElement.hasAttribute('data-brasta-card-back'),false);
  const classic = document.querySelector('[data-cosmetics-kind="cardBack"][data-cosmetics-equip=""]');
  assert.equal(classic.disabled, false);
  assert.equal(classic.querySelector('.cosmetic-choice-state').textContent, 'Equipped');
  assert.equal(document.querySelector('[data-cosmetics-equip="gilded_suits"] .cosmetic-choice-state').textContent, 'Tier 1');
  await select('cardBack','velvet_club');
  assert.equal(requests.filter(r=>r.url==='/api/season-pass'&&r.action==='equip').length,0);
  await assert.rejects(window.BrastaCosmetics.equip('profileTitle','royal_title'),/not unlocked/);
  assert.equal(document.querySelectorAll('.account-modal [data-badge-equip="royal_title"]').length,0);
  assert.match(document.querySelector('.account-modal [data-badge-key="royal_title"]').textContent,/Tier 7 · Premium/);
});
test('account equips and Remove persist through refresh without overwriting guest choices',async(t)=>{
  const state=seasonState({ownedRewardIds:SEASON_REWARDS.map(r=>r.id)});
  const {window,document,select}=await fixture(t,{accountState:state});
  const guest=window.localStorage.getItem(storageKey);
  await select('profileTitle','royal_title');
  assert.equal(window.BrastaCosmetics.read().profileTitle,'royal_title');
  await select('profileTitle','');
  await window.BrastaCosmetics.refresh();
  assert.equal(window.BrastaCosmetics.read().titleSource,'none');
  assert.equal(document.querySelector('.account-modal .profile-badge-hero b').textContent,'None');
  await select('profileTitle','founder');
  assert.equal(window.BrastaCosmetics.read().titleSource,'earned');
  assert.equal(window.localStorage.getItem(storageKey),guest);
});
test('failed account loading disables cosmetics and never falls back to premium guest preview',async(t)=>{
  const {window,document}=await fixture(t,{seasonResponse:async()=>({ok:false,json:async()=>({error:'Unavailable'})})});
  assert.equal(window.BrastaCosmetics.status(),'unavailable');
  assert.equal(window.BrastaCosmetics.read().cardBack,null);
  assert.equal(document.querySelector('[data-cosmetics-equip="velvet_club"]').disabled,true);
  assert.equal(document.querySelector('[data-cosmetics-equip="velvet_club"] .cosmetic-choice-state').textContent, 'Unavailable');
  assert.equal(document.querySelector('[data-cosmetics-kind="cardBack"][data-cosmetics-equip=""] .cosmetic-choice-state').textContent, 'Unavailable');
  await assert.rejects(window.BrastaCosmetics.equip('cardBack','velvet_club'),/unavailable/);
  assert.equal(window.BrastaCosmetics.titleItems().some(r=>r.unlocked),false);
});
test('a late account load cannot leak another account collection after a switch',async(t)=>{
  let resolveA;
  const pending=new Promise(resolve=>{resolveA=resolve;});
  const stateB=seasonState({playerId:'player-b'});
  const {window,settle}=await fixture(t,{seasonResponse:async(_,authorization)=>authorization==='Bearer fixture-token'?pending:stateResponse(stateB)});
  window.localStorage.setItem('brasta-auth-access-token','player-b-token');
  window.dispatchEvent(new window.Event('brasta-auth-changed')); await settle();
  resolveA(stateResponse(seasonState({ownedRewardIds:['royal_title'],equipment:{profile_title:'royal_title'},titleSource:'season'})));
  await settle();
  assert.equal(window.BrastaCosmetics.read().profileTitle,null);
  assert.equal(window.BrastaCosmetics.titleItems().some(r=>r.unlocked),false);
});
test('late equip responses after logout do not change the guest selection',async(t)=>{
  let resolveEquip;
  const pending=new Promise(resolve=>{resolveEquip=resolve;});
  const state=seasonState({ownedRewardIds:['velvet_club']});
  const {window,settle}=await fixture(t,{seasonResponse:async(body)=>body.action==='equip'?pending:stateResponse(state)});
  const guest=window.localStorage.getItem(storageKey);
  const equip=window.BrastaCosmetics.equip('cardBack','velvet_club');
  window.localStorage.removeItem('brasta-auth-access-token');
  window.dispatchEvent(new window.Event('brasta-auth-changed')); await settle();
  resolveEquip(stateResponse({...state,equipment:{card_back:'velvet_club'}})); await equip; await settle();
  assert.equal(window.localStorage.getItem(storageKey),guest);
  assert.equal(window.BrastaCosmetics.read().cardBack,'gilded_suits');
});
test('failed saves preserve equipment and block overlapping equip requests',async(t)=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const state=seasonState({ownedRewardIds:['gilded_suits','velvet_club'],equipment:{card_back:'gilded_suits'}});
  const {window,requests}=await fixture(t,{seasonResponse:async(body)=>body.action==='equip'?pending:stateResponse(state)});
  const first=window.BrastaCosmetics.equip('cardBack','velvet_club');
  const failure=assert.rejects(first,/Save failed/);
  await assert.rejects(window.BrastaCosmetics.equip('cardBack','gilded_suits'),/still saving/);
  finish({ok:false,json:async()=>({error:'Save failed'})}); await failure;
  assert.equal(window.BrastaCosmetics.read().cardBack,'gilded_suits');
  assert.equal(requests.filter(r=>r.action==='equip').length,1);
});
test('new ownership refreshes open Titles and frame controls even when the selection is unchanged',async(t)=>{
  const state=seasonState();
  const {window,document,settle}=await fixture(t,{accountState:state});
  assert.equal(document.querySelector('.account-modal [data-badge-equip="royal_title"]'),null);
  state.ownedRewardIds=['royal_title','royal_frame'];
  window.dispatchEvent(new window.CustomEvent('brasta-season-pass-equipment-changed',{detail:state}));
  await settle();
  assert.equal(document.querySelector('.account-modal [data-badge-equip="royal_title"]').disabled,false);
  document.querySelector('[data-cosmetics-frame-open]').click();
  assert.equal(document.querySelector('[data-cosmetics-equip="royal_frame"]').disabled,false);
});
