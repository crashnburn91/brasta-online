import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sent = [];
const accountBridge = readFileSync('app/AccountBridge.tsx', 'utf8');

class FakeWebSocket {
  constructor(url) {
    this.url = url;
  }

  send(data) {
    sent.push(JSON.parse(String(data)));
  }
}

const window = { WebSocket: FakeWebSocket };
const context = {
  WebSocket: FakeWebSocket,
  window,
  location: { href: 'https://beta.brasta.app/' },
  localStorage: {
    getItem(key) {
      return key === 'brasta-auth-access-token' ? 'signed-in-player-token' : null;
    },
  },
  URL,
};

vm.runInNewContext(readFileSync('public/account-network.js', 'utf8'), context);

const primary = new FakeWebSocket('wss://beta.brasta.app/api/ws');
window.__BRASTA_PRIMARY_GAME_SOCKET__ = primary;
primary.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'ABC123', name: 'SignedPlayer' }));

const bot = new FakeWebSocket('wss://beta.brasta.app/api/ws');
bot.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'ABC123', name: 'Brasta Bot' }));

assert.equal(sent[0].accessToken, 'signed-in-player-token', 'Primary player socket did not receive the account token');
assert.equal(sent[1].accessToken, undefined, 'Bot socket inherited the signed-in player token');
assert.equal(sent[1].name, 'Brasta Bot', 'Bot identity changed while sending its join request');
assert(accountBridge.includes('usernameDraftUserId.current !== nextSession.user.id'), 'Username draft is not scoped to the signed-in user');
assert(accountBridge.includes('if (nextProfile?.username) setUsername(nextProfile.username)'), 'Missing profile refreshes can overwrite the username draft');
assert(!accountBridge.includes("setUsername(nextProfile?.username || '')"), 'Profile refresh still clears an in-progress username draft');
assert(!accountBridge.includes('<input autoFocus'), 'Username signup still forces the mobile keyboard open during auth refresh');
assert(accountBridge.includes('onChange={(event) => setUsername(event.target.value)}'), 'Username input still rewrites text during mobile keyboard composition');
assert(!accountBridge.includes('disabled={busy || profileLoading}'), 'Username submit button still flickers with background profile loading');
assert(accountBridge.includes('disabled={busy || profileResolvedUserId !== user.id}'), 'Username submit button is not gated by the initial user profile lookup');

console.log('9 account and username-draft regression checks passed');
