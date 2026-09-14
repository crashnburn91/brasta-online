import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
function fixture(env={},allow=true) {
  const calls=[], exports={};
  const ordinary={playerId:'player',progress:{xp:0},premiumUnlocked:false,ownedRewardIds:[],equipment:{}};
  const state={...ordinary,testingAccess:true,testRewardIds:['velvet_club']};
  const source=ts.transpileModule(readFileSync('lib/season-pass.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,process:{env},require:()=>({seasonTier:()=>0}),fetch:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body),auth:options.headers.Authorization});
    const value=url.includes('_test_') ? (allow ? state : null) : ordinary;
    return {ok:true,text:async()=>JSON.stringify(value)};
  }});
  return {...exports,calls};
}
for(const env of [{},{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'beta'},{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/test'}]) {
  test('ordinary deployment ignores test access '+JSON.stringify(env),async()=>{
    const f=fixture(env);
    const state=await f.getSeasonPassState('player','season_1','token');
    await f.equipSeasonPassReward({playerId:'player',slot:'card_back',rewardId:null},'token');
    assert.equal(state.testingAccess,undefined);
    assert(f.calls.every(c=>!c.url.includes('_test_')));
  });
}
test('beta account reads and equips only separate test state',async()=>{
  const f=fixture({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'beta'});
  const state=await f.getSeasonPassState('player','season_1','token');
  assert.equal(state.testingAccess,true);assert.equal(state.progress.xp,0);assert.equal(state.premiumUnlocked,false);
  await f.equipSeasonPassReward({playerId:'player',slot:'profile_title',rewardId:null,titleSource:'earned'},'token');
  assert.equal(f.calls.length,2);assert(f.calls.every(c=>c.url.includes('_test_')&&c.auth==='Bearer token'));
  assert.equal(f.calls[1].body.p_title_source,'earned');
});
test('beta account without allowlist falls back to regular ownership',async()=>{
  const f=fixture({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'beta'},false);
  const state=await f.getSeasonPassState('player','season_1','token');
  await f.equipSeasonPassReward({playerId:'player',slot:'card_back',rewardId:null},'token');
  assert.equal(state.testingAccess,undefined);
  assert(f.calls.some(c=>c.url.endsWith('/brasta_equip_season_pass_reward_for_user')));
});
