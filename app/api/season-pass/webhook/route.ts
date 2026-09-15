import {NextResponse} from 'next/server';
import {checkoutEnabled,verifyCheckoutEvent,processCheckoutEvent} from '../../../../lib/season-pass-checkout';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if (!checkoutEnabled()) return NextResponse.json({error:'Webhook unavailable.'},{status:503});
  let event;
  try {event=verifyCheckoutEvent(await request.text(),request.headers.get('stripe-signature')||'');}
  catch {return NextResponse.json({error:'Invalid signature.'},{status:400});}
  try {await processCheckoutEvent(event);return NextResponse.json({received:true});}
  catch {return NextResponse.json({error:'Webhook processing failed; retry required.'},{status:500});}
}
