"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLMA, useScopeChips, type LMAInitData as InitData } from "../_components/LMAProvider";
import { fmtDMY } from "../_lib/dates";
import CodePill from "../_components/CodePill";
import ReceiptModal from "../_components/ReceiptModal";
import StudentModal from "../_components/StudentModal";
import SearchBar, { matchesSearch } from "../_components/SearchBar";
import Pager, { PAGE_SIZE } from "../_components/Pager";
import BookingFlow from "../_components/BookingFlow";

const API = "/api/lma";

interface QueueItem {
  receipt_no:string; student_id:string; library:string; branch:string; name:string;
  seat_no:string; shift:string; shift_name:string; booking_from:string; booking_to:string;
  fee:number; fees_due_balance:number; dues_status:string; is_cross_library:string;
  status:string; renewed_from:string; lifecycle:string; days_until_expiry:number;
  receipt_text:string; cancel_whatsapp_text?:string;
}

type Tab = "EXPIRING"|"EXPIRED"|"CANCELLED";

// student's HOME library (cross students keep their original ID/sheet)
function homeLib(it:QueueItem){ return (it.is_cross_library&&it.is_cross_library!=="NO") ? it.is_cross_library : (it.branch||it.library); }

function relTime(days:number, kind:"expiring"|"expired"){
  if(kind==="expiring"){ if(days<=0) return "Due today"; if(days===1) return "1 day left"; return `${days} days left`; }
  const d=Math.abs(days); if(d===0) return "Expired today"; if(d===1) return "1 day ago"; return `${d} days ago`;
}

export default function RenewalsPage(){
  const { init, showToast, post } = useLMA();
  const [confirmAction,setConfirmAction]=useState<{title:string;message:string;confirmLabel:string;danger?:boolean;onYes:()=>void}|null>(null);

  const [tab,setTab]=useState<Tab>("EXPIRING");
  const [scope,setScope]=useState("");          // "" = all
  const [expiring,setExpiring]=useState<QueueItem[]>([]);
  const [expired,setExpired]=useState<QueueItem[]>([]);
  const [cancellations,setCancellations]=useState<QueueItem[]>([]);
  const [loading,setLoading]=useState(false);

  const [actionFor,setActionFor]=useState<QueueItem|null>(null);   // cancel/refund sheet
  const [resultText,setResultText]=useState<{title:string;text:string}|null>(null);
  const [openRno,setOpenRno]=useState<string|null>(null);          // ReceiptModal
  const [openStu,setOpenStu]=useState<{id:string;library:string}|null>(null); // StudentModal
  const [renew,setRenew]=useState<QueueItem|null>(null);           // in-place renewal
  const [expSub,setExpSub]=useState<"ALL"|"SOON"|"LATER">("ALL");   // sub-filter inside Expiring
  const [draft,setDraft]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);

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

  useEffect(()=>{ load(); },[scope,load]);

  const doDoNotRenew=async(it:QueueItem)=>{
    const r=await post("markReceiptDoNotRenew",{receipt_no:it.receipt_no});
    if(r){ showToast("Marked Do Not Renew"); load(); }
  };
  const doReset=async(it:QueueItem)=>{
    const r=await post("resetReceiptStatus",{receipt_no:it.receipt_no});
    if(r&&r.reset){ showToast("Status reset to active"); load(); }
    else if(r&&r.error) showToast(r.error,"error");
  };

  const chips = useScopeChips();

  const tabs:{key:Tab;label:string;count:number;bg:string}[]=[
    { key:"EXPIRING",  label:"Expiring",  count:expiring.length,      bg:"#dc2626" },
    { key:"EXPIRED",   label:"Expired",   count:expired.length,       bg:"#6b0a0a" },
    { key:"CANCELLED", label:"Cancelled", count:cancellations.length, bg:"#0f172a" },
  ];

  // split EXPIRING into Soon (within primary window) vs Expiring (secondary) — mirrors seat-chart two-tier code
  const primaryDays=(it:QueueItem)=>{ const s=(init?.settings as any)?.[it.branch||it.library]||(init?.settings as any)?.[it.library]; const n=Number(s?.renewal_alert_days_primary); return n>0?n:3; };
  const tierOf=(it:QueueItem):"soon"|"expiring"=> it.days_until_expiry<=primaryDays(it) ? "soon" : "expiring";
  const expiringF=expiring.filter(it=>matchesSearch(it,search));
  const expiredF=expired.filter(it=>matchesSearch(it,search));
  const cancellationsF=cancellations.filter(it=>matchesSearch(it,search));
  const soonList=expiringF.filter(it=>tierOf(it)==="soon");
  const laterList=expiringF.filter(it=>tierOf(it)==="expiring");
  const expShown = expSub==="SOON"?soonList : expSub==="LATER"?laterList : expiringF;
  useEffect(()=>{ setPage(1); },[tab,search,expSub]);

  const secondaryFor=(it:QueueItem,kind:"expiring"|"expired")=>kind==="expiring"
    ? ()=>setActionFor(it)
    : ()=>setConfirmAction({ title:"Mark Do Not Renew?", message:`${it.name} · ${it.receipt_no} will be flagged DO NOT RENEW and leave the queue.`, confirmLabel:"Don't Renew", danger:true, onYes:()=>doDoNotRenew(it) });

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Renewals</h1><p className="text-[11px] text-lma-slate-500 font-medium">{expiring.length} expiring · {expired.length} expired · {cancellations.length} cancelled</p></div>
        <button onClick={load} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"…":"↻"}</button>
      </header>

      {/* 3-tab segmented control */}
      <div className="bg-white rounded-2xl p-1 flex gap-1 mb-3 shadow-sm">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={tab===t.key?{background:t.bg,color:"#fff"}:undefined} className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${tab===t.key?"":"text-lma-slate-500"}`}>
            {t.label}
            <span className={`text-[10px] leading-none px-1.5 py-0.5 rounded-full ${tab===t.key?"bg-white/25":"bg-lma-slate-100 text-lma-slate-500"}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* scope chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.emoji} {c.label}</button>
        ))}
      </div>

      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      {loading&&expiring.length===0&&expired.length===0&&cancellations.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):tab==="EXPIRING"?(
        expiring.length===0?(
          <div className="text-center text-sm text-lma-slate-500 py-10">Nothing expiring soon 🎉</div>
        ):(
          <>
            <div className="flex gap-1.5 mb-2.5">
              <SubPill active={expSub==="ALL"} onClick={()=>setExpSub("ALL")}>All {expiringF.length}</SubPill>
              <SubPill active={expSub==="SOON"} onClick={()=>setExpSub("SOON")} dot="#dc2626">Soon {soonList.length}</SubPill>
              <SubPill active={expSub==="LATER"} onClick={()=>setExpSub("LATER")} dot="#fca5a5">Expiring {laterList.length}</SubPill>
            </div>
            {expShown.length===0?(
              <div className="text-center text-sm text-lma-slate-500 py-8">None in this group.</div>
            ):(
              <div className="space-y-2">
                {expShown.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(it=>(
                  <ReviewCard key={it.receipt_no} it={it} kind={tierOf(it)}
                    onRenew={()=>setRenew(it)} onSecondary={secondaryFor(it,"expiring")}
                    onRno={()=>setOpenRno(it.receipt_no)} onStu={()=>setOpenStu({id:it.student_id,library:homeLib(it)})}/>
                ))}
                <Pager page={page} totalPages={Math.max(1,Math.ceil(expShown.length/PAGE_SIZE))} onPage={setPage}/>
              </div>
            )}
          </>
        )
      ):tab==="EXPIRED"?(
        expiredF.length===0?(
          <div className="text-center text-sm text-lma-slate-500 py-10">No expired receipts ✨</div>
        ):(
          <div className="space-y-2">
            {expiredF.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(it=>(
              <ReviewCard key={it.receipt_no} it={it} kind="expired"
                onRenew={()=>setRenew(it)} onSecondary={secondaryFor(it,"expired")}
                onRno={()=>setOpenRno(it.receipt_no)} onStu={()=>setOpenStu({id:it.student_id,library:homeLib(it)})}/>
            ))}
            <Pager page={page} totalPages={Math.max(1,Math.ceil(expiredF.length/PAGE_SIZE))} onPage={setPage}/>
          </div>
        )
      ):(
        cancellationsF.length===0?(
          <div className="text-center text-sm text-lma-slate-500 py-10">No cancelled receipts.</div>
        ):(
          <div className="space-y-2">
            {cancellationsF.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(it=>(
              <CancelledCard key={it.receipt_no} it={it} showToast={showToast}
                onRenew={()=>setRenew(it)}
                onReset={()=>setConfirmAction({ title:"Reset status?", message:`${it.name} · ${it.receipt_no} will be set back to active (clears Cancelled/Do-Not-Renew).`, confirmLabel:"Reset", onYes:()=>doReset(it) })}
                onRno={()=>setOpenRno(it.receipt_no)} onStu={()=>setOpenStu({id:it.student_id,library:homeLib(it)})}/>
            ))}
            <Pager page={page} totalPages={Math.max(1,Math.ceil(cancellationsF.length/PAGE_SIZE))} onPage={setPage}/>
          </div>
        )
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
          <a href={`https://wa.me/?text=${encodeURIComponent(resultText.text)}`} target="_blank" rel="noopener noreferrer" className="block text-center w-full mt-3 py-3 rounded-xl bg-lma-accent text-white font-bold shadow-md">Share on WhatsApp</a>
          <button onClick={()=>{navigator.clipboard.writeText(resultText.text);showToast("Copied");}} className="w-full mt-2 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Copy message</button>
        </Sheet>
      )}

      {confirmAction&&<ConfirmDialog c={confirmAction} onClose={()=>setConfirmAction(null)}/>}

      {/* universal modals */}
      {openRno&&<ReceiptModal receiptNo={openRno} onClose={()=>setOpenRno(null)} onSaved={load}/>}
      {openStu&&<StudentModal studentId={openStu.id} library={openStu.library} onClose={()=>setOpenStu(null)} onSaved={load}/>}
      {renew&&<BookingFlow renewReceiptNo={renew.receipt_no} libCode={renew.branch||renew.library} onClose={()=>setRenew(null)} onComplete={load}/>}

    </div>
  );
}

// seat-chart parity palette: soon = solid red, expiring = pink, expired = maroon
const LOOK:Record<"soon"|"expiring"|"expired",{accent:string;pillBg:string;pillFg:string;tint:string}> = {
  soon:     { accent:"#dc2626", pillBg:"#dc2626", pillFg:"#ffffff", tint:"#fff5f5" },
  expiring: { accent:"#fca5a5", pillBg:"#fee2e2", pillFg:"#b91c1c", tint:"#ffffff" },
  expired:  { accent:"#6b0a0a", pillBg:"#6b0a0a", pillFg:"#ffffff", tint:"#ffffff" },
};

// ── Review card (Soon + Expiring + Expired) ──
function ReviewCard({ it, kind, onRenew, onSecondary, onRno, onStu }:{
  it:QueueItem; kind:"soon"|"expiring"|"expired"; onRenew:()=>void; onSecondary:()=>void; onRno:()=>void; onStu:()=>void;
}){
  const lk = LOOK[kind];
  const isExpired = kind==="expired";
  return (
    <div className="rounded-xl p-3 shadow-sm border-l-4" style={{ borderLeftColor:lk.accent, background:lk.tint }}>
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onRno} className="text-sm font-extrabold text-lma-slate-900 hover:text-lma-primary">{it.receipt_no}</button>
        <button onClick={onStu} className="text-[10px] font-bold text-lma-slate-400 hover:text-lma-primary">{it.student_id}</button>
        {it.is_cross_library&&it.is_cross_library!=="NO"&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1 rounded">CROSS</span>}
        <span className="text-[10px] font-extrabold ml-auto px-2 py-0.5 rounded-full" style={{ background:lk.pillBg, color:lk.pillFg }}>{relTime(it.days_until_expiry, isExpired?"expired":"expiring")}</span>
      </div>
      <button onClick={onStu} className="block text-left text-sm font-semibold text-lma-slate-800 truncate hover:text-lma-primary w-full">{it.name}</button>
      <div className="text-[11px] text-lma-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
        <CodePill code={it.branch||it.library}/>
        <span>· Seat {it.seat_no||"—"}</span>
        <span>· {it.shift_name||it.shift}</span>
        <span>· till {fmtDMY(it.booking_to)}</span>
        {it.fees_due_balance>0&&<span className="font-bold text-lma-danger">· Due ₹{it.fees_due_balance}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2.5">
        <button onClick={onRenew} className="py-2 rounded-lg bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-xs shadow-sm">Renew</button>
        {isExpired
          ? <button onClick={onSecondary} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Don&apos;t Renew</button>
          : <button onClick={onSecondary} className="py-2 rounded-lg bg-lma-danger/10 text-lma-danger font-bold text-xs">Cancel</button>}
      </div>
    </div>
  );
}

// ── sub-filter pill (Soon / Expiring toggle) ──
function SubPill({ active, onClick, dot, children }:{ active:boolean; onClick:()=>void; dot?:string; children:React.ReactNode }){
  return (
    <button onClick={onClick} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition ${active?"bg-lma-slate-900 text-white":"bg-white text-lma-slate-600 shadow-sm"}`}>
      {dot&&<span className="w-2 h-2 rounded-full" style={{background:dot}}/>}
      {children}
    </button>
  );
}

// ── Cancelled card ──
function CancelledCard({ it, onRenew, onReset, onRno, onStu, showToast }:{
  it:QueueItem; onRenew:()=>void; onReset:()=>void; onRno:()=>void; onStu:()=>void; showToast:(m:string,t?:"success"|"error")=>void;
}){
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border-l-4 border-lma-slate-300">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onRno} className="text-sm font-extrabold text-lma-slate-900 hover:text-lma-primary">{it.receipt_no}</button>
        <button onClick={onStu} className="text-[10px] font-bold text-lma-slate-400 hover:text-lma-primary">{it.student_id}</button>
        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full ml-auto bg-lma-danger/15 text-lma-danger tracking-wide">CANCELLED</span>
      </div>
      <button onClick={onStu} className="block text-left text-sm font-semibold text-lma-slate-800 truncate hover:text-lma-primary w-full">{it.name}</button>
      <div className="text-[11px] text-lma-slate-500 mt-0.5"><CodePill code={it.branch||it.library}/> · Seat {it.seat_no||"—"} · {it.shift_name||it.shift} · was till {fmtDMY(it.booking_to)}</div>
      <div className={`grid ${it.cancel_whatsapp_text?"grid-cols-3":"grid-cols-2"} gap-2 mt-2.5`}>
        <button onClick={onRenew} className="py-2 rounded-lg bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-xs shadow-sm">Renew</button>
        {it.cancel_whatsapp_text&&<button onClick={()=>{navigator.clipboard.writeText(it.cancel_whatsapp_text!);showToast("Copied cancel message");}} className="py-2 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs">Copy WA</button>}
        <button onClick={onReset} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Undo</button>
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