import Stripe from 'stripe';
import {checkoutForPaymentEvent,verifiedPayment} from './season-pass-checkout';
const key=process.env.STRIPE_SECRET_KEY||'';
const secret=process.env.STRIPE_LIVE_WEBHOOK_SECRET||'';
const dbKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const dbUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://fhdrywazfmmvgswkdpdb.supabase.co';
export function livePaymentsConfigured(){return process.env.VERCEL_ENV==='production'
 &&process.env.VERCEL_GIT_COMMIT_REF==='main'&&key.startsWith('sk_live_')&&secret.startsWith('whsec_')&&Boolean(dbKey);}
export function liveCheckoutEnabled(){return livePaymentsConfigured()&&process.env.BRASTA_LIVE_SEASON_PASS_ENABLED==='true';}
function client(){if(!livePaymentsConfigured())throw new Error('Live payments unavailable.');return new Stripe(key,{maxNetworkRetries:2,timeout:15000});}
type Order={order_id:string;player_id:string;season_id:string;amount_cents:number;currency:string;checkout_session_id:string|null;expires_at:string;};
async function db<T>(path:string,body?:Record<string,unknown>):Promise<T>{
 const response=await fetch(`${dbUrl}/rest/v1/${path}`,{method:body?'POST':'GET',headers:{apikey:dbKey,Authorization:`Bearer ${dbKey}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
 if(!response.ok)throw new Error('Live payment storage failed.');
 return response.status===204?undefined as T:response.json();
}
async function save(session:Stripe.Checkout.Session,order:Order){
 if(session.livemode!==true||session.mode!=='payment'||session.client_reference_id!==order.player_id
 ||session.metadata?.brasta_order_id!==order.order_id||session.metadata?.season_id!==order.season_id
 ||session.metadata?.brasta_mode!=='live'||session.amount_total!==order.amount_cents||session.currency!==order.currency
 ||(order.checkout_session_id&&order.checkout_session_id!==session.id))throw new Error('Live session does not match order.');
 const status=session.status==='complete'&&session.payment_status==='paid'?'paid':session.status==='expired'?'expired':'open';
 const payment=status==='paid'?await verifiedPayment(client(),session,order,true):null;
 await db('rpc/brasta_reconcile_web_checkout',{p_order_id:order.order_id,p_session_id:session.id,p_status:status,
  p_amount:order.amount_cents,p_currency:order.currency,p_intent_id:payment?.intentId||null,p_refunded:payment?.refunded||0,
  p_purchased_at:payment?.purchasedAt||null,p_livemode:true,p_dispute_id:payment?.disputeId||null,p_dispute_state:payment?.disputeState||'none'});
 return status;
}
export async function startLiveCheckout(playerId:string){
 if(!liveCheckoutEnabled())throw new Error('Live checkout unavailable.');
 const stripe=client();
 const order=await db<Order&{already_owned?:boolean}>('rpc/brasta_start_web_checkout',{p_player_id:playerId});
 if(order.already_owned)return {status:'owned'};
 const session=order.checkout_session_id?await stripe.checkout.sessions.retrieve(order.checkout_session_id):await stripe.checkout.sessions.create({
  managed_payments:{enabled:false},mode:'payment',payment_method_types:['card'],client_reference_id:playerId,
  metadata:{brasta_order_id:order.order_id,season_id:order.season_id,brasta_mode:'live'},
  line_items:[{quantity:1,price_data:{currency:order.currency,unit_amount:order.amount_cents,product_data:{name:'Brasta Season 1 Premium'}}}],
  success_url:'https://brasta.app/season-pass?checkout=returned',cancel_url:'https://brasta.app/season-pass?checkout=cancelled',
  expires_at:Math.floor(new Date(order.expires_at).getTime()/1000)
 },{idempotencyKey:`brasta-live-order:${order.order_id}`});
 const status=await save(session,order);
 if(status!=='open')return {status};
 if(!session.url||new URL(session.url).origin!=='https://checkout.stripe.com')throw new Error('Checkout URL unavailable.');
 return {status,url:session.url};
}
export function verifyLivePaymentEvent(body:string,signature:string){return client().webhooks.constructEvent(body,signature,secret);}
export async function processLivePaymentEvent(event:Stripe.Event){
 if(event.livemode!==true)throw new Error('Sandbox event rejected by live payments.');
 const session=await checkoutForPaymentEvent(client(),event);
 if(!session||session.metadata?.brasta_mode!=='live')return;
 const orderId=session.metadata?.brasta_order_id;
 if(!orderId||!/^[0-9a-f-]{36}$/i.test(orderId))throw new Error('Missing live order.');
 const orders=await db<Order[]>(`season_pass_web_orders?order_id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
 if(!orders[0])throw new Error('Live order missing.');
 await save(session,orders[0]);
}
