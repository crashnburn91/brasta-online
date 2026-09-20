import Stripe from 'stripe';

const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const dbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
export function checkoutEnabled() {
  return process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'beta'
    && stripeKey.startsWith('sk_test_') && webhookSecret.startsWith('whsec_') && Boolean(dbKey);
}
function stripe() {
  if (!checkoutEnabled()) throw new Error('Test checkout is not configured.');
  return new Stripe(stripeKey, { maxNetworkRetries: 2, timeout: 15000 });
}
export type TestOrder = {
  order_id: string; player_id: string; season_id: string; amount_cents: number;
  currency: string; checkout_session_id: string | null; status: 'created'|'open'|'paid'|'expired'; expires_at: string;
  fulfillment_status: 'none'|'active'|'refunded'|'disputed'|'revoked'; test_reward_ids: string[]; amount_refunded: number;
};
async function db<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  if (!dbKey) throw new Error('Test checkout is not configured.');
  const response = await fetch(`${dbUrl}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET', headers: {apikey:dbKey,Authorization:`Bearer ${dbKey}`,'Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {}), cache:'no-store',
  });
  if (!response.ok) throw new Error(`Checkout storage failed (${response.status}).`);
  // Void PostgREST RPCs succeed with HTTP 204 and no JSON body.
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function latestTestOrder(playerId: string) {
  const path=`season_pass_checkout_tests?player_id=eq.${encodeURIComponent(playerId)}&select=*&order=created_at.desc&limit=1`;
  let order=(await db<TestOrder[]>(path))[0];
  // Restore/reconcile existing receipts, including purchases made before fulfillment shipped.
  if (order?.checkout_session_id) {
    await saveSession(await stripe().checkout.sessions.retrieve(order.checkout_session_id),order);
    order=(await db<TestOrder[]>(path))[0];
  }
  return order ? {orderId:order.order_id,status:order.status,fulfillmentStatus:order.fulfillment_status,
    testRewardCount:order.test_reward_ids.length,amountRefunded:order.amount_refunded} : null;
}
export function validateTestSession(session: Stripe.Checkout.Session, order: TestOrder) {
  if (session.livemode || session.mode !== 'payment' || session.client_reference_id !== order.player_id
    || session.metadata?.brasta_order_id !== order.order_id || session.metadata?.season_id !== order.season_id
    || session.currency !== order.currency || session.amount_total !== order.amount_cents
    || (order.checkout_session_id && order.checkout_session_id !== session.id)) throw new Error('Checkout does not match its order.');
}
async function saveSession(session: Stripe.Checkout.Session, order: TestOrder) {
  validateTestSession(session, order);
  const status = session.status === 'complete' && session.payment_status === 'paid' ? 'paid'
    : session.status === 'expired' ? 'expired' : 'open';
  if (status==='paid') {
    const payment=await verifiedPayment(stripe(),session,order,false);
    await db('rpc/brasta_reconcile_checkout_test',{p_order_id:order.order_id,p_session_id:session.id,
      p_intent_id:payment.intentId,p_amount:order.amount_cents,p_currency:order.currency,
      p_refunded:payment.refunded,p_livemode:false,p_dispute_id:payment.disputeId,p_dispute_state:payment.disputeState});
  } else {
    await db('rpc/brasta_update_checkout_test', {p_order_id:order.order_id,p_session_id:session.id,p_status:status,
      p_amount:session.amount_total,p_currency:session.currency});
  }
  return status;
}
function objectId(value: string | {id:string} | null) {return typeof value==='string' ? value : value?.id;}
export async function startTestCheckout(playerId: string) {
  const client = stripe();
  const order = await db<TestOrder>('rpc/brasta_start_checkout_test', {p_player_id:playerId});
  if (order.status === 'paid') {
    const restored=await latestTestOrder(playerId);
    return {status:restored?.status||'paid',fulfillmentStatus:restored?.fulfillmentStatus};
  }
  const session = order.checkout_session_id ? await client.checkout.sessions.retrieve(order.checkout_session_id)
    : await client.checkout.sessions.create({
      // Keep the isolated card test independent of account-level Managed Payments defaults.
      managed_payments:{enabled:false},
      mode:'payment',payment_method_types:['card'],client_reference_id:playerId,
      metadata:{brasta_order_id:order.order_id,season_id:order.season_id},
      line_items:[{quantity:1,price_data:{currency:order.currency,unit_amount:order.amount_cents,
        product_data:{name:'Brasta Season 1 Premium — TEST ONLY'}}}],
      success_url:'https://beta.brasta.app/season-pass?checkout=returned',
      cancel_url:'https://beta.brasta.app/season-pass?checkout=cancelled',
      expires_at:Math.floor(new Date(order.expires_at).getTime()/1000),
    }, {idempotencyKey:`brasta-test-order:${order.order_id}`});
  const status = await saveSession(session,order);
  if (status !== 'open') return {status};
  if (!session.url || new URL(session.url).origin !== 'https://checkout.stripe.com') throw new Error('Checkout URL unavailable.');
  return {status,url:session.url};
}
export function verifyCheckoutEvent(body: string, signature: string) {
  return stripe().webhooks.constructEvent(body,signature,webhookSecret);
}
export async function processCheckoutEvent(event: Stripe.Event) {
  if (event.livemode) throw new Error('Live payments are not accepted on beta.');
  const client=stripe();
  const session=await checkoutForPaymentEvent(client,event);
  if (!session) return;
  const orderId=session.metadata?.brasta_order_id;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return;
  const orders=await db<TestOrder[]>(`season_pass_checkout_tests?order_id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
  if (!orders[0]) throw new Error('Checkout order not found.');
  await saveSession(session,orders[0]);
}

// Shared provider verification for isolated sandbox and gated live order adapters.
export async function verifiedPayment(client:Stripe,session:Stripe.Checkout.Session,
 order:{amount_cents:number;currency:string},livemode:boolean) {
 const intentId=objectId(session.payment_intent);
 if(!intentId)throw new Error('Paid checkout has no payment intent.');
 const intent=await client.paymentIntents.retrieve(intentId);
 const chargeId=objectId(intent.latest_charge);
 if(intent.id!==intentId||intent.livemode!==livemode||intent.status!=='succeeded'
  ||intent.amount!==order.amount_cents||intent.amount_received!==order.amount_cents
  ||intent.currency!==order.currency||!chargeId)throw new Error('Payment intent does not match its order.');
 const charge=await client.charges.retrieve(chargeId);
 if(charge.id!==chargeId||charge.livemode!==livemode||!charge.paid||!charge.captured
  ||objectId(charge.payment_intent)!==intentId||charge.amount!==order.amount_cents
  ||charge.amount_captured!==order.amount_cents||charge.currency!==order.currency
  ||!Number.isInteger(charge.amount_refunded)||charge.amount_refunded<0
  ||charge.amount_refunded>order.amount_cents)throw new Error('Charge does not match its order.');
 const disputes=await client.disputes.list({charge:charge.id,limit:100});
 // Multiple disputes require manual review rather than guessing which one controls access.
 if(disputes.has_more||disputes.data.length>1)throw new Error('Multiple disputes require review.');
 const dispute=disputes.data[0];
 let disputeState='none';
 if(dispute){
  if(dispute.livemode!==livemode||objectId(dispute.charge)!==charge.id
   ||(dispute.payment_intent&&objectId(dispute.payment_intent)!==intentId)
   ||dispute.currency!==order.currency)throw new Error('Dispute does not match its payment.');
  if(['won','prevented','warning_closed'].includes(dispute.status))disputeState='won';
  else if(dispute.status==='lost')disputeState='lost';
  else if(['needs_response','under_review','warning_needs_response','warning_under_review'].includes(dispute.status))disputeState='open';
  else throw new Error('Unrecognized dispute state.');
 }else if(charge.disputed)throw new Error('Dispute details unavailable.');
 return {intentId,refunded:charge.amount_refunded,purchasedAt:new Date(charge.created*1000).toISOString(),
  disputeId:dispute?.id||null,disputeState};
}
export async function checkoutForPaymentEvent(client:Stripe,event:Stripe.Event) {
 let id:string;
 if(['charge.dispute.created','charge.dispute.updated','charge.dispute.closed'].includes(event.type)){
  const dispute=await client.disputes.retrieve((event.data.object as Stripe.Dispute).id);
  if(dispute.livemode!==event.livemode)throw new Error('Dispute mode mismatch.');
  const chargeId=objectId(dispute.charge);
  if(!chargeId)throw new Error('Dispute has no charge.');
  const charge=await client.charges.retrieve(chargeId);
  if(charge.livemode!==event.livemode)throw new Error('Charge mode mismatch.');
  const intentId=objectId(charge.payment_intent);
  if(!intentId)return null;
  const sessions=await client.checkout.sessions.list({payment_intent:intentId,limit:1});
  if(!sessions.data[0])return null;
  id=sessions.data[0].id;
 }else if(event.type==='charge.refunded'){
  const charge=await client.charges.retrieve((event.data.object as Stripe.Charge).id);
  if(charge.livemode!==event.livemode)throw new Error('Charge mode mismatch.');
  const intentId=objectId(charge.payment_intent);
  if(!intentId)return null;
  const sessions=await client.checkout.sessions.list({payment_intent:intentId,limit:1});
  if(!sessions.data[0])return null;
  id=sessions.data[0].id;
 }else{
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return null;
  id=(event.data.object as Stripe.Checkout.Session).id;
 }
 return client.checkout.sessions.retrieve(id);
}
