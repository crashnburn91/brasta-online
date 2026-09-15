'use client';
import {useEffect,useState,useRef} from 'react';
export default function TestCheckout({token}:{token:string}) {
 const active=useRef(token);
 const [enabled,setEnabled]=useState(false);
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  active.current=token;let alive=true;setEnabled(false);setStatus('');setMessage('');
  const check=async()=>{
   try {
    const response=await fetch('/api/season-pass/checkout',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    const data=await response.json();if(!alive)return;
    setEnabled(response.ok&&data.enabled===true);setStatus(data.order?.status||'');
    if(response.ok&&data.enabled!==true)setMessage('Test checkout will be available once payment setup is complete.');
    else if(!response.ok)setMessage('Could not load test payment status.');
   }catch{if(alive)setMessage('Could not load test payment status.');}
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
   else{setStatus(data.status);if(data.status==='expired')setMessage('That checkout expired. Try again to start a new one.');}
  }catch(error){setMessage(error instanceof Error?error.message:'Checkout unavailable.');}finally{setBusy(false);}
 }
 return <section className="sp-preview-controls" aria-label="Test checkout"><div><b>Test Premium checkout</b><p>No real money is charged. This records a test payment; your real Premium ownership and XP stay unchanged.</p>
 <p role="status">{status==='paid'?'Test payment confirmed.':status==='open'?'Awaiting payment confirmation.':message}</p></div>
 <button className="sp-inspect" disabled={!enabled||busy||status==='paid'} onClick={()=>void start()}>{busy?'Opening checkout…':status==='paid'?'Test payment confirmed':'Open test checkout'}</button>
 <button className="sp-inspect" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Refresh status</button></section>;
}
