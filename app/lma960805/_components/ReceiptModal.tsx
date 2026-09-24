"use client";

// ── Universal Receipt View/Edit/History modal ────────────────────
// Open from ANY page with just a receipt_no. Fetches its own data,
// shows the receipt + (click-to-load) money trail + copy buttons,
// lets you Edit in place (full edit form with seat picker), view
// edit History, and offers the post-save WhatsApp share — all without
// the host page navigating away. On save it calls onSaved() so the
// host can refresh.
//
//   const [rno,setRno] = useState<string|null>(null);
//   ...onClick={()=>setRno(r.receipt_no)}   // card / receipt-no click
//   {rno && <ReceiptModal receiptNo={rno} onClose={()=>setRno(null)} onSaved={reload}/>}

import ContactCopyButton from "./ContactCopyButton";
import WhatsAppButton from "./WhatsAppButton";
import { useState, useEffect, useCallback } from "react";
import { BankCheck, TagBankNote, TagChips } from "./TagBank";
import { useLMA } from "./LMAProvider";
import CancelRefundSheet from "./CancelRefundSheet";
import { fmtDMY, fmtDMYT, toIsoInput, toDmy } from "../_lib/dates";
import { genderCardStyle } from "../_lib/genderTheme";
import StudentModal from "./StudentModal";
import BookingFlow from "./BookingFlow";

const API = "/api/lma960805";
const normDateR = toDmy;
function normalizePhoneR(input:string):string{
  if(!input) return "";
  let c=input.replace(/[\s\-\.\(\)]/g,"");
  if(c.startsWith("+91")) c=c.slice(3);
  else if(c.startsWith("91")&&c.length>10) c=c.slice(2);
  c=c.replace(/\D/g,"");
  if(c.length>10) c=c.slice(-10);
  return c;
}

interface PhoneEntry { number:string; tag:string; }
interface Receipt {
  receipt_no:string; student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[];
  seat_no:string; shift:string; shift_name:string; shift_time:string;
  booking_from:string; booking_to:string; receipt_date:string; fee:number;
  pay_mode_1:string; pay_amount_1:number; pay_mode_2:string; pay_amount_2:number; pay_mode_3:string; pay_amount_3:number;
  pay_mode_1_date?:string; pay_mode_2_date?:string; pay_mode_3_date?:string;
  pay_fees_mode_1?:string; pay_fees_mode_2?:string; pay_fees_mode_3?:string;
  fees_due:number; fees_due_balance:number; type:string; is_cross_library:string;
  status:string; dues_status:string; renewed_from:string; gender:string; cancelled_on:string;
  receipt_text:string; registration_text:string; generated_at:string; remark:string;
}
interface EditEvent { letter:string; edited_at:string; remark:string; changed_fields:string; before:string; after:string; whatsapp_text?:string; }

export default function ReceiptModal({ receiptNo, onClose, onSaved, context }:{
  receiptNo:string; onClose:()=>void; onSaved?:()=>void; context?:"dues"|"refunds";
}) {
  const { init, post, showToast, confirm: ask } = useLMA();
  const [receipt,setReceipt] = useState<Receipt|null>(null);
  const [loading,setLoading] = useState(true);
  const [mode,setMode]       = useState<"view"|"edit"|"history">("view");
  const [history,setHistory] = useState<EditEvent[]|null>(null);
  const [shareText,setShareText] = useState<string|null>(null);
  const [shareLabel,setShareLabel] = useState("Receipt updated");
  const [showStudent,setShowStudent] = useState(false);
  const [showRenew,setShowRenew] = useState(false);
  const [showReAllot,setShowReAllot] = useState(false);
  const [showCancel,setShowCancel] = useState(false);
  const [studentSend,setStudentSend] = useState(false);

  const fetchReceipt = async () => {
    const qs = new URLSearchParams({ action:"getReceiptLog", q:receiptNo, search_type:"RECEIPT_NO", limit:"5" });
    const r = await fetch(`${API}?${qs}`).then(x=>x.json());
    const list:Receipt[] = (r && r.receipts) || [];
    return list.find(x=>x.receipt_no===receiptNo) || list[0] || null;
  };

  useEffect(()=>{ let alive=true; (async()=>{
    setLoading(true); setMode("view"); setHistory(null);
    try{ const rc=await fetchReceipt(); if(alive) setReceipt(rc); }
    catch{ if(alive) showToast("Couldn't load receipt","error"); }
    if(alive) setLoading(false);
  })(); return ()=>{ alive=false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  },[receiptNo]);

  const refresh = async () => { const rc=await fetchReceipt(); setReceipt(rc); onSaved && onSaved(); };
  const doNotRenew = async () => { if(!receipt) return; if(!(await ask({ title:`Do not renew ${receipt.receipt_no}?`, body:`${receipt.name} will stop appearing in renewal lists.`, confirmLabel:"Do not renew", danger:true }))) return; const r=await post("markReceiptDoNotRenew",{receipt_no:receipt.receipt_no}); if(r&&r.ok!==false){ showToast("Marked: do not renew"); refresh(); } else showToast((r&&r.error)||"Failed","error"); };

  const openHistory = async () => {
    setMode("history");
    if(history) return;
    try{
      const r = await fetch(`${API}?action=getReceiptEditHistory&receipt_no=${encodeURIComponent(receiptNo)}`).then(x=>x.json());
      setHistory((r && r.edits) || []);
    }catch{ setHistory([]); }
  };

  const doSave = async (payload:any) => {
    const res = await post("updateReceipt", payload);
    if(res && (res.ok!==false)){
      const rc = await fetchReceipt(); setReceipt(rc); setMode("view");
      setHistory(null);
      if(res.whatsapp_text){ setShareLabel("Receipt updated"); setShareText(res.whatsapp_text); } else showToast("Receipt updated");
      onSaved && onSaved();
    } else {
      showToast((res && res.error) || "Update failed","error");
    }
  };

  return (
    <>
      <Sheet onClose={onClose} cardStyle={receipt?genderCardStyle(receipt.gender):undefined}>
        {loading ? (
          <div className="py-10 text-center text-sm text-lma-ink-3">Loading…</div>
        ) : !receipt ? (
          <div className="py-10 text-center">
            <p className="text-sm text-lma-ink-3 mb-4">Receipt not found.</p>
            <button onClick={onClose} className="px-5 py-2.5 rounded-[14px] bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold text-sm">Close</button>
          </div>
        ) : mode === "view" ? (
          <>
            <div className="mb-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Receipt</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <h3 className="font-lma-mono text-[22px] font-semibold leading-none tracking-[-0.01em] text-lma-ink">{receipt.receipt_no}</h3>
                  {(()=>{ const b=rcptStatus(receipt); return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${b.cls}`}>{b.label}</span>; })()}
                </div>
                {receipt.generated_at&&<div className="mt-1 text-[12px] text-lma-ink-3">Created {fmtDMYT(receipt.generated_at)}</div>}
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>
            <div className="mb-3 rounded-[18px] border border-lma-line bg-lma-surface p-3.5 shadow-lma-card">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 text-[17px] font-bold leading-snug text-lma-ink">{receipt.name}</div>
                <button type="button" onClick={()=>setShowStudent(true)} aria-label={`Open student ${receipt.student_id}`}
                  className="lma-noscale shrink-0 rounded-[12px] bg-lma-bg px-3 py-1.5 text-left ring-1 ring-inset ring-lma-line active:brightness-95">
                  <span className="flex items-center justify-between gap-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-lma-ink-3">Student<svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M8 16 16 8M9 8h7v7"/></svg></span>
                  <span className="block font-lma-mono text-[13.5px] font-semibold text-lma-ink">{receipt.student_id}</span>
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="rounded-md bg-lma-bg px-2 py-0.5 font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">{receipt.branch||receipt.library}</span>
                {receipt.seat_no&&<span className="rounded-md bg-lma-bg px-2 py-0.5 font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Seat {receipt.seat_no}</span>}
                <span className="rounded-md bg-lma-bg px-2 py-0.5 font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">{receipt.shift_name||receipt.shift}</span>
                <span className="ml-auto font-semibold text-lma-ink-2">till {fmtDMY(receipt.booking_to)}</span>
              </div>
              {receipt.fees_due_balance>0&&<div className="mt-2.5 inline-flex rounded-md bg-[#fef3c7] px-2 py-0.5 font-lma-mono text-[12px] font-bold text-[#92400e] ring-1 ring-inset ring-[#f5d88a]">₹{receipt.fees_due_balance} due</div>}
            </div>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-[14px] border border-lma-line bg-lma-surface p-3 font-lma-mono text-[12px] leading-relaxed text-lma-ink-2">{receipt.receipt_text}</pre>
            {receipt.remark&&<div className="mt-2 rounded-[12px] bg-lma-surface px-3 py-2 text-[12.5px] italic text-lma-ink-2 ring-1 ring-inset ring-lma-line">{receipt.remark}</div>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={()=>setStudentSend(true)} className="h-12 rounded-[14px] bg-[#e3f6ec] text-[14.5px] font-semibold text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8]">WhatsApp</button>
              <button onClick={()=>setMode("edit")} className="lma-glass-btn h-12 rounded-[14px] text-[15px] font-bold text-white">Edit</button>
            </div>
            {context!=="refunds"&&receipt.fees_due_balance>0&&<CollectDueInline receiptNo={receipt.receipt_no} balance={receipt.fees_due_balance} post={post} showToast={showToast} onChanged={refresh} onEvent={(t)=>{setShareLabel("Due collected");setShareText(t);}}/>}
            {context!=="dues"&&<RefundInline receiptNo={receipt.receipt_no} post={post} showToast={showToast} onChanged={refresh} onEvent={(t)=>{setShareLabel("Refund issued");setShareText(t);}}/>}
            {(() => {
              const bookingActions = (<>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button onClick={()=>setShowRenew(true)} className="h-12 rounded-[14px] bg-lma-brand-soft text-[14.5px] font-semibold text-lma-brand ring-1 ring-inset ring-[#dcdffb]">Renew</button>
                  <button onClick={()=>setShowReAllot(true)} className="h-12 rounded-[14px] bg-lma-brand-soft text-[14.5px] font-semibold text-lma-brand ring-1 ring-inset ring-[#dcdffb]">Re-allot</button>
                </div>
                {(()=>{ const st=(receipt.status||"").toUpperCase();
                  if(st==="CANCELLED") return <div className="mt-2 rounded-[12px] bg-lma-out-soft py-2.5 text-center text-[13px] font-semibold text-lma-out">Cancelled</div>;
                  if(st==="RENEWED") return <div className="mt-2 rounded-[12px] bg-lma-surface py-2.5 text-center text-[13px] font-semibold text-lma-ink-3 ring-1 ring-inset ring-lma-line">Renewed</div>;
                  const iso=toIsoInput(receipt.booking_to); const expired=!!iso&&iso<new Date().toISOString().slice(0,10);
                  if(expired||st==="DO_NOT_RENEW") return <button onClick={doNotRenew} className="mt-2 h-11 w-full rounded-[12px] bg-lma-surface text-[13.5px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Do not renew</button>;
                  return <button onClick={()=>setShowCancel(true)} className="mt-2 h-11 w-full rounded-[12px] bg-lma-surface text-[13.5px] font-semibold text-lma-out ring-1 ring-inset ring-lma-line">Cancel booking</button>;
                })()}
              </>);
              const opposite = context==="dues"
                ? <RefundInline receiptNo={receipt.receipt_no} post={post} showToast={showToast} onChanged={refresh} onEvent={(t)=>{setShareLabel("Refund issued");setShareText(t);}}/>
                : (context==="refunds" && receipt.fees_due_balance>0 ? <CollectDueInline receiptNo={receipt.receipt_no} balance={receipt.fees_due_balance} post={post} showToast={showToast} onChanged={refresh} onEvent={(t)=>{setShareLabel("Due collected");setShareText(t);}}/> : null);
              return context ? <MoreActions>{opposite}{bookingActions}</MoreActions> : bookingActions;
            })()}
            <div className={`mt-2 grid gap-2 ${receipt.type==="NEW"&&receipt.registration_text?"grid-cols-3":"grid-cols-2"}`}>
              {receipt.type==="NEW"&&receipt.registration_text&&(
                <button onClick={()=>{ navigator.clipboard.writeText(receipt.registration_text); showToast("Group copy"); }} className="h-11 rounded-[12px] bg-lma-surface text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Group copy</button>
              )}
              <ContactCopyButton name={receipt.name} library={receipt.branch||receipt.library} studentId={receipt.student_id} phones={receipt.phones} onCopied={showToast} label="Copy contact" wrapperClassName="relative w-full" className="h-11 w-full rounded-[12px] bg-lma-surface text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line"/>
              <button onClick={openHistory} className="h-11 rounded-[12px] bg-lma-surface text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Edit history</button>
            </div>
            <div className="mt-2"><MoneyTrail receiptNo={receipt.receipt_no}/></div>
          </>
        ) : mode === "history" ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[18px] font-bold tracking-[-0.01em] text-lma-ink">Edit history · {receipt.receipt_no}</h3>
              <button type="button" aria-label="Close" onClick={()=>setMode("view")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>
            {history===null ? (
              <p className="text-sm text-lma-ink-3">Loading…</p>
            ) : history.length===0 ? (
              <p className="text-sm text-lma-ink-3">No edits recorded yet.</p>
            ) : (
              <div className="space-y-2">{history.map(ev=><EditEventCard key={ev.letter} ev={ev} phones={receipt.phones}/>)}</div>
            )}
          </>
        ) : (
          init && <EditForm receipt={receipt} init={init} onCancel={()=>setMode("view")} onSave={doSave}/>
        )}
      </Sheet>
      {showStudent && receipt && <StudentModal studentId={receipt.student_id} library={receipt.library} crossOrigin={receipt.is_cross_library} onClose={()=>setShowStudent(false)} onSaved={refresh}/>}
      {showRenew && receipt && <BookingFlow renewReceiptNo={receipt.receipt_no} libCode={receipt.branch||receipt.library} onClose={()=>setShowRenew(false)} onComplete={refresh}/>}
      {showReAllot && receipt && <EditSeatPicker library={receipt.library} branch={receipt.branch} shift={receipt.shift} currentSeat={receipt.seat_no} ignoreReceiptNo={receipt.receipt_no} onClose={()=>setShowReAllot(false)} onPick={async(label:string)=>{ const r=await post("reAllotSeat",{receipt_no:receipt.receipt_no,seat_no:label,editor_remark:"",flush:true}); if(r&&r.ok!==false){ showToast("Seat re-allotted"); setShowReAllot(false); refresh(); } else showToast((r&&r.error)||"Re-allot failed","error"); }}/>}
      {showCancel && receipt && init && <CancelRefundSheet target={{receipt_no:receipt.receipt_no,name:receipt.name,seat_no:receipt.seat_no,shift_name:receipt.shift_name,shift:receipt.shift,fees_due_balance:receipt.fees_due_balance}} presentation="sheet" post={post} showToast={showToast} onClose={()=>setShowCancel(false)} onDone={()=>{ setShowCancel(false); refresh(); }}/>}

      {studentSend && receipt && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center px-6" onClick={()=>setStudentSend(false)}>
          <div className="absolute inset-0 bg-[rgb(15_23_42/0.45)]"/>
          <div className="lma-sheet-up relative w-full max-w-xs rounded-[20px] bg-lma-surface p-5 shadow-lma-float" onClick={e=>e.stopPropagation()}>
            <h4 className="text-sm font-bold text-lma-ink mb-1">Student receipt</h4>
            <p className="text-[12px] text-lma-ink-3 mb-3">Copy the text, or send it on WhatsApp.</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={()=>setStudentSend(false)} className="h-11 rounded-[12px] bg-lma-bg text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Cancel</button>
              <button onClick={()=>{ navigator.clipboard.writeText(receipt.receipt_text); showToast("Student copy"); setStudentSend(false); }} className="h-11 rounded-[12px] bg-lma-bg text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Copy</button>
              <WhatsAppButton phones={receipt.phones} text={receipt.receipt_text} label="Send" className="h-11 w-full rounded-[12px] bg-[#16a34a] text-[13px] font-semibold text-white text-center disabled:opacity-40"/>
            </div>
          </div>
        </div>
      )}
      {shareText && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center px-6" onClick={()=>setShareText(null)}>
          <div className="absolute inset-0 bg-[rgb(15_23_42/0.45)]"/>
          <div className="lma-sheet-up relative w-full max-w-xs rounded-[20px] bg-lma-surface p-5 shadow-lma-float" onClick={e=>e.stopPropagation()}>
            <h4 className="text-sm font-bold text-lma-ink mb-1">{shareLabel}</h4>
            <p className="text-[12px] text-lma-ink-3 mb-3">Send the student a WhatsApp update?</p>
            <pre className="text-[10px] text-lma-ink-2 whitespace-pre-wrap font-mono bg-lma-bg rounded-lg p-2.5 max-h-40 overflow-y-auto mb-3">{shareText}</pre>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={()=>setShareText(null)} className="h-11 rounded-[12px] bg-lma-bg text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Skip</button>
              <button onClick={()=>{ navigator.clipboard.writeText(shareText); showToast("Copied"); }} className="h-11 rounded-[12px] bg-lma-bg text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Copy</button>
              <WhatsAppButton phones={receipt?.phones} text={shareText} label="Send" className="h-11 w-full rounded-[12px] bg-[#16a34a] text-[13px] font-semibold text-white text-center disabled:opacity-40"/>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── EDIT FORM ────────────────────────────────────────────────────
function EditForm({ receipt, init, onCancel, onSave }:{ receipt:Receipt; init:any; onCancel:()=>void; onSave:(p:any)=>void }){
  const { confirm: ask } = useLMA();
  const [name,setName]=useState(receipt.name);
  const [seat,setSeat]=useState(receipt.seat_no);
  const [shift,setShift]=useState(receipt.shift);
  const [shiftTime,setShiftTime]=useState(receipt.shift_time||"");
  const [bookingFrom,setBookingFrom]=useState(normDateR(receipt.booking_from));
  const [bookingTo,setBookingTo]=useState(normDateR(receipt.booking_to));
  const [receiptDate,setReceiptDate]=useState(normDateR(receipt.receipt_date));
  const [fee,setFee]=useState(String(receipt.fee));
  const _amt=(v:number)=>(v===undefined||v===null||(v as any)==="")?"":String(v);
  const [pays,setPays]=useState([
    {mode:receipt.pay_mode_1,amount:_amt(receipt.pay_amount_1),date:normDateR(receipt.pay_mode_1_date||""),savedMode:receipt.pay_mode_1||"",savedBank:receipt.pay_fees_mode_1||"",move:false},
    {mode:receipt.pay_mode_2,amount:_amt(receipt.pay_amount_2),date:normDateR(receipt.pay_mode_2_date||""),savedMode:receipt.pay_mode_2||"",savedBank:receipt.pay_fees_mode_2||"",move:false},
    {mode:receipt.pay_mode_3,amount:_amt(receipt.pay_amount_3),date:normDateR(receipt.pay_mode_3_date||""),savedMode:receipt.pay_mode_3||"",savedBank:receipt.pay_fees_mode_3||"",move:false},
  ].filter(p=>p.mode));
  const [feesDue,setFeesDue]=useState(String(receipt.fees_due));
  const [phones,setPhones]=useState<PhoneEntry[]>(()=>{
    const base=(receipt.phones||[]).map(p=>({number:p.number,tag:p.tag})).filter(p=>p.number);
    return base.length?base:[{number:"",tag:"SELF"}];
  });
  const [studentId,setStudentId]=useState(receipt.student_id);
  const [library,setLibrary]=useState(receipt.library);
  const [branch,setBranch]=useState(receipt.branch);
  const [isCross,setIsCross]=useState(receipt.is_cross_library||"");
  const [showAdvanced,setShowAdvanced]=useState(false);
  const [editCount,setEditCount]=useState<number|null>(null);
  const [seatPickerOpen,setSeatPickerOpen]=useState(false);
  const [bookRemark,setBookRemark]=useState(receipt.remark||"");
  const [remark,setRemark]=useState("");

  useEffect(()=>{
    let alive=true;
    fetch(`${API}?action=getReceiptEditHistory&receipt_no=${encodeURIComponent(receipt.receipt_no)}`)
      .then(r=>r.json()).then(r=>{ if(alive) setEditCount(r&&Array.isArray(r.edits)?r.edits.length:0); })
      .catch(()=>{ if(alive) setEditCount(null); });
    return ()=>{ alive=false; };
  },[receipt.receipt_no]);

  const feeKey = (branch||library||"").toUpperCase();
  const stdFee = (init.fees && init.fees[feeKey]) ? init.fees[feeKey][shift.toUpperCase()] : undefined;
  const shiftChanged = shift.toUpperCase() !== (receipt.shift||"").toUpperCase();
  const feeMismatch = shiftChanged && typeof stdFee==="number" && stdFee !== Number(fee);
  const isOther = !["MORNING","EVENING","FULL DAY","FULLDAY","FD"].includes(shift.toUpperCase());
  const onShiftChange=(v:string)=>{ setShift(v); if(!["MORNING","EVENING","FULL DAY","FULLDAY","FD"].includes(v.toUpperCase())) setSeat(""); const so=activeShifts.find((s:any)=>s.shift_key.toUpperCase()===v.toUpperCase()); setShiftTime(so?.shift_time||""); };

  const activeShifts=init.shifts.filter((s:any)=>s.active);
  const setPay=(i:number,f:"mode"|"amount"|"date",v:string)=>{const n=[...pays];n[i]={...n[i],[f]:v};setPays(n);};
  const setMove=(i:number,v:boolean)=>{const n=[...pays];n[i]={...n[i],move:v};setPays(n);};
  const libObj=init.libraries.find((l:any)=>l.library_code===library);
  const libBranches=init.branches.filter((b:any)=>b.library_code===library&&b.active);

  const save=async()=>{
    const validPays=pays.filter(p=>p.mode&&p.amount!=="").map(p=>({mode:p.mode,amount:Number(p.amount),date:p.date||"",...(p.move?{move_bank:true}:{})}));
    const shiftObj=activeShifts.find((s:any)=>s.shift_key.toUpperCase()===shift.toUpperCase());
    const cleanPhones=phones.filter(p=>p.number.trim()).map(p=>({number:normalizePhoneR(p.number),tag:(p.tag||"").toUpperCase()}));
    const nameChanged=(name||"").trim().toUpperCase()!==(receipt.name||"").trim().toUpperCase();
    let cascade=false;
    if(nameChanged){
      cascade=await ask({ title:"Name changed", body:"Also update the student's own record with the new name? Other receipts of this student will show it too.", confirmLabel:"Update student too", cancelLabel:"Only this receipt" });
    }
    onSave({
      receipt_no:receipt.receipt_no,
      name, seat_no:seat, shift,
      shift_name:shiftObj?.shift_name||receipt.shift_name, shift_time:shiftTime,
      booking_from:bookingFrom, booking_to:bookingTo, receipt_date:receiptDate,
      fee:Number(fee), pay_modes:validPays,
      fees_due:Number(feesDue),
      phones:cleanPhones,
      student_id:studentId, library, branch, is_cross_library:isCross,
      cascade_name_to_student:cascade,
      editor_remark:remark,
      remark:bookRemark,
    });
  };

  return (
    <div>
      <h3 className="text-base font-bold text-lma-ink mb-1">Edit {receipt.receipt_no}</h3>
      <p className="text-[11px] text-lma-ink-3 mb-3">Every edit is logged in history.</p>
      <MoneyTrail receiptNo={receipt.receipt_no}/>
      {editCount!==null&&editCount>0&&(
        <div className="mt-2 text-[11px] text-lma-ink-3 bg-lma-bg rounded-lg px-2.5 py-1.5">📝 This receipt has <b>{editCount}</b> past edit{editCount>1?"s":""} — open History to see old→new details.</div>
      )}
      <L>Name</L><I value={name} onChange={e=>setName(e.target.value.toUpperCase())}/>
      <div className="grid grid-cols-2 gap-3">
        <div><L>Seat</L>
          {isOther
            ? <div className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand text-lma-ink-3">no seat (OTHER)</div>
            : <button type="button" onClick={()=>setSeatPickerOpen(true)} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand text-left flex items-center justify-between">
                <span className={seat?"text-lma-ink":"text-lma-ink-3"}>{seat||"tap to pick / blank = unassigned"}</span>
                <span className="text-lma-brand text-xs font-bold">{seat?"Change":"Pick"}</span>
              </button>}
        </div>
        <div><L>Shift</L>
          <select value={shift} onChange={e=>onShiftChange(e.target.value)} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand">
            {activeShifts.map((s:any)=><option key={s.shift_key} value={s.shift_key}>{s.shift_name}</option>)}
          </select>
        </div>
      </div>
      <L>Time window</L><I value={shiftTime} onChange={e=>setShiftTime(e.target.value)} placeholder="e.g. 7AM to 2PM"/>
      <div className="grid grid-cols-2 gap-3">
        <div><L>From</L><I type="date" value={toIsoInput(bookingFrom)} onChange={e=>setBookingFrom(normDateR(e.target.value))}/>{bookingFrom && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(bookingFrom)}</span>}</div>
        <div><L>To</L><I type="date" value={toIsoInput(bookingTo)} onChange={e=>setBookingTo(normDateR(e.target.value))}/>{bookingTo && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(bookingTo)}</span>}</div>
      </div>
      <L>Receipt date</L><I type="date" value={toIsoInput(receiptDate)} onChange={e=>setReceiptDate(normDateR(e.target.value))}/>{receiptDate && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(receiptDate)}</span>}
      <L>Fee (₹)</L><I type="number" value={fee} onChange={e=>setFee(e.target.value)}/>
      {shiftChanged&&(
        <div className="mt-1 mb-1 text-[11px] font-semibold text-lma-warn bg-lma-warn/10 rounded-lg px-2.5 py-1.5">
          ⚠ Shift changed — please review the Fee amount.
          {typeof stdFee==="number"
            ? <> Standard fee for <b>{shift}</b> is <b>₹{stdFee}</b>{feeMismatch?<> (current entry ₹{Number(fee)||0}).</>:<> — matches your entry.</>}{feeMismatch&&<button type="button" onClick={()=>setFee(String(stdFee))} className="ml-1 underline font-bold">Use ₹{stdFee}</button>}</>
            : <> No standard fee found for this shift — enter manually.</>}
        </div>
      )}
      <L>Payments</L>
      {pays.map((p,i)=>(
        <div key={i} className="mb-2 rounded-[16px] border border-lma-line bg-lma-surface p-3">
          {pays.length>1&&(
            <div className="mb-2 flex items-center justify-between">
              <span className="px-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Payment {i+1}</span>
              <button onClick={()=>setPays(pays.filter((_,j)=>j!==i))} className="h-8 rounded-full px-2.5 text-[12.5px] font-semibold text-lma-out active:bg-lma-out-soft">Remove</button>
            </div>
          )}
          <TagChips value={p.mode} onChange={v=>setPay(i,"mode",v)} keep={p.savedMode}/>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="w-16 shrink-0 px-0.5 text-[12.5px] font-semibold text-lma-ink-3">Amount</span>
            <input type="number" value={p.amount} onChange={e=>setPay(i,"amount",e.target.value)} placeholder="₹" className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 font-lma-mono text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
          </div>
          {p.mode&&<BankCheck tag={p.mode} savedTag={p.savedMode} savedBank={p.savedBank} move={p.move} onMove={v=>setMove(i,v)}/>}
          {p.mode&&<div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] font-bold text-lma-ink-3 shrink-0">Paid on</span>
            <input type="date" value={toIsoInput(p.date||"")} onChange={e=>setPay(i,"date",normDateR(e.target.value))} className="h-11 flex-1 rounded-[12px] border border-lma-line bg-lma-surface px-3 text-[14px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
            {p.date&&<span className="text-[10px] font-bold text-lma-ink-3 shrink-0">{fmtDMY(p.date)}</span>}
          </div>}
        </div>
      ))}
      {pays.length<3&&<button onClick={()=>setPays([...pays,{mode:"",amount:"",date:"",savedMode:"",savedBank:"",move:false}])} className="text-xs font-bold text-lma-brand">+ Add payment</button>}
      <L>Fees Due (₹)</L><I type="number" value={feesDue} onChange={e=>setFeesDue(e.target.value)}/>

      <L>Phones</L>
      {phones.map((ph,i)=>(
        <div key={i} className="flex gap-2 mb-2">
          <input type="tel" inputMode="numeric" value={ph.number}
            onChange={e=>{const n=[...phones];n[i]={...n[i],number:normalizePhoneR(e.target.value)};setPhones(n);}}
            onBlur={()=>{const n=[...phones];n[i]={...n[i],number:normalizePhoneR(n[i].number)};setPhones(n);}}
            placeholder={i===0?"SELF (primary)":`Phone ${i+1}`}
            className="flex-1 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
          <input value={ph.tag} onChange={e=>{const n=[...phones];n[i]={...n[i],tag:e.target.value.toUpperCase()};setPhones(n);}} placeholder="TAG" className="w-20 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand uppercase"/>
          {i>0&&<button type="button" onClick={()=>setPhones(phones.filter((_,j)=>j!==i))} className="px-3 rounded-[14px] bg-lma-bg text-lma-ink-3 font-bold text-lg leading-none">×</button>}
        </div>
      ))}
      {phones.length<4&&<button type="button" onClick={()=>setPhones([...phones,{number:"",tag:""}])} className="text-xs font-bold text-lma-brand mb-1">+ Add phone</button>}

      <button onClick={()=>setShowAdvanced(v=>!v)} className="block text-xs font-bold text-lma-ink-3 mt-2">{showAdvanced?"▾ Hide advanced":"▸ Advanced (ID, library, branch, cross)"}</button>
      {showAdvanced&&(
        <div className="mt-1 bg-lma-bg rounded-[14px] p-3 space-y-2">
          <div><L>Student ID</L><I value={studentId} onChange={e=>setStudentId(e.target.value.toUpperCase())}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><L>Library</L>
              <select value={library} onChange={e=>{setLibrary(e.target.value);setBranch("");}} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand">
                {init.libraries.filter((l:any)=>l.active).map((l:any)=><option key={l.library_code} value={l.library_code}>{l.library_code}</option>)}
              </select>
            </div>
            <div><L>Branch</L>
              {libObj?.has_branches&&libBranches.length>0
                ? <select value={branch} onChange={e=>setBranch(e.target.value)} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand">
                    <option value="">—</option>
                    {libBranches.map((b:any)=><option key={b.branch_code} value={b.branch_code}>{b.branch_code}</option>)}
                  </select>
                : <div className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand text-lma-ink-3">no branches</div>}
            </div>
          </div>
          <div><L>Cross-library origin (blank = not cross)</L><I value={isCross} onChange={e=>setIsCross(e.target.value.toUpperCase())} placeholder="e.g. KAL"/></div>
        </div>
      )}

      <L>Remark on receipt (optional)</L><I value={bookRemark} onChange={e=>setBookRemark(e.target.value)} placeholder="shown at the bottom of the receipt"/>
      <L>Edit note (optional)</L><I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="why this edit"/>
      {seatPickerOpen&&(
        <EditSeatPicker
          library={library} branch={branch}
          shift={shift} currentSeat={seat} ignoreReceiptNo={receipt.receipt_no}
          onClose={()=>setSeatPickerOpen(false)}
          onPick={(label)=>{ setSeat(label); setSeatPickerOpen(false); }}
        />
      )}
      <div className="flex gap-2.5 mt-4">
        <button onClick={onCancel} className="flex-1 py-3 rounded-[14px] bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold">Cancel</button>
        <button onClick={save} className="flex-1 py-3 rounded-[14px] lma-glass-btn text-white font-bold">Save</button>
      </div>
    </div>
  );
}

function MoreActions({ children }:{ children:React.ReactNode }){
  const [open,setOpen]=useState(false);
  return (
    <div className="mt-2">
      <button onClick={()=>setOpen(o=>!o)} aria-expanded={open} className={`h-11 w-full rounded-[12px] text-[13.5px] font-semibold ring-1 ring-inset ${open?"bg-lma-ink text-white ring-lma-ink":"bg-lma-surface text-lma-ink-2 ring-lma-line"}`}>More actions {open?"▴":"▾"}</button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

function CollectDueInline({ receiptNo, balance, post, showToast, onChanged, onEvent }:{ receiptNo:string; balance:number; post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void; onChanged:()=>void; onEvent?:(text:string)=>void }){
  const { init }=useLMA();
  const modes=(init?.paymentTags||[]).filter(t=>t.active).map(t=>t.tag_name);
  const [open,setOpen]=useState(false);
  const [amt,setAmt]=useState(String(balance||""));
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [mode,setMode]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const submit=async()=>{
    const n=Number(amt);
    if(!n||n<=0){ setErr("Enter a valid amount"); return; }
    if(!mode){ setErr("Select a payment mode"); return; }
    setBusy(true); setErr("");
    const r=await post("logFeePayment",{ receipt_no:receiptNo, payment_mode:mode, amount_received:n, notes:"", receipt_date:date });
    setBusy(false);
    if(r&&r.ok!==false){ if(r.whatsapp_text&&onEvent) onEvent(String(r.whatsapp_text)); else showToast("Due collected"); setOpen(false); onChanged(); } else setErr((r&&r.error)||"Could not collect due");
  };
  if(!open) return <button onClick={()=>setOpen(true)} className="mt-2 h-12 w-full rounded-[14px] bg-[#fef3c7] text-[14px] font-bold text-[#92400e] ring-1 ring-inset ring-[#f5d88a]">Collect due · ₹{balance}</button>;
  return (
    <div className="mt-2 rounded-[14px] border border-lma-danger/30 bg-lma-danger/5 p-3 space-y-2">
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-lma-line text-sm bg-white"/>
      <input type="number" inputMode="decimal" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="Amount ₹" aria-label="Amount" className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 font-lma-mono text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
      <div><div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Paid by</div><TagChips value={mode} onChange={setMode} label="Paid by" size="sm"/></div>
      {mode&&<TagBankNote tag={mode} right/>}
      {err&&<div className="text-[11px] font-bold text-lma-danger">{err}</div>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={()=>{setOpen(false);setErr("");}} className="flex-1 py-2 rounded-lg bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold text-xs disabled:opacity-50">Cancel</button>
        <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-lg bg-lma-danger text-white font-bold text-xs disabled:opacity-50">{busy?"…":"Collect"}</button>
      </div>
    </div>
  );
}

function RefundInline({ receiptNo, post, showToast, onChanged, onEvent }:{ receiptNo:string; post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void; onChanged:()=>void; onEvent?:(text:string)=>void }){
  const { init }=useLMA();
  const modes=(init?.paymentTags||[]).filter(t=>t.active).map(t=>t.tag_name);
  const [open,setOpen]=useState(false);
  const [amt,setAmt]=useState("");
  const [mode,setMode]=useState("");
  const [reason,setReason]=useState("");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const submit=async()=>{
    const n=Number(amt);
    if(!n||n<=0){ setErr("Enter a valid amount"); return; }
    if(!mode){ setErr("Select a refund mode"); return; }
    setBusy(true); setErr("");
    const r=await post("issueRefund",{ original_receipt_no:receiptNo, amount:n, refund_mode:mode, refund_reason:reason, linked_to_cancellation:false, refund_date:date });
    setBusy(false);
    if(r&&r.ok!==false){ if(r.whatsapp_text&&onEvent) onEvent(String(r.whatsapp_text)); else showToast("Refund issued"); setOpen(false); onChanged(); } else setErr((r&&r.error)||"Could not issue refund");
  };
  if(!open) return <button onClick={()=>setOpen(true)} className="mt-2 h-11 w-full rounded-[12px] bg-lma-surface text-[13.5px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Issue refund</button>;
  return (
    <div className="mt-2 rounded-[14px] border border-lma-line bg-lma-bg p-3 space-y-2">
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-lma-line text-sm bg-white"/>
      <input type="number" inputMode="decimal" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="Refund amount ₹" aria-label="Refund amount" className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 font-lma-mono text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
      <div><div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Refund paid by</div><TagChips value={mode} onChange={setMode} label="Refund paid by" size="sm"/></div>
      {mode&&<TagBankNote tag={mode} right/>}
      <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)" className="w-full px-3 py-2 rounded-lg border border-lma-line text-sm"/>
      {err&&<div className="text-[11px] font-bold text-lma-danger">{err}</div>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={()=>{setOpen(false);setErr("");}} className="flex-1 py-2 rounded-lg bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold text-xs disabled:opacity-50">Cancel</button>
        <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-lg bg-lma-warn text-white font-bold text-xs disabled:opacity-50">{busy?"…":"Refund"}</button>
      </div>
    </div>
  );
}

function rcptStatus(r:{status:string;cancelled_on?:string}):{label:string;cls:string}{
  const st=(r.status||"").toUpperCase();
  if(st==="CANCELLED"){ const d=r.cancelled_on?Math.floor((Date.now()-new Date(r.cancelled_on).getTime())/86400000):NaN; const ago=isNaN(d)?"":(d<=0?" · today":` · ${d}d ago`); return {label:"Cancelled"+ago, cls:"bg-lma-danger/15 text-lma-danger"}; }
  if(st==="DO_NOT_RENEW") return {label:"Do Not Renew", cls:"bg-lma-warn/15 text-lma-warn"};
  if(st==="RENEWED")      return {label:"Renewed",      cls:"bg-lma-line text-lma-ink-2"};
  return {label:"Active", cls:"bg-lma-accent/15 text-lma-accent"};
}

function Sheet({ onClose, children, cardStyle }:{ onClose:()=>void; children:React.ReactNode; cardStyle?:React.CSSProperties }){
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
      <div role="dialog" aria-modal="true" className="lma-sheet-up relative w-full max-w-[560px] max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lma-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-lma-float" style={cardStyle} onClick={e=>e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#dfe1ee]"/>
        {children}
      </div>
    </div>
  );
}
function L({ children }:{ children:React.ReactNode }){ return <label className="mb-1.5 mt-3 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{children}</label>; }
function I({className="",...props}:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className={`w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand ${className}`}/>; }

const FIELD_LABELS:Record<string,string>={
  seat_no:"Seat", temporary_seat:"Temp-vacated seat", shift:"Shift", shift_name:"Shift name", shift_time:"Shift time",
  booking_from:"Booking from", booking_to:"Booking to", receipt_date:"Receipt date", fee:"Fee",
  name:"Name", student_id:"Student ID", library:"Library", branch:"Branch", is_cross_library:"Cross-library",
  pay_mode_1:"Pay mode 1", pay_amount_1:"Pay amount 1", pay_fees_mode_1:"Bank 1",
  pay_mode_2:"Pay mode 2", pay_amount_2:"Pay amount 2", pay_fees_mode_2:"Bank 2",
  pay_mode_3:"Pay mode 3", pay_amount_3:"Pay amount 3", pay_fees_mode_3:"Bank 3",
  fees_due:"Fees due", fees_due_balance:"Dues balance", type:"Type", status:"Status", dues_status:"Dues status",
  renewed_from:"Renewed from", phone:"Phone", phone_tag:"Phone tag",
};
function fieldLabel(k:string){ return FIELD_LABELS[k]||k; }
function safeParse(j:string):Record<string,any>{ try{ return j?JSON.parse(j):{}; }catch{ return {}; } }
function dispVal(v:any){ if(v===undefined||v===null||v==="")return "—"; return String(v); }

function EditEventCard({ev,phones}:{ev:EditEvent;phones?:PhoneEntry[]}){
  const before=safeParse(ev.before);
  const after=safeParse(ev.after);
  const fields=(ev.changed_fields||"").split(",").map(x=>x.trim()).filter(Boolean);
  return (
    <div className="border border-lma-line rounded-[14px] p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-bold text-lma-ink">Edit {ev.letter}</span>
        <span className="text-[10px] text-lma-ink-3 ml-auto">{ev.edited_at}</span>
      </div>
      {fields.length===0?(
        <div className="text-[11px] text-lma-ink-3">No field-level changes recorded.</div>
      ):(
        <div className="space-y-1">
          {fields.map(fk=>(
            <div key={fk} className="flex items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-lma-ink-2 w-28 shrink-0 truncate">{fieldLabel(fk)}</span>
              <span className="text-lma-danger line-through truncate max-w-[90px]">{dispVal(before[fk])}</span>
              <span className="text-lma-ink-3">→</span>
              <span className="text-lma-accent font-semibold truncate max-w-[90px]">{dispVal(after[fk])}</span>
            </div>
          ))}
        </div>
      )}
      {ev.remark&&<div className="text-[11px] text-lma-ink-3 mt-1.5 pt-1.5 border-t border-lma-line">Note: {ev.remark}</div>}
      {ev.whatsapp_text&&(
        <div className="mt-2 flex gap-2">
          <WhatsAppButton phones={phones} text={ev.whatsapp_text} label="Send update" className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-lma-accent/10 text-lma-accent disabled:opacity-40"/>
          <button onClick={()=>{ navigator.clipboard.writeText(ev.whatsapp_text||""); }} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-lma-bg text-lma-ink-3">Copy</button>
        </div>
      )}
    </div>
  );
}

// ── MONEY TRAIL — click-to-load (never auto-fetched) ──
// autoOpen: loads straight away (used by the Ledger's entry sheet). Default false = unchanged behaviour.
export function MoneyTrail({receiptNo, autoOpen=false}:{receiptNo:string; autoOpen?:boolean}){
  const [open,setOpen]=useState(autoOpen);
  const [t,setT]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const fetchTrail=useCallback(async()=>{
    setLoading(true); setErr("");
    try{
      const r=await fetch(`${API}?action=getReceiptMoneyTrail&receipt_no=${encodeURIComponent(receiptNo)}`).then(x=>x.json());
      if(r&&r.ok) setT(r); else setErr(r&&r.error?r.error:"Could not load money trail (redeploy backend?).");
    }catch{ setErr("Network error loading money trail."); }
    setLoading(false);
  },[receiptNo]);
  useEffect(()=>{ if(autoOpen) fetchTrail(); },[autoOpen,fetchTrail]);
  const toggle=async()=>{
    if(t || open){ setOpen(o=>!o); return; }
    setOpen(true);
    await fetchTrail();
  };
  const inr=(n:number)=>"₹"+Math.round(n).toLocaleString("en-IN");
  return (
    <div className="mt-3">
      <button type="button" onClick={toggle} aria-expanded={open} className="lma-noscale flex h-12 w-full items-center justify-between rounded-[14px] bg-lma-surface px-3.5 text-[14px] font-semibold text-lma-ink ring-1 ring-inset ring-lma-line active:bg-lma-bg">
        <span>Money trail</span><span className="text-[12.5px] font-medium text-lma-ink-3">{open?"hide ▴":"show ▾"}</span>
      </button>
      {open&&(
        <div className="mt-1.5 bg-lma-bg rounded-[14px] p-3 text-[11px]">
          {loading ? <div className="text-lma-ink-3">Loading money trail…</div>
          : err ? <div className="text-lma-danger">⚠ {err}</div>
          : t ? (
            <>
              <div className="grid grid-cols-2 gap-y-1 gap-x-3">
                <span className="text-lma-ink-3">Fee</span><span className="text-right font-bold text-lma-ink">{inr(t.fee)}</span>
                <span className="text-lma-ink-3">Paid at receipt</span><span className="text-right font-bold text-lma-ink">{inr(t.totals.initial_paid)}</span>
                {t.totals.dues_received>0&&<><span className="text-lma-accent">Dues received</span><span className="text-right font-bold text-lma-accent">{inr(t.totals.dues_received)}</span></>}
                {t.totals.refunds_total>0&&<><span className="text-lma-danger">Refunds made</span><span className="text-right font-bold text-lma-danger">−{inr(t.totals.refunds_total)}</span></>}
                <span className="text-lma-ink-3">Outstanding balance</span><span className={`text-right font-bold ${t.fees_due_balance>0?"text-lma-warn":"text-lma-ink"}`}>{inr(t.fees_due_balance)}</span>
              </div>
              {(t.initial_payments&&t.initial_payments.filter((p:any)=>p.mode||p.amount).length>0)&&(
                <div className="mt-2 pt-2 border-t border-lma-line space-y-0.5">
                  <div className="text-[10px] font-bold text-lma-ink-3">Paid at receipt</div>
                  {t.initial_payments.filter((p:any)=>p.mode||p.amount).map((p:any,i:number)=>(
                    <div key={"ip"+i} className="flex justify-between text-[10px]"><span className="text-lma-ink-3">{p.mode||"—"} · {p.date?fmtDMY(p.date):"—"}</span><span className="font-bold text-lma-ink-2">{inr(p.amount)}</span></div>
                  ))}
                </div>
              )}
              {(t.dues_payments.length>0||t.refunds.length>0)&&(
                <div className="mt-2 pt-2 border-t border-lma-line space-y-0.5">
                  {t.dues_payments.map((d:any)=>(
                    <div key={d.payment_id} className="flex justify-between text-[10px]"><span className="text-lma-ink-3">Dues · {d.mode} · {fmtDMYT(d.received_on)}</span><span className="font-bold text-lma-accent">{inr(d.amount)}</span></div>
                  ))}
                  {t.refunds.map((r:any)=>(
                    <div key={r.refund_id} className="flex justify-between text-[10px]"><span className="text-lma-ink-3">Refund · {r.mode} · {fmtDMYT(r.refund_date)}</span><span className="font-bold text-lma-danger">−{inr(r.amount)}</span></div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── EDIT SEAT PICKER ──
interface ESP_Cell { row_in_section:number; col_in_section:number; display_label:string; cell_type:string; state:string; occupant?:{name:string}|null; share_note?:string|null; }
interface ESP_Resp { ok:boolean; needs_seat:boolean; sections:{section_name:string;section_order:number;rows:number;cols:number;seats:ESP_Cell[]}[]; }
function EditSeatPicker({ library, branch, shift, currentSeat, ignoreReceiptNo, onClose, onPick }:{
  library:string; branch:string; shift:string; currentSeat:string; ignoreReceiptNo:string;
  onClose:()=>void; onPick:(label:string)=>void;
}){
  const [data,setData]=useState<ESP_Resp|null>(null);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [picked,setPicked]=useState(currentSeat||"");

  useEffect(()=>{
    let alive=true; setLoading(true); setErr("");
    const p=new URLSearchParams({ action:"getVacantSeats", library_code:library, shift:shift, ignore_receipt_no:ignoreReceiptNo });
    if(branch) p.set("branch_code",branch);
    fetch(`${API}?${p}`).then(r=>r.json()).then((r:ESP_Resp)=>{ if(!alive)return; if(r&&r.ok!==false){ setData(r);} else setErr("Could not load seats."); setLoading(false); })
      .catch(()=>{ if(alive){ setErr("Network error loading seats."); setLoading(false); } });
    return ()=>{ alive=false; };
  },[library,branch,shift,ignoreReceiptNo]);

  return (
    <div className="fixed inset-0 z-[10001] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50"/>
      <div className="relative w-full max-w-md bg-white rounded-t-[24px] p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-line rounded-full mx-auto mb-4"/>
        <h3 className="text-base font-bold text-lma-ink mb-1">Pick seat — {shift}</h3>
        <p className="text-[12px] text-lma-ink-3 mb-3">Green = available for this shift. Your current seat is highlighted.</p>
        {loading?(<div className="text-center text-sm text-lma-ink-3 py-8">Loading seats…</div>)
        :err?(<div className="text-center text-sm text-lma-danger py-8">{err}</div>)
        :!data||!data.sections?(<div className="text-center text-sm text-lma-ink-3 py-8">No layout.</div>)
        :(
          <div className="space-y-4">
            {data.sections.slice().sort((a,b)=>a.section_order-b.section_order).map(sec=>(
              <div key={sec.section_name}>
                {data.sections.length>1&&<div className="text-[11px] font-bold text-lma-ink-3 mb-1.5">{sec.section_name}</div>}
                <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${sec.cols}, minmax(28px, 1fr))`}}>
                  {Array.from({length:sec.rows*sec.cols}).map((_,idx)=>{
                    const r=Math.floor(idx/sec.cols)+1,c=(idx%sec.cols)+1;
                    const cell=sec.seats.find(s=>s.row_in_section===r&&s.col_in_section===c);
                    if(!cell) return <div key={idx} className="aspect-square"/>;
                    if(cell.cell_type==="DEAD") return <div key={idx} className="aspect-square rounded" style={{background:"#e2e8f0",border:"1px solid #cbd5e1"}}/>;
                    const isVacant=cell.state==="VACANT";
                    const isCurrent=currentSeat&&cell.display_label===currentSeat;
                    const isPicked=picked===cell.display_label;
                    const tone=isPicked?{bg:"#4f46e5",fg:"#fff",bd:"#4f46e5"}
                      :isCurrent?{bg:"#fffbeb",fg:"#b45309",bd:"#f59e0b"}
                      :isVacant?{bg:"#f0fdf4",fg:"#15803d",bd:"#86efac"}
                      :{bg:"#f1f5f9",fg:"#94a3b8",bd:"#e2e8f0"};
                    return (
                      <button key={idx} type="button" disabled={!isVacant} onClick={()=>setPicked(cell.display_label)}
                        title={cell.occupant?cell.occupant.name:(cell.share_note||"")}
                        className="aspect-square rounded text-[9px] font-bold flex items-center justify-center disabled:cursor-not-allowed"
                        style={{background:tone.bg,color:tone.fg,border:`${isCurrent?"1.5px dashed":"1px solid"} ${tone.bd}`}}>
                        {cell.display_label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-5 sticky bottom-0 bg-white pt-2">
          <button type="button" onClick={()=>onPick("")} className="flex-1 py-3 rounded-[14px] bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold text-sm">Unassign (blank)</button>
          <button type="button" disabled={!picked} onClick={()=>onPick(picked)} className="flex-1 py-3 rounded-[14px] lma-glass-btn text-white font-bold disabled:opacity-50">{picked?`Use ${picked}`:"Pick a seat"}</button>
        </div>
      </div>
    </div>
  );
}