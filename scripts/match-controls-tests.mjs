import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/app.ts', 'utf8');
const chat = readFileSync('public/chat-ui.js', 'utf8');
const liveStatus = readFileSync('public/live-score-ui.js', 'utf8');
const menu = readFileSync('public/match-menu.js', 'utf8');
const mobileHeader = readFileSync('public/mobile-game-header.css', 'utf8');
const server = readFileSync('lib/brasta-server.ts', 'utf8');
const bot = readFileSync('src/bot.ts', 'utf8');
const layout = readFileSync('app/layout.tsx', 'utf8');
const specialMoves = readFileSync('public/brasta-special-moves.js', 'utf8');
const specialMoveStyles = readFileSync('app/special-move-effects.css', 'utf8');
const lobbyPolish = readFileSync('public/lobby-polish.js', 'utf8');

assert(/latestState\.score/.test(liveStatus), 'Live header no longer renders the completed-round match score');
assert(liveStatus.includes('match-score-live'), 'Live header is missing the match-score group');
assert(!liveStatus.includes('round-score-live'), 'Live header still renders the current-round running score');
assert(!/scoreline[^\n]*Team A <b>/.test(app), 'Core header still renders the live Team A score');
assert(!/scoreline[^\n]*Team B <b>/.test(app), 'Core header still renders the live Team B score');
assert(app.includes('data-event-text="${escapeAttr(text)}"'), 'Event banners do not preserve stable authoritative text for sound/effect deduplication');

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

assert(layout.includes("import './special-move-effects.css'"), 'Brasta effect styles are not bundled by the root layout');
assert(layout.includes('/brasta-special-moves.js?v=0.1.0'), 'Brasta effect controller is not loaded by the root layout');
assert(specialMoves.includes("name: 'brasta'"), 'Special-move registry is missing the Brasta renderer');
assert(specialMoves.includes("banner.dataset.brastaEffectKind = 'brasta'"), 'Brasta banners are not protected from duplicate decoration');
assert(specialMoves.includes('navigator.vibrate(42)'), 'Brasta crest impact is missing its supported-device haptic');
assert(specialMoveStyles.includes('@media(prefers-reduced-motion:reduce)'), 'Brasta effect is missing its reduced-motion presentation');
assert(lobbyPolish.includes('playBrastaRush(delay)'), 'Brasta audio is missing the card-rush layer');
assert(lobbyPolish.includes('playBrastaImpact(delay + 0.39)'), 'Brasta audio is missing the crest-impact layer');

console.log('Match-control, header, chat, score-display, and special-move regression checks passed');
