import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import Stripe from 'stripe';
const source=ts.transpileModule(readFileSync('lib/season-pass-checkout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const order={order_id:'00000000-0000-4000-8000-000000000001',player_id:'tester',season_id:'season_1',amount_cents:499,currency:'usd',checkout_session_id:null,status:'created',expires_at:new Date(Date.now()+3600000).toISOString()};
const session={id:'cs_test_fixture',livemode:false,mode:'payment',client_reference_id:'tester',metadata:{brasta_order_id:order.order_id,season_id:'season_1'},amount_total:499,currency:'usd',status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/cs_test_fixture'};
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'beta',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',SUPABASE_SECRET_KEY:'server-fixture'};
function fixture(overrides={},state=session){
 const exports={},calls=[];
 class Client {webhooks=new Stripe('sk_test_fixture').webhooks;checkout={sessions:{create:async(body,options)=>{calls.push({body,options});return state;},retrieve:async()=>state}};}
 runInNewContext(source,{exports,URL,process:{env:{...env,...overrides}},require:()=>Client,fetch:async(url,options)=>{
  calls.push({url,body:options.body?JSON.parse(options.body):undefined});
  return {ok:true,json:async()=>url.includes('brasta_start')?order:url.includes('brasta_update')?null:[order]};
 }});return {...exports,calls};
}
test('checkout is beta-only and rejects live keys or missing signing setup',()=>{
 assert.equal(fixture().checkoutEnabled(),true);
 for(const overrides of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{STRIPE_SECRET_KEY:'sk_live_fixture'},{STRIPE_WEBHOOK_SECRET:''}])assert.equal(fixture(overrides).checkoutEnabled(),false);
});
test('checkout uses catalog amount, verified player, fixed redirects and stable idempotency',async()=>{
 const f=fixture();const result=await f.startTestCheckout('tester');
 assert.equal(result.url,session.url);
 const create=f.calls.find(c=>c.options);
 assert.equal(create.body.managed_payments.enabled,false);
 assert.equal(create.body.payment_method_types[0],'card');
 assert.equal(create.body.line_items[0].price_data.unit_amount,499);
 assert.equal(create.body.client_reference_id,'tester');
 assert.equal(create.body.success_url,'https://beta.brasta.app/season-pass?checkout=returned');
 assert.equal(create.options.idempotencyKey,'brasta-test-order:'+order.order_id);
});
test('mismatched amount, currency, account, live mode, season or order cannot fulfill',()=>{
 const f=fixture();
 for(const change of [{amount_total:1},{currency:'eur'},{client_reference_id:'other'},{livemode:true},{metadata:{brasta_order_id:order.order_id,season_id:'other'}},{metadata:{brasta_order_id:'other',season_id:'season_1'}}])assert.throws(()=>f.validateTestSession({...session,...change},order));
});
test('real Stripe signature verification rejects tampering and expired signatures',()=>{
 const f=fixture(),stripe=new Stripe('sk_test_fixture');
 const payload=JSON.stringify({id:'evt_fixture',livemode:false,type:'checkout.session.completed',data:{object:session}});
 const signature=stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_fixture'});
 assert.equal(f.verifyCheckoutEvent(payload,signature).id,'evt_fixture');
 assert.throws(()=>f.verifyCheckoutEvent(payload+' ',signature));
 const stale=stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_fixture',timestamp:Math.floor(Date.now()/1000)-600});
 assert.throws(()=>f.verifyCheckoutEvent(payload,stale));
});
test('a completed but unpaid session stays pending; paid session creates only test receipt',async()=>{
 for(const paid of [false,true]){
  const f=fixture({}, {...session,status:'complete',payment_status:paid?'paid':'unpaid'});
  await f.processCheckoutEvent({livemode:false,type:'checkout.session.completed',data:{object:{id:session.id}}});
  const write=f.calls.find(c=>c.url?.includes('brasta_update'));
  assert.equal(write.body.p_status,paid?'paid':'open');
  assert(f.calls.every(c=>!c.url||!c.url.includes('entitlement')));
 }
});

test('checkout route requires verified tester and ignores client price and identity',async()=>{
 const route=ts.transpileModule(readFileSync('app/api/season-pass/checkout/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const access of ['unsigned','ordinary','tester']){
  const exports={},started=[];
  runInNewContext(route,{exports,require:name=>{
   if(name==='next/server')return {NextResponse:{json:(body,options)=>Response.json(body,options)}};
   if(name.endsWith('supabase-auth'))return {verifyBrastaAccessToken:async()=>access==='unsigned'?null:{userId:'verified-player'}};
   if(name.endsWith('season-pass'))return {getSeasonPassState:async()=>({testingAccess:access==='tester'})};
   return {checkoutEnabled:()=>true,startTestCheckout:async id=>{started.push(id);return {status:'open'};}};
  }});
  const response=await exports.POST(new Request('https://beta.brasta.app/api/season-pass/checkout',{method:'POST',headers:{Authorization:'Bearer token'},body:JSON.stringify({playerId:'someone-else',amount:1,returnUrl:'https://evil.test'})}));
  assert.equal(response.status,access==='unsigned'?401:access==='ordinary'?403:200);
  assert.deepEqual(started,access==='tester'?['verified-player']:[]);
 }
});
