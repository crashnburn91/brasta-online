'use client';
import {useEffect,useState,useRef} from 'react';
export default function TestCheckout({token}:{token:string}) {
 const active=useRef(token);
 const [enabled,setEnabled]=useState(false);
 const [status,setStatus]=useState('');
 const [fulfillment,setFulfillment]=useState('');
 const [rewardCount,setRewardCount]=useState(0);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  active.current=token;let alive=true;let requestNumber=0;setEnabled(false);setStatus('');setFulfillment('');setRewardCount(0);setMessage('');setBusy(false);
  const check=async()=>{
   const request=++requestNumber;
   try {
    const response=await fetch('/api/season-pass/checkout',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    const data=await response.json();if(!alive||request!==requestNumber)return;
    setEnabled(response.ok&&data.enabled===true);setStatus(data.order?.status||'');
    setFulfillment(data.order?.fulfillmentStatus||'');setRewardCount(data.order?.testRewardCount||0);
    setMessage('');
    if(response.ok&&data.enabled!==true)setMessage('Test checkout will be available once payment setup is complete.');
    else if(!response.ok)setMessage('Could not load test payment status.');
   }catch{if(alive&&request===requestNumber){setEnabled(false);setStatus('');setFulfillment('');setMessage('Could not load test payment status.');}}
  };
  void check();window.addEventListener('focus',check);
  return()=>{active.current='';alive=false;window.removeEventListener('focus',check);};
 },[token,refresh]);
 async function start(){
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/season-pass/checkout',{method:'POST',headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   const data=await response.json();if(active.current!==token)return;if(!response.ok)throw new Error(data.error||'Checkout unavailable.');
   if(data.url){const url=new URL(data.url);if(url.origin!=='https://checkout.stripe.com')throw new Error('Invalid checkout URL.');window.location.assign(url.href);}
   else{setStatus(data.status);setRefresh(v=>v+1);if(data.status==='expired')setMessage('That checkout expired. Try again to start a new one.');}
  }catch(error){if(active.current===token)setMessage(error instanceof Error?error.message:'Checkout unavailable.');}finally{if(active.current===token)setBusy(false);}
 }
 return <section className="sp-preview-controls" aria-label="Test checkout"><div><b>Test Premium checkout</b><p>No real money is charged. Test Premium and reward grants are separate from your real collection and XP. Your all-cosmetics beta preview access is independent of this payment test.</p>
 <p role="status">{message|| (fulfillment==='disputed'?'Test Premium suspended while the payment dispute is reviewed.':fulfillment==='revoked'?'Test Premium revoked after a lost payment dispute.':fulfillment==='refunded'?'Test payment refunded. Test Premium and its reward grants have been removed.':fulfillment==='active'?`Test Premium active · ${rewardCount} earned Premium test rewards.`:status==='paid'?'Test payment confirmed. Fulfillment pending.':status==='open'?'Awaiting payment confirmation.':'')}</p>
 {fulfillment==='active'&&rewardCount===0&&<p>Rewards unlock at their required Season XP tiers. Season 1 is still a draft.</p>}</div>
 <button className="sp-inspect" disabled={!enabled||busy||(status==='paid'&&fulfillment!=='refunded')} onClick={()=>void start()}>{busy?'Opening checkout…':fulfillment==='active'?'Test Premium active':fulfillment==='disputed'?'Test Premium suspended':fulfillment==='revoked'?'Test Premium revoked':fulfillment==='refunded'?'Start another test checkout':status==='paid'?'Test payment confirmed':'Open test checkout'}</button>
 <button className="sp-inspect" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Refresh status</button></section>;
}
