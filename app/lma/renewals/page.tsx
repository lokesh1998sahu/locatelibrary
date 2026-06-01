"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API = "/api/lma";
const PASSWORD = process.env.NEXT_PUBLIC_LMA_PASSWORD!;

interface Library { library_code:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch  { library_code:string; branch_code:string; active:boolean; emoji?:string; color?:string; }
interface PaymentTag { tag_name:string; fees_mode:string; active:boolean; }
interface InitData{ ok:boolean; libraries:Library[]; branches:Branch[]; paymentTags:PaymentTag[]; }
interface QueueItem {
  receipt_no:string; student_id:string; library:string; branch:string; name:string;
  seat_no:string; shift:string; shift_name:string; booking_from:string; booking_to:string;
  fee:number; fees_due_balance:number; dues_status:string; is_cross_library:string;
  status:string; renewed_from:string; lifecycle:string; days_until_expiry:number;
  receipt_text:string; cancel_whatsapp_text?:string;
}

type Toast = { msg:string; type:"success"|"error" } | null;
type Tab = "RENEW"|"CANCEL";

export default function RenewalsPage(){
  const router = useRouter();
  const [unlocked,setUnlocked]=useState(false);
  const [pwInput,setPwInput]=useState(""); const [pwErr,setPwErr]=useState("");
  const [init,setInit]=useState<InitData|null>(null);
  const [toast,setToast]=useState<Toast>(null);
  const [confirmAction,setConfirmAction]=useState<{title:string;message:string;confirmLabel:string;danger?:boolean;onYes:()=>void}|null>(null);

  const [tab,setTab]=useState<Tab>("RENEW");
  const [scope,setScope]=useState("");          // "" = all
  const [expiring,setExpiring]=useState<QueueItem[]>([]);
  const [expired,setExpired]=useState<QueueItem[]>([]);
  const [cancellations,setCancellations]=useState<QueueItem[]>([]);
  const [loading,setLoading]=useState(false);

  const [actionFor,setActionFor]=useState<QueueItem|null>(null);   // cancel/refund sheet
  const [resultText,setResultText]=useState<{title:string;text:string}|null>(null);

  useEffect(()=>{ if(typeof window!=="undefined"&&sessionStorage.getItem("lma_ok")==="1")setUnlocked(true); },[]);
  const tryUnlock=()=>{ if(pwInput&&pwInput===PASSWORD){sessionStorage.setItem("lma_ok","1");setUnlocked(true);setPwErr("");}else setPwErr("Incorrect password."); };
  const showToast=useCallback((msg:string,type:"success"|"error"="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3000); },[]);

  const inflightRef = useRef<Set<string>>(new Set());
  const post=useCallback(async(action:string,payload:any)=>{ const _k=action+"|"+JSON.stringify(payload); if(inflightRef.current.has(_k))return null; inflightRef.current.add(_k); try{ try{ const res=await fetch(API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,payload})}).then(r=>r.json()); if(!res.ok&&res.error){showToast(res.error,"error");return null;} return res; }catch(e){ showToast(e instanceof Error?e.message:String(e),"error"); return null; }  } finally { inflightRef.current.delete(_k); }},[showToast]);

  useEffect(()=>{ if(unlocked) fetch(`${API}?action=getInitData`).then(r=>r.json()).then((r:InitData)=>{if(r.ok)setInit(r);}); },[unlocked]);

  const load=useCallback(async()=>{
    setLoading(true);
    const p=new URLSearchParams(); if(scope) p.set("library",scope);
    const [rq,cq]=await Promise.all([
      fetch(`${API}?action=getRenewalsQueue&${p}`).then(r=>r.json()),
      fetch(`${API}?action=getCancellationsQueue&${p}`).then(r=>r.json()),
    ]);
    setLoading(false);
    setExpiring(rq.expiring||[]); setExpired(rq.expired||[]);
    setCancellations(cq.items||[]);
  },[scope]);

  useEffect(()=>{ if(unlocked) load(); },[unlocked,scope,load]);

  const doDoNotRenew=async(it:QueueItem)=>{
    const r=await post("markReceiptDoNotRenew",{receipt_no:it.receipt_no});
    if(r){ showToast("Marked Do Not Renew"); load(); }
  };
  const doReset=async(it:QueueItem)=>{
    const r=await post("resetReceiptStatus",{receipt_no:it.receipt_no});
    if(r&&r.reset){ showToast("Status reset to active"); load(); }
    else if(r&&r.error) showToast(r.error,"error");
  };

  if(!unlocked){
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-7 lma-slide-up">
          <div className="text-center mb-5"><div className="text-4xl mb-2">🔁</div><h1 className="text-xl font-extrabold text-lma-slate-900">Renewals</h1></div>
          <input type="password" autoFocus value={pwInput} onChange={e=>{setPwInput(e.target.value);setPwErr("");}} onKeyDown={e=>{if(e.key==="Enter")tryUnlock();}} placeholder="Password" className="w-full px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[15px] font-medium"/>
          {pwErr&&<p className="text-sm text-lma-danger mt-2 font-medium">{pwErr}</p>}
          <button onClick={tryUnlock} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-[15px] shadow-md">Unlock</button>
        </div>
      </div>
    );
  }

  const chips:{code:string;label:string;color?:string}[]=[{code:"",label:"All"}];
  if(init){ init.libraries.filter(l=>l.active).forEach(l=>{
    if(l.has_branches){ init.branches.filter(b=>b.library_code===l.library_code&&b.active).forEach(b=>chips.push({code:b.branch_code,label:b.branch_code,color:b.color||l.color})); }
    else chips.push({code:l.library_code,label:l.library_code,color:l.color});
  }); }

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Renewals</h1><p className="text-[11px] text-lma-slate-500 font-medium">{expiring.length+expired.length} to review · {cancellations.length} cancelled</p></div>
        <button onClick={load} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {/* tab toggle */}
      <div className="bg-white rounded-2xl p-1 flex gap-1 mb-3 shadow-sm">
        <button onClick={()=>setTab("RENEW")} className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${tab==="RENEW"?"bg-lma-slate-900 text-white":"text-lma-slate-500"}`}>To Review ({expiring.length+expired.length})</button>
        <button onClick={()=>setTab("CANCEL")} className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${tab==="CANCEL"?"bg-lma-slate-900 text-white":"text-lma-slate-500"}`}>Cancelled ({cancellations.length})</button>
      </div>

      {/* scope chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.label}</button>
        ))}
      </div>

      {loading&&expiring.length===0&&expired.length===0&&cancellations.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):tab==="RENEW"?(
        <>
          {expiring.length===0&&expired.length===0?(
            <div className="text-center text-sm text-lma-slate-500 py-8">Nothing to review. 🎉</div>
          ):(
            <>
              {expired.length>0&&(
                <Group title="Expired" tone="expired" count={expired.length}>
                  {expired.map(it=><QueueCard key={it.receipt_no} it={it} router={router} onCancel={()=>setActionFor(it)} onDoNotRenew={()=>setConfirmAction({ title:"Mark Do Not Renew?", message:`${it.name} · ${it.receipt_no} will be flagged DO NOT RENEW and leave the review queue.`, confirmLabel:"Don't Renew", danger:true, onYes:()=>doDoNotRenew(it) })}/>)}
                </Group>
              )}
              {expiring.length>0&&(
                <Group title="Expiring soon" tone="expiring" count={expiring.length}>
                  {expiring.map(it=><QueueCard key={it.receipt_no} it={it} router={router} onCancel={()=>setActionFor(it)} onDoNotRenew={()=>setConfirmAction({ title:"Mark Do Not Renew?", message:`${it.name} · ${it.receipt_no} will be flagged DO NOT RENEW and leave the review queue.`, confirmLabel:"Don't Renew", danger:true, onYes:()=>doDoNotRenew(it) })}/>)}
                </Group>
              )}
            </>
          )}
        </>
      ):(
        <>
          {cancellations.length===0?(
            <div className="text-center text-sm text-lma-slate-500 py-8">No cancelled receipts.</div>
          ):(
            <div className="space-y-2">
              {cancellations.map(it=>(
                <div key={it.receipt_no} className="bg-white rounded-xl p-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-extrabold text-lma-slate-900">{it.receipt_no}</span>
                    <span className="text-[10px] font-bold text-lma-slate-400">{it.student_id}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto bg-lma-danger/15 text-lma-danger">Cancelled</span>
                  </div>
                  <div className="text-sm font-semibold text-lma-slate-800 truncate">{it.name}</div>
                  <div className="text-[11px] text-lma-slate-500 mt-0.5">{it.library}{it.branch?`/${it.branch}`:""} · Seat {it.seat_no||"—"} · {it.shift_name||it.shift}</div>
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    {it.cancel_whatsapp_text&&<button onClick={()=>{navigator.clipboard.writeText(it.cancel_whatsapp_text!);showToast("Copied cancel message");}} className="py-2 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs">Copy WhatsApp</button>}
                    <button onClick={()=>setConfirmAction({ title:"Reset status?", message:`${it.name} · ${it.receipt_no} will be set back to active (clears Cancelled/Do-Not-Renew).`, confirmLabel:"Reset", onYes:()=>doReset(it) })} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Undo (Reset)</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* cancel / refund action sheet */}
      {actionFor&&init&&(
        <CancelSheet it={actionFor} init={init} onClose={()=>setActionFor(null)} post={post}
          onDone={(title,text)=>{ setActionFor(null); if(text)setResultText({title,text}); showToast("Done"); load(); }}/>
      )}

      {/* whatsapp result sheet */}
      {resultText&&(
        <Sheet onClose={()=>setResultText(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-3">{resultText.title}</h3>
          <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-60 overflow-y-auto">{resultText.text}</pre>
          <button onClick={()=>{navigator.clipboard.writeText(resultText.text);showToast("Copied");}} className="w-full mt-3 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">Copy message</button>
          <button onClick={()=>setResultText(null)} className="w-full mt-2 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Close</button>
        </Sheet>
      )}

      {confirmAction&&<ConfirmDialog c={confirmAction} onClose={()=>setConfirmAction(null)}/>}

      {toast&&(
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-lg z-[9999] lma-slide-up ${toast.type==="success"?"bg-lma-accent":"bg-lma-danger"}`}>
          {toast.type==="success"?"✓ ":"✕ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

function Group({ title, tone, count, children }:{ title:string; tone:"expired"|"expiring"; count:number; children:React.ReactNode }){
  const cls=tone==="expired"?"text-red-900":"text-lma-danger";
  return (
    <div className="mb-4">
      <div className={`text-[11px] font-bold uppercase tracking-wide mb-2 ${cls}`}>{title} · {count}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function QueueCard({ it, router, onCancel, onDoNotRenew }:{ it:QueueItem; router:any; onCancel:()=>void; onDoNotRenew:()=>void }){
  const daysLabel = it.days_until_expiry<0?`${Math.abs(it.days_until_expiry)}d ago`:it.days_until_expiry===0?"today":`in ${it.days_until_expiry}d`;
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-extrabold text-lma-slate-900">{it.receipt_no}</span>
        <span className="text-[10px] font-bold text-lma-slate-400">{it.student_id}</span>
        {it.is_cross_library&&it.is_cross_library!=="NO"&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1 rounded">CROSS</span>}
        <span className={`text-[10px] font-extrabold ml-auto ${it.days_until_expiry<0?"text-red-900":"text-lma-danger"}`}>{daysLabel}</span>
      </div>
      <div className="text-sm font-semibold text-lma-slate-800 truncate">{it.name}</div>
      <div className="text-[11px] text-lma-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
        <span>{it.library}{it.branch?`/${it.branch}`:""}</span>
        <span>· Seat {it.seat_no||"—"}</span>
        <span>· {it.shift_name||it.shift}</span>
        <span>· till {it.booking_to}</span>
        {it.fees_due_balance>0&&<span className="font-bold text-lma-danger">· Due ₹{it.fees_due_balance}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2.5">
        <button onClick={()=>{ const lib=it.branch||it.library; const q=new URLSearchParams({lib,student_id:it.student_id,renew_from:it.receipt_no}); router.push(`/lma/admissions?${q}`); }} className="py-2 rounded-lg bg-lma-primary/10 text-lma-primary font-bold text-xs">Renew</button>
        <button onClick={onCancel} className="py-2 rounded-lg bg-lma-danger/10 text-lma-danger font-bold text-xs">Cancel</button>
        <button onClick={onDoNotRenew} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Don't Renew</button>
      </div>
    </div>
  );
}

function CancelSheet({ it, init, onClose, post, onDone }:{ it:QueueItem; init:InitData; onClose:()=>void; post:(a:string,p:any)=>Promise<any>; onDone:(title:string,text:string)=>void }){
  const [withRefund,setWithRefund]=useState(false);
  const [remark,setRemark]=useState("");
  const [refundMode,setRefundMode]=useState("");
  const [refundAmount,setRefundAmount]=useState("");
  const [refundReason,setRefundReason]=useState("");
  const [busy,setBusy]=useState(false);

  const submit=async()=>{
    setBusy(true);
    if(withRefund){
      if(!refundMode||!refundAmount){ setBusy(false); return; }
      const r=await post("markReceiptCancelledWithRefund",{receipt_no:it.receipt_no,cancel_remark:remark,refund_mode:refundMode,refund_amount:Number(refundAmount),refund_reason:refundReason});
      setBusy(false);
      if(r&&r.cancelled) onDone("Cancellation + Refund", r.cancel_whatsapp_text||r.refund_whatsapp_text||"");
    }else{
      const r=await post("markReceiptCancelled",{receipt_no:it.receipt_no,cancel_remark:remark});
      setBusy(false);
      if(r&&r.updated) onDone("Cancellation", r.cancel_whatsapp_text||"");
    }
  };

  return (
    <Sheet onClose={onClose}>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Cancel {it.receipt_no}</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">{it.name} · Seat {it.seat_no||"—"} · {it.shift_name||it.shift}</p>
      {it.fees_due_balance>0&&<div className="text-[11px] font-bold text-lma-danger bg-lma-danger/10 rounded-lg p-2 mb-3">⚠ ₹{it.fees_due_balance} dues outstanding on this receipt.</div>}

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={withRefund} onChange={e=>setWithRefund(e.target.checked)} className="w-4 h-4 accent-lma-primary"/>
        <span className="text-sm font-semibold text-lma-slate-700">Issue a refund with this cancellation</span>
      </label>

      {withRefund&&(
        <div className="bg-lma-slate-50 rounded-xl p-3 mb-3 space-y-2">
          <div>
            <L>Refund Mode</L>
            <select value={refundMode} onChange={e=>setRefundMode(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-sm font-medium">
              <option value="">Select…</option>
              {init.paymentTags.filter(t=>t.active).map(t=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
            </select>
          </div>
          <div><L>Refund Amount (₹)</L><I type="number" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)} placeholder="rupees handed back"/></div>
          <div><L>Refund Reason</L><I value={refundReason} onChange={e=>setRefundReason(e.target.value)} placeholder="optional"/></div>
        </div>
      )}

      <L>Cancellation note (optional)</L>
      <I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="why cancelling"/>

      <div className="flex gap-2.5 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Back</button>
        <button onClick={submit} disabled={busy||(withRefund&&(!refundMode||!refundAmount))} className="flex-1 py-3 rounded-xl bg-lma-danger text-white font-bold shadow-md disabled:opacity-50">{busy?"…":withRefund?"Cancel + Refund":"Cancel Booking"}</button>
      </div>
    </Sheet>
  );
}

function Sheet({ onClose, children }:{ onClose:()=>void; children:React.ReactNode }){
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        {children}
      </div>
    </div>
  );
}
function L({ children }:{ children:React.ReactNode }){ return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1">{children}</label>; }
function I(props:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium"/>; }

// ── Reusable confirm dialog (prevents accidental state changes) ──
function ConfirmDialog({c,onClose}:{c:{title:string;message:string;confirmLabel:string;danger?:boolean;onYes:()=>void};onClose:()=>void}){
  const [busy,setBusy]=useState(false);
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40"/>
      <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
        <h4 className="text-sm font-extrabold text-lma-slate-900 mb-1">{c.title}</h4>
        <p className="text-[12px] text-lma-slate-500 mb-4">{c.message}</p>
        <div className="flex gap-2">
          <button disabled={busy} onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm disabled:opacity-50">No</button>
          <button disabled={busy} onClick={async()=>{ setBusy(true); try{ await c.onYes(); } finally { setBusy(false); onClose(); } }} className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50 ${c.danger?"bg-lma-danger":"bg-lma-primary"}`}>{busy?"…":c.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}