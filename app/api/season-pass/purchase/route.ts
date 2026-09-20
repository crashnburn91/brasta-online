import {NextResponse} from 'next/server';
import {verifyBrastaAccessToken} from '../../../../lib/supabase-auth';
import {liveCheckoutEnabled,startLiveCheckout} from '../../../../lib/season-pass-live-checkout';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!liveCheckoutEnabled())return NextResponse.json({error:'Premium purchases are not open.'},{status:503});
 try{
  const token=/^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization')||'')?.[1];
  const identity=token?await verifyBrastaAccessToken(token):null;
  if(!identity?.userId)return NextResponse.json({error:'Sign in to purchase Premium.'},{status:401});
  return NextResponse.json(await startLiveCheckout(identity.userId),{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Could not start checkout.'},{status:503});}
}
