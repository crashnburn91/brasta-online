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
const badge = { key: 'founder', name: 'Founder', tier: 'standard', icon: 'B' };
const card = (name, self = false) => `<div class="player-chip player-card" data-player-profile="${name}" ${self ? 'data-you="1"' : ''}>
  <div class="player-card-top"><div class="player-card-identity"><div class="player-name-line"><b class="player-name">${name}</b></div></div></div>
</div>`;
const profile = (name) => `<section class="player-profile-modal"><div class="player-profile-head"><div class="player-profile-avatar"><span class="brasta-avatar-portrait">${name[0]}</span></div><div class="player-profile-identity"><h2 id="player-profile-title">${name}</h2></div></div><div class="ppg-tabs"></div></section>`;

async function fixture(t, { accountPhoto = '', avatarResponse, saved } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <button class="account-dock" data-brasta-username="Tester"><span class="brasta-avatar-shell">${accountPhoto ? `<img class="brasta-avatar-portrait" src="${accountPhoto}">` : '<span class="account-avatar-fallback brasta-avatar-portrait">T</span>'}</span></button>
    <div class="players">${card('Tester', true)}${card('Opponent')}</div>
    <section class="account-modal"><div class="account-profile-head"><span class="brasta-avatar-shell"><span class="account-profile-avatar brasta-avatar-portrait">T</span></span><div><h2>Tester</h2></div></div><div class="ppg-tabs"></div></section>
    ${profile('Tester')}${profile('Opponent')}
  </body></html>`, { url: 'https://beta.brasta.app/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  const { document } = window;
  // Let JSDOM deliver DOMContentLoaded before starting the actual client scripts.
  await new Promise(setImmediate);
  const frames = [];
  window.requestAnimationFrame = (callback) => frames.push(callback);
  const requests = [];
  window.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, ...body });
    if (url === '/api/player-avatar') {
      const result = avatarResponse ? await avatarResponse(body.username) : { avatarUrl: null };
      return { ok: true, json: async () => result };
    }
    return { ok: true, json: async () => ({ equipped: badge, isSelf: body.username === 'Tester', badges: { equipped: badge, items: [] } }) };
  };
  for (const file of ['player-cards.css', 'player-card-avatars.css', 'player-card-identity.css', 'cosmetics.css']) {
    const style = document.createElement('style');
    style.textContent = readFileSync(`public/${file}`, 'utf8');
    document.head.appendChild(style);
  }
  if (saved) window.localStorage.setItem(storageKey, JSON.stringify(saved));
  for (const file of ['profile-badges.js', 'player-card-avatars.js', 'cosmetics.js']) window.eval(readFileSync(`public/${file}`, 'utf8'));
  async function settle() {
    for (let round = 0; round < 20; round++) {
      await new Promise(setImmediate);
      if (!frames.length) return;
      for (const callback of frames.splice(0)) callback();
    }
    assert.fail('Cosmetics and avatar observers did not settle; the UI is still rewriting itself.');
  }
  async function select(slot, value) {
    const input = document.querySelector(`[data-cosmetics-slot="${slot}"]`);
    input.value = value;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  }
  await settle();
  return { window, document, requests, settle, select };
}

test('each title equips its badge, preserves usernames, and clearing restores the earned badge', async (t) => {
  const { document, window, requests, select, settle } = await fixture(t);
  const own = document.querySelector(ownSelector);
  for (const { id } of SEASON_REWARDS.filter((reward) => reward.kind === 'Profile title')) {
    await select('profileTitle', id);
    assert.equal(own.querySelector('.beta-cosmetic-badge-art').getAttribute('src'), `/cosmetics/season-1/${id}.svg?v=2`);
    assert.equal(own.querySelectorAll('[data-beta-cosmetic-title]').length, 1);
    assert.equal(document.querySelector('.account-profile-head h2').textContent, 'Tester');
    assert.equal(document.querySelector('.player-profile-identity h2').textContent, 'Tester');
    assert.equal(document.querySelector('.player-card:not([data-you]) [data-beta-cosmetic-title]'), null);
    assert.equal(document.querySelectorAll('.player-profile-head[data-beta-cosmetic-self]').length, 1);
    assert.equal(window.getComputedStyle(own.querySelector('[data-player-card-profile-badge]')).display, 'none');
  }
  assert(requests.filter((request) => request.action === 'collection').every((request) => ['Tester', 'Opponent'].includes(request.username)));
  document.querySelector('[data-cosmetics-clear]').click();
  await settle();
  assert.equal(document.querySelector('[data-beta-cosmetic-title]'), null);
  assert.notEqual(window.getComputedStyle(own.querySelector('[data-player-card-profile-badge]')).display, 'none');
});

test('the former Velvet Conservatory slots now equip the Royal Crown artwork', async (t) => {
  const { document, select } = await fixture(t);
  const cardBack = document.querySelector('[data-cosmetics-slot="cardBack"]');
  const tableFelt = document.querySelector('[data-cosmetics-slot="tableFelt"]');
  assert.equal([...cardBack.options].find((option) => option.value === 'velvet_club')?.textContent, 'Royal Crown');
  assert.equal([...tableFelt.options].find((option) => option.value === 'woven_green')?.textContent, 'Royal Crown Felt');
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

test('every catalog set equips exactly four matching rewards and preserves the photo', async (t) => {
  const { document, window, settle, select } = await fixture(t, { accountPhoto: 'https://example.test/provider-photo.jpg' });
  assert.equal(SEASON_REWARDS.length, 20);
  assert.equal(new Set(SEASON_REWARDS.map((reward) => reward.id)).size, 20);
  assert.deepEqual(readdirSync('public/cosmetics/season-1').filter((file) => file.endsWith('.svg')).sort(), SEASON_REWARDS.map((reward) => `${reward.id}.svg`).sort());
  for (const [slot, kind] of Object.entries(slotKinds)) {
    const options = [...document.querySelector(`[data-cosmetics-slot="${slot}"]`).options].filter((option) => option.value);
    const rewards = SEASON_REWARDS.filter((reward) => reward.kind === kind);
    assert.deepEqual(options.map((option) => [option.value, option.textContent]).sort(), rewards.map((reward) => [reward.id, reward.name]).sort());
  }
  const photo = document.querySelector(`${ownSelector} .player-card-avatar img`);
  const setSelect = document.querySelector('[data-cosmetics-set]');
  assert.deepEqual([...setSelect.options].filter((option) => option.value).map((option) => [option.value, option.textContent]), Object.entries(SEASON_SETS).map(([id, set]) => [id, set.name]));
  for (const [setId, set] of Object.entries(SEASON_SETS)) {
    const rewards = SEASON_REWARDS.filter((reward) => reward.setId === setId);
    assert.deepEqual(rewards.map((reward) => reward.kind).sort(), Object.values(slotKinds).sort(), `${set.name} needs one reward of each kind`);
    const expected = Object.fromEntries(Object.entries(slotKinds).map(([slot, kind]) => [slot, rewards.find((reward) => reward.kind === kind).id]));
    assert.equal(rewards.find((reward) => reward.kind === 'Table felt').matchingCardBackId, expected.cardBack);
    setSelect.value = setId;
    setSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    document.querySelector('[data-cosmetics-equip-set]').click();
    await settle();
    assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)), expected);
    for (const [slot, id] of Object.entries(expected)) {
      assert.equal(document.documentElement.getAttribute('data-brasta-' + slot.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())), id);
      assert.equal(document.querySelector(`[data-cosmetics-slot="${slot}"]`).value, id);
    }
    assert.equal(document.querySelector(`${ownSelector} .player-card-avatar img`), photo);
    assert.equal(document.querySelector(`${ownSelector} .beta-cosmetic-title-copy`).textContent, set.name);
    assert.equal(setSelect.value, setId);
  }
  await select('avatarFrame', 'gilded_frame');
  assert.equal(setSelect.value, '', 'Mixed sets should not be labelled as a complete matching set');
});

test('retired badges and face choices are removed from saved equipment without clearing valid choices', async (t) => {
  for (const id of ['golden_guest', 'four_suits', 'season_regular', 'season_keepsake']) {
    const { document, window } = await fixture(t, { saved: { cardBack: 'velvet_club', tableFelt: 'woven_green', profileTitle: id, avatarFrame: 'laurel', cardFaces: 'ivory_faces' } });
    assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)), { cardBack: 'velvet_club', tableFelt: 'woven_green', profileTitle: null, avatarFrame: 'laurel' });
    assert.equal(document.querySelector('[data-beta-cosmetic-title]'), null);
    assert.equal(document.querySelector('[data-cosmetics-slot="profileTitle"]').value, '');
  }
});
