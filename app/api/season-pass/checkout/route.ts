import {NextResponse} from 'next/server';
import {verifyBrastaAccessToken} from '../../../../lib/supabase-auth';
import {getSeasonPassState} from '../../../../lib/season-pass';
import {checkoutEnabled,latestTestOrder,startTestCheckout} from '../../../../lib/season-pass-checkout';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request:Request,start:boolean) {
  if (!checkoutEnabled()) return json({enabled:false,error:'Test checkout is not configured.'},start?503:200);
  const token=/^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization')||'')?.[1]||'';
  const identity=token ? await verifyBrastaAccessToken(token) : null;
  if (!identity?.userId) return json({error:'Sign in to test checkout.'},401);
  const state=await getSeasonPassState(identity.userId,'season_1',token);
  if (!state.testingAccess) return json({error:'Checkout testing is not enabled for this account.'},403);
  // No client-supplied price, identity, season, mode, or return URL is accepted.
  return start ? json(await startTestCheckout(identity.userId)) : json({enabled:true,order:await latestTestOrder(identity.userId)});
}
function reportFailure(error: unknown) {
  const value = error as {type?: string; code?: string; param?: string; requestId?: string; message?: string};
  const clean = (input: unknown) => typeof input === 'string' ? input
    .replace(/(?:sk|rk|pk)_(?:test|live)_[^\s'"<>]+/g, '[redacted-key]')
    .replace(/whsec_[^\s'"<>]+/g, '[redacted-secret]')
    .slice(0, 500) : undefined;
  // Never log request headers, tokens, raw Stripe errors, or payment details.
  console.error('[brasta test checkout]', {type:clean(value?.type), code:clean(value?.code),
    param:clean(value?.param), requestId:clean(value?.requestId), message:clean(value?.message)});
}
export async function GET(request:Request) {
  try {return await handle(request,false);} catch (error) {reportFailure(error);return json({error:'Could not load checkout status.'},503);}
}
export async function POST(request:Request) {
  try {return await handle(request,true);} catch (error) {reportFailure(error);return json({error:'Could not start test checkout. Please retry.'},503);}
}
