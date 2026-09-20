import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import Stripe from 'stripe';
const source=ts.transpileModule(readFileSync('lib/season-pass-checkout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const order={order_id:'00000000-0000-4000-8000-000000000001',player_id:'tester',season_id:'season_1',amount_cents:499,currency:'usd',checkout_session_id:null,status:'created',fulfillment_status:'none',test_reward_ids:[],amount_refunded:0,expires_at:new Date(Date.now()+3600000).toISOString()};
const session={id:'cs_test_fixture',livemode:false,mode:'payment',client_reference_id:'tester',metadata:{brasta_order_id:order.order_id,season_id:'season_1'},amount_total:499,currency:'usd',status:'open',payment_intent:'pi_fixture',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/cs_test_fixture'};
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'beta',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',SUPABASE_SECRET_KEY:'server-fixture'};
function fixture(overrides={},state=session,extra={}){
 const exports={},calls=[];
 class Client {webhooks=new Stripe('sk_test_fixture').webhooks;checkout={sessions:{create:async(body,options)=>{calls.push({body,options});return state;},retrieve:async()=>state,list:async()=>({data:[state]})}};paymentIntents={retrieve:async()=>({id:'pi_fixture',livemode:false,status:'succeeded',amount:499,amount_received:499,currency:'usd',latest_charge:'ch_fixture',...extra.intent})};charges={retrieve:async()=>({id:'ch_fixture',livemode:false,paid:true,captured:true,payment_intent:'pi_fixture',amount:499,amount_captured:499,currency:'usd',amount_refunded:0,...extra.charge})};}
 runInNewContext(source,{exports,URL,process:{env:{...env,...overrides}},require:()=>Client,fetch:async(url,options)=>{
  calls.push({url,body:options.body?JSON.parse(options.body):undefined});
  if(extra.fetch)return extra.fetch(url,options);
  return (url.includes('brasta_update')||url.includes('brasta_fulfill')) ? new Response(null,{status:204})
    : Response.json(url.includes('brasta_start')?order:[order]);
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
  const write=f.calls.find(c=>c.url?.includes(paid?'brasta_fulfill':'brasta_update'));
  if(paid){assert.equal(write.body.p_intent_id,'pi_fixture');assert.equal(write.body.p_livemode,false);}
  else assert.equal(write.body.p_status,'open');
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

const paidSession={...session,status:'complete',payment_status:'paid'};
const event=(type='checkout.session.completed')=>({livemode:false,type,data:{object:{id:type==='charge.refunded'?'ch_fixture':session.id}}});
test('refund notifications retrieve current charge and reconcile isolated fulfillment',async()=>{
 for(const amount of [99,499]){
  const f=fixture({},paidSession,{charge:{amount_refunded:amount}});
  await f.processCheckoutEvent(event('charge.refunded'));
  const write=f.calls.find(c=>c.url?.includes('brasta_fulfill'));
  assert.equal(write.body.p_refunded,amount);
  assert.equal(write.body.p_session_id,session.id);
  assert(f.calls.every(c=>!c.url?.includes('brasta_reconcile_web')));
 }
});
test('old success event retrieves current refund state instead of granting again',async()=>{
 const f=fixture({},paidSession,{charge:{amount_refunded:499}});
 await f.processCheckoutEvent(event());
 assert.equal(f.calls.find(c=>c.url?.includes('brasta_fulfill')).body.p_refunded,499);
});
test('wrong intent, live mode, uncaptured or mismatched charge cannot grant',async()=>{
 for(const extra of [{intent:{id:'pi_other'}},{intent:{status:'processing'}},{intent:{amount_received:1}},
 {intent:{livemode:true}},{charge:{payment_intent:'pi_other'}},{charge:{amount:1}},
 {charge:{livemode:true}},{charge:{captured:false}},{charge:{currency:'eur'}},
 {charge:{amount_refunded:-1}},{charge:{amount_refunded:500}}]){
  const f=fixture({},paidSession,extra);
  await assert.rejects(f.processCheckoutEvent(event()));
  assert(!f.calls.some(c=>c.url?.includes('brasta_fulfill')));
 }
});
test('fulfillment storage failure propagates for Stripe retry',async()=>{
 const f=fixture({},paidSession,{fetch:(url)=>url.includes('brasta_fulfill')?new Response(null,{status:503}):Response.json([order])});
 await assert.rejects(f.processCheckoutEvent(event()),/storage failed/);
});
test('status refresh reconciles a previously paid receipt and returns test Premium only',async()=>{
 let fulfilled=false;
 const f=fixture({},paidSession,{fetch:(url)=>{
  if(url.includes('brasta_fulfill')){fulfilled=true;return new Response(null,{status:204});}
  return Response.json([{...order,status:'paid',checkout_session_id:session.id,
    fulfillment_status:fulfilled?'active':'none',test_reward_ids:fulfilled?['velvet_club']:[]}]);
 }});
 const result=await f.latestTestOrder('tester');
 assert.equal(result.fulfillmentStatus,'active');assert.equal(result.testRewardCount,1);
 assert(f.calls.every(c=>!c.url?.includes('brasta_reconcile_web')));
});
test('unrelated events are ignored and live events are rejected',async()=>{
 const f=fixture();await f.processCheckoutEvent(event('customer.created'));
 assert.equal(f.calls.length,0);
 await assert.rejects(f.processCheckoutEvent({...event(),livemode:true}),/Live payments/);
});

test('checkout UI distinguishes active, refunded and failed status without carrying access across accounts',async()=>{
 const React=await import('react');
 const {createRoot}=await import('react-dom/client');
 const {JSDOM}=await import('jsdom');
 const jsx=await import('react/jsx-runtime');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://beta.brasta.app/season-pass'});
 const saved={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const exports={};let body={enabled:true,order:{status:'paid',fulfillmentStatus:'active',testRewardCount:0}};
 let pending;
 const source=ts.transpileModule(readFileSync('app/season-pass/TestCheckout.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(source,{exports,URL,window:dom.window,require:name=>name==='react'?React:jsx,fetch:async()=>pending?await pending:Response.json(body)});
 const root=createRoot(dom.window.document.getElementById('root'));
 const render=async token=>React.act(async()=>root.render(React.createElement(exports.default,{token})));
 try{
  await render('first');assert.match(dom.window.document.body.textContent,/Test Premium active · 0 earned/);
  assert.match(dom.window.document.body.textContent,/Rewards unlock at their required/);
  assert.equal(dom.window.document.querySelector('button').disabled,true);
  body={enabled:true,order:{status:'paid',fulfillmentStatus:'refunded',testRewardCount:0}};
  await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));
  assert.match(dom.window.document.body.textContent,/Test payment refunded/);
  assert.equal(dom.window.document.querySelector('button').disabled,false);
  let resolve;pending=new Promise(r=>resolve=r);
  await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));
  pending=null;body={enabled:false};await render('second');
  await React.act(async()=>resolve(Response.json({enabled:true,order:{status:'paid',fulfillmentStatus:'active',testRewardCount:16}})));
  assert.doesNotMatch(dom.window.document.body.textContent,/Test Premium active/);
  assert.equal(dom.window.document.querySelector('button').disabled,true);
 }finally{
  await React.act(async()=>root.unmount());dom.window.close();
  globalThis.window=saved.window;globalThis.document=saved.document;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;
 }
});
