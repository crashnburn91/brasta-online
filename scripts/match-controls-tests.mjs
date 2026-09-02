import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/app.ts', 'utf8');
const chat = readFileSync('public/chat-ui.js', 'utf8');
const liveStatus = readFileSync('public/live-score-ui.js', 'utf8');
const menu = readFileSync('public/match-menu.js', 'utf8');
const server = readFileSync('lib/brasta-server.ts', 'utf8');

assert(!/latestState\.score/.test(liveStatus), 'Live header still reads running match scores');
assert(!/scoreline[^\n]*Team A <b>/.test(app), 'Core header still renders the live Team A score');
assert(!/scoreline[^\n]*Team B <b>/.test(app), 'Core header still renders the live Team B score');

assert(chat.includes('mobile-header-chat'), 'Chat does not create a dedicated mobile header button');
assert(!chat.includes('function buildMobileMenuItem'), 'Chat is still hidden behind the mobile hamburger');

assert(menu.includes('Abandon Match'), 'Private-match menu is missing the abandon action');
assert(menu.includes('brasta-abandon-match'), 'Abandon confirmation does not reach the game client');
assert(server.includes("msg.type === 'ABANDON_MATCH'"), 'Realtime server does not enforce private-match abandonment');
assert(server.includes('if (rankedMeta(room))'), 'Realtime server does not protect ranked matches from private abandonment');

console.log('9 match-control and score-privacy regression checks passed');
