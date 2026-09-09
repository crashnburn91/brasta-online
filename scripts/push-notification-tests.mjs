import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync('lib/brasta-server.ts', 'utf8');
const friendsRoute = readFileSync('app/api/friends/route.ts', 'utf8');
const pushRoute = readFileSync('app/api/push/route.ts', 'utf8');
const push = readFileSync('lib/push-notifications.ts', 'utf8');
const ranked1v1 = readFileSync('lib/ranked-matchmaking.ts', 'utf8');
const ranked2v2 = readFileSync('lib/ranked-matchmaking-2v2.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260906075022_android_push_subscriptions.sql', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

assert.equal(packageJson.dependencies['firebase-admin'], '14.3.0', 'Firebase Admin must remain pinned');
assert(push.includes('sendEachForMulticast'), 'Push delivery no longer uses FCM multicast');
assert(push.includes("createHash('sha256')"), 'Device revocation secrets are not hashed');
assert(push.includes("[brasta push] Delivery skipped."), 'Missing push configuration is not diagnosed');
assert(push.includes("[brasta push] Delivery result."), 'FCM delivery outcomes are not diagnosed');
assert(push.includes('errorCodes'), 'Privacy-safe FCM error codes are not retained');
assert(pushRoute.includes("body.action === 'register'"), 'Push API cannot register a device');
assert(pushRoute.includes("body.action === 'unregister'"), 'Push API cannot revoke a device');
assert(pushRoute.includes('verifyBrastaAccessToken'), 'Push registration is not tied to a verified account');
assert(friendsRoute.includes('sendGameInvitePush'), 'Private and ranked invites do not trigger push');
assert(server.includes('notifyTurnTransition(changed.room, previousTurn)'), 'Private matches do not trigger turn push');
assert(ranked1v1.includes('sendRankedMatchPush'), 'Ranked 1v1 assignment does not trigger push');
assert(ranked1v1.includes('sendTurnPush'), 'Ranked 1v1 opening turns do not trigger push');
assert(ranked2v2.includes('sendRankedMatchPush'), 'Ranked 2v2 assignment does not trigger push');
assert(ranked2v2.includes('sendTurnPush'), 'Ranked 2v2 opening turns do not trigger push');
assert(migration.includes('enable row level security'), 'Push subscription storage is missing RLS');
assert(migration.includes('from public, anon, authenticated'), 'Browser roles can still access device tokens');

console.log('Push notification backend checks passed.');
