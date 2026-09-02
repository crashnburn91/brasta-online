import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/app.ts', 'utf8');
const chat = readFileSync('public/chat-ui.js', 'utf8');
const liveStatus = readFileSync('public/live-score-ui.js', 'utf8');
const menu = readFileSync('public/match-menu.js', 'utf8');
const mobileHeader = readFileSync('public/mobile-game-header.css', 'utf8');
const server = readFileSync('lib/brasta-server.ts', 'utf8');
const bot = readFileSync('src/bot.ts', 'utf8');

assert(!/latestState\.score/.test(liveStatus), 'Live header still reads running match scores');
assert(!/scoreline[^\n]*Team A <b>/.test(app), 'Core header still renders the live Team A score');
assert(!/scoreline[^\n]*Team B <b>/.test(app), 'Core header still renders the live Team B score');

assert(chat.includes('mobile-header-chat'), 'Chat does not create a dedicated mobile header button');
assert(!chat.includes('function buildMobileMenuItem'), 'Chat is still hidden behind the mobile hamburger');
assert(chat.includes('context.chatEnabled !== false'), 'Chat UI does not hide itself for bot matches');
assert(app.includes('chatEnabled: !onlineRoom?.botMatch'), 'Game client does not derive chat availability from the authoritative bot-match flag');
assert(bot.includes('bot: true'), 'Bot connection does not identify itself to the authoritative room');
assert(server.includes('Match chat is disabled for bot matches.'), 'Realtime server does not reject bot-match chat');

assert(mobileHeader.includes('body.brasta-mobile-merged-header .friends-dock'), 'Active mobile matches still show the Friends shortcut');
assert(mobileHeader.includes('body.brasta-mobile-merged-header .tournament-dock'), 'Active mobile matches still show the Tournament shortcut');
assert(mobileHeader.includes('body.brasta-mobile-merged-header .account-dock-copy'), 'Active mobile matches do not collapse the account card to its avatar');

assert(menu.includes('Abandon Match'), 'Private-match menu is missing the abandon action');
assert(menu.includes('brasta-abandon-match'), 'Abandon confirmation does not reach the game client');
assert(server.includes("msg.type === 'ABANDON_MATCH'"), 'Realtime server does not enforce private-match abandonment');
assert(server.includes('if (rankedMeta(room))'), 'Realtime server does not protect ranked matches from private abandonment');

console.log('16 match-control, header, chat, and score-privacy regression checks passed');
