import {NextResponse} from 'next/server';
import {livePaymentsConfigured,verifyLivePaymentEvent,processLivePaymentEvent} from '../../../../lib/season-pass-live-checkout';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 // Continue handling refunds/disputes even when new purchases are switched off.
 if(!livePaymentsConfigured())return NextResponse.json({error:'Live payments unavailable.'},{status:503});
 let event;
 try{event=verifyLivePaymentEvent(await request.text(),request.headers.get('stripe-signature')||'');}
 catch{return NextResponse.json({error:'Invalid signature.'},{status:400});}
 try{await processLivePaymentEvent(event);return NextResponse.json({received:true});}
 catch{return NextResponse.json({error:'Processing failed; retry required.'},{status:500});}
}
