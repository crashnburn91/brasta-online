import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sent = [];

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

console.log('2 account-network socket isolation regression checks passed');
