import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Exercise the actual route with controlled auth and persistence boundaries.
function fixture({ error, identity = { userId: 'verified-player' } } = {}) {
  const calls = [];
  const exports = {};
  const source = ts.transpileModule(readFileSync('app/api/season-pass/route.ts','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, Error, console: { error() {} }, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body,options) => Response.json(body,options) } };
    if (name.endsWith('supabase-auth')) return { verifyBrastaAccessToken: async () => identity };
    if (name.endsWith('season-pass')) return {
      getSeasonPassState: async playerId => { calls.push({playerId}); if(error) throw new Error(error); return {playerId}; },
      equipSeasonPassReward: async value => { calls.push(JSON.parse(JSON.stringify(value))); if(error) throw new Error(error); return {playerId:value.playerId}; },
    };
    throw new Error(`Unexpected import ${name}`);
  }});
  const request = (body, token='test-token') => new Request('https://example.test/api/season-pass', {
    method: body === undefined ? 'GET' : 'POST', headers: token ? { Authorization:`Bearer ${token}` } : {},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
  return { ...exports, calls, request };
}

test('state/equipment use verified identity, ignore a supplied player ID, and disable caching',async()=>{
  const f=fixture();
  const state=await f.GET(f.request());
  assert.equal(state.status,200); assert.equal(state.headers.get('cache-control'),'no-store');
  const equipped=await f.POST(f.request({action:'equip',slot:'profile_title',rewardId:null,playerId:'attacker-target',xp:3000,premium:true}));
  assert.equal(equipped.status,200);
  assert.deepEqual(f.calls,[{playerId:'verified-player'},{playerId:'verified-player',slot:'profile_title',rewardId:null,seasonId:'season_1'}]);
});
test('unsigned and expired requests cannot read or equip account rewards',async()=>{
  for(const identity of [null,{userId:'verified-player'}]) {
    const f=fixture({identity}); const token=identity ? '' : 'expired';
    assert.equal((await f.GET(f.request(undefined,token))).status,401);
    assert.equal((await f.POST(f.request({action:'equip',slot:'card_back',rewardId:'gilded_suits'},token))).status,401);
    assert.equal(f.calls.length,0);
  }
});
test('malformed payloads and client XP/purchase actions are rejected without writes',async()=>{
  const f=fixture();
  for(const body of [null,[],1,'equip',{action:'award',xp:3000},{action:'purchase'},{action:{}},
    {action:'equip',slot:'admin'},{action:'equip',slot:'card_back',rewardId:123},
    {action:'equip',slot:'card_back',rewardId:'valid',seasonId:'season&select=secret'}]) {
    assert.equal((await f.POST(f.request(body))).status,400,JSON.stringify(body));
  }
  assert.equal((await f.POST(new Request('https://example.test/api/season-pass',{method:'POST',body:'{'}))).status,400);
  assert.equal(f.calls.length,0);
});
test('ownership failures are denied and internal database errors are not exposed',async()=>{
  for(const [error,status] of [['You have not unlocked that Season Pass reward',403],['That reward does not fit this equipment slot',403],['Season Pass backend is not configured',503],['password=internal-secret relation private_table missing',500]]) {
    const f=fixture({error}); const response=await f.POST(f.request({action:'equip',slot:'card_back',rewardId:'gilded_suits'}));
    assert.equal(response.status,status);
    assert.doesNotMatch(await response.text(),/password|internal-secret|private_table/);
  }
});
