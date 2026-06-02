"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useLMA, useScopeChips, type LMAInitData as InitData } from "../layout";

const API = "/api/lma";

interface PhoneEntry { number:string; tag:string; }
interface Receipt {
  receipt_no:string; student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[];
  seat_no:string; shift:string; shift_name:string; shift_time:string;
  booking_from:string; booking_to:string; receipt_date:string; fee:number;
  pay_mode_1:string; pay_amount_1:number; pay_mode_2:string; pay_amount_2:number; pay_mode_3:string; pay_amount_3:number;
  fees_due:number; fees_due_balance:number; type:string; is_cross_library:string;
  status:string; dues_status:string; renewed_from:string;
  receipt_text:string; registration_text:string;
}
interface EditEvent { letter:string; edited_at:string; remark:string; changed_fields:string; before:string; after:string;  whatsapp_text?:string; }

type SearchType = "NAME"|"PHONE"|"STUDENT_ID"|"RECEIPT_NO";

function autoDetect(q:string): SearchType {
  const t=q.trim();
  if(!t) return "NAME";
  const s=t.replace(/[\s\-\.\(\)\+]/g,"");
  if(/^R\d+/i.test(t)) return "RECEIPT_NO";
  if(/^F\d+/i.test(t)) return "STUDENT_ID";
  if(/^\d{3,}$/.test(s)) return "PHONE";
  return "NAME";
}
function lifecycleBadge(r:Receipt, alertDays:number, hasSuccessor:boolean):{label:string;cls:string}{
  const st=(r.status||"").toUpperCase();
  if(st==="RENEWED")       return {label:"Renewed",      cls:"bg-lma-slate-200 text-lma-slate-600"};
  if(st==="CANCELLED")     return {label:"Cancelled",    cls:"bg-lma-danger/15 text-lma-danger"};
  if(st==="DO_NOT_RENEW")  return {label:"Do Not Renew", cls:"bg-lma-warn/15 text-lma-warn"};
  // #4: Rule-C orphan recovery — if a successor receipt exists (renewed_from=this),
  // treat as RENEWED even when status wasn't flipped (markReceiptRenewed failed).
  if(hasSuccessor)         return {label:"Renewed",      cls:"bg-lma-slate-200 text-lma-slate-600"};
  // live → compute from booking_to
  const days=daysFromToday(r.booking_to);
  if(days===null) return {label:"Current", cls:"bg-lma-accent/15 text-lma-accent"};
  if(days<0)      return {label:"Expired", cls:"bg-red-900/15 text-red-900"};
  if(days<=alertDays) return {label:"Expiring",cls:"bg-lma-danger/15 text-lma-danger"}; // #12: per-library threshold
  return {label:"Current", cls:"bg-lma-accent/15 text-lma-accent"};
}
function daysFromToday(dmy:string):number|null{
  if(!dmy) return null;
  const p=dmy.split("-"); if(p.length!==3) return null;
  const d=new Date(Number(p[2]),Number(p[1])-1,Number(p[0]));
  const today=new Date(); today.setHours(0,0,0,0);
  return Math.round((d.getTime()-today.getTime())/86400000);
}
// #19: tolerant date → DD-M-YYYY
function normDateR(v:string):string{
  if(!v) return "";
  if(typeof v!=="string") v=String(v);
  if(/^\d{1,2}-\d{1,2}-\d{4}$/.test(v)) return v;
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)){ const p=v.split("-"); return `${+p[2]}-${+p[1]}-${p[0]}`; }
  try{ const d=new Date(v); if(!isNaN(d.getTime())) return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }catch{}
  return v;
}
// #17: phone normalizer
function normalizePhoneR(input:string):string{
  if(!input) return "";
  let c=input.replace(/[\s\-\.\(\)]/g,"");
  if(c.startsWith("+91")) c=c.slice(3);
  else if(c.startsWith("91")&&c.length>10) c=c.slice(2);
  c=c.replace(/\D/g,"");
  if(c.length>10) c=c.slice(-10);
  return c;
}

export default function ReceiptsPage(){
  const { init, showToast, post } = useLMA();

  const [scope,setScope]=useState("");          // library/branch filter, "" = all
  const [search,setSearch]=useState("");
  const [receipts,setReceipts]=useState<Receipt[]>([]);
  const [page,setPage]=useState(1);
  const [totalPages,setTotalPages]=useState(1);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [view,setView]=useState<Receipt|null>(null);
  const [edit,setEdit]=useState<Receipt|null>(null);
  const [history,setHistory]=useState<{receipt_no:string;edits:EditEvent[]}|null>(null);
  const [shareText,setShareText]=useState<string|null>(null);
  const debounceRef=useRef<ReturnType<typeof setTimeout>|null>(null);



  const load=useCallback(async(pg:number,replace:boolean)=>{
    setLoading(true);
    const q=search.trim();
    const params=new URLSearchParams({action:"getReceiptLog",page:String(pg),limit:"20"});
    if(scope) params.set("library",scope);
    if(q){ params.set("q",q); params.set("search_type",autoDetect(q)); }
    const r=await fetch(`${API}?${params}`).then(r=>r.json());
    setLoading(false);
    if(r.receipts){
      setReceipts(prev=>replace?r.receipts:[...prev,...r.receipts]);
      setTotalPages(r.totalPages||1); setTotal(r.total||0); setPage(pg);
    }
  },[scope,search]);

  // reload on scope change / search (debounced)
  useEffect(()=>{
    if(debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current=setTimeout(()=>load(1,true),300);
  },[scope,search,load]);

  const openHistory=async(r:Receipt)=>{
    const res=await fetch(`${API}?action=getReceiptEditHistory&receipt_no=${encodeURIComponent(r.receipt_no)}`).then(x=>x.json());
    setHistory({receipt_no:r.receipt_no,edits:res.edits||[]});
  };

// chips (libraries + branches + an "All")
  const chips = useScopeChips();

  // #4: set of receipt_nos that are referenced as a predecessor (renewed_from) by another loaded receipt.
  const successorOf = useMemo(()=>{
    const s=new Set<string>();
    receipts.forEach(r=>{ if(r.renewed_from) s.add(String(r.renewed_from).toUpperCase()); });
    return s;
  },[receipts]);

  // #12: resolve per-library renewal_alert_days from init.settings; fallback 5.
  const alertDaysFor=useCallback((r:Receipt):number=>{
    const def=5;
    if(!init?.settings) return def;
    const key=(r.library||"").toUpperCase();
    const row=init.settings[key];
    if(!row) return def;
    const v=row["renewal_alert_days"];
    const n=Number(v);
    return (v!==undefined&&v!==null&&v!==""&&!isNaN(n)&&n>0)?n:def;
  },[init]);

  

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Receipts</h1><p className="text-[11px] text-lma-slate-500 font-medium">{total} total</p></div>
        <button onClick={()=>load(1,true)} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {/* scope chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.label}</button>
        ))}
      </div>

      {/* search */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, F-ID, R-no…" className="w-full px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-white focus:border-lma-primary outline-none text-sm font-medium mb-3 shadow-sm"/>

      {/* list */}
      {loading&&receipts.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):receipts.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">No receipts found.</div>
      ):(
        <div className="space-y-2">
          {receipts.map(r=>{
            const badge=lifecycleBadge(r, alertDaysFor(r), successorOf.has(String(r.receipt_no).toUpperCase()));
            return (
              <button key={r.receipt_no} onClick={()=>setView(r)} className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-extrabold text-lma-slate-900">{r.receipt_no}</span>
                  <span className="text-[10px] font-bold text-lma-slate-400">{r.student_id}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="text-sm font-semibold text-lma-slate-800 truncate">{r.name}</div>
                <div className="text-[11px] text-lma-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                  <span>{r.library}{r.branch?`/${r.branch}`:""}</span>
                  <span>· Seat {r.seat_no||"—"}</span>
                  <span>· {r.shift_name||r.shift}</span>
                  <span>· till {r.booking_to}</span>
                  {r.fees_due_balance>0&&<span className="font-bold text-lma-danger">· Due ₹{r.fees_due_balance}</span>}
                </div>
              </button>
            );
          })}
          {page<totalPages&&(
            <button onClick={()=>load(page+1,false)} disabled={loading} className="w-full py-2.5 rounded-xl border-[1.5px] border-dashed border-lma-primary/40 text-lma-primary font-bold text-sm disabled:opacity-50">{loading?"Loading…":"Load more"}</button>
          )}
        </div>
      )}

      {/* VIEW sheet */}
      {view&&(
        <Sheet onClose={()=>setView(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">{view.receipt_no}</h3>
          <p className="text-xs text-lma-slate-500 mb-3">{view.student_id} · {view.name}</p>
          <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-56 overflow-y-auto">{view.receipt_text}</pre>
          <MoneyTrail receiptNo={view.receipt_no}/>
          {/* #25: copy row — Student / Group(NEW only) / Contact */}
          <div className={`grid gap-2 mt-3 ${view.type==="NEW"&&view.registration_text?"grid-cols-3":"grid-cols-2"}`}>
            <button onClick={()=>{ navigator.clipboard.writeText(view.receipt_text); showToast("Student copy"); }} className="py-2.5 rounded-xl bg-lma-accent/10 text-lma-accent font-bold text-xs">📋 Student</button>
            {view.type==="NEW"&&view.registration_text&&(
              <button onClick={()=>{ navigator.clipboard.writeText(view.registration_text); showToast("Group copy"); }} className="py-2.5 rounded-xl bg-lma-primary/10 text-lma-primary font-bold text-xs">📢 Group</button>
            )}
            <button onClick={()=>{ navigator.clipboard.writeText(`${view.name} ${view.library} ${view.student_id}`); showToast("Contact copy"); }} className="py-2.5 rounded-xl bg-lma-warn/10 text-lma-warn font-bold text-xs">📇 Contact</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button onClick={()=>{ setEdit(view); setView(null); }} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-700 font-bold text-xs">Edit</button>
            <button onClick={()=>{ openHistory(view); }} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">History</button>
          </div>
        </Sheet>
      )}

      {/* EDIT sheet */}
      {edit&&init&&(
        <Sheet onClose={()=>setEdit(null)}>
          <EditForm receipt={edit} init={init} onCancel={()=>setEdit(null)} onSave={async(payload)=>{
            const res=await post("updateReceipt",payload);
            if(res){ setEdit(null); load(1,true);
              if(res.whatsapp_text){ setShareText(res.whatsapp_text); }
              else showToast("Receipt updated");
            }
          }}/>
        </Sheet>
      )}

      {/* HISTORY sheet */}
      {history&&(
        <Sheet onClose={()=>setHistory(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-3">Edit history · {history.receipt_no}</h3>
          {history.edits.length===0?(
            <p className="text-sm text-lma-slate-500">No edits recorded yet.</p>
          ):(
            <div className="space-y-2">
              {history.edits.map(ev=><EditEventCard key={ev.letter} ev={ev}/>)}
            </div>
          )}
        </Sheet>
      )}

      {shareText&&(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center px-6" onClick={()=>setShareText(null)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
            <h4 className="text-sm font-extrabold text-lma-slate-900 mb-1">Receipt updated</h4>
            <p className="text-[12px] text-lma-slate-500 mb-3">Send the student a WhatsApp update?</p>
            <pre className="text-[10px] text-lma-slate-600 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-2.5 max-h-40 overflow-y-auto mb-3">{shareText}</pre>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={()=>setShareText(null)} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Skip</button>
              <button onClick={()=>{ navigator.clipboard.writeText(shareText); showToast("Copied"); }} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Copy</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" onClick={()=>setShareText(null)} className="py-2.5 rounded-xl bg-lma-accent text-white font-bold text-xs text-center">Share</a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── EDIT FORM ────────────────────────────────────────────────────
function EditForm({ receipt, init, onCancel, onSave }:{ receipt:Receipt; init:InitData; onCancel:()=>void; onSave:(p:any)=>void }){
  const [name,setName]=useState(receipt.name);
  const [seat,setSeat]=useState(receipt.seat_no);
  const [shift,setShift]=useState(receipt.shift);
  // #19: normalize incoming dates so the inputs read consistently
  const [bookingFrom,setBookingFrom]=useState(normDateR(receipt.booking_from));
  const [bookingTo,setBookingTo]=useState(normDateR(receipt.booking_to));
  const [receiptDate,setReceiptDate]=useState(normDateR(receipt.receipt_date)); // #13
  const [fee,setFee]=useState(String(receipt.fee));
  // #16: 0 is a legit amount — show it, don't blank it. Only blank when undefined/null.
  const _amt=(v:number)=>(v===undefined||v===null||(v as any)==="")?"":String(v);
  const [pays,setPays]=useState([
    {mode:receipt.pay_mode_1,amount:_amt(receipt.pay_amount_1)},
    {mode:receipt.pay_mode_2,amount:_amt(receipt.pay_amount_2)},
    {mode:receipt.pay_mode_3,amount:_amt(receipt.pay_amount_3)},
  ].filter(p=>p.mode));
  const [feesDue,setFeesDue]=useState(String(receipt.fees_due));
  // #13: additional editable fields
  const [phones,setPhones]=useState<PhoneEntry[]>(()=>{
    const base=(receipt.phones||[]).map(p=>({number:p.number,tag:p.tag}));
    while(base.length<4) base.push({number:"",tag:""});
    return base.slice(0,4);
  });
  const [studentId,setStudentId]=useState(receipt.student_id);
  const [library,setLibrary]=useState(receipt.library);
  const [branch,setBranch]=useState(receipt.branch);
  const [isCross,setIsCross]=useState(receipt.is_cross_library||"");
  const [showAdvanced,setShowAdvanced]=useState(false);
  const [editCount,setEditCount]=useState<number|null>(null);
  const [seatPickerOpen,setSeatPickerOpen]=useState(false);
  // load how many past edits this receipt already has (shown inline)
  useEffect(()=>{
    let alive=true;
    fetch(`${API}?action=getReceiptEditHistory&receipt_no=${encodeURIComponent(receipt.receipt_no)}`)
      .then(r=>r.json()).then(r=>{ if(alive) setEditCount(r&&Array.isArray(r.edits)?r.edits.length:0); })
      .catch(()=>{ if(alive) setEditCount(null); });
    return ()=>{ alive=false; };
  },[receipt.receipt_no]);

  // Standard fee for the currently-selected shift (from the fee matrix).
  const feeKey = (branch||library||"").toUpperCase();
  const stdFee = (init.fees && init.fees[feeKey]) ? init.fees[feeKey][shift.toUpperCase()] : undefined;
  const shiftChanged = shift.toUpperCase() !== (receipt.shift||"").toUpperCase();
  const feeMismatch = shiftChanged && typeof stdFee==="number" && stdFee !== Number(fee);
  const isOther = !["MORNING","EVENING","FULL DAY","FULLDAY","FD"].includes(shift.toUpperCase());
  const onShiftChange=(v:string)=>{ setShift(v); if(!["MORNING","EVENING","FULL DAY","FULLDAY","FD"].includes(v.toUpperCase())) setSeat(""); };
  const [remark,setRemark]=useState("");

  const activeShifts=init.shifts.filter(s=>s.active);
  const setPay=(i:number,f:"mode"|"amount",v:string)=>{const n=[...pays];n[i]={...n[i],[f]:v};setPays(n);};

  // branch options for the selected library
  const libObj=init.libraries.find(l=>l.library_code===library);
  const libBranches=init.branches.filter(b=>b.library_code===library&&b.active);

  const save=()=>{
    const validPays=pays.filter(p=>p.mode&&p.amount!=="").map(p=>({mode:p.mode,amount:Number(p.amount)}));
    const shiftObj=activeShifts.find(s=>s.shift_key.toUpperCase()===shift.toUpperCase());
    const cleanPhones=phones.filter(p=>p.number.trim()).map(p=>({number:normalizePhoneR(p.number),tag:(p.tag||"").toUpperCase()}));
    const nameChanged=(name||"").trim().toUpperCase()!==(receipt.name||"").trim().toUpperCase();
    // #14: ask each time when name changed
    let cascade=false;
    if(nameChanged){
      cascade=window.confirm("Name changed. Also update the student's master record (STUDENTS sheet)?\n\nOK = update master too\nCancel = only this receipt");
    }
    onSave({
      receipt_no:receipt.receipt_no,
      name, seat_no:seat, shift,
      shift_name:shiftObj?.shift_name||receipt.shift_name, shift_time:shiftObj?.shift_time||receipt.shift_time,
      booking_from:bookingFrom, booking_to:bookingTo, receipt_date:receiptDate,
      fee:Number(fee), pay_modes:validPays,
      fees_due:Number(feesDue),
      phones:cleanPhones,
      student_id:studentId, library, branch, is_cross_library:isCross,
      cascade_name_to_student:cascade,
      editor_remark:remark,
    });
  };

  return (
    <div>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Edit {receipt.receipt_no}</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">Every edit is logged in history.</p>
      <MoneyTrail receiptNo={receipt.receipt_no}/>
      {editCount!==null&&editCount>0&&(
        <div className="mt-2 text-[11px] text-lma-slate-500 bg-lma-slate-50 rounded-lg px-2.5 py-1.5">📝 This receipt has <b>{editCount}</b> past edit{editCount>1?"s":""} — open History (from the receipt view) to see old→new details.</div>
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
            {activeShifts.map(s=><option key={s.shift_key} value={s.shift_key}>{s.shift_name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><L>From</L><I value={bookingFrom} onChange={e=>setBookingFrom(e.target.value)} placeholder="DD-M-YYYY"/></div>
        <div><L>To</L><I value={bookingTo} onChange={e=>setBookingTo(e.target.value)} placeholder="DD-M-YYYY"/></div>
      </div>
      {/* #13: receipt date */}
      <L>Receipt date</L><I value={receiptDate} onChange={e=>setReceiptDate(e.target.value)} placeholder="DD-M-YYYY"/>
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
        <div key={i} className="flex gap-2 mb-2">
          <select value={p.mode} onChange={e=>setPay(i,"mode",e.target.value)} className="flex-1 px-2.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
            <option value="">Mode…</option>
            {init.paymentTags.filter(t=>t.active).map(t=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
          </select>
          <input type="number" value={p.amount} onChange={e=>setPay(i,"amount",e.target.value)} placeholder="₹" className="w-24 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
          {pays.length>1&&<button onClick={()=>setPays(pays.filter((_,j)=>j!==i))} className="px-2 text-lma-danger font-bold">✕</button>}
        </div>
      ))}
      {pays.length<3&&<button onClick={()=>setPays([...pays,{mode:"",amount:""}])} className="text-xs font-bold text-lma-primary">+ Add payment</button>}
      <L>Fees Due (₹)</L><I type="number" value={feesDue} onChange={e=>setFeesDue(e.target.value)}/>

      {/* #13: phones */}
      <L>Phones</L>
      {phones.map((ph,i)=>(
        <div key={i} className="flex gap-2 mb-2">
          <input type="tel" inputMode="numeric" value={ph.number}
            onChange={e=>{const n=[...phones];n[i]={...n[i],number:e.target.value};setPhones(n);}}
            onBlur={()=>{const n=[...phones];n[i]={...n[i],number:normalizePhoneR(n[i].number)};setPhones(n);}}
            placeholder={i===0?"Primary":`Phone ${i+1}`}
            className="flex-1 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
          <input value={ph.tag} onChange={e=>{const n=[...phones];n[i]={...n[i],tag:e.target.value.toUpperCase()};setPhones(n);}} placeholder="TAG" className="w-20 px-2 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium uppercase"/>
        </div>
      ))}

      {/* #13: advanced (student_id / library / branch / cross) */}
      <button onClick={()=>setShowAdvanced(v=>!v)} className="text-xs font-bold text-lma-slate-500 mt-2">{showAdvanced?"▾ Hide advanced":"▸ Advanced (ID, library, branch, cross)"}</button>
      {showAdvanced&&(
        <div className="mt-1 bg-lma-slate-50 rounded-xl p-3 space-y-2">
          <div><L>Student ID</L><I value={studentId} onChange={e=>setStudentId(e.target.value.toUpperCase())}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><L>Library</L>
              <select value={library} onChange={e=>{setLibrary(e.target.value);setBranch("");}} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-sm font-medium">
                {init.libraries.filter(l=>l.active).map(l=><option key={l.library_code} value={l.library_code}>{l.library_code}</option>)}
              </select>
            </div>
            <div><L>Branch</L>
              {libObj?.has_branches&&libBranches.length>0
                ? <select value={branch} onChange={e=>setBranch(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-sm font-medium">
                    <option value="">—</option>
                    {libBranches.map(b=><option key={b.branch_code} value={b.branch_code}>{b.branch_code}</option>)}
                  </select>
                : <div className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-[14px] font-medium text-lma-slate-400">no branches</div>}
            </div>
          </div>
          <div><L>Cross-library origin (blank = not cross)</L><I value={isCross} onChange={e=>setIsCross(e.target.value.toUpperCase())} placeholder="e.g. KAL"/></div>
        </div>
      )}

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
function I({className="",...props}:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className={`w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium ${className}`}/>; }

// ── History edit card: parses BEFORE/AFTER JSON → shows old → new per field ──
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

function EditEventCard({ev}:{ev:EditEvent}){
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
          <a href={`https://wa.me/?text=${encodeURIComponent(ev.whatsapp_text)}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-lma-accent/10 text-lma-accent">Share update</a>
          <button onClick={()=>{ navigator.clipboard.writeText(ev.whatsapp_text||""); }} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-lma-slate-100 text-lma-slate-500">Copy</button>
        </div>
      )}
    </div>
  );
}

// ── MONEY TRAIL (Item 4): fee, payments, dues received, refunds made ──
// Read-only context shown on the receipt View + Edit so money is never
// changed blindly. Fetches getReceiptMoneyTrail on mount.
function MoneyTrail({receiptNo}:{receiptNo:string}){
  const [t,setT]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState<string>("");
  useEffect(()=>{
    let alive=true;
    setLoading(true); setErr(""); setT(null);
    fetch(`${API}?action=getReceiptMoneyTrail&receipt_no=${encodeURIComponent(receiptNo)}`)
      .then(r=>r.json())
      .then(r=>{ if(!alive)return; if(r&&r.ok){ setT(r); } else { setErr(r&&r.error?r.error:"Could not load money trail (backend action missing — redeploy?)"); } setLoading(false); })
      .catch((e)=>{ if(alive){ setErr("Network error loading money trail."); setLoading(false); } });
    return ()=>{ alive=false; };
  },[receiptNo]);

  if(loading) return <div className="mt-3 text-[11px] text-lma-slate-400">Loading money trail…</div>;
  if(err) return <div className="mt-3 text-[11px] text-lma-danger bg-lma-danger/10 rounded-lg px-2.5 py-1.5">⚠ {err}</div>;
  if(!t) return null;
  const inr=(n:number)=>"₹"+Math.round(n).toLocaleString("en-IN");

  return (
    <div className="mt-3 bg-lma-slate-50 rounded-xl p-3 text-[11px]">
      <div className="font-extrabold text-lma-slate-700 mb-2 text-xs">Money trail</div>
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
            <div key={d.payment_id} className="flex justify-between text-[10px]"><span className="text-lma-slate-500">Dues · {d.mode} · {d.received_on}</span><span className="font-bold text-lma-accent">{inr(d.amount)}</span></div>
          ))}
          {t.refunds.map((r:any)=>(
            <div key={r.refund_id} className="flex justify-between text-[10px]"><span className="text-lma-slate-500">Refund · {r.mode} · {r.refund_date}</span><span className="font-bold text-lma-danger">−{inr(r.amount)}</span></div>
          ))}
        </div>
      )}
      {t.totals.dues_received>0&&<div className="mt-2 text-[10px] text-lma-warn">Note: ₹{t.totals.dues_received} already collected via dues — editing the fee recomputes the balance automatically; it can't drop below what's collected.</div>}
    </div>
  );
}

// ── EDIT SEAT PICKER — visual grid for the receipt edit form ──
// Shows availability for the NEWLY SELECTED shift, ignoring THIS receipt's
// own current hold (so its seat shows available when the rule allows).
// Rules are enforced by the backend (getVacantSeats + ignore_receipt_no):
//   M→E same seat: available if evening half free; M→FD: only if evening also free;
//   FD→M: morning half frees up; etc.
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