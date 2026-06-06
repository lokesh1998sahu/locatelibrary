"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLMA, type LMAInitData as InitData } from "../_components/LMAProvider";
import { toDmy } from "../_lib/dates";

const API = "/api/lma";

interface PhoneEntry { number:string; tag:string; }
interface Student  { student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[]; address:string; preparing_for:string; aadhaar_last4:string; date_of_birth:string; is_past:boolean; }
interface Receipt  { receipt_no:string; student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[]; seat_no:string; shift:string; shift_name:string; shift_time:string; booking_from:string; booking_to:string; status:string; fee?:number; }
interface SeatCell { row_in_section:number; col_in_section:number; seat_no:number; display_label:string; notes:string; cell_type:string; state?:string; occupant?:{receipt_no:string;student_id:string;name:string;shift:string}|null; share_note?:string|null; }
interface VacantResp { ok:boolean; needs_seat:boolean; sections:{section_name:string;section_order:number;rows:number;cols:number;seats:SeatCell[]}[]; }

type PayMode = { mode:string; amount:string };
interface BookingPreload { seat?:string; shift?:string; fee?:string; from?:string; to?:string; }
interface BookingCtx { admitType:"NEW"|"RENEWAL"; student:Student|null; isCross:boolean; crossOrigin:string; renewFrom?:Receipt|null; preload?:BookingPreload; }
interface ResultData { receipt_no:string; student_id:string; receipt_text:string; registration_text:string; }

// ── HELPERS ──────────────────────────────────────────────────────
function todayDmy(){ const d=new Date(); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function addOneMonth(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); const d=new Date(+p[2],+p[1]-1,+p[0]); const tm=d.getMonth()+1; d.setMonth(tm); if(d.getMonth()!==tm%12)d.setDate(0); else d.setDate(d.getDate()-1); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function addOneDayDmy(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); const d=new Date(+p[2],+p[1]-1,+p[0]); d.setDate(d.getDate()+1); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function dmyToIso(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); if(p.length!==3)return""; return `${p[2]}-${String(+p[1]).padStart(2,"0")}-${String(+p[0]).padStart(2,"0")}`; }
function isoToDmy(iso:string){ if(!iso)return""; const p=iso.split("-"); if(p.length!==3)return""; return `${+p[2]}-${+p[1]}-${+p[0]}`; }
function autoDetectSearchType(q:string):"NAME"|"PHONE"|"STUDENT_ID"|"RECEIPT_NO"{ const t=q.trim(); if(!t)return"NAME"; if(/^R\d+/i.test(t))return"RECEIPT_NO"; const s=t.replace(/[\s\-\.\(\)\+]/g,""); if(/^\d{3,}$/.test(s))return"PHONE"; if(/^F\d+/i.test(t))return"STUDENT_ID"; return"NAME"; }
function normShiftKey(s:string):"MORNING"|"EVENING"|"FULL DAY"|"OTHER"{ const u=(s||"").toUpperCase().trim(); if(u==="MORNING")return"MORNING"; if(u==="EVENING")return"EVENING"; if(u==="FULL DAY"||u==="FULLDAY"||u==="FULL_DAY")return"FULL DAY"; return"OTHER"; }

// ── #17: PHONE NORMALIZE ─────────────────────────────────────────
function normalizePhone(input:string):string{
  if(!input)return"";
  let c=input.replace(/[\s\-\.\(\)]/g,"");
  if(c.startsWith("+91"))c=c.slice(3);
  else if(c.startsWith("91")&&c.length>10)c=c.slice(2);
  c=c.replace(/\D/g,"");
  if(c.length>10)c=c.slice(-10);
  return c;
}

// ── #19: TOLERANT DATE NORMALIZER ────────────────────────────────
// Handles: DMY, ISO, GMT/IST strings, locale-formatted dates. Returns DD-M-YYYY.
// Delegates to the shared toDmy implementation.
const normDate = toDmy;

export default function AdmissionsPage(){
  return (
    <Suspense fallback={<div className="lma-page-body max-w-md mx-auto px-4 pt-4 text-center text-sm text-lma-slate-500 py-8">Loading…</div>}>
      <AdmissionsPageInner/>
    </Suspense>
  );
}

function AdmissionsPageInner(){
  const searchParams=useSearchParams();
  const { init, showToast, post } = useLMA();
  const [step,setStep]=useState(1);
  const [libCode,setLibCode]=useState("");
  const [admitType,setAdmitType]=useState<"NEW"|"RENEWAL"|null>(null);
  const [bookingCtx,setBookingCtx]=useState<BookingCtx|null>(null);
  const [result,setResult]=useState<ResultData|null>(null);
  const [preloadHandled,setPreloadHandled]=useState(false);

  const { resolvedLib, resolvedBranch, scopeLabel } = useMemo(()=>{
    if(!init||!libCode) return {resolvedLib:"",resolvedBranch:"",scopeLabel:""};
    const br=init.branches.find(b=>b.branch_code===libCode);
    if(br) return {resolvedLib:br.library_code,resolvedBranch:br.branch_code,scopeLabel:`${br.library_code} · ${br.branch_code}`};
    const lib=init.libraries.find(l=>l.library_code===libCode);
    return {resolvedLib:libCode,resolvedBranch:"",scopeLabel:lib?.display_name||libCode};
  },[init,libCode]);

  // ── #8 URL PRELOAD ──
  // Supports:
  //   ?lib=X&student_id=Y&renew_from=R123     → renewal (existing)
  //   ?lib=X&seat=12&shift=MORNING            → "Book this seat" deep-link from board vacant tap (NEW)
  useEffect(()=>{
    if(!init||preloadHandled)return;
    const lib=searchParams.get("lib")||"";
    const sid=searchParams.get("student_id")||"";
    const rno=searchParams.get("renew_from")||"";
    const seatP=searchParams.get("seat")||"";
    const shiftP=(searchParams.get("shift")||"").toUpperCase();
    if(!lib){ setPreloadHandled(true); return; }
    (async()=>{
      // resolve library/branch code
      const isBranch=init.branches.find(b=>b.branch_code===lib);
      const isLib=init.libraries.find(l=>l.library_code===lib);
      if(!isBranch&&!isLib){ showToast(`Unknown library: ${lib}`,"error"); setPreloadHandled(true); return; }
      setLibCode(lib);

      // Decide admit type: renew_from or student_id → RENEWAL, else NEW
      const isRenewalIntent = !!(rno||sid);
      const finalAdmit:"NEW"|"RENEWAL" = isRenewalIntent ? "RENEWAL" : "NEW";
      setAdmitType(finalAdmit);

      const preload:BookingPreload = {
        seat: seatP, shift: shiftP, fee: "", from: "", to: "",
      };

      try{
        if(finalAdmit==="RENEWAL"){
          // existing renewal preload logic
          let student:Student|null=null;
          let renewFrom:Receipt|null=null;
          if(sid){
            const params=new URLSearchParams({action:"searchStudents",q:sid,search_type:"STUDENT_ID",library:lib,is_past:"ANY"});
            const r=await fetch(`${API}?${params}`).then(r=>r.json());
            if(r.ok&&r.results&&r.results.length){ student=r.results[0]; }
          }
          if(rno){
            const params=new URLSearchParams({action:"getReceiptLog",q:rno,search_type:"RECEIPT_NO",library:lib,limit:"5"});
            const r=await fetch(`${API}?${params}`).then(r=>r.json());
            if(r.ok&&r.receipts&&r.receipts.length){ renewFrom=r.receipts[0]; if(!student){
              student={ student_id:renewFrom!.student_id, library:renewFrom!.library, branch:renewFrom!.branch, name:renewFrom!.name, phones:renewFrom!.phones||[], address:"", preparing_for:"", aadhaar_last4:"", date_of_birth:"", is_past:false };
            }}
          } else if(student){
            const params=new URLSearchParams({action:"getReceiptLog",q:student.student_id,search_type:"STUDENT_ID",library:lib,limit:"5"});
            const r=await fetch(`${API}?${params}`).then(r=>r.json());
            if(r.ok&&r.receipts&&r.receipts.length){ renewFrom=r.receipts[0]; }
          }
          if(!student){ showToast(`Student ${sid||rno} not found`,"error"); setPreloadHandled(true); return; }
          const isCross=renewFrom?(String(renewFrom.library).toUpperCase()!==String(lib).toUpperCase()&&String(renewFrom.branch||"").toUpperCase()!==String(lib).toUpperCase()):false;
          setBookingCtx({ admitType:"RENEWAL", student, isCross, crossOrigin: isCross?(renewFrom!.branch||renewFrom!.library):"", renewFrom, preload });
          setStep(4);
        } else {
          // NEW preload — for "Book this seat" from board
          const br=init.branches.find(b=>b.branch_code===lib);
          const targetLib = br ? br.library_code : lib;
          const targetBranch = br ? br.branch_code : "";
          const student:Student = {
            student_id:"", library:targetLib, branch:targetBranch,
            name: "", phones:[{number:"",tag:"SELF"}], address:"", preparing_for:"", aadhaar_last4:"", date_of_birth:"", is_past:false,
          };
          setBookingCtx({ admitType:"NEW", student, isCross:false, crossOrigin:"", preload });
          setStep(3);
        }
      } catch(e){
        showToast("Preload failed","error");
      }
      setPreloadHandled(true);
    })();
  },[init,searchParams,preloadHandled,showToast]);

  const resetWizard=()=>{ setStep(1); setLibCode(""); setAdmitType(null); setBookingCtx(null); setResult(null); };

  // ── #10: DYNAMIC HEADER TITLE ──
  const headerTitle = step<=1 ? "Admissions" : (admitType==="RENEWAL"?"Renewal":"New Admission");

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-4">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">{headerTitle}</h1>
          <p className="text-[11px] text-lma-slate-500 font-medium">
            {step===1?"Step 1 · Pick library":step===2?"Step 2 · New or renewal":step===3?"Step 3 · Student":step===4?"Step 4 · Booking":"Done"}
            {scopeLabel&&step>1?` · ${scopeLabel}`:""}
          </p>
        </div>
        {step>1&&step<5&&<button onClick={resetWizard} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600">Restart</button>}
      </header>

      {!init?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):(
        <>
          {step===1&&<StepLibrary init={init} onPick={c=>{setLibCode(c);setStep(2);}}/>}
          {step===2&&<StepType onPick={t=>{setAdmitType(t);setStep(3);}} onBack={()=>setStep(1)}/>}
          {step===3&&admitType&&<StepStudent init={init} resolvedLib={resolvedLib} resolvedBranch={resolvedBranch} admitType={admitType} post={post} showToast={showToast} onBack={()=>setStep(2)} onReady={ctx=>{setBookingCtx(ctx);setStep(4);}}/>}
          {step===4&&bookingCtx&&<StepBooking init={init} resolvedLib={resolvedLib} resolvedBranch={resolvedBranch} ctx={bookingCtx} post={post} showToast={showToast} onBack={()=>setStep(3)} onDone={r=>{setResult(r);setStep(5);}}/>}
          {step===5&&result&&<StepResult result={result} onNew={resetWizard}/>}
        </>
      )}
    </div>
  );
}

// ── STEP 1: LIBRARY ──────────────────────────────────────────────
function StepLibrary({ init, onPick }:{ init:InitData; onPick:(code:string)=>void }){
  return (
    <div className="lma-slide-up">
      <p className="text-sm text-lma-slate-500 mb-3">Which library or branch?</p>
      <div className="space-y-2">
        {init.libraries.filter(l=>l.active).map(lib=>(
          <div key={lib.library_code}>
            <button onClick={()=>!lib.has_branches&&onPick(lib.library_code)} disabled={lib.has_branches}
              className={`w-full text-left bg-white rounded-2xl p-3.5 shadow-sm flex items-center gap-3 ${lib.has_branches?"opacity-100 cursor-default":"hover:shadow-md active:scale-[0.99]"}`}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-extrabold" style={lib.color?{background:lib.color+"22",color:lib.color}:{background:"#e2e8f0"}}>{lib.emoji}</div>
              <div className="flex-1"><div className="text-sm font-bold text-lma-slate-900">{lib.library_code}</div><div className="text-[11px] text-lma-slate-500">{lib.display_name}</div></div>
              {!lib.has_branches&&<span className="text-lma-slate-400 text-lg">›</span>}
              {lib.has_branches&&<span className="text-[10px] font-bold text-lma-slate-400">pick branch →</span>}
            </button>
            {lib.has_branches&&(
              <div className="grid grid-cols-2 gap-2 mt-2 pl-4">
                {init.branches.filter(b=>b.library_code===lib.library_code&&b.active).map(br=>(
                  <button key={br.branch_code} onClick={()=>onPick(br.branch_code)} className="bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.98] text-left">
                    <div className="text-sm font-bold text-lma-slate-900">{br.branch_code}</div>
                    <div className="text-[10px] text-lma-slate-500">{br.branch_display}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STEP 2: TYPE ─────────────────────────────────────────────────
function StepType({ onPick, onBack }:{ onPick:(t:"NEW"|"RENEWAL")=>void; onBack:()=>void }){
  return (
    <div className="lma-slide-up">
      <button onClick={onBack} className="text-sm text-lma-slate-500 mb-3">← Back</button>
      <div className="grid grid-cols-1 gap-3">
        <button onClick={()=>onPick("NEW")} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md active:scale-[0.99] text-left flex items-center gap-4">
          <div className="text-3xl">🆕</div>
          <div><div className="text-base font-extrabold text-lma-slate-900">New Admission</div><div className="text-xs text-lma-slate-500">First-time student. Auto-generates student ID.</div></div>
        </button>
        <button onClick={()=>onPick("RENEWAL")} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md active:scale-[0.99] text-left flex items-center gap-4">
          <div className="text-3xl">🔁</div>
          <div><div className="text-base font-extrabold text-lma-slate-900">Renewal</div><div className="text-xs text-lma-slate-500">Existing student. Search & continue booking.</div></div>
        </button>
      </div>
    </div>
  );
}

// ── STEP 3: STUDENT ──────────────────────────────────────────────
function StepStudent({ init, resolvedLib, resolvedBranch, admitType, post, showToast, onBack, onReady }:{
  init:InitData; resolvedLib:string; resolvedBranch:string; admitType:"NEW"|"RENEWAL";
  post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void;
  onBack:()=>void; onReady:(ctx:BookingCtx)=>void;
}){
  // NEW: collect details locally
  const [name,setName]=useState("");
  const [phones,setPhones]=useState<PhoneEntry[]>([{number:"",tag:"SELF"},{number:"",tag:""},{number:"",tag:""},{number:"",tag:""}]);
  const [address,setAddress]=useState("");
  const [preparingFor,setPreparingFor]=useState("");
  const [aadhaar,setAadhaar]=useState("");
  const [dob,setDob]=useState("");

  // RENEWAL: search (#5 button-triggered + #6 dual results)
  const [search,setSearch]=useState("");
  const [studentResults,setStudentResults]=useState<Student[]>([]);
  const [receiptResults,setReceiptResults]=useState<Receipt[]>([]);
  const [searching,setSearching]=useState(false);
  const [hasSearched,setHasSearched]=useState(false);
  const [isCross,setIsCross]=useState(false);
  const [crossOrigin,setCrossOrigin]=useState("");
  // #23: manual entry path
  const [manualSid,setManualSid]=useState("");

  const searchScope = isCross ? crossOrigin : resolvedBranch || resolvedLib;

  const doSearch=async()=>{
    const q=search.trim();
    if(q.length<2){ showToast("Type at least 2 characters","error"); return; }
    setSearching(true); setHasSearched(true);
    const type=autoDetectSearchType(q);
    try{
      // Run student + receipt searches in parallel (#6)
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
    init.libraries.filter(l=>l.active).forEach(l=>{
      if(l.has_branches) init.branches.filter(b=>b.library_code===l.library_code&&b.active).forEach(b=>out.push({code:b.branch_code,label:`${b.library_code}·${b.branch_code}`}));
      else out.push({code:l.library_code,label:l.library_code});
    });
    return out;
  },[init]);

  const handleNewNext=()=>{
    if(!name.trim()){ showToast("Name is required","error"); return; }
    // #17: normalize phones on submit (also done on blur, double-safe)
    const cleanPhones=phones.filter(p=>p.number.trim()).map(p=>({number:normalizePhone(p.number),tag:p.tag}));
    const student:Student={ student_id:"", library:resolvedLib, branch:resolvedBranch, name:name.trim(),
      phones:cleanPhones, address, preparing_for:preparingFor, aadhaar_last4:aadhaar, date_of_birth:dob, is_past:false };
    onReady({ admitType:"NEW", student, isCross:false, crossOrigin:"" });
  };

  // #20: auto-detect cross when picked student's library/branch ≠ current scope
  const pickRenewalStudent=async(st:Student)=>{
    const params=new URLSearchParams({action:"getReceiptLog",q:st.student_id,search_type:"STUDENT_ID",library:resolvedBranch||resolvedLib,limit:"50"});
    const r=await fetch(`${API}?${params}`).then(r=>r.json());
    let renewFrom:Receipt|null=null;
    if(r.ok&&r.receipts&&r.receipts.length){ renewFrom=r.receipts[0]; }
    const scope=(resolvedBranch||resolvedLib).toUpperCase();
    const stLib=(st.library||"").toUpperCase();
    const stBr=(st.branch||"").toUpperCase();
    const autoCross = stLib!==scope && stBr!==scope;
    const autoOrigin = autoCross ? (st.branch||st.library) : "";
    onReady({ admitType:"RENEWAL", student:st, isCross: autoCross||isCross, crossOrigin: autoCross?autoOrigin:(isCross?crossOrigin:""), renewFrom });
  };

  // pick a specific receipt directly (#6)
  const pickRenewalReceipt=(r:Receipt)=>{
    const student:Student={ student_id:r.student_id, library:r.library, branch:r.branch, name:r.name, phones:r.phones||[], address:"", preparing_for:"", aadhaar_last4:"", date_of_birth:"", is_past:false };
    const scope=(resolvedBranch||resolvedLib).toUpperCase();
    const rLib=(r.library||"").toUpperCase();
    const rBr=(r.branch||"").toUpperCase();
    const autoCross = rLib!==scope && rBr!==scope;
    const autoOrigin = autoCross ? (r.branch||r.library) : "";
    onReady({ admitType:"RENEWAL", student, isCross: autoCross||isCross, crossOrigin: autoCross?autoOrigin:(isCross?crossOrigin:""), renewFrom:r });
  };

  // #23: manual student_id path (jump straight to booking with a typed ID, no search needed)
  const pickManual=async()=>{
    const sid=manualSid.trim().toUpperCase();
    if(!sid){ showToast("Enter a Student ID","error"); return; }
    // Try to fetch their latest receipt for date chaining
    const params=new URLSearchParams({action:"getReceiptLog",q:sid,search_type:"STUDENT_ID",library:resolvedBranch||resolvedLib,limit:"5"});
    const r=await fetch(`${API}?${params}`).then(r=>r.json());
    const renewFrom = (r.ok&&r.receipts&&r.receipts.length)?r.receipts[0]:null;
    const baseName = renewFrom?renewFrom.name:"";
    const baseLib = renewFrom?renewFrom.library:resolvedLib;
    const baseBranch = renewFrom?renewFrom.branch:resolvedBranch;
    const phonesFromR = renewFrom?(renewFrom.phones||[]):[];
    const student:Student={ student_id:sid, library:baseLib, branch:baseBranch, name:baseName, phones:phonesFromR, address:"", preparing_for:"", aadhaar_last4:"", date_of_birth:"", is_past:false };
    onReady({ admitType:"RENEWAL", student, isCross, crossOrigin: isCross?crossOrigin:"", renewFrom });
  };

  return (
    <div className="lma-slide-up">
      <button onClick={onBack} className="text-sm text-lma-slate-500 mb-3">← Back</button>

      {admitType==="NEW"?(
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-3">New Student Details</h3>
          <FieldLabel>Name *</FieldLabel>
          {/* #18: live UPPERCASE */}
          <Inp value={name} onChange={e=>setName(e.target.value.toUpperCase())} placeholder="FULL NAME"/>
          <FieldLabel>Phones</FieldLabel>
          {phones.map((ph,i)=>(
            <div key={i} className="flex gap-2 mb-2">
              {/* #17: normalize on blur */}
              <input type="tel" inputMode="numeric" value={ph.number}
                onChange={e=>{const n=[...phones];n[i]={...n[i],number:e.target.value};setPhones(n);}}
                onBlur={()=>{const n=[...phones];n[i]={...n[i],number:normalizePhone(n[i].number)};setPhones(n);}}
                placeholder={i===0?"Primary":`Phone ${i+1}`}
                className="flex-1 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
              <input value={ph.tag} onChange={e=>{const n=[...phones];n[i]={...n[i],tag:e.target.value.toUpperCase()};setPhones(n);}} placeholder="TAG" className="w-20 px-2 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium uppercase"/>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-0 mt-1">
            <FieldLabel>Address</FieldLabel>
            <Inp value={address} onChange={e=>setAddress(e.target.value.toUpperCase())}/>
            <FieldLabel>Preparing For</FieldLabel>
            <Inp value={preparingFor} onChange={e=>setPreparingFor(e.target.value.toUpperCase())} placeholder="NEET, UPSC…"/>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Aadhaar (last 4)</FieldLabel><Inp value={aadhaar} onChange={e=>setAadhaar(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4}/></div>
              <div><FieldLabel>DOB</FieldLabel><Inp value={dob} onChange={e=>setDob(e.target.value)} placeholder="DD-MM-YYYY"/></div>
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
                <p className="text-[10px] text-lma-slate-500 mt-1">They&apos;ll keep their original ID but sit & pay here.</p>
              </div>
            )}
            <div className="flex gap-2">
              <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doSearch();}} placeholder="Name, phone, F-ID, or R-no…" disabled={isCross&&!crossOrigin} className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-sm font-medium disabled:opacity-50"/>
              {/* #5: explicit search button */}
              <button onClick={doSearch} disabled={searching||(isCross&&!crossOrigin)} className="px-5 py-3 rounded-xl bg-lma-primary text-white font-bold text-sm disabled:opacity-50">{searching?"…":"Search"}</button>
            </div>
            <p className="text-[10px] text-lma-slate-500 mt-1.5">Auto-detects type. Tip: R12 = receipt, F45 = student ID, digits = phone.</p>
          </div>

          {searching&&<div className="text-center text-sm text-lma-slate-500 py-3">Searching…</div>}

          {/* #6: dual results — receipts on top (more specific), students below */}
          {hasSearched&&!searching&&receiptResults.length>0&&(
            <div className="mb-3">
              <p className="text-[10px] font-bold text-lma-slate-500 uppercase tracking-wider mb-1.5">🧾 Receipts ({receiptResults.length})</p>
              <div className="space-y-2">
                {receiptResults.map(r=>(
                  <button key={r.receipt_no} onClick={()=>pickRenewalReceipt(r)} className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99] flex items-center gap-3 border-l-4 border-lma-primary">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-extrabold text-lma-slate-900">{r.receipt_no}</span>
                        <span className="text-[10px] font-bold text-lma-primary bg-lma-primary/10 px-1.5 py-0.5 rounded">{r.student_id}</span>
                        <span className="text-[10px] text-lma-slate-400 ml-auto">{r.library}{r.branch?`/${r.branch}`:""}</span>
                      </div>
                      <div className="text-sm font-semibold text-lma-slate-800 truncate">{r.name}</div>
                      <div className="text-[11px] text-lma-slate-500">{normDate(r.booking_from)} → {normDate(r.booking_to)} · {r.shift_name||r.shift}{r.seat_no?` · Seat ${r.seat_no}`:""}</div>
                    </div>
                    <span className="text-lma-slate-400">›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasSearched&&!searching&&studentResults.length>0&&(
            <div className="mb-3">
              <p className="text-[10px] font-bold text-lma-slate-500 uppercase tracking-wider mb-1.5">👤 Students ({studentResults.length})</p>
              <div className="space-y-2">
                {studentResults.map(st=>(
                  <button key={`${st.library}-${st.student_id}`} onClick={()=>pickRenewalStudent(st)} className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99] flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5"><span className="text-sm font-extrabold text-lma-slate-900">{st.student_id}</span>{st.is_past&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded">PAST</span>}<span className="text-[10px] text-lma-slate-400 ml-auto">{st.library}{st.branch?`/${st.branch}`:""}</span></div>
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

          {/* #23: manual entry escape hatch */}
          <div className="mt-3 bg-white rounded-2xl p-3 shadow-sm border border-dashed border-lma-slate-200">
            <p className="text-[11px] font-bold text-lma-slate-500 uppercase tracking-wider mb-1.5">Or enter Student ID directly</p>
            <div className="flex gap-2">
              <input value={manualSid} onChange={e=>setManualSid(e.target.value.toUpperCase())} placeholder="F123" className="flex-1 px-3 py-2 rounded-lg border border-lma-slate-200 bg-lma-slate-50 text-sm font-medium uppercase"/>
              <button onClick={pickManual} className="px-4 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-700 font-bold text-sm">Continue →</button>
            </div>
            <p className="text-[10px] text-lma-slate-500 mt-1">Useful for past students or when search misses.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── STEP 4: BOOKING ──────────────────────────────────────────────
function StepBooking({ init, resolvedLib, resolvedBranch, ctx, post, showToast, onBack, onDone }:{
  init:InitData; resolvedLib:string; resolvedBranch:string; ctx:BookingCtx;
  post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void;
  onBack:()=>void; onDone:(r:ResultData)=>void;
}){
  const feeKey = resolvedBranch || resolvedLib;
  const [shift,setShift]=useState("");
  const [seat,setSeat]=useState("");
  const [bookingFrom,setBookingFrom]=useState("");
  const [bookingTo,setBookingTo]=useState("");
  const [toEdited,setToEdited]=useState(false);
  // #9: receipt_date input (defaults to today)
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
    if(pl?.from){
      from = normDate(pl.from);
    } else if(ctx.admitType==="RENEWAL"&&ctx.renewFrom&&ctx.renewFrom.booking_to){
      // #19: tolerate any date format coming back from backend
      from=addOneDayDmy(normDate(ctx.renewFrom.booking_to));
    } else {
      from=todayDmy();
    }
    setBookingFrom(from);
    setBookingTo(pl?.to ? normDate(pl.to) : addOneMonth(from));
    if(pl?.to) setToEdited(true); // honor explicit to-date

    // Shift — preload wins, else from renewFrom
    if(pl?.shift){
      setShift(pl.shift);
    } else if(ctx.admitType==="RENEWAL"&&ctx.renewFrom&&ctx.renewFrom.shift){
      setShift(ctx.renewFrom.shift);
    }
    // Seat — preload wins, else from renewFrom
    if(pl?.seat){
      setSeat(pl.seat);
    } else if(ctx.admitType==="RENEWAL"&&ctx.renewFrom&&ctx.renewFrom.seat_no){
      setSeat(ctx.renewFrom.seat_no);
    }
    // Fee — preload wins (overrides the auto-fee lookup that happens on shift change)
    if(pl?.fee){
      setFee(String(pl.fee));
    }
  },[ctx]);

  useEffect(()=>{ if(!toEdited&&bookingFrom) setBookingTo(addOneMonth(bookingFrom)); },[bookingFrom,toEdited]);

  // Guard so auto-fee doesn't stomp a preloaded fee on the very first shift sync.
  const preloadFeeRef = useRef<string>("");
  useEffect(()=>{ preloadFeeRef.current = ctx.preload?.fee || ""; },[ctx]);

  useEffect(()=>{
    if(!shift) return;
    // If a preload fee was provided AND the current fee still matches it, skip auto-overwrite.
    // The user can change shift later → auto-fee then takes over normally.
    if(preloadFeeRef.current && fee === preloadFeeRef.current){
      preloadFeeRef.current = ""; // one-shot
      return;
    }
    const m=init.fees[feeKey];
    if(m){ const f=m[shiftKey]; if(f!==undefined&&f!==null) setFee(String(f)); }
  },[shift]);   // eslint-disable-line

  useEffect(()=>{
    const f=Number(fee)||0;
    const paid=pays.reduce((s,p)=>s+(Number(p.amount)||0),0);
    const due=Math.max(0,f-paid);
    setFeesDue(String(due));
  },[fee,pays]);

  const activeShifts=init.shifts.filter(s=>s.active);
  const shiftObj=activeShifts.find(s=>normShiftKey(s.shift_key)===shiftKey);

  const setPay=(i:number,field:"mode"|"amount",val:string)=>{ const n=[...pays]; n[i]={...n[i],[field]:val}; setPays(n); };
  const addSplit=()=>{ if(pays.length<3) setPays([...pays,{mode:"",amount:""}]); };
  const removeSplit=(i:number)=>{ setPays(pays.filter((_,j)=>j!==i)); };

  // #21: auto-fill payment amount = remaining when ANY slot picks a mode (not just first)
  // logic: if a slot has mode but no amount, fill with (fee - already-allocated)
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
      receipt_date:receiptDate, // #9
      fee:Number(fee),
      pay_modes:validPays.map(p=>({mode:p.mode,amount:Number(p.amount)})),
      fees_due:Number(feesDue),
      type:ctx.admitType,
    };
    if(ctx.admitType==="NEW"){
      payload.phones=ctx.student?.phones||[];
      payload.address=ctx.student?.address||""; payload.preparing_for=ctx.student?.preparing_for||"";
      payload.aadhaar_last4=ctx.student?.aadhaar_last4||""; payload.date_of_birth=ctx.student?.date_of_birth||"";
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
    <div className="lma-slide-up">
      <button onClick={onBack} className="text-sm text-lma-slate-500 mb-3">← Back</button>
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="bg-lma-slate-50 rounded-xl p-2.5 flex items-center gap-2">
          <span className="text-[10px] font-bold bg-lma-primary/10 text-lma-primary px-2 py-0.5 rounded">{ctx.admitType}</span>
          <span className="text-sm font-bold text-lma-slate-900">{ctx.student?.student_id||"New"}</span>
          <span className="text-sm text-lma-slate-600 truncate">{ctx.student?.name}</span>
          {ctx.isCross&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded ml-auto">CROSS · {ctx.crossOrigin}</span>}
        </div>

        <div>
          <FieldLabel>Shift *</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {activeShifts.map(s=>(
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
          <div><FieldLabel>From</FieldLabel><input type="date" value={dmyToIso(bookingFrom)} onChange={e=>{setBookingFrom(isoToDmy(e.target.value));}} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/></div>
          <div><FieldLabel>To</FieldLabel><input type="date" value={dmyToIso(bookingTo)} onChange={e=>{setBookingTo(isoToDmy(e.target.value));setToEdited(true);}} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/></div>
        </div>

        {/* #9: Receipt Date */}
        <div><FieldLabel>Receipt Date</FieldLabel><input type="date" value={dmyToIso(receiptDate)} onChange={e=>setReceiptDate(isoToDmy(e.target.value))} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/></div>

        <div><FieldLabel>Fee (₹)</FieldLabel><Inp type="number" inputMode="numeric" value={fee} onChange={e=>setFee(e.target.value)}/></div>

        <div>
          <FieldLabel>Payment</FieldLabel>
          {pays.map((p,i)=>(
            <div key={i} className="flex gap-2 mb-2">
              <select value={p.mode} onChange={e=>setPay(i,"mode",e.target.value)} className="flex-1 px-2.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
                <option value="">Mode…</option>
                {init.paymentTags.filter(t=>t.active).map(t=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
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
          {submitting?"Creating…":"Create Receipt"}
        </button>
      </div>

      {showSeatPicker&&(
        <SeatPickerSheet
          library={resolvedLib} branch={resolvedBranch} shift={shiftKey}
          current={seat} onClose={()=>setShowSeatPicker(false)}
          onPick={(label)=>{ setSeat(label); setShowSeatPicker(false); }}
        />
      )}
    </div>
  );
}

// ── SEAT PICKER ──────────────────────────────────────────────────
function SeatPickerSheet({ library, branch, shift, current, onClose, onPick }:{
  library:string; branch:string; shift:string; current:string;
  onClose:()=>void; onPick:(label:string)=>void;
}){
  const [data,setData]=useState<VacantResp|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const params=new URLSearchParams({action:"getVacantSeats",library_code:library,shift});
    if(branch) params.set("branch_code",branch);
    fetch(`${API}?${params}`).then(r=>r.json()).then((r:VacantResp)=>{ setData(r); setLoading(false); });
  },[library,branch,shift]);

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-4 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-3"/>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-lma-slate-900">Pick a seat · {shift}</h3>
          <button onClick={()=>onPick("")} className="text-xs font-bold text-lma-primary">Assign later</button>
        </div>
        <div className="flex gap-3 mb-3 text-[10px] text-lma-slate-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-lma-accent/20 border border-lma-accent inline-block"></span>vacant</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-lma-slate-200 inline-block"></span>taken</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-lma-slate-500 inline-block"></span>dead</span>
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

// ── STEP 5: RESULT ───────────────────────────────────────────────
function StepResult({ result, onNew }:{ result:ResultData; onNew:()=>void }){
  const [copied,setCopied]=useState("");
  const copy=(text:string,which:string)=>{ navigator.clipboard.writeText(text); setCopied(which); setTimeout(()=>setCopied(""),1500); };
  const wa=(text:string)=>`https://wa.me/?text=${encodeURIComponent(text)}`;
  return (
    <div className="lma-slide-up">
      <div className="bg-white rounded-2xl p-5 shadow-sm text-center mb-3">
        <div className="text-4xl mb-2">✅</div>
        <h2 className="text-lg font-extrabold text-lma-slate-900">Receipt Created</h2>
        <p className="text-sm text-lma-slate-600 mt-1">{result.receipt_no} · {result.student_id}</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
        <div className="text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-2">Receipt</div>
        <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">{result.receipt_text}</pre>
        <div className="flex gap-2 mt-2">
          <a href={wa(result.receipt_text)} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-xl bg-lma-accent text-white font-bold text-sm text-center">Share on WhatsApp</a>
          <button onClick={()=>copy(result.receipt_text,"r")} className="px-4 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">{copied==="r"?"Copied":"Copy"}</button>
        </div>
      </div>

      {result.registration_text&&(
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <div className="text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-2">Registration</div>
          <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">{result.registration_text}</pre>
          <div className="flex gap-2 mt-2">
            <a href={wa(result.registration_text)} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-xl bg-lma-accent text-white font-bold text-sm text-center">Share on WhatsApp</a>
            <button onClick={()=>copy(result.registration_text,"reg")} className="px-4 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">{copied==="reg"?"Copied":"Copy"}</button>
          </div>
        </div>
      )}

      <button onClick={onNew} className="w-full py-3.5 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-extrabold shadow-md">+ New Admission</button>
    </div>
  );
}

// ── SHARED ───────────────────────────────────────────────────────
function FieldLabel({ children }:{ children:React.ReactNode }){ return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1 mt-2">{children}</label>; }
function Inp(props:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium"/>; }