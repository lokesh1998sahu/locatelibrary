"use client";

// ── BookingFlow — in-place booking modal (renewal + add-from-seat) ─
// Two modes, both complete in place (host never navigates away):
//
//  • RENEWAL (pass renewReceiptNo): fetches the receipt → confirm →
//    booking form (prefilled) → WhatsApp share.
//      <BookingFlow renewReceiptNo={rno} libCode={lib} presetSeat presetShift
//         onClose={...} onComplete={reload}/>
//
//  • ADD from a vacant seat (pass addMode + seat/shift): New/Renewal
//    chooser → student step (new details OR search) → booking form
//    (seat/shift preset) → WhatsApp share.
//      <BookingFlow addMode libCode={lib} presetSeat presetShift
//         onClose={...} onComplete={reload}/>
//
// onComplete() lets the host refresh its data.

import { useState, useEffect, useMemo, useRef } from "react";
import { useLMA } from "./LMAProvider";
import { toDmy, fmtDMY } from "../_lib/dates";
import CodePill from "./CodePill";

const API = "/api/lma";

// ── helpers (copied from admissions, proven) ──
const normDate = toDmy;
function todayDmy(){ const d=new Date(); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function addOneMonth(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); const d=new Date(+p[2],+p[1]-1,+p[0]); const tm=d.getMonth()+1; d.setMonth(tm); if(d.getMonth()!==tm%12)d.setDate(0); else d.setDate(d.getDate()-1); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function addOneDayDmy(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); const d=new Date(+p[2],+p[1]-1,+p[0]); d.setDate(d.getDate()+1); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function dmyToIso(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); if(p.length!==3)return""; return `${p[2]}-${String(+p[1]).padStart(2,"0")}-${String(+p[0]).padStart(2,"0")}`; }
function isoToDmy(iso:string){ if(!iso)return""; const p=iso.split("-"); if(p.length!==3)return""; return `${+p[2]}-${+p[1]}-${+p[0]}`; }
function normShiftKey(s:string):"MORNING"|"EVENING"|"FULL DAY"|"OTHER"{ const u=(s||"").toUpperCase().trim(); if(u==="MORNING")return"MORNING"; if(u==="EVENING")return"EVENING"; if(u==="FULL DAY"||u==="FULLDAY"||u==="FULL_DAY")return"FULL DAY"; return"OTHER"; }
function autoDetectSearchType(q:string):"NAME"|"PHONE"|"STUDENT_ID"|"RECEIPT_NO"{ const t=q.trim(); if(!t)return"NAME"; if(/^R\d+/i.test(t))return"RECEIPT_NO"; const s=t.replace(/[\s\-\.\(\)\+]/g,""); if(/^\d{3,}$/.test(s))return"PHONE"; if(/^F\d+/i.test(t))return"STUDENT_ID"; return"NAME"; }
function normalizePhone(input:string):string{ if(!input)return""; let c=input.replace(/[\s\-\.\(\)]/g,""); if(c.startsWith("+91"))c=c.slice(3); else if(c.startsWith("91")&&c.length>10)c=c.slice(2); c=c.replace(/\D/g,""); if(c.length>10)c=c.slice(-10); return c; }

interface PhoneEntry { number:string; tag:string; }
interface Student  { student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[]; address:string; preparing_for:string; aadhaar_last4:string; date_of_birth:string; gender?:string; is_past:boolean; }
interface Receipt  { receipt_no:string; student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[]; seat_no:string; shift:string; shift_name:string; shift_time:string; booking_from:string; booking_to:string; status:string; is_cross_library?:string; fee?:number; }
interface SeatCell { row_in_section:number; col_in_section:number; seat_no:number; display_label:string; notes:string; cell_type:string; state?:string; occupant?:{receipt_no:string;student_id:string;name:string;shift:string}|null; share_note?:string|null; }
interface VacantResp { ok:boolean; needs_seat:boolean; sections:{section_name:string;section_order:number;rows:number;cols:number;seats:SeatCell[]}[]; }
interface ResultData { receipt_no:string; student_id:string; receipt_text:string; registration_text:string; }
type PayMode = { mode:string; amount:string };
interface BookingPreload { seat?:string; shift?:string; fee?:string; from?:string; to?:string; }
interface BookingCtx { admitType:"NEW"|"RENEWAL"; student:Student|null; isCross:boolean; crossOrigin:string; renewFrom?:Receipt|null; preload?:BookingPreload; }

export default function BookingFlow({ renewReceiptNo, addMode, libCode, presetSeat, presetShift, onClose, onComplete }:{
  renewReceiptNo?:string; addMode?:boolean; libCode:string; presetSeat?:string; presetShift?:string; onClose:()=>void; onComplete:()=>void;
}){
  const { init, post, showToast } = useLMA();
  const [renewFrom,setRenewFrom] = useState<Receipt|null>(null);
  const [loading,setLoading] = useState(!!renewReceiptNo);
  const [step,setStep] = useState<"confirm"|"type"|"student"|"form"|"done">(renewReceiptNo?"confirm":"type");
  const [admitType,setAdmitType] = useState<"NEW"|"RENEWAL"|null>(null);
  const [bookingCtx,setBookingCtx] = useState<BookingCtx|null>(null);
  const [result,setResult] = useState<ResultData|null>(null);

  // renewal mode: fetch the receipt by number (self-sufficient)
  useEffect(()=>{ if(!renewReceiptNo) return; let alive=true; (async()=>{
    setLoading(true);
    try{
      const qs=new URLSearchParams({ action:"getReceiptLog", q:renewReceiptNo, search_type:"RECEIPT_NO", limit:"5" });
      const r=await fetch(`${API}?${qs}`).then(x=>x.json());
      const list:Receipt[]=(r&&r.receipts)||[];
      if(alive) setRenewFrom(list.find(x=>x.receipt_no===renewReceiptNo)||list[0]||null);
    }catch{ if(alive) showToast("Couldn't load receipt","error"); }
    if(alive) setLoading(false);
  })(); return ()=>{ alive=false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  },[renewReceiptNo]);

  // resolve the target library/branch code → resolvedLib + resolvedBranch
  const resolved = useMemo(()=>{ const br=init?.branches.find(b=>b.branch_code===libCode); return { lib: br?br.library_code:libCode, branch: br?br.branch_code:"" }; },[init,libCode]);

  // renewal-mode ctx (memoized so StepBooking's prefill effect is stable)
  const renewCtx = useMemo<BookingCtx|null>(()=>{
    if(!renewFrom) return null;
    const student:Student={ student_id:renewFrom.student_id, library:renewFrom.library, branch:renewFrom.branch, name:renewFrom.name, phones:renewFrom.phones||[], address:"", preparing_for:"", aadhaar_last4:"", date_of_birth:"", is_past:false };
    const cl=String(renewFrom.is_cross_library||"").trim().toUpperCase();
    const isCross=(!!cl && cl!=="NO");
    return { admitType:"RENEWAL", student, isCross, crossOrigin: isCross?cl:"", renewFrom, preload:{ seat:presetSeat||"", shift:presetShift||"", fee:"", from:"", to:"" } };
  },[renewFrom,libCode,presetSeat,presetShift]);

  const formCtx = renewReceiptNo ? renewCtx : bookingCtx;

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>

        {!renewReceiptNo && (presetSeat||presetShift) && step!=="done" && (
          <div className="text-[11px] font-semibold text-lma-primary bg-lma-primary/5 rounded-lg px-2.5 py-1.5 mb-3">📍 From seat chart: {presetShift||""}{presetSeat?` · Seat ${presetSeat}`:""}</div>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-lma-slate-500">Loading…</div>
        ) : renewReceiptNo && !renewFrom ? (
          <div className="py-10 text-center"><p className="text-sm text-lma-slate-500 mb-4">Receipt not found.</p><button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Close</button></div>
        ) : step==="confirm" && renewFrom ? (
          <>
            <h3 className="text-lg font-extrabold text-lma-slate-900 mb-1">Renew receipt</h3>
            <p className="text-[12px] text-lma-slate-500 mb-3">A new receipt will be created and the old one marked renewed.</p>
            <div className="bg-lma-slate-50 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2"><span className="text-sm font-extrabold text-lma-slate-900">{renewFrom.receipt_no}</span><span className="text-[10px] font-bold text-lma-slate-400">{renewFrom.student_id}</span>{renewCtx?.isCross&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded ml-auto">CROSS · {renewCtx.crossOrigin}</span>}</div>
              <div className="text-sm font-bold text-lma-slate-800">{renewFrom.name}</div>
              <div className="text-[11px] text-lma-slate-500">{renewFrom.shift_name||renewFrom.shift}{renewFrom.seat_no?` · Seat ${renewFrom.seat_no}`:""} · until {fmtDMY(renewFrom.booking_to)}</div>
              {(presetSeat||presetShift)&&<div className="text-[11px] font-semibold text-lma-primary mt-1">New: {presetShift||renewFrom.shift}{presetSeat?` · Seat ${presetSeat}`:""}</div>}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={onClose} className="py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
              <button onClick={()=>setStep("form")} className="py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">Continue →</button>
            </div>
          </>
        ) : step==="type" ? (
          <StepType onPick={t=>{ setAdmitType(t); setStep("student"); }} onBack={onClose}/>
        ) : step==="student" && admitType ? (
          <StepStudent init={init} resolvedLib={resolved.lib} resolvedBranch={resolved.branch} admitType={admitType} post={post} showToast={showToast}
            onBack={()=>setStep("type")}
            onReady={(ctx)=>{ setBookingCtx({ ...ctx, preload:{ seat:presetSeat||"", shift:presetShift||"", fee:"", from:"", to:"" } }); setStep("form"); }}/>
        ) : step==="form" && formCtx ? (
          <StepBooking init={init} resolvedLib={resolved.lib} resolvedBranch={resolved.branch} ctx={formCtx} post={post} showToast={showToast}
            onBack={()=>setStep(renewReceiptNo?"confirm":"student")}
            onDone={(r)=>{ setResult(r); setStep("done"); onComplete(); }}/>
        ) : step==="done" && result ? (
          <DoneView result={result} onClose={onClose}/>
        ) : null}
      </div>
    </div>
  );
}

// ── success view (closes + refreshes; WhatsApp share) ──
function DoneView({ result, onClose }:{ result:ResultData; onClose:()=>void }){
  const [copied,setCopied]=useState("");
  const copy=(text:string,which:string)=>{ navigator.clipboard.writeText(text); setCopied(which); setTimeout(()=>setCopied(""),1500); };
  const wa=(text:string)=>`https://wa.me/?text=${encodeURIComponent(text)}`;
  return (
    <div>
      <div className="text-center mb-3">
        <div className="text-4xl mb-1">✅</div>
        <h2 className="text-lg font-extrabold text-lma-slate-900">Receipt Created</h2>
        <p className="text-sm text-lma-slate-600">{result.receipt_no} · {result.student_id}</p>
      </div>
      <div className="text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1.5">Receipt</div>
      <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-44 overflow-y-auto">{result.receipt_text}</pre>
      <div className="flex gap-2 mt-2">
        <a href={wa(result.receipt_text)} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-xl bg-lma-accent text-white font-bold text-sm text-center">Share on WhatsApp</a>
        <button onClick={()=>copy(result.receipt_text,"r")} className="px-4 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">{copied==="r"?"Copied":"Copy"}</button>
      </div>
      {result.registration_text&&(
        <>
          <div className="text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1.5 mt-3">Registration</div>
          <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-40 overflow-y-auto">{result.registration_text}</pre>
          <div className="flex gap-2 mt-2">
            <a href={wa(result.registration_text)} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-xl bg-lma-accent text-white font-bold text-sm text-center">Share Registration</a>
            <button onClick={()=>copy(result.registration_text,"reg")} className="px-4 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">{copied==="reg"?"Copied":"Copy"}</button>
          </div>
        </>
      )}
      <button onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-extrabold shadow-md">Done</button>
    </div>
  );
}

// ── STEP: NEW vs RENEWAL (copied) ──
function StepType({ onPick, onBack }:{ onPick:(t:"NEW"|"RENEWAL")=>void; onBack:()=>void }){
  return (
    <div className="lma-slide-up">
      <button onClick={onBack} className="text-sm text-lma-slate-500 mb-3">← Cancel</button>
      <div className="grid grid-cols-1 gap-3">
        <button onClick={()=>onPick("NEW")} className="bg-white border border-lma-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md active:scale-[0.99] text-left flex items-center gap-4">
          <div className="text-3xl">🆕</div>
          <div><div className="text-base font-extrabold text-lma-slate-900">New Admission</div><div className="text-xs text-lma-slate-500">First-time student. Auto-generates student ID.</div></div>
        </button>
        <button onClick={()=>onPick("RENEWAL")} className="bg-white border border-lma-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md active:scale-[0.99] text-left flex items-center gap-4">
          <div className="text-3xl">🔁</div>
          <div><div className="text-base font-extrabold text-lma-slate-900">Renewal</div><div className="text-xs text-lma-slate-500">Existing student. Search & continue booking.</div></div>
        </button>
      </div>
    </div>
  );
}

// ── STEP: STUDENT (new details OR renewal search) — copied ──
function StepStudent({ init, resolvedLib, resolvedBranch, admitType, post, showToast, onBack, onReady }:{
  init:any; resolvedLib:string; resolvedBranch:string; admitType:"NEW"|"RENEWAL";
  post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void;
  onBack:()=>void; onReady:(ctx:BookingCtx)=>void;
}){
  const [name,setName]=useState("");
  const [phones,setPhones]=useState<PhoneEntry[]>([{number:"",tag:"SELF"}]);
  const [address,setAddress]=useState("");
  const [preparingFor,setPreparingFor]=useState("");
  const [aadhaar,setAadhaar]=useState("");
  const [dob,setDob]=useState("");
  const [gender,setGender]=useState<"M"|"F"|"">("");

  const [search,setSearch]=useState("");
  const [studentResults,setStudentResults]=useState<Student[]>([]);
  const [receiptResults,setReceiptResults]=useState<Receipt[]>([]);
  const [searching,setSearching]=useState(false);
  const [hasSearched,setHasSearched]=useState(false);
  const [rcptPage,setRcptPage]=useState(0);
  const [stuPage,setStuPage]=useState(0);
  const [isCross,setIsCross]=useState(false);
  const [crossOrigin,setCrossOrigin]=useState("");

  const searchScope = isCross ? crossOrigin : resolvedBranch || resolvedLib;

  const doSearch=async()=>{
    const q=search.trim();
    if(q.length<2){ showToast("Type at least 2 characters","error"); return; }
    setSearching(true); setHasSearched(true); setRcptPage(0); setStuPage(0);
    const type=autoDetectSearchType(q);
    try{
      const studentParams=new URLSearchParams({action:"searchStudents",q,search_type:type==="RECEIPT_NO"?"NAME":type,is_past:"ANY"});
      if(searchScope) studentParams.set("library",searchScope);
      const receiptParams=new URLSearchParams({action:"getReceiptLog",q,search_type:type,limit:"20"});
      if(searchScope) receiptParams.set("library",searchScope);
      const [sRes,rRes]=await Promise.all([
        fetch(`${API}?${studentParams}`).then(r=>r.json()),
        fetch(`${API}?${receiptParams}`).then(r=>r.json()),
      ]);
      setStudentResults(sRes.ok?(sRes.results||[]):[]);
      setReceiptResults(rRes.ok?(rRes.receipts||[]):[]);
    }catch{ showToast("Search failed","error"); }
    setSearching(false);
  };

  const allScopes = useMemo(()=>{
    const out:{code:string;label:string}[]=[];
    init.libraries.filter((l:any)=>l.active).forEach((l:any)=>{
      if(l.has_branches) init.branches.filter((b:any)=>b.library_code===l.library_code&&b.active).forEach((b:any)=>out.push({code:b.branch_code,label:`${b.library_code}·${b.branch_code}`}));
      else out.push({code:l.library_code,label:l.library_code});
    });
    return out;
  },[init]);

  const handleNewNext=()=>{
    if(!name.trim()){ showToast("Name is required","error"); return; }
    if(!gender){ showToast("Select Male or Female","error"); return; }
    const cleanPhones=phones.filter(p=>p.number.trim()).map(p=>({number:normalizePhone(p.number),tag:p.tag}));
    const student:Student={ student_id:"", library:resolvedLib, branch:resolvedBranch, name:name.trim(),
      phones:cleanPhones, address, preparing_for:preparingFor, aadhaar_last4:aadhaar, date_of_birth:dob, gender, is_past:false };
    onReady({ admitType:"NEW", student, isCross:false, crossOrigin:"" });
  };

  const pickRenewalStudent=async(st:Student)=>{
    const params=new URLSearchParams({action:"getReceiptLog",q:st.student_id,search_type:"STUDENT_ID",library:resolvedBranch||resolvedLib,limit:"50"});
    const r=await fetch(`${API}?${params}`).then(r=>r.json());
    let renewFrom:Receipt|null=null;
    if(r.ok&&r.receipts&&r.receipts.length){ renewFrom=r.receipts[0]; }
    const scope=(resolvedBranch||resolvedLib).toUpperCase();
    const autoCross = (st.library||"").toUpperCase()!==scope && (st.branch||"").toUpperCase()!==scope;
    const autoOrigin = autoCross ? (st.branch||st.library) : "";
    onReady({ admitType:"RENEWAL", student:st, isCross: autoCross||isCross, crossOrigin: autoCross?autoOrigin:(isCross?crossOrigin:""), renewFrom });
  };

  const pickRenewalReceipt=(r:Receipt)=>{
    const student:Student={ student_id:r.student_id, library:r.library, branch:r.branch, name:r.name, phones:r.phones||[], address:"", preparing_for:"", aadhaar_last4:"", date_of_birth:"", is_past:false };
    const scope=(resolvedBranch||resolvedLib).toUpperCase();
    const autoCross = (r.library||"").toUpperCase()!==scope && (r.branch||"").toUpperCase()!==scope;
    const autoOrigin = autoCross ? (r.branch||r.library) : "";
    onReady({ admitType:"RENEWAL", student, isCross: autoCross||isCross, crossOrigin: autoCross?autoOrigin:(isCross?crossOrigin:""), renewFrom:r });
  };

  return (
    <div className="lma-slide-up">
      <button onClick={onBack} className="text-sm text-lma-slate-500 mb-3">← Back</button>

      {admitType==="NEW"?(
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-3">New Student Details</h3>
          <FieldLabel>Name *</FieldLabel>
          <Inp value={name} onChange={e=>setName(e.target.value.toUpperCase())} placeholder="FULL NAME"/>
          <FieldLabel>Gender *</FieldLabel>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button type="button" onClick={()=>setGender("M")} className={`py-2.5 rounded-xl font-bold text-sm border-[1.5px] transition ${gender==="M"?"bg-[#dbe6fb] border-[#93b4f0] text-[#1e3a8a]":"bg-lma-slate-50 border-lma-slate-200 text-lma-slate-500"}`}>♂ Male</button>
            <button type="button" onClick={()=>setGender("F")} className={`py-2.5 rounded-xl font-bold text-sm border-[1.5px] transition ${gender==="F"?"bg-[#fbdbe8] border-[#f0a6c4] text-[#9d174d]":"bg-lma-slate-50 border-lma-slate-200 text-lma-slate-500"}`}>♀ Female</button>
          </div>
          <FieldLabel>Phones</FieldLabel>
          {phones.map((ph,i)=>(
            <div key={i} className="flex gap-2 mb-2">
              <input type="tel" inputMode="numeric" value={ph.number}
                onChange={e=>{const n=[...phones];n[i]={...n[i],number:e.target.value};setPhones(n);}}
                onBlur={()=>{const n=[...phones];n[i]={...n[i],number:normalizePhone(n[i].number)};setPhones(n);}}
                placeholder={i===0?"SELF (primary)":`Phone ${i+1}`}
                className="flex-1 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
              <input value={ph.tag} onChange={e=>{const n=[...phones];n[i]={...n[i],tag:e.target.value.toUpperCase()};setPhones(n);}} placeholder="TAG" className="w-20 px-2 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium uppercase"/>
              {i>0&&<button type="button" onClick={()=>setPhones(phones.filter((_,j)=>j!==i))} className="px-3 rounded-xl bg-lma-slate-100 text-lma-slate-500 font-extrabold text-lg leading-none">×</button>}
            </div>
          ))}
          <button type="button" onClick={()=>setPhones([...phones,{number:"",tag:""}])} className="text-sm font-bold text-lma-primary mb-3">+ Add phone</button>
          <div className="grid grid-cols-1 gap-0 mt-1">
            <FieldLabel>Address</FieldLabel>
            <Inp value={address} onChange={e=>setAddress(e.target.value.toUpperCase())}/>
            <FieldLabel>Preparing For</FieldLabel>
            <Inp value={preparingFor} onChange={e=>setPreparingFor(e.target.value.toUpperCase())} placeholder="NEET, UPSC…"/>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Aadhaar (last 4)</FieldLabel><Inp value={aadhaar} onChange={e=>setAadhaar(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4}/></div>
              <div><FieldLabel>DOB</FieldLabel><input type="date" value={dob} onChange={e=>setDob(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>{dob && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(dob)}</span>}</div>
            </div>
          </div>
          <button onClick={handleNewNext} className="w-full mt-3 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">Next: Booking →</button>
        </div>
      ):(
        <div>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-extrabold text-lma-slate-900">Find Student / Receipt</h3>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={isCross} onChange={e=>{setIsCross(e.target.checked);setStudentResults([]);setReceiptResults([]);setHasSearched(false);}} className="w-4 h-4 accent-lma-primary"/>
                <span className="text-[11px] font-bold text-lma-slate-600">Cross-library</span>
              </label>
            </div>
            {isCross&&(
              <div className="mb-2">
                <FieldLabel>Student&apos;s home library</FieldLabel>
                <select value={crossOrigin} onChange={e=>{setCrossOrigin(e.target.value);setStudentResults([]);setReceiptResults([]);setHasSearched(false);}} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
                  <option value="">Select origin…</option>
                  {allScopes.map(s=><option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
                <p className="text-[10px] text-lma-slate-500 mt-1">They&apos;ll keep their original ID but sit &amp; pay here.</p>
              </div>
            )}
            <div className="flex gap-2">
              <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doSearch();}} placeholder="Name, phone, F-ID, or R-no…" disabled={isCross&&!crossOrigin} className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-sm font-medium disabled:opacity-50"/>
              <button onClick={doSearch} disabled={searching||(isCross&&!crossOrigin)} className="px-5 py-3 rounded-xl bg-lma-primary text-white font-bold text-sm disabled:opacity-50">{searching?"…":"Search"}</button>
            </div>
            <p className="text-[10px] text-lma-slate-500 mt-1.5">Auto-detects type. Tip: R12 = receipt, F45 = student ID, digits = phone.</p>
          </div>

          {searching&&<div className="text-center text-sm text-lma-slate-500 py-3">Searching…</div>}

          {hasSearched&&!searching&&receiptResults.length>0&&(
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-lma-slate-500 uppercase tracking-wider">🧾 Receipts ({receiptResults.length})</p>
                {receiptResults.length>5&&(<div className="flex items-center gap-2 text-[11px] font-bold text-lma-slate-600"><button type="button" onClick={()=>setRcptPage(p=>Math.max(0,p-1))} disabled={rcptPage===0} className="px-2 py-0.5 rounded bg-lma-slate-100 disabled:opacity-40">‹</button><span>{rcptPage+1}/{Math.ceil(receiptResults.length/5)}</span><button type="button" onClick={()=>setRcptPage(p=>Math.min(Math.ceil(receiptResults.length/5)-1,p+1))} disabled={rcptPage>=Math.ceil(receiptResults.length/5)-1} className="px-2 py-0.5 rounded bg-lma-slate-100 disabled:opacity-40">›</button></div>)}
              </div>
              <div className="space-y-2">
                {receiptResults.slice(rcptPage*5,rcptPage*5+5).map(r=>(
                  <button key={r.receipt_no} onClick={()=>pickRenewalReceipt(r)} className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99] flex items-center gap-3 border-l-4 border-lma-primary">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-extrabold text-lma-slate-900">{r.receipt_no}</span>
                        <span className="text-[10px] font-bold text-lma-primary bg-lma-primary/10 px-1.5 py-0.5 rounded">{r.student_id}</span>
                        <span className="text-[10px] text-lma-slate-400 ml-auto"><CodePill code={r.branch||r.library}/></span>
                      </div>
                      <div className="text-sm font-semibold text-lma-slate-800 truncate">{r.name}</div>
                      <div className="text-[11px] text-lma-slate-500">{fmtDMY(r.booking_from)} → {fmtDMY(r.booking_to)} · {r.shift_name||r.shift}{r.seat_no?` · Seat ${r.seat_no}`:""}</div>
                    </div>
                    <span className="text-lma-slate-400">›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasSearched&&!searching&&studentResults.length>0&&(
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-lma-slate-500 uppercase tracking-wider">👤 Students ({studentResults.length})</p>
                {studentResults.length>5&&(<div className="flex items-center gap-2 text-[11px] font-bold text-lma-slate-600"><button type="button" onClick={()=>setStuPage(p=>Math.max(0,p-1))} disabled={stuPage===0} className="px-2 py-0.5 rounded bg-lma-slate-100 disabled:opacity-40">‹</button><span>{stuPage+1}/{Math.ceil(studentResults.length/5)}</span><button type="button" onClick={()=>setStuPage(p=>Math.min(Math.ceil(studentResults.length/5)-1,p+1))} disabled={stuPage>=Math.ceil(studentResults.length/5)-1} className="px-2 py-0.5 rounded bg-lma-slate-100 disabled:opacity-40">›</button></div>)}
              </div>
              <div className="space-y-2">
                {studentResults.slice(stuPage*5,stuPage*5+5).map(st=>(
                  <button key={`${st.library}-${st.student_id}`} onClick={()=>pickRenewalStudent(st)} className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99] flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5"><span className="text-sm font-extrabold text-lma-slate-900">{st.student_id}</span>{st.is_past&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded">PAST</span>}<span className="text-[10px] text-lma-slate-400 ml-auto"><CodePill code={st.branch||st.library}/></span></div>
                      <div className="text-sm font-semibold text-lma-slate-800 truncate">{st.name}</div>
                      {st.phones[0]&&<div className="text-[11px] text-lma-slate-500 font-mono">📱 {st.phones[0].number}</div>}
                    </div>
                    <span className="text-lma-slate-400">›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasSearched&&!searching&&studentResults.length===0&&receiptResults.length===0&&(
            <div className="text-center text-sm text-lma-slate-500 py-3">No matches.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── STEP BOOKING (copied verbatim from admissions; submit unchanged) ──
function StepBooking({ init, resolvedLib, resolvedBranch, ctx, post, showToast, onBack, onDone }:{
  init:any; resolvedLib:string; resolvedBranch:string; ctx:BookingCtx;
  post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void;
  onBack:()=>void; onDone:(r:ResultData)=>void;
}){
  const feeKey = resolvedBranch || resolvedLib;
  const [shift,setShift]=useState("");
  const [seat,setSeat]=useState("");
  const [bookingFrom,setBookingFrom]=useState("");
  const [bookingTo,setBookingTo]=useState("");
  const [toEdited,setToEdited]=useState(false);
  const [receiptDate,setReceiptDate]=useState(todayDmy());
  const [fee,setFee]=useState("");
  const [pays,setPays]=useState<PayMode[]>([{mode:"",amount:""}]);
  const [feesDue,setFeesDue]=useState("0");
  const [submitting,setSubmitting]=useState(false);
  const [showSeatPicker,setShowSeatPicker]=useState(false);

  const shiftKey=normShiftKey(shift);
  const needsSeat=shift!==""&&shiftKey!=="OTHER";

  useEffect(()=>{
    const pl = ctx.preload;
    let from:string;
    if(pl?.from){ from = normDate(pl.from); }
    else if(ctx.admitType==="RENEWAL"&&ctx.renewFrom&&ctx.renewFrom.booking_to){ from=addOneDayDmy(normDate(ctx.renewFrom.booking_to)); }
    else { from=todayDmy(); }
    setBookingFrom(from);
    setBookingTo(pl?.to ? normDate(pl.to) : addOneMonth(from));
    if(pl?.to) setToEdited(true);
    if(pl?.shift){ setShift(pl.shift); }
    else if(ctx.admitType==="RENEWAL"&&ctx.renewFrom&&ctx.renewFrom.shift){ setShift(ctx.renewFrom.shift); }
    if(pl?.seat){ setSeat(pl.seat); }
    else if(ctx.admitType==="RENEWAL"&&ctx.renewFrom&&ctx.renewFrom.seat_no){ setSeat(ctx.renewFrom.seat_no); }
    if(pl?.fee){ setFee(String(pl.fee)); }
  },[ctx]);

  useEffect(()=>{ if(!toEdited&&bookingFrom) setBookingTo(addOneMonth(bookingFrom)); },[bookingFrom,toEdited]);

  const preloadFeeRef = useRef<string>("");
  useEffect(()=>{ preloadFeeRef.current = ctx.preload?.fee || ""; },[ctx]);

  useEffect(()=>{
    if(!shift) return;
    if(preloadFeeRef.current && fee === preloadFeeRef.current){ preloadFeeRef.current = ""; return; }
    const m=init.fees[feeKey];
    if(m){ const f=m[shiftKey]; if(f!==undefined&&f!==null) setFee(String(f)); }
  },[shift]);   // eslint-disable-line

  useEffect(()=>{
    const f=Number(fee)||0;
    const paid=pays.reduce((s,p)=>s+(Number(p.amount)||0),0);
    setFeesDue(String(Math.max(0,f-paid)));
  },[fee,pays]);

  const activeShifts=init.shifts.filter((s:any)=>s.active);
  const shiftObj=activeShifts.find((s:any)=>normShiftKey(s.shift_key)===shiftKey);

  const setPay=(i:number,field:"mode"|"amount",val:string)=>{ const n=[...pays]; n[i]={...n[i],[field]:val}; setPays(n); };
  const addSplit=()=>{ if(pays.length<3) setPays([...pays,{mode:"",amount:""}]); };
  const removeSplit=(i:number)=>{ setPays(pays.filter((_,j)=>j!==i)); };

  useEffect(()=>{
    const f=Number(fee)||0;
    if(f<=0) return;
    let allocated=0;
    pays.forEach(p=>{ if(p.amount) allocated += Number(p.amount)||0; });
    let changed=false;
    const next=pays.map((p)=>{
      if(p.mode&&!p.amount){
        const remaining=Math.max(0,f-allocated);
        if(remaining>0){ changed=true; allocated += remaining; return {...p, amount:String(remaining)}; }
      }
      return p;
    });
    if(changed) setPays(next);
  // eslint-disable-next-line
  },[pays.map(p=>p.mode).join("|"),fee]);

  const handleSubmit=async()=>{
    if(!shift){ showToast("Pick a shift","error"); return; }
    if(!fee){ showToast("Fee required","error"); return; }
    const validPays=pays.filter(p=>p.mode&&p.amount);
    if(validPays.length===0){ showToast("Add at least one payment","error"); return; }
    setSubmitting(true);
    const payload:any={
      library:resolvedLib, branch:resolvedBranch,
      name:ctx.student?.name,
      shift:shiftKey, shift_name:shiftObj?.shift_name||"", shift_time:shiftObj?.shift_time||"",
      seat_no: needsSeat?seat:"",
      booking_from:bookingFrom, booking_to:bookingTo,
      receipt_date:receiptDate,
      fee:Number(fee),
      pay_modes:validPays.map(p=>({mode:p.mode,amount:Number(p.amount)})),
      fees_due:Number(feesDue),
      type:ctx.admitType,
    };
    if(ctx.admitType==="NEW"){
      payload.phones=ctx.student?.phones||[];
      payload.address=ctx.student?.address||""; payload.preparing_for=ctx.student?.preparing_for||"";
      payload.aadhaar_last4=ctx.student?.aadhaar_last4||""; payload.date_of_birth=ctx.student?.date_of_birth||"";
      payload.gender=ctx.student?.gender||"";
    } else {
      payload.student_id=ctx.student?.student_id;
      payload.phones=ctx.student?.phones||[];
      if(ctx.isCross){ payload.is_cross_library=ctx.crossOrigin; }
      if(ctx.renewFrom){ payload.renewed_from=ctx.renewFrom.receipt_no; }
    }
    const res=await post("createReceipt",payload);
    setSubmitting(false);
    if(res){
      if(ctx.admitType==="RENEWAL"&&ctx.renewFrom){
        await post("markReceiptRenewed",{ receipt_no:ctx.renewFrom.receipt_no, successor:res.receipt_no });
      }
      onDone({ receipt_no:res.receipt_no, student_id:res.student_id, receipt_text:res.receipt_text, registration_text:res.registration_text });
    }
  };

  return (
    <div>
      <button onClick={onBack} className="text-sm text-lma-slate-500 mb-3">← Back</button>
      <div className="bg-white rounded-2xl space-y-3">
        <div className="bg-lma-slate-50 rounded-xl p-2.5 flex items-center gap-2">
          <span className="text-[10px] font-bold bg-lma-primary/10 text-lma-primary px-2 py-0.5 rounded">{ctx.admitType}</span>
          <span className="text-sm font-bold text-lma-slate-900">{ctx.student?.student_id||"New"}</span>
          <span className="text-sm text-lma-slate-600 truncate">{ctx.student?.name}</span>
          {ctx.isCross&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded ml-auto">CROSS · {ctx.crossOrigin}</span>}
        </div>

        <div>
          <FieldLabel>Shift *</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {activeShifts.map((s:any)=>(
              <button key={s.shift_key} onClick={()=>{setShift(s.shift_key);setSeat("");}} className={`py-2.5 rounded-xl text-sm font-bold border-[1.5px] transition ${normShiftKey(shift)===normShiftKey(s.shift_key)?"bg-lma-primary/10 border-lma-primary text-lma-primary":"bg-lma-slate-50 border-lma-slate-200 text-lma-slate-600"}`}>
                {s.shift_name}<div className="text-[9px] font-medium opacity-70">{s.shift_time}</div>
              </button>
            ))}
          </div>
        </div>

        {needsSeat&&(
          <div>
            <FieldLabel>Seat</FieldLabel>
            <button onClick={()=>setShowSeatPicker(true)} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium text-left flex items-center justify-between">
              <span className={seat?"text-lma-slate-900 font-bold":"text-lma-slate-400"}>{seat?`Seat ${seat}`:"Tap to pick a seat"}</span>
              <span className="text-lma-primary text-xs font-bold">{seat?"Change":"Pick →"}</span>
            </button>
            {!seat&&<p className="text-[10px] text-lma-slate-500 mt-1">Leave unset to assign later.</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>From</FieldLabel><input type="date" value={dmyToIso(bookingFrom)} onChange={e=>{setBookingFrom(isoToDmy(e.target.value));}} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>{bookingFrom && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(bookingFrom)}</span>}</div>
          <div><FieldLabel>To</FieldLabel><input type="date" value={dmyToIso(bookingTo)} onChange={e=>{setBookingTo(isoToDmy(e.target.value));setToEdited(true);}} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>{bookingTo && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(bookingTo)}</span>}</div>
        </div>

        <div><FieldLabel>Receipt Date</FieldLabel><input type="date" value={dmyToIso(receiptDate)} onChange={e=>setReceiptDate(isoToDmy(e.target.value))} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>{receiptDate && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(receiptDate)}</span>}</div>

        <div><FieldLabel>Fee (₹)</FieldLabel><Inp type="number" inputMode="numeric" value={fee} onChange={e=>setFee(e.target.value)}/></div>

        <div>
          <FieldLabel>Payment</FieldLabel>
          {pays.map((p,i)=>(
            <div key={i} className="flex gap-2 mb-2">
              <select value={p.mode} onChange={e=>setPay(i,"mode",e.target.value)} className="flex-1 px-2.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
                <option value="">Mode…</option>
                {init.paymentTags.filter((t:any)=>t.active).map((t:any)=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
              </select>
              <input type="number" inputMode="numeric" value={p.amount} onChange={e=>setPay(i,"amount",e.target.value)} placeholder="₹" className="w-24 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
              {pays.length>1&&<button onClick={()=>removeSplit(i)} className="px-2 text-lma-danger font-bold">✕</button>}
            </div>
          ))}
          {pays.length<3&&<button onClick={addSplit} className="text-xs font-bold text-lma-primary">+ Split payment</button>}
        </div>

        <div><FieldLabel>Fees Due (auto)</FieldLabel><Inp type="number" inputMode="numeric" value={feesDue} onChange={e=>setFeesDue(e.target.value)}/>
          {Number(feesDue)>0&&<p className="text-[10px] text-lma-warn font-bold mt-1">Due will be logged as PENDING.</p>}
        </div>

        <button onClick={handleSubmit} disabled={submitting} className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-extrabold shadow-md disabled:opacity-50">
          {submitting?"Creating…":(ctx.admitType==="RENEWAL"?"Renew →":"Create Receipt")}
        </button>
      </div>

      {showSeatPicker&&(
        <SeatPickerSheet
          library={resolvedLib} branch={resolvedBranch} shift={shiftKey} ignoreReceiptNo={ctx.renewFrom?.receipt_no||""}
          current={seat} onClose={()=>setShowSeatPicker(false)}
          onPick={(label)=>{ setSeat(label); setShowSeatPicker(false); }}
        />
      )}
    </div>
  );
}

// ── SEAT PICKER (copied) ──
function SeatPickerSheet({ library, branch, shift, current, ignoreReceiptNo, onClose, onPick }:{
  library:string; branch:string; shift:string; current:string; ignoreReceiptNo?:string;
  onClose:()=>void; onPick:(label:string)=>void;
}){
  const [data,setData]=useState<VacantResp|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const params=new URLSearchParams({action:"getVacantSeats",library_code:library,shift});
    if(branch) params.set("branch_code",branch);
    if(ignoreReceiptNo) params.set("ignore_receipt_no",ignoreReceiptNo);
    fetch(`${API}?${params}`).then(r=>r.json()).then((r:VacantResp)=>{ setData(r); setLoading(false); });
  },[library,branch,shift,ignoreReceiptNo]);
  return (
    <div className="fixed inset-0 z-[10001] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-4 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-3"/>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-lma-slate-900">Pick a seat · {shift}</h3>
          <button onClick={()=>onPick("")} className="text-xs font-bold text-lma-primary">Assign later</button>
        </div>
        {loading?(
          <div className="text-center text-sm text-lma-slate-500 py-8">Loading layout…</div>
        ):!data||data.sections.length===0?(
          <div className="text-center text-sm text-lma-slate-500 py-8">No layout found for this library.</div>
        ):(
          <div className="space-y-4">
            {data.sections.sort((a,b)=>a.section_order-b.section_order).map(sec=>(
              <div key={sec.section_name}>
                <div className="text-[11px] font-bold text-lma-slate-500 mb-1.5">{sec.section_name}</div>
                <div className="overflow-x-auto">
                  <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${sec.cols}, minmax(30px, 1fr))`}}>
                    {Array.from({length:sec.rows*sec.cols}).map((_,idx)=>{
                      const r=Math.floor(idx/sec.cols)+1, c=(idx%sec.cols)+1;
                      const cell=sec.seats.find(s=>s.row_in_section===r&&s.col_in_section===c);
                      if(!cell) return <div key={idx} className="aspect-square"/>;
                      if(cell.cell_type==="DEAD"||cell.state==="DEAD") return <div key={idx} className="aspect-square rounded bg-lma-slate-500"/>;
                      const isCurrent=current===cell.display_label;
                      if(cell.state==="VACANT"){
                        return <button key={idx} onClick={()=>onPick(cell.display_label)} title={cell.share_note||""} className={`aspect-square rounded text-[11px] font-bold border ${isCurrent?"bg-lma-primary text-white border-lma-primary":"bg-lma-accent/15 text-lma-accent border-lma-accent/40 hover:bg-lma-accent/30"} flex items-center justify-center`}>{cell.display_label}</button>;
                      }
                      if(cell.state==="BLOCKED"){
                        return <div key={idx} className="aspect-square rounded bg-lma-danger/20 border border-lma-danger/40 flex items-center justify-center text-[10px] text-lma-danger" title="Blocked">{cell.display_label}</div>;
                      }
                      return <div key={idx} className="aspect-square rounded bg-lma-slate-200 border border-lma-slate-300 flex flex-col items-center justify-center text-[10px] text-lma-slate-500" title={cell.occupant?`${cell.occupant.name} (${cell.occupant.shift})`:"taken"}>{cell.display_label}<span className="text-[7px] leading-none truncate w-full text-center px-0.5">{cell.occupant?.student_id||""}</span></div>;
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }:{ children:React.ReactNode }){ return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1 mt-2">{children}</label>; }
function Inp(props:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium"/>; }