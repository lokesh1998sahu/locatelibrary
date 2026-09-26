"use client";
// LMA — Dues. What is still owed, what has been collected, what was written off.
// Same data and actions as before (getPendingDues · getDuePaymentLog ·
// getIrrecoverableDues · logFeePayment · markDuesIrrecoverable ·
// unmarkDuesIrrecoverable). New look; collecting uses the keypad and tag chips.

import { useState, useEffect, useCallback } from "react";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { fmtDMY, fmtDMYT, toIsoInput, inDateRange } from "../_lib/dates";
import ReceiptModal from "../_components/ReceiptModal";
import StudentModal from "../_components/StudentModal";
import SearchBar, { matchesSearch } from "../_components/SearchBar";
import DateRangeFilter from "../_components/DateRangeFilter";
import Pager, { PAGE_SIZE } from "../_components/Pager";
import WhatsAppButton from "../_components/WhatsAppButton";
import { buildDuesReminder } from "../_lib/reminderText";
import { TagBankNote, TagChips, BankCheck } from "../_components/TagBank";
import { Screen, Card, ScopeChips, Sheet, Button, Skeleton, Empty, IconButton, AmountPad, DateChips, TextInput, cx } from "../_ui/kit";
import { IconRefresh, IconWallet } from "../_ui/icons";
import { inr, todayIso, shiftIso, dayLabel } from "../_ui/format";

const API = "/api/lma960805";

// FEES_DUE_LOG headers (exact): s_no, payment_id, receipt_no, student_id, library,
//   branch, name, phone, payment_mode, payment_fees_mode, amount_received,
//   balance_before, balance_after, received_on, notes, whatsapp_text
interface PendingDue {
  receipt_no:string; student_id:string; library:string; branch:string; name:string;
  seat_no:string; shift:string; shift_name:string; booking_to:string;
  fees_due:number; fees_due_balance:number; dues_status:string; phones?:{number:string;tag:string}[]; remark?:string;
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
const daysAgo = (iso:string) => Math.round((new Date(todayIso()+"T00:00:00").getTime()-new Date(iso+"T00:00:00").getTime())/86400000);
const dmyOf = (iso:string) => { const d=new Date(iso+"T00:00:00"); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; };
const EDITED = /\s*\(EDITED\)\s*$/;
const keyRules = (s:string,k:string) => { if(k==="<") return s.slice(0,-1); if(k==="."&&s.includes(".")) return s; if(s.replace(".","").length>=8) return s; return (s+k).replace(/^0(?=\d)/,""); };

export default function DuesPage(){
  const { init, showToast, post, confirm: ask } = useLMA();
  const duesReminder=(d:PendingDue)=>{ const libName=(init?.libraries?.find(l=>l.library_code===d.library)?.display_name)||d.library; return buildDuesReminder(d.name, libName, d.fees_due_balance); };
  const [openRno,setOpenRno]=useState<string|null>(null);
  const [openStu,setOpenStu]=useState<{ id:string; library:string }|null>(null);
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
  const [loaded,setLoaded]=useState(false);
  const [payFor,setPayFor]=useState<PendingDue|null>(null);
  const [irrecFor,setIrrecFor]=useState<PendingDue|null>(null);
  const [editPay,setEditPay]=useState<DuePayment|null>(null);   // a collected payment being corrected
  const [resultText,setResultText]=useState<{title:string;text:string;phones?:{number:string;tag:string}[]}|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const p=new URLSearchParams();   // all scopes; filtered here
      const [pd,pl,ir]=await Promise.all([
        fetch(`${API}?action=getPendingDues&${p}`).then(r=>r.json()),
        fetch(`${API}?action=getDuePaymentLog&${p}&all=1&page=1&limit=30`).then(r=>r.json()),
        fetch(`${API}?action=getIrrecoverableDues&${p}`).then(r=>r.json()),
      ]);
      const pdList:PendingDue[]=(pd.pending||[]).map((x:any)=>({
        receipt_no:String(x.receipt_no||""), student_id:String(x.student_id||""),
        library:String(x.library||""), branch:String(x.branch||""), name:String(x.name||""),
        seat_no:String(x.seat_no||""), shift:String(x.shift||""), shift_name:String(x.shift_name||""),
        booking_to:String(x.booking_to||""), fees_due:Number(x.fees_due||0),
        fees_due_balance:Number(x.fees_due_balance||0), dues_status:String(x.dues_status||""),
        phones:Array.isArray(x.phones)?x.phones:[], remark:String(x.remark||""),
      }));
      setPending(pdList);
      setPendingSum(typeof pd.sum==="number"?pd.sum:pdList.reduce((s,d)=>s+d.fees_due_balance,0));
      setPayments((pl.payments||[]).map((x:any)=>({
        payment_id:String(x.payment_id||""), receipt_no:String(x.receipt_no||""),
        student_id:String(x.student_id||""), library:String(x.library||""), branch:String(x.branch||""),
        name:String(x.name||""), phone:String(x.phone||""),
        payment_mode:String(x.payment_mode||""), payment_fees_mode:String(x.payment_fees_mode||""),
        amount_received:Number(x.amount_received||0), balance_before:Number(x.balance_before||0),
        balance_after:Number(x.balance_after||0), received_on:String(x.received_on||""),
        notes:String(x.notes||""), whatsapp_text:String(x.whatsapp_text||""),
      })));
      setIrrec((ir.items||[]).map((x:any)=>({
        receipt_no:String(x.receipt_no||""), student_id:String(x.student_id||""),
        library:String(x.library||""), branch:String(x.branch||""), name:String(x.name||""),
        fees_due_balance:Number(x.fees_due_balance||0),
        irrecoverable_remark:String(x.irrecoverable_remark||""),
        irrecoverable_whatsapp_text:String(x.irrecoverable_whatsapp_text||""),
      })));
    }catch{ showToast("Couldn’t load dues","error"); }
    setLoading(false); setLoaded(true);
  },[showToast]);
  useEffect(()=>{ load(); },[load]);

  const chips = useScopeChips();
  const pendingBase=pending.filter(d=>matchesSearch(d,search) && inDateRange(d.booking_to,dFrom,dTo));
  const paymentsBase=payments.filter(p=>matchesSearch(p,search) && inDateRange(p.received_on,dFrom,dTo));
  const irrecBase=irrec.filter(d=>matchesSearch(d,search));
  const activeBase:any[]=tab==="PENDING"?pendingBase:tab==="PAYMENTS"?paymentsBase:irrecBase;
  const counts:Record<string,number>={"":activeBase.length}; activeBase.forEach(it=>{ const k=homeLib(it); if(k) counts[k]=(counts[k]||0)+1; });
  const pendingF=scope?pendingBase.filter(d=>homeLib(d)===scope):pendingBase;
  const paymentsF=scope?paymentsBase.filter(p=>homeLib(p)===scope):paymentsBase;
  const irrecF=scope?irrecBase.filter(d=>homeLib(d)===scope):irrecBase;
  useEffect(()=>{ setPage(1); },[tab,search,scope,dFrom,dTo]);

  const shownSum = tab==="PENDING" ? pendingF.reduce((s,d)=>s+d.fees_due_balance,0)
    : tab==="PAYMENTS" ? paymentsF.reduce((s,p)=>s+p.amount_received,0) : irrecF.reduce((s,d)=>s+d.fees_due_balance,0);
  const shownCount = tab==="PENDING" ? pendingF.length : tab==="PAYMENTS" ? paymentsF.length : irrecF.length;
  const list:any[] = tab==="PENDING" ? pendingF : tab==="PAYMENTS" ? paymentsF : irrecF;
  const shown = list.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const restore=async(d:Irrecoverable)=>{
    if(!(await ask({ title:"Move back to pending?", body:`${d.name} · ${d.receipt_no} — ${inr(d.fees_due_balance)} goes back to pending dues.`, confirmLabel:"Move back" }))) return;
    const r=await post("unmarkDuesIrrecoverable",{receipt_no:d.receipt_no});
    if(r){ showToast("Moved back to pending"); load(); }
  };

  return (
    <Screen>
      <header className="flex items-start gap-2 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Dues</h1>
          <p className="mt-0.5 text-[12.5px] text-lma-ink-3">{pending.length} pending · {inr(pendingSum)} outstanding</p>
        </div>
        <IconButton label="Refresh" onClick={load} className="-mr-2"><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>
      </header>

      <div role="tablist" className="mb-3 grid grid-cols-3 gap-1 rounded-[16px] bg-lma-surface p-1 ring-1 ring-inset ring-lma-line">
        {([["PENDING","Pending",pending.length],["PAYMENTS","Collected",payments.length],["IRRECOVERABLE","Written off",irrec.length]] as [Tab,string,number][]).map(([k,l,n])=>{ const on=tab===k; return (
          <button key={k} role="tab" aria-selected={on} type="button" onClick={()=>setTab(k)}
            className={cx("lma-btn flex h-11 items-center justify-center gap-1.5 rounded-[12px] text-[13px] font-semibold", on?"lma-glass-btn text-white":"text-lma-ink-2 active:bg-lma-bg")}>
            {l}<span className={cx("rounded-full px-1.5 font-lma-mono text-[11.5px] font-bold", on?"bg-white/25":"bg-lma-bg text-lma-ink-3")}>{n}</span>
          </button>
        ); })}
      </div>

      <ScopeChips chips={chips} value={scope} onChange={setScope} counts={counts}/>

      <section className={cx("mb-3 rounded-[22px] p-5 text-white", tab==="PENDING"?"":"lma-glass-dark")}
        style={tab==="PENDING"?{ background:"radial-gradient(120% 90% at 0% 0%, rgb(255 255 255 / .2), transparent 55%), linear-gradient(160deg,#f59e0b 0%,#d97706 55%,#92400e 100%)", boxShadow:"0 22px 44px -22px rgb(146 64 14 / .7)" }:undefined}>
        <div className="text-[13px] font-semibold text-white/80">{tab==="PENDING"?"Outstanding":tab==="PAYMENTS"?"Collected (last 30 shown)":"Written off"}{scope?` · ${scope}`:""}</div>
        <div className="mt-1 font-lma-mono text-[32px] font-medium leading-none tracking-[-0.02em]">{inr(shownSum)}</div>
        <div className="mt-1.5 text-[12px] text-white/80">{shownCount} {tab==="PAYMENTS"?(shownCount===1?"payment":"payments"):(shownCount===1?"student":"students")}</div>
      </section>

      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      {tab!=="IRRECOVERABLE" && <DateRangeFilter from={dFrom} to={dTo} onChange={(f,t)=>{setDFrom(f);setDTo(t);setPage(1);}} className="mb-3"/>}

      {!loaded||(loading&&pending.length===0&&payments.length===0&&irrec.length===0) ? (
        <div className="space-y-2">{[0,1,2].map(i=><Card key={i}><Skeleton className="h-4 w-40"/><Skeleton className="mt-2 h-3 w-52"/><Skeleton className="mt-3 h-11"/></Card>)}</div>
      ) : list.length===0 ? (
        <Card><Empty icon={<IconWallet size={22}/>} title={tab==="PENDING"?"No pending dues":tab==="PAYMENTS"?"No payments collected yet":"Nothing written off"}/></Card>
      ) : (
        <div className="space-y-2 pb-4">
          {tab==="PENDING" && (shown as PendingDue[]).map(d=>(
            <div key={d.receipt_no} className="flex overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
              <span aria-hidden="true" className="w-1.5 shrink-0 bg-[#f59e0b]"/>
              <div className="min-w-0 flex-1 p-3.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15.5px] font-bold leading-snug text-lma-ink">{d.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-lma-ink-3">
                      <span className="font-semibold text-lma-ink-2">{d.branch||d.library}</span>
                      <span aria-hidden="true">·</span><span>Seat {d.seat_no||"—"}</span>
                      <span aria-hidden="true">·</span><span>{d.shift_name||d.shift}</span>
                      <span aria-hidden="true">·</span><span>till {fmtDMY(d.booking_to)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-[#fef3c7] px-2 py-0.5 font-lma-mono text-[14px] font-bold text-[#92400e] ring-1 ring-inset ring-[#f5d88a]">{inr(d.fees_due_balance)}</span>
                </div>
                {d.remark&&<div className="mt-1.5 truncate text-[12px] italic text-lma-ink-3">{d.remark}</div>}
                <Refs studentId={d.student_id} receiptNo={d.receipt_no} onStu={()=>setOpenStu({id:d.student_id,library:homeLib(d)})} onRno={()=>setOpenRno(d.receipt_no)}/>
                <div className="mt-3 grid grid-cols-[1.25fr_1fr_1fr] gap-2">
                  <button type="button" onClick={()=>setPayFor(d)} className="h-11 rounded-[12px] text-[14px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28)]"
                    style={{ background:"linear-gradient(180deg,#f5a524 0%,#d97706 60%,#b45309 100%)" }}>Collect</button>
                  <WhatsAppButton phones={d.phones} chat text={duesReminder(d)} variants={[{label:"Dues reminder",text:duesReminder(d)}]} label="WhatsApp"
                    className="h-11 w-full whitespace-nowrap rounded-[12px] bg-[#e3f6ec] text-[13px] font-semibold text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8] disabled:opacity-40"/>
                  <button type="button" onClick={()=>setIrrecFor(d)} className="h-11 whitespace-nowrap rounded-[12px] bg-lma-surface text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Write off</button>
                </div>
              </div>
            </div>
          ))}

          {tab==="PAYMENTS" && (shown as DuePayment[]).map(p=>(
            <div key={p.payment_id} className="rounded-[18px] border border-lma-line bg-lma-surface p-3.5 shadow-lma-card">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-lma-ink">{p.name||p.receipt_no}</div>
                  <div className="mt-0.5 text-[12px] text-lma-ink-3">{p.payment_mode} · {fmtDMYT(p.received_on.replace(EDITED,""))}{EDITED.test(p.received_on)&&<span className="ml-1.5 rounded bg-lma-bg px-1 text-[10.5px] font-bold text-lma-ink-3 ring-1 ring-inset ring-lma-line">edited</span>}</div>
                  <div className="mt-0.5 font-lma-mono text-[12px] text-lma-ink-3">owed {inr(p.balance_before)} → {inr(p.balance_after)}</div>
                </div>
                <span className="shrink-0 font-lma-mono text-[15px] font-semibold text-lma-in">+{inr(p.amount_received)}</span>
              </div>
              {p.notes&&<div className="mt-1.5 text-[12px] text-lma-ink-3">{p.notes}</div>}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" onClick={()=>setOpenRno(p.receipt_no)} className="inline-flex h-9 items-center rounded-[10px] bg-lma-bg px-2.5 font-lma-mono text-[12.5px] font-semibold text-lma-ink ring-1 ring-inset ring-lma-line">{p.receipt_no} ↗</button>
                <button type="button" onClick={()=>setEditPay(p)} className="h-9 rounded-[10px] bg-lma-brand-soft px-3 text-[12.5px] font-semibold text-lma-brand ring-1 ring-inset ring-[#dcdffb]">Edit</button>
                {p.whatsapp_text&&<button type="button" onClick={()=>{ navigator.clipboard.writeText(p.whatsapp_text); showToast("Copied receipt message"); }}
                  className="h-9 rounded-[10px] bg-[#e3f6ec] px-3 text-[12.5px] font-semibold text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8]">Copy message</button>}
              </div>
            </div>
          ))}

          {tab==="IRRECOVERABLE" && (shown as Irrecoverable[]).map(d=>(
            <div key={d.receipt_no} className="rounded-[18px] border border-lma-line bg-lma-surface p-3.5 shadow-lma-card">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-lma-ink">{d.name}</div>
                  <div className="mt-0.5 font-lma-mono text-[12px] text-lma-ink-3">{d.branch||d.library} · {d.receipt_no} · {d.student_id}</div>
                </div>
                <span className="shrink-0 font-lma-mono text-[14px] font-semibold text-lma-ink-3 line-through">{inr(d.fees_due_balance)}</span>
              </div>
              {d.irrecoverable_remark&&<div className="mt-1.5 text-[12px] text-lma-ink-3">Note: {d.irrecoverable_remark}</div>}
              <Button variant="secondary" full className="mt-2.5 h-11" onClick={()=>restore(d)}>Move back to pending</Button>
            </div>
          ))}
          <Pager page={page} totalPages={Math.max(1,Math.ceil(list.length/PAGE_SIZE))} onPage={setPage}/>
        </div>
      )}

      <Sheet open={!!payFor&&!!init} onClose={()=>setPayFor(null)} title={payFor?`Collect · ${payFor.name}`:""}>
        {payFor&&(
          <PaymentForm key={payFor.receipt_no} due={payFor} post={post}
            onDone={(text)=>{ const ph=payFor.phones; setPayFor(null); if(text) setResultText({title:"Payment receipt",text,phones:ph}); showToast("Payment logged"); load(); }}/>
        )}
      </Sheet>

      <Sheet open={!!editPay&&!!init} onClose={()=>setEditPay(null)} title={editPay?`Edit payment · ${editPay.name||editPay.receipt_no}`:""}>
        {editPay&&(
          <EditPaymentForm key={editPay.payment_id} pay={editPay} post={post}
            onDone={()=>{ setEditPay(null); showToast("Payment updated"); load(); }}/>
        )}
      </Sheet>

      <Sheet open={!!irrecFor} onClose={()=>setIrrecFor(null)} title={irrecFor?`Write off ${irrecFor.receipt_no}`:""}>
        {irrecFor&&(
          <WriteOffForm due={irrecFor} onCancel={()=>setIrrecFor(null)} onSubmit={async(remark)=>{
            const r=await post("markDuesIrrecoverable",{receipt_no:irrecFor.receipt_no,remark});
            if(r){ setIrrecFor(null); if(r.irrecoverable_whatsapp_text) setResultText({title:"Write-off notice",text:r.irrecoverable_whatsapp_text}); showToast("Marked irrecoverable"); load(); }
          }}/>
        )}
      </Sheet>

      <Sheet open={!!resultText} onClose={()=>setResultText(null)} title={resultText?.title||""}>
        {resultText&&(
          <div className="pb-2">
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-[14px] border border-lma-line bg-lma-surface p-3 font-lma-mono text-[12px] leading-relaxed text-lma-ink-2">{resultText.text}</pre>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              {resultText.phones
                ? <WhatsAppButton phones={resultText.phones} text={resultText.text} label="Send on WhatsApp" className="h-12 w-full rounded-[14px] bg-[#16a34a] text-[14.5px] font-bold text-white disabled:opacity-40"/>
                : <a href={`https://wa.me/?text=${encodeURIComponent(resultText.text)}`} target="_blank" rel="noopener noreferrer" className="grid h-12 place-items-center rounded-[14px] bg-[#16a34a] text-[14.5px] font-bold text-white">Share on WhatsApp</a>}
              <Button variant="secondary" onClick={()=>{ navigator.clipboard.writeText(resultText.text); showToast("Copied"); }}>Copy</Button>
            </div>
          </div>
        )}
      </Sheet>

      {openRno && <ReceiptModal receiptNo={openRno} context="dues" onClose={()=>setOpenRno(null)} onSaved={load}/>}
      {openStu && <StudentModal studentId={openStu.id} library={openStu.library} onClose={()=>setOpenStu(null)} onSaved={load}/>}
    </Screen>
  );
}

function Refs({ studentId, receiptNo, onStu, onRno }:{ studentId:string; receiptNo:string; onStu:()=>void; onRno:()=>void }){
  const open=<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M8 16 16 8M9 8h7v7"/></svg>;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      <button type="button" onClick={onStu} aria-label={`Open student ${studentId}`} className="inline-flex h-8 items-center gap-1 rounded-[10px] bg-lma-bg px-2.5 font-lma-mono text-[12.5px] font-semibold text-lma-ink ring-1 ring-inset ring-lma-line">{studentId}{open}</button>
      <button type="button" onClick={onRno} aria-label={`Open receipt ${receiptNo}`} className="inline-flex h-8 items-center gap-1 rounded-[10px] bg-lma-bg px-2.5 font-lma-mono text-[12.5px] font-semibold text-lma-ink ring-1 ring-inset ring-lma-line">{receiptNo}{open}</button>
    </div>
  );
}

// Collect: keypad amount (starts at what is owed), paid-by chips, date, note.
function PaymentForm({ due, post, onDone }:{ due:PendingDue; post:(a:string,p:any)=>Promise<any>; onDone:(text:string)=>void }){
  const [mode,setMode]=useState("");
  const [amountStr,setAmountStr]=useState(String(due.fees_due_balance));
  const [dateIso,setDateIso]=useState(todayIso());
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const amount=Number(amountStr||0);
  const blocker=amount<=0?"Enter the amount":!mode?"Pick how it was paid":"";
  const submit=async()=>{
    if(blocker) return;
    setBusy(true);
    const d=new Date(dateIso+"T00:00:00");
    // payload keys match logFeePayment params (receipt_no, payment_mode, amount_received, notes, receipt_date)
    const r=await post("logFeePayment",{receipt_no:due.receipt_no,payment_mode:mode,amount_received:amount,notes,receipt_date:`${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`});
    setBusy(false);
    if(r) onDone(String(r.whatsapp_text||""));
  };
  return (
    <div className="pb-2">
      <p className="mb-3 px-1 text-[12.5px] text-lma-ink-3">{due.receipt_no} · {inr(due.fees_due_balance)} outstanding</p>
      <AmountPad value={amountStr} onKey={k=>setAmountStr(s=>keyRules(s,k))} label="Amount received"/>
      <p className="-mt-1 mb-3 px-1 text-[12.5px] font-semibold text-lma-ink-2">Still owed after this: {inr(Math.max(0,due.fees_due_balance-amount))}</p>
      <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Paid by</div>
      <TagChips value={mode} onChange={setMode}/>
      <div className="mb-3 mt-1"><TagBankNote tag={mode}/></div>
      <DateChips title="On" value={dateIso} onChange={setDateIso} ago={daysAgo(dateIso)} label={dayLabel(dateIso)} today={todayIso()} yesterday={shiftIso(todayIso(),-1)}/>
      <div className="mb-4"><TextInput value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Note (optional)" aria-label="Note"/></div>
      <Button size="lg" full disabled={!!blocker||busy} loading={busy} loadingText="Saving…" onClick={submit}>{blocker||`Collect ${inr(amount)}`}</Button>
    </div>
  );
}

function WriteOffForm({ due, onCancel, onSubmit }:{ due:PendingDue; onCancel:()=>void; onSubmit:(remark:string)=>void }){
  const [remark,setRemark]=useState("");
  return (
    <div className="pb-2">
      <p className="mb-3 px-1 text-[12.5px] text-lma-ink-3">{due.name} · {inr(due.fees_due_balance)} outstanding</p>
      <div className="mb-3 rounded-[12px] bg-lma-warn-soft p-3 text-[12.5px] font-semibold text-lma-warn-2">Marks these dues as won’t be collected. You can move them back to pending later.</div>
      <TextInput value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Reason (optional)" aria-label="Reason"/>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={()=>onSubmit(remark)}>Write off</Button>
      </div>
    </div>
  );
}

// Correct a payment already collected: amount, how it was paid, the date, the note.
// Only what you change is sent. Changing the amount also corrects what is still
// owed on the receipt (and on any later payments) — the server does that part.
function EditPaymentForm({ pay, post, onDone }:{ pay:DuePayment; post:(a:string,p:any)=>Promise<any>; onDone:()=>void }){
  const origIso=toIsoInput(pay.received_on.replace(EDITED,""))||todayIso();
  const [amountStr,setAmountStr]=useState(String(pay.amount_received));
  const [mode,setMode]=useState(pay.payment_mode);
  const [move,setMove]=useState(false);
  const [dateIso,setDateIso]=useState(origIso);
  const [notes,setNotes]=useState(pay.notes);
  const [busy,setBusy]=useState(false);
  const amount=Number(amountStr||0);
  const changed=amount!==pay.amount_received||mode!==pay.payment_mode||move||dateIso!==origIso||notes!==pay.notes;
  const blocker=amount<=0?"Enter the amount"
    :amount>pay.balance_before?`Can’t be more than ${inr(pay.balance_before)} (owed then)`
    :!mode?"Pick how it was paid"
    :dateIso>todayIso()?"The date can’t be in the future"
    :!changed?"Nothing changed yet":"";
  const save=async()=>{
    if(blocker) return;
    const payload:any={ payment_id:pay.payment_id, receipt_no:pay.receipt_no };
    if(amount!==pay.amount_received) payload.amount_received=amount;
    if(mode!==pay.payment_mode) payload.payment_mode=mode;
    if(move) payload.move_bank=true;
    if(dateIso!==origIso) payload.received_on=dmyOf(dateIso);
    if(notes!==pay.notes) payload.notes=notes;
    setBusy(true); const r=await post("updateDuePayment",payload); setBusy(false);
    if(r) onDone();
  };
  return (
    <div className="pb-2">
      <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-lma-ink-3">
        {pay.receipt_no} · owed {inr(pay.balance_before)} at that time · after this payment {inr(Math.max(0,pay.balance_before-amount))}
      </p>
      <AmountPad value={amountStr} onKey={k=>setAmountStr(v=>keyRules(v,k))} label="Amount received"/>
      {amount!==pay.amount_received&&amount>0&&amount<=pay.balance_before&&(
        <p className="-mt-1 mb-3 px-1 text-[12.5px] font-semibold text-lma-warn-2">
          Outstanding on the receipt goes {amount>pay.amount_received?"down":"up"} by {inr(Math.abs(amount-pay.amount_received))}.
        </p>
      )}
      <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Paid by</div>
      <TagChips value={mode} onChange={setMode} keep={pay.payment_mode}/>
      <div className="mb-3 mt-1"><BankCheck tag={mode} savedTag={pay.payment_mode} savedBank={pay.payment_fees_mode} move={move} onMove={setMove}/></div>
      <DateChips title="Received on" value={dateIso} onChange={setDateIso} ago={daysAgo(dateIso)} label={dayLabel(dateIso)} today={todayIso()} yesterday={shiftIso(todayIso(),-1)}/>
      <div className="mb-4"><TextInput value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Note (optional)" aria-label="Note"/></div>
      <Button size="lg" full disabled={!!blocker||busy} loading={busy} loadingText="Saving…" onClick={save}>{blocker||"Save changes"}</Button>
    </div>
  );
}
