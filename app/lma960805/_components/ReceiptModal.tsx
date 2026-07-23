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
import { useState, useEffect } from "react";
import { useLMA } from "./LMAProvider";
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
  fees_due:number; fees_due_balance:number; type:string; is_cross_library:string;
  status:string; dues_status:string; renewed_from:string; gender:string; cancelled_on:string;
  receipt_text:string; registration_text:string; generated_at:string; remark:string;
}
interface EditEvent { letter:string; edited_at:string; remark:string; changed_fields:string; before:string; after:string; whatsapp_text?:string; }

export default function ReceiptModal({ receiptNo, onClose, onSaved, context }:{
  receiptNo:string; onClose:()=>void; onSaved?:()=>void; context?:"dues"|"refunds";
}) {
  const { init, post, showToast } = useLMA();
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
  const doNotRenew = async () => { if(!receipt) return; if(!confirm(`Flag receipt ${receipt.receipt_no} as Do-Not-Renew?`)) return; const r=await post("markReceiptDoNotRenew",{receipt_no:receipt.receipt_no}); if(r&&r.ok!==false){ showToast("Marked: do not renew"); refresh(); } else showToast((r&&r.error)||"Failed","error"); };

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
          <div className="py-10 text-center text-sm text-lma-slate-500">Loading…</div>
        ) : !receipt ? (
          <div className="py-10 text-center">
            <p className="text-sm text-lma-slate-500 mb-4">Receipt not found.</p>
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Close</button>
          </div>
        ) : mode === "view" ? (
          <>
            <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">{receipt.receipt_no}</h3>
            <button onClick={()=>setShowStudent(true)} className="block text-left text-xs text-lma-primary font-bold hover:underline mb-2">{receipt.student_id} · {receipt.name}</button>
            <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[10px]">
              <span className="font-bold px-2 py-0.5 rounded bg-lma-slate-100 text-lma-slate-600">{receipt.branch||receipt.library}</span>
              {receipt.seat_no&&<span className="font-bold px-2 py-0.5 rounded bg-lma-slate-100 text-lma-slate-600">Seat {receipt.seat_no}</span>}
              <span className="font-bold px-2 py-0.5 rounded bg-lma-slate-100 text-lma-slate-600">{receipt.shift_name||receipt.shift}</span>
              {(()=>{ const b=rcptStatus(receipt); return <span className={`font-bold px-2 py-0.5 rounded ${b.cls}`}>{b.label}</span>; })()}
              <span className="font-bold px-2 py-0.5 rounded bg-lma-slate-100 text-lma-slate-600 ml-auto">until {fmtDMY(receipt.booking_to)}</span>
            </div>
            {receipt.generated_at&&<div className="text-[10px] text-lma-slate-400 mb-2">Created {fmtDMYT(receipt.generated_at)}</div>}
            <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-56 overflow-y-auto">{receipt.receipt_text}</pre>
            {receipt.remark&&<div className="text-[11px] text-lma-slate-500 mt-1.5 italic">📝 {receipt.remark}</div>}
            <MoneyTrail receiptNo={receipt.receipt_no}/>
            {context!=="refunds"&&receipt.fees_due_balance>0&&<CollectDueInline receiptNo={receipt.receipt_no} balance={receipt.fees_due_balance} post={post} showToast={showToast} onChanged={refresh} onEvent={(t)=>{setShareLabel("Due collected");setShareText(t);}}/>}
            {context!=="dues"&&<RefundInline receiptNo={receipt.receipt_no} post={post} showToast={showToast} onChanged={refresh} onEvent={(t)=>{setShareLabel("Refund issued");setShareText(t);}}/>}
            <div className={`grid gap-2 mt-3 ${receipt.type==="NEW"&&receipt.registration_text?"grid-cols-4":"grid-cols-3"}`}>
              <button onClick={()=>setStudentSend(true)} className="py-2.5 rounded-xl bg-lma-accent/10 text-lma-accent font-bold text-xs">📋 Student</button>
              {receipt.type==="NEW"&&receipt.registration_text&&(
                <button onClick={()=>{ navigator.clipboard.writeText(receipt.registration_text); showToast("Group copy"); }} className="py-2.5 rounded-xl bg-lma-primary/10 text-lma-primary font-bold text-xs">📢 Group</button>
              )}
              <ContactCopyButton name={receipt.name} library={receipt.branch||receipt.library} studentId={receipt.student_id} phones={receipt.phones} onCopied={showToast} className="w-full py-2.5 rounded-xl bg-lma-warn/10 text-lma-warn font-bold text-xs whitespace-nowrap"/><WhatsAppButton phones={receipt.phones} className="w-full py-2.5 rounded-xl bg-lma-accent/10 text-lma-accent font-bold text-xs disabled:opacity-40"/>
            </div>
            {(() => {
              const bookingActions = (<>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button onClick={()=>setShowRenew(true)} className="py-2.5 rounded-xl bg-lma-accent/10 text-lma-accent font-bold text-xs">🔄 Renew</button>
                  <button onClick={()=>setShowReAllot(true)} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">🔀 Re-Allot</button>
                </div>
                {(()=>{ const st=(receipt.status||"").toUpperCase();
                  if(st==="CANCELLED") return <div className="mt-2 py-2.5 rounded-xl bg-lma-danger/10 text-lma-danger font-bold text-xs text-center">Cancelled</div>;
                  if(st==="RENEWED") return <div className="mt-2 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-500 font-bold text-xs text-center">Renewed</div>;
                  const iso=toIsoInput(receipt.booking_to); const expired=!!iso&&iso<new Date().toISOString().slice(0,10);
                  if(expired||st==="DO_NOT_RENEW") return <button onClick={doNotRenew} className="mt-2 w-full py-2.5 rounded-xl bg-lma-warn/10 text-lma-warn font-bold text-xs">🚫 Do Not Renew</button>;
                  return <button onClick={()=>setShowCancel(true)} className="mt-2 w-full py-2.5 rounded-xl bg-lma-danger/10 text-lma-danger font-bold text-xs">✕ Cancel Booking</button>;
                })()}
              </>);
              const opposite = context==="dues"
                ? <RefundInline receiptNo={receipt.receipt_no} post={post} showToast={showToast} onChanged={refresh} onEvent={(t)=>{setShareLabel("Refund issued");setShareText(t);}}/>
                : (context==="refunds" && receipt.fees_due_balance>0 ? <CollectDueInline receiptNo={receipt.receipt_no} balance={receipt.fees_due_balance} post={post} showToast={showToast} onChanged={refresh} onEvent={(t)=>{setShareLabel("Due collected");setShareText(t);}}/> : null);
              return context ? <MoreActions>{opposite}{bookingActions}</MoreActions> : bookingActions;
            })()}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={()=>setMode("edit")} className="py-2.5 rounded-xl bg-lma-primary text-white font-bold text-xs">✏️ Edit</button>
              <button onClick={openHistory} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">History</button>
            </div>
          </>
        ) : mode === "history" ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-extrabold text-lma-slate-900">Edit history · {receipt.receipt_no}</h3>
              <button onClick={()=>setMode("view")} className="text-lma-slate-400 text-2xl leading-none">×</button>
            </div>
            {history===null ? (
              <p className="text-sm text-lma-slate-500">Loading…</p>
            ) : history.length===0 ? (
              <p className="text-sm text-lma-slate-500">No edits recorded yet.</p>
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
      {showCancel && receipt && init && <CancelPanel receipt={receipt} init={init} post={post} showToast={showToast} onClose={()=>setShowCancel(false)} onDone={()=>{ setShowCancel(false); refresh(); }}/>}

      {studentSend && receipt && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center px-6" onClick={()=>setStudentSend(false)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
            <h4 className="text-sm font-extrabold text-lma-slate-900 mb-1">Student receipt</h4>
            <p className="text-[12px] text-lma-slate-500 mb-3">Copy the text, or send it on WhatsApp.</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={()=>setStudentSend(false)} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Cancel</button>
              <button onClick={()=>{ navigator.clipboard.writeText(receipt.receipt_text); showToast("Student copy"); setStudentSend(false); }} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Copy</button>
              <WhatsAppButton phones={receipt.phones} text={receipt.receipt_text} label="Send" className="w-full py-2.5 rounded-xl bg-lma-accent text-white font-bold text-xs text-center disabled:opacity-40"/>
            </div>
          </div>
        </div>
      )}
      {shareText && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center px-6" onClick={()=>setShareText(null)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
            <h4 className="text-sm font-extrabold text-lma-slate-900 mb-1">{shareLabel}</h4>
            <p className="text-[12px] text-lma-slate-500 mb-3">Send the student a WhatsApp update?</p>
            <pre className="text-[10px] text-lma-slate-600 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-2.5 max-h-40 overflow-y-auto mb-3">{shareText}</pre>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={()=>setShareText(null)} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Skip</button>
              <button onClick={()=>{ navigator.clipboard.writeText(shareText); showToast("Copied"); }} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Copy</button>
              <WhatsAppButton phones={receipt?.phones} text={shareText} label="Send" className="w-full py-2.5 rounded-xl bg-lma-accent text-white font-bold text-xs text-center disabled:opacity-40"/>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── EDIT FORM ────────────────────────────────────────────────────
function EditForm({ receipt, init, onCancel, onSave }:{ receipt:Receipt; init:any; onCancel:()=>void; onSave:(p:any)=>void }){
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
    {mode:receipt.pay_mode_1,amount:_amt(receipt.pay_amount_1),date:normDateR(receipt.pay_mode_1_date||"")},
    {mode:receipt.pay_mode_2,amount:_amt(receipt.pay_amount_2),date:normDateR(receipt.pay_mode_2_date||"")},
    {mode:receipt.pay_mode_3,amount:_amt(receipt.pay_amount_3),date:normDateR(receipt.pay_mode_3_date||"")},
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
  const libObj=init.libraries.find((l:any)=>l.library_code===library);
  const libBranches=init.branches.filter((b:any)=>b.library_code===library&&b.active);

  const save=()=>{
    const validPays=pays.filter(p=>p.mode&&p.amount!=="").map(p=>({mode:p.mode,amount:Number(p.amount),date:p.date||""}));
    const shiftObj=activeShifts.find((s:any)=>s.shift_key.toUpperCase()===shift.toUpperCase());
    const cleanPhones=phones.filter(p=>p.number.trim()).map(p=>({number:normalizePhoneR(p.number),tag:(p.tag||"").toUpperCase()}));
    const nameChanged=(name||"").trim().toUpperCase()!==(receipt.name||"").trim().toUpperCase();
    let cascade=false;
    if(nameChanged){
      cascade=window.confirm("Name changed. Also update the student's master record (STUDENTS sheet)?\n\nOK = update master too\nCancel = only this receipt");
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
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Edit {receipt.receipt_no}</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">Every edit is logged in history.</p>
      <MoneyTrail receiptNo={receipt.receipt_no}/>
      {editCount!==null&&editCount>0&&(
        <div className="mt-2 text-[11px] text-lma-slate-500 bg-lma-slate-50 rounded-lg px-2.5 py-1.5">📝 This receipt has <b>{editCount}</b> past edit{editCount>1?"s":""} — open History to see old→new details.</div>
      )}
      <L>Name</L><I value={name} onChange={e=>setName(e.target.value.toUpperCase())}/>
      <div className="grid grid-cols-2 gap-3">
        <div><L>Seat</L>
          {isOther
            ? <div className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-[14px] font-medium text-lma-slate-400">no seat (OTHER)</div>
            : <button type="button" onClick={()=>setSeatPickerOpen(true)} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-[14px] font-medium text-left flex items-center justify-between">
                <span className={seat?"text-lma-slate-900":"text-lma-slate-400"}>{seat||"tap to pick / blank = unassigned"}</span>
                <span className="text-lma-primary text-xs font-bold">{seat?"Change":"Pick"}</span>
              </button>}
        </div>
        <div><L>Shift</L>
          <select value={shift} onChange={e=>onShiftChange(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
            {activeShifts.map((s:any)=><option key={s.shift_key} value={s.shift_key}>{s.shift_name}</option>)}
          </select>
        </div>
      </div>
      <L>Time window</L><I value={shiftTime} onChange={e=>setShiftTime(e.target.value)} placeholder="e.g. 7AM to 2PM"/>
      <div className="grid grid-cols-2 gap-3">
        <div><L>From</L><I type="date" value={toIsoInput(bookingFrom)} onChange={e=>setBookingFrom(normDateR(e.target.value))}/>{bookingFrom && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(bookingFrom)}</span>}</div>
        <div><L>To</L><I type="date" value={toIsoInput(bookingTo)} onChange={e=>setBookingTo(normDateR(e.target.value))}/>{bookingTo && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(bookingTo)}</span>}</div>
      </div>
      <L>Receipt date</L><I type="date" value={toIsoInput(receiptDate)} onChange={e=>setReceiptDate(normDateR(e.target.value))}/>{receiptDate && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(receiptDate)}</span>}
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
        <div key={i} className="mb-2">
          <div className="flex gap-2">
            <select value={p.mode} onChange={e=>setPay(i,"mode",e.target.value)} className="flex-1 px-2.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
              <option value="">Mode…</option>
              {init.paymentTags.filter((t:any)=>t.active).map((t:any)=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
            </select>
            <input type="number" value={p.amount} onChange={e=>setPay(i,"amount",e.target.value)} placeholder="₹" className="w-24 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
            {pays.length>1&&<button onClick={()=>setPays(pays.filter((_,j)=>j!==i))} className="px-2 text-lma-danger font-bold">✕</button>}
          </div>
          {p.mode&&<div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] font-bold text-lma-slate-400 shrink-0">Paid on</span>
            <input type="date" value={toIsoInput(p.date||"")} onChange={e=>setPay(i,"date",normDateR(e.target.value))} className="flex-1 px-2.5 py-2 rounded-lg border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-xs font-medium"/>
            {p.date&&<span className="text-[10px] font-bold text-lma-slate-500 shrink-0">{fmtDMY(p.date)}</span>}
          </div>}
        </div>
      ))}
      {pays.length<3&&<button onClick={()=>setPays([...pays,{mode:"",amount:"",date:""}])} className="text-xs font-bold text-lma-primary">+ Add payment</button>}
      <L>Fees Due (₹)</L><I type="number" value={feesDue} onChange={e=>setFeesDue(e.target.value)}/>

      <L>Phones</L>
      {phones.map((ph,i)=>(
        <div key={i} className="flex gap-2 mb-2">
          <input type="tel" inputMode="numeric" value={ph.number}
            onChange={e=>{const n=[...phones];n[i]={...n[i],number:normalizePhoneR(e.target.value)};setPhones(n);}}
            onBlur={()=>{const n=[...phones];n[i]={...n[i],number:normalizePhoneR(n[i].number)};setPhones(n);}}
            placeholder={i===0?"SELF (primary)":`Phone ${i+1}`}
            className="flex-1 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
          <input value={ph.tag} onChange={e=>{const n=[...phones];n[i]={...n[i],tag:e.target.value.toUpperCase()};setPhones(n);}} placeholder="TAG" className="w-20 px-2 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium uppercase"/>
          {i>0&&<button type="button" onClick={()=>setPhones(phones.filter((_,j)=>j!==i))} className="px-3 rounded-xl bg-lma-slate-100 text-lma-slate-500 font-extrabold text-lg leading-none">×</button>}
        </div>
      ))}
      {phones.length<4&&<button type="button" onClick={()=>setPhones([...phones,{number:"",tag:""}])} className="text-xs font-bold text-lma-primary mb-1">+ Add phone</button>}

      <button onClick={()=>setShowAdvanced(v=>!v)} className="block text-xs font-bold text-lma-slate-500 mt-2">{showAdvanced?"▾ Hide advanced":"▸ Advanced (ID, library, branch, cross)"}</button>
      {showAdvanced&&(
        <div className="mt-1 bg-lma-slate-50 rounded-xl p-3 space-y-2">
          <div><L>Student ID</L><I value={studentId} onChange={e=>setStudentId(e.target.value.toUpperCase())}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><L>Library</L>
              <select value={library} onChange={e=>{setLibrary(e.target.value);setBranch("");}} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-sm font-medium">
                {init.libraries.filter((l:any)=>l.active).map((l:any)=><option key={l.library_code} value={l.library_code}>{l.library_code}</option>)}
              </select>
            </div>
            <div><L>Branch</L>
              {libObj?.has_branches&&libBranches.length>0
                ? <select value={branch} onChange={e=>setBranch(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-sm font-medium">
                    <option value="">—</option>
                    {libBranches.map((b:any)=><option key={b.branch_code} value={b.branch_code}>{b.branch_code}</option>)}
                  </select>
                : <div className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-[14px] font-medium text-lma-slate-400">no branches</div>}
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
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        <button onClick={save} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">Save</button>
      </div>
    </div>
  );
}

function MoreActions({ children }:{ children:React.ReactNode }){
  const [open,setOpen]=useState(false);
  return (
    <div className="mt-2">
      <button onClick={()=>setOpen(o=>!o)} className="w-full py-2 rounded-xl bg-lma-slate-100 text-lma-slate-500 font-bold text-[11px]">⋯ More actions {open?"▴":"▾"}</button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

function CancelPanel({ receipt, init, post, showToast, onClose, onDone }:{ receipt:Receipt; init:any; post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void; onClose:()=>void; onDone:()=>void }){
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
      const r=await post("markReceiptCancelledWithRefund",{receipt_no:receipt.receipt_no,cancel_remark:remark,refund_mode:refundMode,refund_amount:Number(refundAmount),refund_reason:refundReason});
      setBusy(false);
      if(r&&r.cancelled){ showToast("Cancelled + refunded"); onDone(); } else showToast((r&&r.error)||"Cancel failed","error");
    }else{
      const r=await post("markReceiptCancelled",{receipt_no:receipt.receipt_no,cancel_remark:remark});
      setBusy(false);
      if(r&&r.updated){ showToast("Cancelled"); onDone(); } else showToast((r&&r.error)||"Cancel failed","error");
    }
  };
  return (
    <Sheet onClose={onClose}>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Cancel {receipt.receipt_no}</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">{receipt.name} · Seat {receipt.seat_no||"—"} · {receipt.shift_name||receipt.shift}</p>
      {receipt.fees_due_balance>0&&<div className="text-[11px] font-bold text-lma-danger bg-lma-danger/10 rounded-lg p-2 mb-3">⚠ ₹{receipt.fees_due_balance} dues outstanding on this receipt.</div>}
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={withRefund} onChange={e=>setWithRefund(e.target.checked)} className="w-4 h-4 accent-lma-primary"/>
        <span className="text-sm font-semibold text-lma-slate-700">Issue a refund with this cancellation</span>
      </label>
      {withRefund&&(
        <div className="bg-lma-slate-50 rounded-xl p-3 mb-3 space-y-2">
          <div><L>Refund Mode</L>
            <select value={refundMode} onChange={e=>setRefundMode(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-sm font-medium"><option value="">Select…</option>{(init?.paymentTags||[]).filter((t:any)=>t.active).map((t:any)=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}</select>
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
  if(!open) return <button onClick={()=>setOpen(true)} className="mt-2 w-full py-2 rounded-xl bg-lma-danger/10 text-lma-danger font-bold text-xs">💰 Collect Due (₹{balance})</button>;
  return (
    <div className="mt-2 rounded-xl border border-lma-danger/30 bg-lma-danger/5 p-3 space-y-2">
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-lma-slate-300 text-sm bg-white"/>
      <div className="flex gap-2">
        <input type="number" inputMode="decimal" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="Amount" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-lma-slate-300 text-sm"/>
        <select value={mode} onChange={e=>setMode(e.target.value)} className="px-2 py-2 rounded-lg border border-lma-slate-300 text-sm bg-white"><option value="">Mode…</option>{modes.map(m=><option key={m} value={m}>{m}</option>)}</select>
      </div>
      {err&&<div className="text-[11px] font-bold text-lma-danger">{err}</div>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={()=>{setOpen(false);setErr("");}} className="flex-1 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs disabled:opacity-50">Cancel</button>
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
  if(!open) return <button onClick={()=>setOpen(true)} className="mt-2 w-full py-2 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">↩ Issue Refund (standalone)</button>;
  return (
    <div className="mt-2 rounded-xl border border-lma-slate-300 bg-lma-slate-50 p-3 space-y-2">
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-lma-slate-300 text-sm bg-white"/>
      <div className="flex gap-2">
        <input type="number" inputMode="decimal" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="Refund amount" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-lma-slate-300 text-sm"/>
        <select value={mode} onChange={e=>setMode(e.target.value)} className="px-2 py-2 rounded-lg border border-lma-slate-300 text-sm bg-white"><option value="">Mode…</option>{modes.map(m=><option key={m} value={m}>{m}</option>)}</select>
      </div>
      <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)" className="w-full px-3 py-2 rounded-lg border border-lma-slate-300 text-sm"/>
      {err&&<div className="text-[11px] font-bold text-lma-danger">{err}</div>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={()=>{setOpen(false);setErr("");}} className="flex-1 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs disabled:opacity-50">Cancel</button>
        <button disabled={busy} onClick={submit} className="flex-1 py-2 rounded-lg bg-lma-warn text-white font-bold text-xs disabled:opacity-50">{busy?"…":"Refund"}</button>
      </div>
    </div>
  );
}

function rcptStatus(r:{status:string;cancelled_on?:string}):{label:string;cls:string}{
  const st=(r.status||"").toUpperCase();
  if(st==="CANCELLED"){ const d=r.cancelled_on?Math.floor((Date.now()-new Date(r.cancelled_on).getTime())/86400000):NaN; const ago=isNaN(d)?"":(d<=0?" · today":` · ${d}d ago`); return {label:"Cancelled"+ago, cls:"bg-lma-danger/15 text-lma-danger"}; }
  if(st==="DO_NOT_RENEW") return {label:"Do Not Renew", cls:"bg-lma-warn/15 text-lma-warn"};
  if(st==="RENEWED")      return {label:"Renewed",      cls:"bg-lma-slate-200 text-lma-slate-600"};
  return {label:"Active", cls:"bg-lma-accent/15 text-lma-accent"};
}

function Sheet({ onClose, children, cardStyle }:{ onClose:()=>void; children:React.ReactNode; cardStyle?:React.CSSProperties }){
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" style={cardStyle} onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        {children}
      </div>
    </div>
  );
}
function L({ children }:{ children:React.ReactNode }){ return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1 mt-2">{children}</label>; }
function I({className="",...props}:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className={`w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium ${className}`}/>; }

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
    <div className="border border-lma-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-extrabold text-lma-slate-900">Edit {ev.letter}</span>
        <span className="text-[10px] text-lma-slate-400 ml-auto">{ev.edited_at}</span>
      </div>
      {fields.length===0?(
        <div className="text-[11px] text-lma-slate-500">No field-level changes recorded.</div>
      ):(
        <div className="space-y-1">
          {fields.map(fk=>(
            <div key={fk} className="flex items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-lma-slate-600 w-28 shrink-0 truncate">{fieldLabel(fk)}</span>
              <span className="text-lma-danger line-through truncate max-w-[90px]">{dispVal(before[fk])}</span>
              <span className="text-lma-slate-400">→</span>
              <span className="text-lma-accent font-semibold truncate max-w-[90px]">{dispVal(after[fk])}</span>
            </div>
          ))}
        </div>
      )}
      {ev.remark&&<div className="text-[11px] text-lma-slate-500 mt-1.5 pt-1.5 border-t border-lma-slate-100">Note: {ev.remark}</div>}
      {ev.whatsapp_text&&(
        <div className="mt-2 flex gap-2">
          <WhatsAppButton phones={phones} text={ev.whatsapp_text} label="Send update" className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-lma-accent/10 text-lma-accent disabled:opacity-40"/>
          <button onClick={()=>{ navigator.clipboard.writeText(ev.whatsapp_text||""); }} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-lma-slate-100 text-lma-slate-500">Copy</button>
        </div>
      )}
    </div>
  );
}

// ── MONEY TRAIL — click-to-load (never auto-fetched) ──
function MoneyTrail({receiptNo}:{receiptNo:string}){
  const [open,setOpen]=useState(false);
  const [t,setT]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const toggle=async()=>{
    if(t || open){ setOpen(o=>!o); return; }
    setOpen(true); setLoading(true); setErr("");
    try{
      const r=await fetch(`${API}?action=getReceiptMoneyTrail&receipt_no=${encodeURIComponent(receiptNo)}`).then(x=>x.json());
      if(r&&r.ok) setT(r); else setErr(r&&r.error?r.error:"Could not load money trail (redeploy backend?).");
    }catch{ setErr("Network error loading money trail."); }
    setLoading(false);
  };
  const inr=(n:number)=>"₹"+Math.round(n).toLocaleString("en-IN");
  return (
    <div className="mt-3">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-lma-slate-50 text-[12px] font-bold text-lma-slate-600 active:scale-[0.99]">
        <span>💰 Money trail</span><span className="text-lma-slate-400">{open?"▾":"▸ tap to load"}</span>
      </button>
      {open&&(
        <div className="mt-1.5 bg-lma-slate-50 rounded-xl p-3 text-[11px]">
          {loading ? <div className="text-lma-slate-400">Loading money trail…</div>
          : err ? <div className="text-lma-danger">⚠ {err}</div>
          : t ? (
            <>
              <div className="grid grid-cols-2 gap-y-1 gap-x-3">
                <span className="text-lma-slate-500">Fee</span><span className="text-right font-bold text-lma-slate-800">{inr(t.fee)}</span>
                <span className="text-lma-slate-500">Paid at receipt</span><span className="text-right font-bold text-lma-slate-800">{inr(t.totals.initial_paid)}</span>
                {t.totals.dues_received>0&&<><span className="text-lma-accent">Dues received</span><span className="text-right font-bold text-lma-accent">{inr(t.totals.dues_received)}</span></>}
                {t.totals.refunds_total>0&&<><span className="text-lma-danger">Refunds made</span><span className="text-right font-bold text-lma-danger">−{inr(t.totals.refunds_total)}</span></>}
                <span className="text-lma-slate-500">Outstanding balance</span><span className={`text-right font-extrabold ${t.fees_due_balance>0?"text-lma-warn":"text-lma-slate-800"}`}>{inr(t.fees_due_balance)}</span>
              </div>
              {(t.dues_payments.length>0||t.refunds.length>0)&&(
                <div className="mt-2 pt-2 border-t border-lma-slate-200 space-y-0.5">
                  {t.dues_payments.map((d:any)=>(
                    <div key={d.payment_id} className="flex justify-between text-[10px]"><span className="text-lma-slate-500">Dues · {d.mode} · {fmtDMYT(d.received_on)}</span><span className="font-bold text-lma-accent">{inr(d.amount)}</span></div>
                  ))}
                  {t.refunds.map((r:any)=>(
                    <div key={r.refund_id} className="flex justify-between text-[10px]"><span className="text-lma-slate-500">Refund · {r.mode} · {fmtDMYT(r.refund_date)}</span><span className="font-bold text-lma-danger">−{inr(r.amount)}</span></div>
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
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Pick seat — {shift}</h3>
        <p className="text-[12px] text-lma-slate-500 mb-3">Green = available for this shift. Your current seat is highlighted.</p>
        {loading?(<div className="text-center text-sm text-lma-slate-500 py-8">Loading seats…</div>)
        :err?(<div className="text-center text-sm text-lma-danger py-8">{err}</div>)
        :!data||!data.sections?(<div className="text-center text-sm text-lma-slate-500 py-8">No layout.</div>)
        :(
          <div className="space-y-4">
            {data.sections.slice().sort((a,b)=>a.section_order-b.section_order).map(sec=>(
              <div key={sec.section_name}>
                {data.sections.length>1&&<div className="text-[11px] font-bold text-lma-slate-500 mb-1.5">{sec.section_name}</div>}
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
                        className="aspect-square rounded text-[9px] font-extrabold flex items-center justify-center disabled:cursor-not-allowed"
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
          <button type="button" onClick={()=>onPick("")} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Unassign (blank)</button>
          <button type="button" disabled={!picked} onClick={()=>onPick(picked)} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50">{picked?`Use ${picked}`:"Pick a seat"}</button>
        </div>
      </div>
    </div>
  );
}