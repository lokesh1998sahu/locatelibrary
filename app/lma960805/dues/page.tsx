"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useLMA, useScopeChips, type LMAInitData as InitData } from "../_components/LMAProvider";
import { fmtDMY, toIsoInput, inDateRange } from "../_lib/dates";
import CodePill from "../_components/CodePill";
import ReceiptModal from "../_components/ReceiptModal";
import StudentModal from "../_components/StudentModal";
import SearchBar, { matchesSearch } from "../_components/SearchBar";
import DateRangeFilter from "../_components/DateRangeFilter";
import Pager, { PAGE_SIZE } from "../_components/Pager";

const API = "/api/lma960805";

// FEES_DUE_LOG headers (exact): s_no, payment_id, receipt_no, student_id, library,
//   branch, name, phone, payment_mode, payment_fees_mode, amount_received,
//   balance_before, balance_after, received_on, notes, whatsapp_text

// PendingDue / Irrecoverable come from RECEIPT_LOG via getPendingDues / getIrrecoverableDues.
// Fields below are the standard RECEIPT_LOG mapping used across LMA (mapReceiptRow).
interface PendingDue {
  receipt_no:string; student_id:string; library:string; branch:string; name:string;
  seat_no:string; shift:string; shift_name:string; booking_to:string;
  fees_due:number; fees_due_balance:number; dues_status:string;
}
interface DuePayment {
  payment_id:string; receipt_no:string; student_id:string; library:string; branch:string;
  name:string; phone:string; payment_mode:string; payment_fees_mode:string;
  amount_received:number; balance_before:number; balance_after:number;
  received_on:string; notes:string; whatsapp_text:string;
}
interface Irrecoverable {
  receipt_no:string; student_id:string; library:string; branch:string; name:string;
  fees_due_balance:number; irrecoverable_remark:string; irrecoverable_whatsapp_text:string;
}

type Tab = "PENDING"|"PAYMENTS"|"IRRECOVERABLE";

function homeLib(it:any){ return (it.is_cross_library && it.is_cross_library!=="NO") ? it.is_cross_library : (it.branch||it.library); }

export default function DuesPage(){
  const { init, showToast, post } = useLMA();
  const [openRno, setOpenRno] = useState<string|null>(null);
  const [openStu, setOpenStu] = useState<{ id:string; library:string }|null>(null);
  const [confirmAction,setConfirmAction]=useState<{title:string;message:string;confirmLabel:string;danger?:boolean;onYes:()=>void}|null>(null);

  const [tab,setTab]=useState<Tab>("PENDING");
  const [dFrom,setDFrom]=useState(""); const [dTo,setDTo]=useState("");
  const [scope,setScope]=useState("");
  const [pending,setPending]=useState<PendingDue[]>([]);
  const [payments,setPayments]=useState<DuePayment[]>([]);
  const [irrec,setIrrec]=useState<Irrecoverable[]>([]);
  const [pendingSum,setPendingSum]=useState(0);
  const [draft,setDraft]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(false);

  const [payFor,setPayFor]=useState<PendingDue|null>(null);
  const [irrecFor,setIrrecFor]=useState<PendingDue|null>(null);
  const [resultText,setResultText]=useState<{title:string;text:string}|null>(null);




  const load=useCallback(async()=>{
    setLoading(true);
    const p=new URLSearchParams(); if(scope) p.set("library",scope);
    const [pd,pl,ir]=await Promise.all([
      fetch(`${API}?action=getPendingDues&${p}`).then(r=>r.json()),
      fetch(`${API}?action=getDuePaymentLog&${p}&page=1&limit=30`).then(r=>r.json()),
      fetch(`${API}?action=getIrrecoverableDues&${p}`).then(r=>r.json()),
    ]);
    setLoading(false);

    // PENDING — getPendingDues returns array under `pending` (mapReceiptRow rows), no sum
    const pdList:PendingDue[]=(pd.pending||[]).map((x:any)=>({
      receipt_no:String(x.receipt_no||""), student_id:String(x.student_id||""),
      library:String(x.library||""), branch:String(x.branch||""), name:String(x.name||""),
      seat_no:String(x.seat_no||""), shift:String(x.shift||""), shift_name:String(x.shift_name||""),
      booking_to:String(x.booking_to||""), fees_due:Number(x.fees_due||0),
      fees_due_balance:Number(x.fees_due_balance||0), dues_status:String(x.dues_status||""),
    }));
    setPending(pdList);
    setPendingSum(typeof pd.sum==="number"?pd.sum:pdList.reduce((s,d)=>s+d.fees_due_balance,0));

    // PAYMENTS — getDuePaymentLog returns array under `payments` (exact FEES_DUE_LOG headers)
    const plList:DuePayment[]=(pl.payments||[]).map((x:any)=>({
      payment_id:String(x.payment_id||""), receipt_no:String(x.receipt_no||""),
      student_id:String(x.student_id||""), library:String(x.library||""), branch:String(x.branch||""),
      name:String(x.name||""), phone:String(x.phone||""),
      payment_mode:String(x.payment_mode||""), payment_fees_mode:String(x.payment_fees_mode||""),
      amount_received:Number(x.amount_received||0), balance_before:Number(x.balance_before||0),
      balance_after:Number(x.balance_after||0), received_on:String(x.received_on||""),
      notes:String(x.notes||""), whatsapp_text:String(x.whatsapp_text||""),
    }));
    setPayments(plList);

    // IRRECOVERABLE — getIrrecoverableDues returns array under `items`
    const irList:Irrecoverable[]=(ir.items||[]).map((x:any)=>({
      receipt_no:String(x.receipt_no||""), student_id:String(x.student_id||""),
      library:String(x.library||""), branch:String(x.branch||""), name:String(x.name||""),
      fees_due_balance:Number(x.fees_due_balance||0),
      irrecoverable_remark:String(x.irrecoverable_remark||""),
      irrecoverable_whatsapp_text:String(x.irrecoverable_whatsapp_text||""),
    }));
    setIrrec(irList);
  },[scope]);

  useEffect(()=>{ load(); },[scope,load]);


  const chips = useScopeChips();
  const pendingF=pending.filter(d=>matchesSearch(d,search) && inDateRange(d.booking_to,dFrom,dTo));
  const paymentsF=payments.filter(p=>matchesSearch(p,search) && inDateRange(p.received_on,dFrom,dTo));
  const irrecF=irrec.filter(d=>matchesSearch(d,search));
  useEffect(()=>{ setPage(1); },[tab,search]);

  return (
   <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      {openRno && <ReceiptModal receiptNo={openRno} context="dues" onClose={()=>setOpenRno(null)} onSaved={load}/>}
      {openStu && <StudentModal studentId={openStu.id} library={openStu.library} onClose={()=>setOpenStu(null)} onSaved={load}/>}
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma960805" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Dues</h1><p className="text-[11px] text-lma-slate-500 font-medium">{pending.length} pending · ₹{pendingSum} outstanding</p></div>
        <button onClick={load} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      <div className="bg-white rounded-2xl p-1 flex gap-1 mb-3 shadow-sm">
        <button onClick={()=>setTab("PENDING")} className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition ${tab==="PENDING"?"bg-lma-slate-900 text-white":"text-lma-slate-500"}`}>Pending ({pending.length})</button>
        <button onClick={()=>setTab("PAYMENTS")} className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition ${tab==="PAYMENTS"?"bg-lma-slate-900 text-white":"text-lma-slate-500"}`}>Payments</button>
        <button onClick={()=>setTab("IRRECOVERABLE")} className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition ${tab==="IRRECOVERABLE"?"bg-lma-slate-900 text-white":"text-lma-slate-500"}`}>Written-off ({irrec.length})</button>
      </div>

      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.emoji} {c.label}</button>
        ))}
      </div>

      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      {tab!=="IRRECOVERABLE" && <DateRangeFilter from={dFrom} to={dTo} onChange={(f,t)=>{setDFrom(f);setDTo(t);setPage(1);}} className="mt-2"/>}
      {loading&&pending.length===0&&payments.length===0&&irrec.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):tab==="PENDING"?(
        pendingF.length===0?(
          <div className="text-center text-sm text-lma-slate-500 py-8">No pending dues. 🎉</div>
        ):(
          <div className="space-y-2">
            {pendingF.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(d=>(
              <div key={d.receipt_no} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-extrabold text-lma-slate-900">{d.receipt_no}</span>
                  <button onClick={()=>setOpenStu({id:d.student_id,library:homeLib(d)})} className="text-[10px] font-bold text-lma-slate-400 underline decoration-dotted">{d.student_id}</button>  
                  <span className="text-sm font-extrabold text-lma-danger ml-auto">₹{d.fees_due_balance}</span>
                </div>
                <button onClick={()=>setOpenStu({id:d.student_id,library:homeLib(d)})} className="block w-full text-left text-sm font-semibold text-lma-slate-800 truncate hover:underline">{d.name}</button>
                <div className="text-[11px] text-lma-slate-500 mt-0.5"><CodePill code={d.branch||d.library}/> · Seat {d.seat_no||"—"} · {d.shift_name||d.shift} · till {fmtDMY(d.booking_to)}</div>
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <button onClick={()=>setPayFor(d)} className="py-2 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs">Log Payment</button>
                  <button onClick={()=>setIrrecFor(d)} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Write Off</button>
                </div>
              </div>
            ))}
            <Pager page={page} totalPages={Math.max(1,Math.ceil(pendingF.length/PAGE_SIZE))} onPage={setPage}/>
          </div>
        )
      ):tab==="PAYMENTS"?(
        paymentsF.length===0?(
          <div className="text-center text-sm text-lma-slate-500 py-8">No payments logged yet.</div>
        ):(
          <div className="space-y-2">
            {paymentsF.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(p=>(
              <div key={p.payment_id} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={()=>setOpenRno(p.receipt_no)} className="text-sm font-extrabold text-lma-primary underline decoration-dotted">{p.receipt_no}</button>
                  {p.name&&<span className="text-[11px] text-lma-slate-500 truncate">{p.name}</span>}
                  <span className="text-sm font-extrabold text-lma-accent ml-auto">+₹{p.amount_received}</span>
                </div>
                <div className="text-[11px] text-lma-slate-500">{p.payment_mode} · {fmtDMY(p.received_on)} · ₹{p.balance_before}→₹{p.balance_after}</div>
                {p.notes&&<div className="text-[11px] text-lma-slate-400 mt-0.5">{p.notes}</div>}
                {p.whatsapp_text&&<button onClick={()=>{navigator.clipboard.writeText(p.whatsapp_text);showToast("Copied receipt message");}} className="mt-2 py-1.5 px-3 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs">Copy WhatsApp</button>}
              </div>
            ))}
            <Pager page={page} totalPages={Math.max(1,Math.ceil(paymentsF.length/PAGE_SIZE))} onPage={setPage}/>
          </div>
        )
      ):(
        irrecF.length===0?(
          <div className="text-center text-sm text-lma-slate-500 py-8">No written-off dues.</div>
        ):(
          <div className="space-y-2">
            {irrecF.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(d=>(
              <div key={d.receipt_no} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-extrabold text-lma-slate-900">{d.receipt_no}</span>
                  <span className="text-[10px] font-bold text-lma-slate-400">{d.student_id}</span>
                  <span className="text-sm font-extrabold text-lma-slate-500 ml-auto line-through">₹{d.fees_due_balance}</span>
                </div>
                <div className="text-sm font-semibold text-lma-slate-800 truncate">{d.name}</div>
                <div className="text-[11px] text-lma-slate-500 mt-0.5"><CodePill code={d.branch||d.library}/></div>
                {d.irrecoverable_remark&&<div className="text-[11px] text-lma-slate-400 mt-0.5">Note: {d.irrecoverable_remark}</div>}
                <button onClick={()=>setConfirmAction({ title:"Restore to Pending?", message:`${d.name} · ${d.receipt_no} — ₹${d.fees_due_balance} will be moved back to PENDING dues.`, confirmLabel:"Restore", onYes:async()=>{ const r=await post("unmarkDuesIrrecoverable",{receipt_no:d.receipt_no}); if(r){showToast("Restored to pending");load();} } })} className="mt-2 py-1.5 px-3 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Restore to Pending</button>
              </div>
            ))}
            <Pager page={page} totalPages={Math.max(1,Math.ceil(irrecF.length/PAGE_SIZE))} onPage={setPage}/>
          </div>
        )
      )}

      {payFor&&init&&(
        <PaymentSheet due={payFor} init={init} onClose={()=>setPayFor(null)} post={post}
          onDone={(text)=>{ setPayFor(null); if(text)setResultText({title:"Payment Receipt",text}); showToast("Payment logged"); load(); }}/>
      )}

      {irrecFor&&(
        <Sheet onClose={()=>setIrrecFor(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Write off {irrecFor.receipt_no}</h3>
          <p className="text-[11px] text-lma-slate-500 mb-3">{irrecFor.name} · ₹{irrecFor.fees_due_balance} outstanding</p>
          <div className="text-[11px] text-lma-warn bg-lma-warn/10 rounded-lg p-2 mb-3">Marks these dues as irrecoverable (won't be collected). Reversible later.</div>
          <WriteOffForm onCancel={()=>setIrrecFor(null)} onSubmit={async(remark)=>{ const r=await post("markDuesIrrecoverable",{receipt_no:irrecFor.receipt_no,remark}); if(r){ setIrrecFor(null); if(r.irrecoverable_whatsapp_text)setResultText({title:"Write-off notice",text:r.irrecoverable_whatsapp_text}); showToast("Marked irrecoverable"); load(); } }}/>
        </Sheet>
      )}

      {resultText&&(
        <Sheet onClose={()=>setResultText(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-3">{resultText.title}</h3>
          <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-60 overflow-y-auto">{resultText.text}</pre>
          <button onClick={()=>{navigator.clipboard.writeText(resultText.text);showToast("Copied");}} className="w-full mt-3 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">Copy message</button>
          <button onClick={()=>setResultText(null)} className="w-full mt-2 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Close</button>
        </Sheet>
      )}

      {confirmAction&&<ConfirmDialog c={confirmAction} onClose={()=>setConfirmAction(null)}/>}

    </div>
  );
}

function PaymentSheet({ due, init, onClose, post, onDone }:{ due:PendingDue; init:InitData; onClose:()=>void; post:(a:string,p:any)=>Promise<any>; onDone:(text:string)=>void }){
  const [mode,setMode]=useState("");
  const [amount,setAmount]=useState(String(due.fees_due_balance));
  const [date,setDate]=useState((()=>{const d=new Date();return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`;})());
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);

  const submit=async()=>{
    if(!mode||!amount){ return; }
    setBusy(true);
    // payload keys match logFeePayment params (receipt_no, payment_mode, amount_received, notes)
    const r=await post("logFeePayment",{receipt_no:due.receipt_no,payment_mode:mode,amount_received:Number(amount),notes,receipt_date:date});
    setBusy(false);
    // logFeePayment returns the new FEES_DUE_LOG row's whatsapp_text
    if(r) onDone(String(r.whatsapp_text||""));
  };

  return (
    <Sheet onClose={onClose}>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Log Payment · {due.receipt_no}</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">{due.name} · ₹{due.fees_due_balance} outstanding</p>
      <L>Payment Mode</L>
      <select value={mode} onChange={e=>setMode(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium mb-2">
        <option value="">Select…</option>
        {init.paymentTags.filter(t=>t.active).map(t=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
      </select>
      <L>Amount Received (₹)</L>
      <I type="number" value={amount} onChange={e=>setAmount(e.target.value)} max={due.fees_due_balance}/>
      <p className="text-[11px] text-lma-slate-500 mt-1">New balance will be ₹{Math.max(0,due.fees_due_balance-(Number(amount)||0))}.</p>
      <L>Note (optional)</L>
      <I value={notes} onChange={e=>setNotes(e.target.value)} placeholder="optional"/>
      <L>Date</L>
      <I type="date" value={toIsoInput(date)} onChange={e=>setDate(e.target.value)}/>{date && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(date)}</span>}
      <div className="flex gap-2.5 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        <button onClick={submit} disabled={busy||!mode||!amount} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50">{busy?"…":"Log Payment"}</button>
      </div>
    </Sheet>
  );
}

function WriteOffForm({ onCancel, onSubmit }:{ onCancel:()=>void; onSubmit:(remark:string)=>void }){
  const [remark,setRemark]=useState("");
  return (
    <>
      <L>Reason (optional)</L>
      <I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="why writing off"/>
      <div className="flex gap-2.5 mt-4">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        <button onClick={()=>onSubmit(remark)} className="flex-1 py-3 rounded-xl bg-lma-danger text-white font-bold shadow-md">Write Off</button>
      </div>
    </>
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
function L({ children }:{ children:React.ReactNode }){ return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1 mt-2">{children}</label>; }
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