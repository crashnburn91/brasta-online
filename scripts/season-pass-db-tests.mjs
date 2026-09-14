import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Run the shipped PL/pgSQL and recorder against an isolated Postgres engine.
// No real accounts, matches, XP, or entitlements are changed by this suite.
const db = new PGlite();
const players = Array.from({ length: 4 }, () => randomUUID());
const migration = name => readFileSync(`supabase/migrations/${name}`, 'utf8');
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0];

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    create table public.profiles(id uuid primary key, username text);
    create table public.ranked_matches(id uuid primary key);
    grant usage on schema public,private to service_role;
    grant select on public.profiles to service_role;`);
  for (const file of ['20260904033000_match_history_stats_achievements.sql',
    '20260904045500_consecutive_brasta_achievements.sql', '20260904054500_opponent_jack_burn_achievements.sql',
    '20260905010000_profile_badges.sql']) {
    // Profile report functions are unrelated and depend on the rank schema.
    await db.exec(migration(file).split('create or replace function public.brasta_player_progression(')[0]);
  }
  for (const file of readdirSync('supabase/migrations').filter(name => name.includes('season_pass')).sort()) {
    await db.exec(migration(file));
  }
  for (let i = 0; i < players.length; i++) await query('insert into profiles values ($1,$2)', [players[i], `Fixture${i}`]);
});
after(() => db.close());
beforeEach(() => db.exec('begin'));
afterEach(() => db.exec('rollback'));

async function signInAs(playerId) {
  await query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: 'authenticated', sub: playerId })]);
  await db.exec('set local role authenticated');
}

test('authenticated JSON JWT claims load the collection and equip only owned rewards', async () => {
  await activate();
  for (let i = 0; i < 5; i++) await record();
  await signInAs(players[0]);
  const state = await scalar("select brasta_get_season_pass_state($1,'season_1')", [players[0]]);
  assert.equal(state.playerId, players[0]);
  assert.deepEqual(state.ownedRewardIds.sort(), ['first_seat', 'gilded_suits']);
  await query("select brasta_equip_season_pass_reward_for_user($1,'season_1','card_back','gilded_suits')", [players[0]]);
  const equipped = await scalar("select brasta_get_season_pass_state($1,'season_1')", [players[0]]);
  assert.equal(equipped.equipment.card_back, 'gilded_suits');
  await query("select brasta_equip_season_pass_reward_for_user($1,'season_1','card_back',null)", [players[0]]);
  const classic = await scalar("select brasta_get_season_pass_state($1,'season_1')", [players[0]]);
  assert.equal(classic.equipment.card_back, null);
});

for (const action of ['read', 'equip']) {
  for (const identity of ['another account', 'missing identity']) {
    test(`${action} denies ${identity} with authenticated JWT claims`, async () => {
      await signInAs(identity === 'missing identity' ? undefined : players[1]);
      const sql = action === 'read' ? "select brasta_get_season_pass_state($1,'season_1')"
        : "select brasta_equip_season_pass_reward_for_user($1,'season_1','card_back',null)";
      await assert.rejects(query(sql, [players[0]]), /Not authorized/);
    });
  }
}

test('authenticated equip still denies an unearned Premium reward', async () => {
  await signInAs(players[0]);
  await assert.rejects(query("select brasta_equip_season_pass_reward_for_user($1,'season_1','card_back','velvet_club')", [players[0]]), /not unlocked/);
});

async function activate() {
  await db.exec("update season_pass_seasons set status='active', starts_at=now()-interval '1 day', ends_at=now()+interval '55 days' where season_id='season_1'");
}
async function record(options = {}) {
  const key = options.key || `fixture:${randomUUID()}`;
  const mode = options.mode || '1v1';
  const seats = mode === '2v2' ? 4 : 2;
  const roster = Array.from({length:seats}, (_, i) => ({
    player_id: options.guest && i === 1 ? null : options.duplicate ? players[0] : players[i],
    seat: i+1, team: i%2 ? 'B':'A', username: `Fixture${i}`, result: i%2 ? 'loss':'win',
  }));
  const timestamps = await query("select now()-interval '10 minutes' as started,now()-interval '1 minute' as completed");
  const id = await scalar(`select brasta_record_completed_match($1,null,'TEST00',$2,$3,110,$4,$5,40,3,$6,$7,$8,$9::jsonb,'[]'::jsonb)`,
    [key,mode,options.type||'private',options.winner||'A',options.score??115,
      options.started || timestamps[0].started, options.completed || timestamps[0].completed,
      options.reason||'completed',JSON.stringify(roster)]);
  await db.exec('set constraints all immediate; set constraints all deferred');
  return id;
}
const xp = (i=0) => scalar("select coalesce((select xp from season_pass_progress where player_id=$1 and season_id='season_1'),0)", [players[i]]);
const owned = (i=0) => query('select reward_id from season_pass_reward_ownership where player_id=$1 order by reward_id',[players[i]]).then(rows=>rows.map(r=>r.reward_id));
async function entitlement(status='active') {
  return scalar(`insert into season_pass_entitlements(player_id,season_id,provider,provider_transaction_id,status,amount_cents)
    values ($1,'season_1','admin',$2,$3,0) returning entitlement_id`, [players[0],randomUUID(),status]);
}

test('draft season awards no XP or rewards and cannot activate without dates', async () => {
  await record();
  await entitlement();
  assert.equal(await xp(),0);
  assert.deepEqual(await owned(),[]);
  await assert.rejects(db.exec("update season_pass_seasons set status='active'"), /season_pass_scheduled_dates/);
});
test('completed matches award 25 completion + 25 win; 2v2 awards both teammates', async () => {
  await activate();
  await record({mode:'2v2',type:'ranked'});
  assert.deepEqual(await Promise.all(players.map((_,i)=>xp(i))),[50,25,50,25]);
  assert.equal(await scalar('select count(*)::int from season_pass_xp_events'),6);
});
test('record retries and award replays never duplicate XP or match statistics', async () => {
  await activate();
  const key=`fixture:${randomUUID()}`;
  const id=await record({key});
  assert.equal(await record({key}),id);
  assert.equal(await scalar('select brasta_award_season_pass_match($1)',[id]),0);
  assert.equal(await xp(),50);
  assert.equal(await scalar('select matches_played from player_game_stats where player_id=$1',[players[0]]),1);
});
for (const [name, options] of Object.entries({bot:{type:'bot'},abandoned:{reason:'ended_by_host'},forfeit:{reason:'forfeit'},guest:{guest:true},duplicate:{duplicate:true},unfinished:{score:70},wrongWinner:{winner:'B'}})) {
  test(`${name} matches do not award Season XP`,async()=>{
    await activate(); await record(options); assert.equal(await xp(),0);
  });
}
test('season boundaries use persisted start/completion times, including delayed delivery',async()=>{
  await activate();
  const times=(await query("select starts_at,ends_at from season_pass_seasons"))[0];
  await record({started:new Date(new Date(times.starts_at).getTime()-1).toISOString()});
  assert.equal(await xp(),0);
  await db.exec("update season_pass_seasons set status='ended',ends_at=now()-interval '30 seconds'");
  const end=await scalar('select ends_at from season_pass_seasons');
  await record({completed:end});
  assert.equal(await xp(),0);
  await record(); // Eligible completion persisted before end; its delivery was late.
  assert.equal(await xp(),50);
});
test('free rewards grant at tier boundaries and late premium activation is retroactive',async()=>{
  await activate();
  for(let i=0;i<4;i++) await record();
  assert.deepEqual(await owned(),[]);
  await record();
  assert.deepEqual(await owned(),['first_seat','gilded_suits']);
  for(let i=0;i<5;i++) await record();
  assert.deepEqual(await owned(),['first_seat','gilded_suits']);
  const id=await entitlement('pending');
  assert.deepEqual(await owned(),['first_seat','gilded_suits']);
  await query("update season_pass_entitlements set status='active' where entitlement_id=$1",[id]);
  assert.deepEqual(await owned(),['first_seat','gilded_suits','velvet_club']);
  await query("update season_pass_entitlements set status='active' where entitlement_id=$1",[id]);
  assert.equal((await owned()).length,3);
});
test('progress caps at tier 12 and ownership persists after season end',async()=>{
  await activate(); await entitlement();
  await query("insert into season_pass_progress(player_id,season_id,xp) values ($1,'season_1',2975)",[players[0]]);
  await record(); await record();
  assert.equal(await xp(),3000); assert.equal((await owned()).length,20);
  await db.exec("update season_pass_seasons set status='ended',ends_at=now()-interval '30 seconds'");
  assert.equal((await owned()).length,20);
});
test('rolled back match transaction also rolls back XP and rewards',async()=>{
  await activate(); await db.exec('savepoint match_write');
  await record(); assert.equal(await xp(),50);
  await db.exec('rollback to savepoint match_write');
  assert.equal(await xp(),0); assert.equal(await scalar('select count(*)::int from match_history'),0);
});
test('server role can award; browser roles cannot award, equip, or write ownership',async()=>{
  await activate(); await db.exec('set local role service_role'); await record(); assert.equal(await xp(),50);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']) {
    assert.equal(await scalar(`select has_function_privilege($1,'public.brasta_award_season_pass_match(uuid)','execute')`,[role]),false);
    assert.equal(await scalar(`select has_function_privilege($1,'public.brasta_equip_season_pass_reward(uuid,text,text,text)','execute')`,[role]),false);
    assert.equal(await scalar("select has_table_privilege($1,'season_pass_reward_ownership','insert')",[role]),false);
  }
});
test('owned reward equips in its slot; Remove survives reload and earned titles switch atomically',async()=>{
  await activate(); for(let i=0;i<5;i++) await record();
  await query("select brasta_equip_season_pass_reward($1,'season_1','profile_title','first_seat')",[players[0]]);
  assert.equal(await scalar("select title_source from season_pass_equipment where player_id=$1 and slot='profile_title'",[players[0]]),'season');
  await query("select brasta_equip_season_pass_reward($1,'season_1','profile_title',null)",[players[0]]);
  assert.equal(await scalar("select title_source from season_pass_equipment where player_id=$1 and slot='profile_title'",[players[0]]),'none');
  await query("insert into player_profile_badges(player_id,badge_key,source) values ($1,'founder','admin')",[players[0]]);
  await query("select brasta_equip_profile_badge($1,'founder')",[players[0]]);
  assert.equal(await scalar("select title_source from season_pass_equipment where player_id=$1 and slot='profile_title'",[players[0]]),'earned');
});
for (const [slot,id,i,pattern] of [['avatar_frame','gilded_suits',0,/does not fit/],['card_back','velvet_club',0,/not unlocked/],['card_back','gilded_suits',1,/not unlocked/]]) {
  test(`cannot equip ${id} in ${slot} for player ${i}`,async()=>{
    await activate(); for(let n=0;n<5;n++) await record();
    await assert.rejects(query('select brasta_equip_season_pass_reward($1,\'season_1\',$2,$3)',[players[i],slot,id]),pattern);
  });
}
