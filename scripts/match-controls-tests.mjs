import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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
const tutorial = readFileSync('public/tutorial.js', 'utf8');

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
assert(menu.includes("const MOTION_STORAGE_KEY = 'brasta-special-motion'"), 'Match menu does not persist the special-move motion preference');
assert(menu.includes("motionButton.setAttribute('role', 'menuitemcheckbox')"), 'Reduced Motion is not exposed as an accessible menu toggle');
assert(menu.includes('document.documentElement.dataset.brastaMotion = next'), 'Motion preference does not reach the special-move presentation layer');
assert(server.includes("msg.type === 'ABANDON_MATCH'"), 'Realtime server does not enforce private-match abandonment');
assert(server.includes('if (rankedMeta(room))'), 'Realtime server does not protect ranked matches from private abandonment');

assert(layout.includes("import './special-move-effects.css'"), 'Brasta effect styles are not bundled by the root layout');
assert(layout.includes('/brasta-special-moves.js?v=0.8.0'), 'Special-move effect controller is not cache-busted for the Brasta combination update');
assert(layout.includes('/match-menu.js?v=0.13.0'), 'Motion preference control is not cache-busted by the root layout');
assert(layout.includes('/lobby-polish.js?v=13'), 'Special-move sound update is not cache-busted by the root layout');
assert(layout.includes('/tutorial.js?v=0.6.0'), 'Special-card tutorial steps are not cache-busted by the root layout');
assert(specialMoves.includes("name: 'brasta'"), 'Special-move registry is missing the Brasta renderer');
assert(specialMoves.includes("name: 'big2'"), 'Special-move registry is missing the Big 2 renderer');
assert(specialMoves.includes("name: 'big10'"), 'Special-move registry is missing the Big 10 renderer');
assert(specialMoves.includes("name: 'power-pair'"), 'Special-move registry is missing the fused Big 2 + Big 10 renderer');
assert(specialMoves.includes("name: 'burned-jack'"), 'Special-move registry is missing the Burned Jack renderer');
assert(specialMoves.includes("name: 'jack-sweep'"), 'Special-move registry is missing the Jack Sweep renderer');
assert(specialMoves.includes("!/\\bBRASTA!/i.test(text)"), 'Standalone Big 10 renderer can incorrectly replace the Brasta combination effect');
assert(specialMoves.includes("banner.dataset.brastaEffectKind = 'brasta'"), 'Brasta banners are not protected from duplicate decoration');
assert(specialMoves.includes("banner.dataset.brastaEffectKind = 'big2'"), 'Big 2 banners are not protected from duplicate decoration');
assert(specialMoves.includes("banner.dataset.brastaEffectKind = 'big10'"), 'Big 10 banners are not protected from duplicate decoration');
assert(specialMoves.includes("banner.dataset.brastaEffectKind = 'power-pair'"), 'Power Pair banners are not protected from duplicate decoration');
assert(specialMoves.includes("banner.dataset.brastaEffectKind = 'burned-jack'"), 'Burned Jack banners are not protected from duplicate decoration');
assert(specialMoves.includes("banner.dataset.brastaEffectKind = 'jack-sweep'"), 'Jack Sweep banners are not protected from duplicate decoration');
assert(specialMoves.includes("layer.className = 'event brasta-crest-event brasta-effect-layer'"), 'Brasta animation is still coupled to the replaceable game render tree');
assert(specialMoves.includes("layer.className = 'event big2-crush-event brasta-effect-layer'"), 'Big 2 animation is still coupled to the replaceable game render tree');
assert(specialMoves.includes("layer.className = 'event big10-strike-event brasta-effect-layer'"), 'Big 10 animation is still coupled to the replaceable game render tree');
assert(specialMoves.includes("layer.className = 'event power-pair-event brasta-effect-layer'"), 'Power Pair animation is still coupled to the replaceable game render tree');
assert(specialMoves.includes("layer.className = 'event burned-jack-event brasta-effect-layer'"), 'Burned Jack animation is still coupled to the replaceable game render tree');
assert(specialMoves.includes("layer.className = 'event jack-sweep-event brasta-effect-layer'"), 'Jack Sweep animation is still coupled to the replaceable game render tree');
assert(specialMoves.includes('const jackSweepSnapshots = new Map()'), 'Jack Sweep does not retain board snapshots across rerenders');
assert(specialMoves.includes('sweepGeometry(snapshot, count)'), 'Jack Sweep does not derive its path from captured card geometry');
assert(specialMoves.includes('event?.detail'), 'Jack Sweep does not accept a pre-render snapshot event');
assert(specialMoves.includes('captureJackSweep: rememberJackSweepSnapshot'), 'Jack Sweep snapshot capture is not exposed to the game client');
assert(specialMoves.includes('const renderedKinds = new Set'), 'Special-move effects still allow only one renderer per event');
assert(specialMoves.includes('function brastaComboKind(bonuses)'), 'Brasta combo planner is missing');
assert(specialMoves.includes('function brastaComboMarkup(kind, actor, totalPoints, rawText)'), 'Brasta combo scene markup is missing');
assert(specialMoves.includes('layer.dataset.brastaCombo = comboKind'), 'Brasta combo metadata is missing from the presentation layer');
assert(specialMoves.includes('brastaComboKindForEvent,'), 'Brasta combo planner is not exposed for regression checks');
assert(specialMoves.includes('document.body.append(next.layer)'), 'Brasta animation does not mount in the persistent presentation layer');
assert(specialMoves.includes('effectQueue.push({ key, layer })'), 'Special-move effects cannot queue without interrupting one another');
assert(specialMoves.includes('big2: [36, 45, 68]'), 'Big 2 Club Crush is missing its double-impact haptic');
assert(specialMoves.includes("'power-pair': [36, 32, 56, 28, 24]"), 'Power Pair is missing its fused haptic');
assert(specialMoves.includes("'burned-jack': [22, 34, 76]"), 'Burned Jack is missing its impact haptic');
assert(specialMoves.includes("'jack-sweep': [16, 26, 58]"), 'Jack Sweep is missing its pickup haptic');
assert(specialMoves.includes('showMs: BIG2_SHOW_MS'), 'Big 2 effect does not use its shorter presentation window');
assert(specialMoves.includes('showMs: BIG10_SHOW_MS'), 'Big 10 effect does not use its shorter presentation window');
assert(specialMoves.includes('showMs: POWER_PAIR_SHOW_MS'), 'Power Pair effect does not use its combined presentation window');
assert(specialMoves.includes('showMs: BURNED_JACK_SHOW_MS'), 'Burned Jack effect does not use its penalty presentation window');
assert(specialMoves.includes('showMs: hasReward ? JACK_SWEEP_COMBO_SHOW_MS : JACK_SWEEP_SHOW_MS'), 'Jack Sweep effect does not use its compact presentation windows');
assert(specialMoves.includes('JACK_SWEEP_COMBO_SHOW_MS'), 'Jack Sweep combo does not use its shorter handoff window');
assert(app.includes('queueJackSweepSnapshot(state, result.state)'), 'Local Jack Sweep does not capture cards before the state swap');
assert(app.includes('queueJackSweepSnapshot(state, nextState)'), 'Online Jack Sweep does not capture cards before the state swap');
assert(app.includes('data-card-id="${escapeAttr(id)}"'), 'Board cards do not expose stable ids for animation snapshots');
assert(app.includes('data-event-key="${escapeAttr(eventIdentityFor(state))}"'), 'Event banners do not expose their transition key to the effect queue');
assert(specialMoveStyles.includes('--jack-sweep-frame-left'), 'Jack Sweep does not expose compact frame positioning variables');
const jackSweepStyles = specialMoveStyles.slice(specialMoveStyles.indexOf('.event.jack-sweep-event{'), specialMoveStyles.indexOf('/* Burned Jack'));
assert(!jackSweepStyles.includes('inset:0!important'), 'Jack Sweep still uses a full-viewport presentation layer');
assert(!jackSweepStyles.includes('width:100vw!important'), 'Jack Sweep still stretches to the viewport width');
assert(!jackSweepStyles.includes('height:100vh!important'), 'Jack Sweep still stretches to the viewport height');
assert(jackSweepStyles.includes('overflow:visible'), 'Jack Sweep compact frame clips the sweep path');
assert(specialMoveStyles.includes('--sweep-left'), 'Jack Sweep does not position cards from captured viewport coordinates');
assert(specialMoveStyles.includes('--jack-start-x'), 'Jack Sweep does not position the Jack from captured viewport coordinates');
assert(specialMoveStyles.includes('.jack-sweep-combo'), 'Jack Sweep combo handoff styling is missing');
assert(!specialMoveStyles.includes('--jack-sweep-left'), 'Jack Sweep still depends on a captured table rectangle');
assert(specialMoveStyles.includes('position:fixed!important'), 'Brasta crest is not anchored to the viewport takeover layer');
assert(specialMoveStyles.includes('height:100dvh!important'), 'Brasta crest does not cover the dynamic viewport');
assert(specialMoveStyles.includes('pointer-events:none'), 'Brasta crest blocks the next player from taking their turn');
assert(specialMoveStyles.includes('.event.big10-strike-event'), 'Big 10 Diamond Strike styling is missing');
assert(specialMoveStyles.includes('@keyframes big10-prize-card-slam'), 'Big 10 prize-card impact animation is missing');
assert(specialMoveStyles.includes('.event.big2-crush-event'), 'Big 2 Club Crush styling is missing');
assert(specialMoveStyles.includes('@keyframes big2-prize-card-drop'), 'Big 2 card-drop impact animation is missing');
assert(specialMoveStyles.includes('.event.power-pair-event'), 'Big 2 + Big 10 Power Pair styling is missing');
assert(specialMoveStyles.includes('@keyframes power-pair-card-diamond'), 'Power Pair diamond-cut animation is missing');
assert(specialMoveStyles.includes('.brasta-combo-stamp'), 'Brasta combo identity stamp styling is missing');
assert(specialMoveStyles.includes('.brasta-combo-big2'), 'Brasta + Big 2 styling is missing');
assert(specialMoveStyles.includes('.brasta-combo-big10'), 'Brasta + Big 10 styling is missing');
assert(specialMoveStyles.includes('.brasta-combo-power-pair'), 'Brasta + Power Pair styling is missing');
assert(specialMoveStyles.includes('.event.burned-jack-event'), 'Burned Jack Brand the Jack styling is missing');
assert(specialMoveStyles.includes('@keyframes burned-jack-brand-slam'), 'Burned Jack branding impact animation is missing');
assert(specialMoveStyles.includes('.event.jack-sweep-event'), 'Jack Sweep table-local styling is missing');
assert(specialMoveStyles.includes('@keyframes jack-sweep-jack-run'), 'Jack Sweep card run animation is missing');
assert(specialMoveStyles.includes('--jack-sweep-y:50%'), 'Jack Sweep is missing its path positioning variables');
assert(specialMoveStyles.includes(':root[data-brasta-motion="reduced"]'), 'Brasta effect is missing its explicit reduced-motion presentation');
assert(!specialMoveStyles.includes('@media(prefers-reduced-motion:reduce)'), 'System reduced-motion still forces special moves directly to their final frame');
assert(specialMoves.includes("dataset.brastaMotion === 'reduced'"), 'Special-move haptics do not honor the explicit Brasta motion preference');
assert(lobbyPolish.includes('playBrastaRush(delay)'), 'Brasta audio is missing the card-rush layer');
assert(lobbyPolish.includes('playBrastaImpact(delay + 0.39)'), 'Brasta audio is missing the crest-impact layer');
assert(lobbyPolish.includes('playBrastaMetallicStrike(delay + 0.43)'), 'Big 10 audio is missing its crystal-strike layer');
assert(lobbyPolish.includes('playClubDoubleImpact(delay)'), 'Big 2 audio is missing its double bass impact');
assert(lobbyPolish.includes('playCardSnap(delay + 0.33)'), 'Big 2 audio is missing its card-snap layer');
assert(lobbyPolish.includes('playPowerPairSound'), 'Big 2 + Big 10 audio is not fused into one sequence');
assert(lobbyPolish.includes('playBurnedJackSound'), 'Burned Jack audio sequence is missing');
assert(lobbyPolish.includes('playBurnWhoosh(delay + 0.2)'), 'Burned Jack audio is missing its flame-whoosh layer');
assert(tutorial.includes("title: 'Capture the Big 2'"), 'Tutorial is missing the interactive standalone Big 2 step');
assert(tutorial.includes("title: 'Capture the Big 10'"), 'Tutorial is missing the interactive standalone Big 10 step');
assert(tutorial.includes("title: 'Capture Both Prizes'"), 'Tutorial is missing the interactive Power Pair step');
assert(tutorial.includes("scenario: 'big2'"), 'Big 2 tutorial step does not load its standalone scenario');
assert(tutorial.includes("scenario: 'big10'"), 'Big 10 tutorial step does not load its standalone scenario');
assert(tutorial.includes("scenario: 'big2big10'"), 'Power Pair tutorial step does not load its combined scenario');

function motionPreferenceSandbox(savedPreference = null) {
  const documentElement = { dataset: {} };
  const sandbox = {
    window: { dispatchEvent() {} },
    document: { documentElement, readyState: 'loading', addEventListener() {} },
    localStorage: {
      getItem(key) { return key === 'brasta-special-motion' ? savedPreference : null; },
      setItem() {},
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
  };
  runInNewContext(menu, sandbox);
  return documentElement.dataset.brastaMotion;
}

assert.equal(motionPreferenceSandbox(), 'full', 'Special moves do not default to full motion');
assert.equal(motionPreferenceSandbox('reduced'), 'reduced', 'Saved Reduced Motion preference is not restored');

const specialMoveSandbox = {
  window: {},
  document: { readyState: 'loading', addEventListener() {} },
};
runInNewContext(specialMoves, specialMoveSandbox);
const pointsForEvent = specialMoveSandbox.window.BrastaSpecialMoves?.pointsForEvent;
assert.equal(typeof pointsForEvent, 'function', 'Brasta point-total helper is unavailable');
const effectKindsForEvent = specialMoveSandbox.window.BrastaSpecialMoves?.effectKindsForEvent;
assert.equal(typeof effectKindsForEvent, 'function', 'Special-move effect planner is unavailable');
const brastaComboKindForEvent = specialMoveSandbox.window.BrastaSpecialMoves?.brastaComboKindForEvent;
assert.equal(typeof brastaComboKindForEvent, 'function', 'Brasta combo planner is unavailable');
assert.equal(JSON.stringify(effectKindsForEvent('Jack sweep — Alex • BIG 10! Team A')), JSON.stringify(['jack-sweep', 'big10']), 'Jack + Big 10 does not queue both effects');
assert.equal(JSON.stringify(effectKindsForEvent('Jack sweep — Alex • BIG 2! Team A')), JSON.stringify(['jack-sweep', 'big2']), 'Jack + Big 2 does not queue both effects');
assert.equal(JSON.stringify(effectKindsForEvent('Jack sweep — Alex • BIG 2 + BIG 10! Team A')), JSON.stringify(['jack-sweep', 'power-pair']), 'Jack + Power Pair does not queue the fused reward effect');
assert.equal(pointsForEvent('BRASTA! Team A +10'), 10, 'A standalone Brasta does not show +10');
assert.equal(pointsForEvent('BIG 2! Team A'), 10, 'A standalone Big 2 does not show +10');
assert.equal(pointsForEvent('BIG 10! Team A'), 10, 'A standalone Big 10 does not show +10');
assert.equal(pointsForEvent('BIG 2 + BIG 10! Team A'), 20, 'A standalone Power Pair does not show +20');
assert.equal(pointsForEvent('BRASTA! Team A +10 • BIG 2! Team A'), 20, 'Brasta + Big 2 does not show +20');
assert.equal(pointsForEvent('BRASTA! Team A +10 • BIG 10! Team A'), 20, 'Brasta + Big 10 does not show +20');
assert.equal(pointsForEvent('BRASTA! Team A +10 • LAST PICKUP! Team A +10'), 20, 'Brasta + Last Pickup does not show +20');
assert.equal(pointsForEvent('BRASTA! Team A +10 • BIG 2 + BIG 10! Team A • LAST PICKUP! Team A +10'), 40, 'The full Brasta combination does not show +40');
assert.equal(brastaComboKindForEvent('BRASTA! Team A +10 • BIG 2! Team A'), 'big2', 'Brasta + Big 2 does not use Club Crush');
assert.equal(brastaComboKindForEvent('BRASTA! Team A +10 • BIG 10! Team A'), 'big10', 'Brasta + Big 10 does not use Diamond Strike');
assert.equal(brastaComboKindForEvent('BRASTA! Team A +10 • BIG 2 + BIG 10! Team A'), 'power-pair', 'Brasta + Big 2 + Big 10 does not use Power Pair');
assert.equal(brastaComboKindForEvent('BRASTA! Team A +10 • LAST PICKUP! Team A +10'), '', 'Brasta + Last Pickup should keep the crest scene');

console.log('Match-control, header, chat, score-display, and special-move regression checks passed');
