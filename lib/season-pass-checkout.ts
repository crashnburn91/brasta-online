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
};
async function db<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  if (!dbKey) throw new Error('Test checkout is not configured.');
  const response = await fetch(`${dbUrl}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET', headers: {apikey:dbKey,Authorization:`Bearer ${dbKey}`,'Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {}), cache:'no-store',
  });
  if (!response.ok) throw new Error(`Checkout storage failed (${response.status}).`);
  return response.json() as Promise<T>;
}
export async function latestTestOrder(playerId: string) {
  const rows = await db<TestOrder[]>(`season_pass_checkout_tests?player_id=eq.${encodeURIComponent(playerId)}&select=order_id,status&order=created_at.desc&limit=1`);
  return rows[0] ? {orderId:rows[0].order_id,status:rows[0].status} : null;
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
  await db('rpc/brasta_update_checkout_test', {p_order_id:order.order_id,p_session_id:session.id,p_status:status,
    p_amount:session.amount_total,p_currency:session.currency});
  return status;
}
export async function startTestCheckout(playerId: string) {
  const client = stripe();
  const order = await db<TestOrder>('rpc/brasta_start_checkout_test', {p_player_id:playerId});
  if (order.status === 'paid') return {status:'paid'};
  const session = order.checkout_session_id ? await client.checkout.sessions.retrieve(order.checkout_session_id)
    : await client.checkout.sessions.create({
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
  if (!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type)) return;
  const id=(event.data.object as Stripe.Checkout.Session).id;
  // Retrieve current provider state: never trust redirect parameters or stale event order.
  const session=await stripe().checkout.sessions.retrieve(id);
  const orderId=session.metadata?.brasta_order_id;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return;
  const orders=await db<TestOrder[]>(`season_pass_checkout_tests?order_id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
  if (!orders[0]) throw new Error('Checkout order not found.');
  await saveSession(session,orders[0]);
}
