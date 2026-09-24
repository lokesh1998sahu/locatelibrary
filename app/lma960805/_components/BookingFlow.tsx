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

import ContactCopyButton from "./ContactCopyButton";
import WhatsAppButton from "./WhatsAppButton";
import { useState, useEffect, useMemo, useRef } from "react";
import { useLMA } from "./LMAProvider";
import { toDmy, fmtDMY, toIsoInput } from "../_lib/dates";
import { parsePhone10 } from "../_lib/phone";
import CodePill from "./CodePill";
import { TagBankNote, TagChips } from "./TagBank";

const API = "/api/lma960805";

// ── helpers (copied from admissions, proven) ──
const normDate = toDmy;
function todayDmy(){ const d=new Date(); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function addOneMonth(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); const d=new Date(+p[2],+p[1]-1,+p[0]); const tm=d.getMonth()+1; d.setMonth(tm); if(d.getMonth()!==tm%12)d.setDate(0); else d.setDate(d.getDate()-1); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function addOneDayDmy(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); const d=new Date(+p[2],+p[1]-1,+p[0]); d.setDate(d.getDate()+1); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function dmyToIso(dmy:string){ if(!dmy)return""; const p=dmy.split("-"); if(p.length!==3)return""; return `${p[2]}-${String(+p[1]).padStart(2,"0")}-${String(+p[0]).padStart(2,"0")}`; }
function isoToDmy(iso:string){ if(!iso)return""; const p=iso.split("-"); if(p.length!==3)return""; return `${+p[2]}-${+p[1]}-${+p[0]}`; }
function normShiftKey(s:string):"MORNING"|"EVENING"|"FULL DAY"|"OTHER"{ const u=(s||"").toUpperCase().trim(); if(u==="MORNING")return"MORNING"; if(u==="EVENING")return"EVENING"; if(u==="FULL DAY"||u==="FULLDAY"||u==="FULL_DAY")return"FULL DAY"; return"OTHER"; }
function autoDetectSearchType(q:string):"NAME"|"PHONE"|"STUDENT_ID"|"RECEIPT_NO"{ const t=q.trim(); if(!t)return"NAME"; if(/^R\d+/i.test(t))return"RECEIPT_NO"; const s=t.replace(/[\s\-\.\(\)\+]/g,""); if(/^\d{3,}$/.test(s))return"PHONE"; if(/^F\d+/i.test(t))return"STUDENT_ID"; return"NAME"; }
const normalizePhone = parsePhone10;

interface PhoneEntry { number:string; tag:string; }
interface Student  { student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[]; address:string; preparing_for:string; aadhaar_last4:string; date_of_birth:string; gender?:string; is_past:boolean; }
interface Receipt  { receipt_no:string; student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[]; seat_no:string; shift:string; shift_name:string; shift_time:string; booking_from:string; booking_to:string; status:string; is_cross_library?:string; fee?:number; }
interface SeatCell { row_in_section:number; col_in_section:number; seat_no:number; display_label:string; notes:string; cell_type:string; state?:string; occupant?:{receipt_no:string;student_id:string;name:string;shift:string}|null; share_note?:string|null; }
interface VacantResp { ok:boolean; needs_seat:boolean; sections:{section_name:string;section_order:number;rows:number;cols:number;seats:SeatCell[]}[]; }
interface ResultData { receipt_no:string; student_id:string; receipt_text:string; registration_text:string; name:string; library:string; phones:PhoneEntry[]; }
type PayMode = { mode:string; amount:string; date?:string };
interface BookingPreload { seat?:string; shift?:string; fee?:string; from?:string; to?:string; }
interface BookingCtx { admitType:"NEW"|"RENEWAL"; student:Student|null; isCross:boolean; crossOrigin:string; renewFrom?:Receipt|null; preload?:BookingPreload; intakeCode?:string; }

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
  const bookingDraft = useRef<any>(null);
  const studentDraft = useRef<any>(null);

  // renewal mode: fetch the receipt by number (self-sufficient)
  useEffect(()=>{ if(!renewReceiptNo) return; let alive=true; (async()=>{
    setLoading(true);
    try{
      const qs=new URLSearchParams({ action:"getReceiptLog", q:renewReceiptNo, search_type:"RECEIPT_NO", exact:"1", limit:"5" });
      const r=await fetch(`${API}?${qs}`).then(x=>x.json());
      const list:Receipt[]=(r&&r.receipts)||[];
      if(alive){ const exact=list.find(x=>x.receipt_no===renewReceiptNo)||null; if(!exact) showToast("Receipt "+renewReceiptNo+" not found","error"); setRenewFrom(exact); }
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
  const STEPS = renewReceiptNo ? ["Confirm","Booking","Done"] : ["Type","Student","Booking","Done"];
  const stepIdx = (renewReceiptNo ? ({confirm:0,form:1,done:2} as Record<string,number>) : ({type:0,student:1,form:2,done:3} as Record<string,number>))[step] ?? 0;
  const flowTitle = renewReceiptNo ? "Renew booking" : "New booking";
  const fromChart = [presetSeat?`Seat ${presetSeat}`:"", presetShift?presetShift.charAt(0).toUpperCase()+presetShift.slice(1).toLowerCase():""].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
      <div role="dialog" aria-modal="true" aria-label={flowTitle} className="lma-sheet-up relative w-full max-w-[560px] max-h-[94dvh] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lma-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-lma-float" onClick={e=>e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#dfe1ee]"/>
        {step!=="done"&&(
          <div className="mb-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[18px] font-bold tracking-[-0.01em] text-lma-ink">{flowTitle}</div>
                <div className="mt-0.5 truncate text-[12.5px] text-lma-ink-3">Step {stepIdx+1} of {STEPS.length} · {STEPS[stepIdx]}{fromChart?` · ${fromChart}`:""}</div>
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>
            <div className="mt-3 flex gap-1.5" aria-hidden="true">{STEPS.map((_,k)=><span key={k} className={`h-1.5 flex-1 rounded-full ${k<=stepIdx?"bg-lma-brand":"bg-lma-line"}`}/>)}</div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-lma-ink-3">Loading…</div>
        ) : renewReceiptNo && !renewFrom ? (
          <div className="py-10 text-center"><p className="text-sm text-lma-ink-3 mb-4">Receipt not found.</p><button onClick={onClose} className="px-5 py-2.5 rounded-[14px] bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold text-sm">Close</button></div>
        ) : step==="confirm" && renewFrom ? (
          <>
            <div className="rounded-[18px] border border-lma-line bg-lma-surface p-4 shadow-lma-card">
              <div className="text-[17px] font-bold leading-snug text-lma-ink">{renewFrom.name}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-lma-ink-3">
                <span className={`rounded-md px-1.5 py-0.5 font-lma-mono font-semibold ring-1 ring-inset ${renewCtx?.isCross?"bg-[#f5f0ff] text-[#7c3aed] ring-[#e4d9fb]":"bg-lma-bg text-lma-ink-2 ring-lma-line"}`}>{renewFrom.student_id}{renewCtx?.isCross?`-${renewCtx.crossOrigin}`:""}</span>
                <span aria-hidden="true">·</span><span className="font-lma-mono">{renewFrom.receipt_no}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[12px] bg-lma-bg px-3 py-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-lma-ink-3">Now</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold text-lma-ink">{renewFrom.shift_name||renewFrom.shift}{renewFrom.seat_no?` · Seat ${renewFrom.seat_no}`:""}</div>
                  <div className="text-[12px] text-lma-ink-3">till {fmtDMY(renewFrom.booking_to)}</div>
                </div>
                <div className="rounded-[12px] bg-lma-brand-soft px-3 py-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-lma-brand">Renewing</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold text-lma-ink">{presetShift||renewFrom.shift_name||renewFrom.shift}{(presetSeat||renewFrom.seat_no)?` · Seat ${presetSeat||renewFrom.seat_no}`:""}</div>
                  <div className="text-[12px] text-lma-ink-3">dates &amp; fees next</div>
                </div>
              </div>
            </div>
            <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-lma-ink-3">A new receipt is created and the old one is marked renewed.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={onClose} className="h-12 rounded-[14px] bg-lma-surface text-[15px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Cancel</button>
              <button onClick={()=>setStep("form")} className="lma-glass-btn h-12 rounded-[14px] text-[15px] font-bold text-white">Continue</button>
            </div>
          </>
        ) : step==="type" ? (
          <StepType onPick={t=>{ if(studentDraft.current && studentDraft.current.admitType!==t) studentDraft.current=null; setAdmitType(t); setStep("student"); }} onBack={onClose}/>
        ) : step==="student" && admitType ? (
           <StepStudent init={init} resolvedLib={resolved.lib} resolvedBranch={resolved.branch} admitType={admitType} post={post} showToast={showToast}
            draft={studentDraft}
            onBack={()=>setStep("type")}
            onReady={(ctx)=>{ setBookingCtx({ ...ctx, preload:{ seat:presetSeat||"", shift:presetShift||"", fee:"", from:"", to:"" } }); setStep("form"); }}/>
        ) : step==="form" && formCtx ? (
          <StepBooking init={init} resolvedLib={resolved.lib} resolvedBranch={resolved.branch} ctx={formCtx} post={post} showToast={showToast}
            draft={bookingDraft}
            onBack={()=>setStep(renewReceiptNo?"confirm":"student")}
           onDone={(r)=>{ bookingDraft.current=null; studentDraft.current=null; setResult(r); setStep("done"); onComplete(); }}/>
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
      <div className="flex flex-col items-center pt-3 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-lma-in-soft text-lma-in">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 9.5 17 19 7.5"/></svg>
        </span>
        <h2 className="mt-3 text-[20px] font-bold tracking-[-0.01em] text-lma-ink">Receipt created</h2>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="rounded-md bg-lma-surface px-2 py-0.5 font-lma-mono text-[13px] font-semibold text-lma-ink ring-1 ring-inset ring-lma-line">{result.receipt_no}</span>
          <span className="rounded-md bg-lma-surface px-2 py-0.5 font-lma-mono text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">{result.student_id}</span>
        </div>
      </div>
      <div className="mt-5 rounded-[18px] border border-lma-line bg-lma-surface p-3.5 shadow-lma-card">
        <div className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Receipt</div>
        <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-[12px] bg-lma-bg p-3 font-lma-mono text-[12px] leading-relaxed text-lma-ink-2">{result.receipt_text}</pre>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <WhatsAppButton phones={result.phones} text={result.receipt_text} label="Send on WhatsApp" className="h-12 w-full rounded-[14px] bg-[#16a34a] text-[14.5px] font-bold text-white disabled:opacity-40"/>
          <button onClick={()=>copy(result.receipt_text,"r")} className="h-12 rounded-[14px] bg-lma-bg px-4 text-[14px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">{copied==="r"?"Copied":"Copy"}</button>
        </div>
      </div>
      {result.registration_text&&(
        <div className="mt-3 rounded-[18px] border border-lma-line bg-lma-surface p-3.5 shadow-lma-card">
          <div className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Registration</div>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-[12px] bg-lma-bg p-3 font-lma-mono text-[12px] leading-relaxed text-lma-ink-2">{result.registration_text}</pre>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <a href={wa(result.registration_text)} target="_blank" rel="noopener noreferrer" className="grid h-12 place-items-center rounded-[14px] bg-[#16a34a] text-[14.5px] font-bold text-white">Send registration</a>
            <button onClick={()=>copy(result.registration_text,"reg")} className="h-12 rounded-[14px] bg-lma-bg px-4 text-[14px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">{copied==="reg"?"Copied":"Copy"}</button>
          </div>
        </div>
      )}
      <div className="mt-3"><ContactCopyButton name={result.name} library={result.library} studentId={result.student_id} phones={result.phones} label="Copy contact" wrapperClassName="w-full" className="h-12 w-full rounded-[14px] bg-lma-surface text-[14px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line"/></div>
      <button onClick={onClose} className="lma-glass-btn mt-4 h-12 w-full rounded-[14px] text-[15px] font-bold text-white">Done</button>
    </div>
  );
}

// ── STEP: NEW vs RENEWAL (copied) ──
function StepType({ onPick, onBack }:{ onPick:(t:"NEW"|"RENEWAL")=>void; onBack:()=>void }){
  const card="lma-noscale flex w-full items-center gap-4 rounded-[18px] border border-lma-line bg-lma-surface p-4 text-left shadow-lma-card active:bg-lma-bg";
  const chev=<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-lma-ink-3"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>;
  return (
    <div>
      <div className="space-y-3">
        <button onClick={()=>onPick("NEW")} className={card}>
          <span aria-hidden="true" className="lma-glass-btn grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 19.5a6.5 6.5 0 0 1 11.5-4"/><path d="M18.5 14v6M15.5 17h6"/></svg>
          </span>
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-bold text-lma-ink">New admission</span><span className="mt-0.5 block text-[12.5px] text-lma-ink-3">First-time student · a student ID is created</span></span>
          {chev}
        </button>
        <button onClick={()=>onPick("RENEWAL")} className={card}>
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-lma-brand-soft text-lma-brand">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 11V9.5A3.5 3.5 0 0 1 8.5 6H18l-3-3"/><path d="M19 13v1.5a3.5 3.5 0 0 1-3.5 3.5H6l3 3"/></svg>
          </span>
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-bold text-lma-ink">Renewal</span><span className="mt-0.5 block text-[12.5px] text-lma-ink-3">Existing student · find them and continue</span></span>
          {chev}
        </button>
      </div>
      <button onClick={onBack} className="mt-3 h-11 w-full rounded-[14px] text-[14px] font-semibold text-lma-ink-3">Cancel</button>
    </div>
  );
}

// ── STEP: STUDENT (new details OR renewal search) — copied ──
function StepStudent({ init, resolvedLib, resolvedBranch, admitType, post, showToast, onBack, onReady, draft }:{
  init:any; resolvedLib:string; resolvedBranch:string; admitType:"NEW"|"RENEWAL";
  post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void;
  onBack:()=>void; onReady:(ctx:BookingCtx)=>void; draft?:{current:any};
}){
  const [name,setName]=useState("");
  const [phones,setPhones]=useState<PhoneEntry[]>([{number:"",tag:"SELF"}]);
  const [address,setAddress]=useState("");
  const [preparingFor,setPreparingFor]=useState("");
  const [aadhaar,setAadhaar]=useState("");
  const [dob,setDob]=useState("");
  const [gender,setGender]=useState<"M"|"F"|"">("");
  const [intakeCode,setIntakeCode]=useState("");   // B6
  const [intakeBusy,setIntakeBusy]=useState(false);
  const [intakeOk,setIntakeOk]=useState("");
  const [intakeRemark,setIntakeRemark]=useState(""); // admin note from the enquiry code — verify it matches the student in front of you
  const [intakeMobile,setIntakeMobile]=useState("");
  const [intakeAlt,setIntakeAlt]=useState("");   // code number ≠ the number the student filled — offer it as a secondary
  const fetchIntake=async()=>{
    const c=intakeCode.trim(); if(!c) return;
    setIntakeBusy(true); setIntakeOk("");
    try{
      const r=await fetch(`${API}?action=intakeFetch&code=${encodeURIComponent(c)}`).then(x=>x.json());
      if(r&&r.ok&&r.fields){
        const f=r.fields;
        setName(String(f.name||"").toUpperCase());
        if(f.gender==="M"||f.gender==="F") setGender(f.gender);
        if(f.whatsapp_no) setPhones([{number:String(f.whatsapp_no),tag:"SELF"}]);
        setDob(String(f.date_of_birth||""));
        setAddress(String(f.address||"").toUpperCase());
        setPreparingFor(String(f.preparing_for||"").toUpperCase());
        setIntakeRemark(String(r.remark||""));
        const adminMob=String(r.mobile||""), stuMob=String(f.whatsapp_no||"");
        setIntakeMobile(adminMob);
        setIntakeAlt(adminMob&&stuMob&&adminMob!==stuMob?adminMob:"");
        setIntakeOk(r.issued_for&&r.issued_for!==(resolvedBranch||resolvedLib)?`Prefilled · code issued for ${r.issued_for}`:"Prefilled from student submission");
      } else showToast((r&&r.error)||"Could not fetch this code","error");
    }catch{ showToast("Network error","error"); }
    setIntakeBusy(false);
  };

  const [search,setSearch]=useState("");
  const [studentResults,setStudentResults]=useState<Student[]>([]);
  const [receiptResults,setReceiptResults]=useState<Receipt[]>([]);
  const [searching,setSearching]=useState(false);
  const [hasSearched,setHasSearched]=useState(false);
  const [rcptPage,setRcptPage]=useState(0);
  const [stuPage,setStuPage]=useState(0);
  const [isCross,setIsCross]=useState(false);
   const [crossOrigin,setCrossOrigin]=useState("");

  // Draft: everything typed/searched here survives a trip forward to booking and

  // back. Restored in a layout effect so it lands before paint (no blank flash).

  const restoredRef=useRef(false);
  if(!restoredRef.current){
    restoredRef.current=true;

    const d=draft?.current;

    if(d&&d.admitType===admitType){

    setName(d.name||""); setPhones(d.phones&&d.phones.length?d.phones:[{number:"",tag:"SELF"}]);

    setAddress(d.address||""); setPreparingFor(d.preparingFor||""); setAadhaar(d.aadhaar||"");

    setDob(d.dob||""); setGender(d.gender||""); setIntakeCode(d.intakeCode||"");

    setIntakeOk(d.intakeOk||""); setIntakeRemark(d.intakeRemark||""); setIntakeMobile(d.intakeMobile||""); setIntakeAlt(d.intakeAlt||"");

    setSearch(d.search||""); setStudentResults(d.studentResults||[]); setReceiptResults(d.receiptResults||[]);

    setHasSearched(!!d.hasSearched); setRcptPage(d.rcptPage||0); setStuPage(d.stuPage||0);

    setIsCross(!!d.isCross); setCrossOrigin(d.crossOrigin||"");

    }
  }

  // mirror current state into the draft after every render — no exit path can miss it

  useEffect(()=>{ if(draft) draft.current={ admitType, name, phones, address, preparingFor, aadhaar, dob, gender, intakeCode, intakeOk, intakeRemark, intakeMobile, intakeAlt, search, studentResults, receiptResults, hasSearched, rcptPage, stuPage, isCross, crossOrigin }; });
  const searchScope = isCross ? crossOrigin : resolvedBranch || resolvedLib;

  // O11(b): in RENEWAL search only, show just the LATEST receipt per student.
  // getReceiptLog returns newest-first, so the first hit per student_id is the latest.
  const receiptsShown = useMemo(()=>{
    
    const seen=new Set<string>(); const out:Receipt[]=[];
    receiptResults.forEach(r=>{
      const k=String(r.student_id||"").toUpperCase();
      if(!k){ out.push(r); return; }
      if(seen.has(k)) return;
      seen.add(k); out.push(r);
    });
    return out;
  },[receiptResults]);

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
    onReady({ admitType:"NEW", student, isCross:false, crossOrigin:"", intakeCode:intakeCode.trim() });
  };

  const pickRenewalStudent=(st:Student)=>{ // A1: student tile = FRESH booking from today (pick a RECEIPT tile to continue a booking)
    
    
    
    
    const scope=(resolvedBranch||resolvedLib).toUpperCase();
    const autoCross = (st.library||"").toUpperCase()!==scope && (st.branch||"").toUpperCase()!==scope;
    const autoOrigin = autoCross ? (st.branch||st.library) : "";
    onReady({ admitType:"RENEWAL", student:st, isCross: autoCross||isCross, crossOrigin: autoCross?autoOrigin:(isCross?crossOrigin:""), renewFrom:null });
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
      <button onClick={onBack} className="text-sm text-lma-ink-3 mb-3">← Back</button>

      {admitType==="NEW"?(
        <div className="bg-white rounded-[18px] p-4 shadow-sm">
          <h3 className="text-base font-bold text-lma-ink mb-3">New Student Details</h3>
          <div className="bg-lma-bg rounded-[14px] p-2.5 mb-3">
            <FieldLabel>Intake code (optional)</FieldLabel>
            <div className="flex gap-2">
              <input value={intakeCode} onChange={e=>{setIntakeCode(e.target.value.toUpperCase());setIntakeOk("");setIntakeRemark("");setIntakeMobile("");setIntakeAlt("");}} placeholder="XXXXX-XXXXX" autoCapitalize="characters" className="flex-1 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-lma-mono tracking-wider text-lma-ink outline-none focus:border-lma-brand"/>
              <button type="button" onClick={fetchIntake} disabled={intakeBusy||!intakeCode.trim()} className="px-3.5 py-2.5 rounded-[14px] bg-lma-primary text-white font-bold text-xs disabled:opacity-50">{intakeBusy?"…":"Fetch"}</button>
            </div>
            {(intakeMobile||intakeRemark)&&<div className="mt-1.5 px-2 py-1.5 rounded-lg bg-lma-brand-soft text-[11px] font-bold text-lma-brand leading-snug">{intakeMobile&&<span className="font-mono">📱 {intakeMobile}</span>}{intakeMobile&&intakeRemark?" · ":""}{intakeRemark}</div>}
            {intakeAlt&&(
              <div className="mt-1.5 px-2.5 py-2 rounded-lg bg-lma-warn/10 border border-lma-warn/30">
                <div className="text-[11px] font-bold text-lma-ink leading-snug">&#9888; Number mismatch &mdash; code issued to <span className="font-mono font-bold">{intakeAlt}</span>, student filled <span className="font-mono font-bold">{phones[0]?.number||"—"}</span>. Check you have the right person.</div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={()=>{ setPhones(p=>p.some(x=>x.number===intakeAlt)?p:[...p,{number:intakeAlt,tag:"ALT"}]); setIntakeAlt(""); }} style={{borderRadius:10}} className="flex-1 h-8 bg-lma-primary text-white font-bold text-[11px]">Add as secondary</button>
                  <button type="button" onClick={()=>setIntakeAlt("")} style={{borderRadius:10}} className="flex-1 h-8 bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold text-[11px]">Keep only theirs</button>
                </div>
              </div>
            )}
            {intakeOk&&<div className="text-[10px] font-bold text-lma-accent mt-1.5">✓ {intakeOk}</div>}
          </div>
          <FieldLabel>Name *</FieldLabel>
          <Inp value={name} onChange={e=>setName(e.target.value.toUpperCase())} placeholder="FULL NAME"/>
          <FieldLabel>Gender *</FieldLabel>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button type="button" onClick={()=>setGender("M")} className={`py-2.5 rounded-[14px] font-bold text-sm border-[1.5px] transition ${gender==="M"?"bg-[#dbe6fb] border-[#93b4f0] text-[#1e3a8a]":"bg-lma-bg border-lma-line text-lma-ink-3"}`}>♂ Male</button>
            <button type="button" onClick={()=>setGender("F")} className={`py-2.5 rounded-[14px] font-bold text-sm border-[1.5px] transition ${gender==="F"?"bg-[#fbdbe8] border-[#f0a6c4] text-[#9d174d]":"bg-lma-bg border-lma-line text-lma-ink-3"}`}>♀ Female</button>
          </div>
          <FieldLabel>Phones</FieldLabel>
          {phones.map((ph,i)=>(
            <div key={i} className="flex gap-2 mb-2">
              <input type="tel" inputMode="numeric" value={ph.number}
                onChange={e=>{const n=[...phones];n[i]={...n[i],number:parsePhone10(e.target.value)};setPhones(n);}}
                onBlur={()=>{const n=[...phones];n[i]={...n[i],number:normalizePhone(n[i].number)};setPhones(n);}}
                placeholder={i===0?"SELF (primary)":`Phone ${i+1}`}
                className="flex-1 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
              <input value={ph.tag} onChange={e=>{const n=[...phones];n[i]={...n[i],tag:e.target.value.toUpperCase()};setPhones(n);}} placeholder="TAG" className="w-20 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand uppercase"/>
              {i>0&&<button type="button" onClick={()=>setPhones(phones.filter((_,j)=>j!==i))} className="px-3 rounded-[14px] bg-lma-bg text-lma-ink-3 font-bold text-lg leading-none">×</button>}
            </div>
          ))}
          <button type="button" onClick={()=>setPhones([...phones,{number:"",tag:""}])} className="text-sm font-bold text-lma-brand mb-3">+ Add phone</button>
          <div className="grid grid-cols-1 gap-0 mt-1">
            <FieldLabel>Address</FieldLabel>
            <Inp value={address} onChange={e=>setAddress(e.target.value.toUpperCase())}/>
            <FieldLabel>Preparing For</FieldLabel>
            <Inp value={preparingFor} onChange={e=>setPreparingFor(e.target.value.toUpperCase())} placeholder="NEET, UPSC…"/>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Aadhaar (last 4)</FieldLabel><Inp value={aadhaar} onChange={e=>setAadhaar(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4}/></div>
              <div><FieldLabel>DOB</FieldLabel><input type="date" value={toIsoInput(dob)} onChange={e=>setDob(e.target.value)} className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>{dob && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(dob)}</span>}</div>
            </div>
          </div>
          <button onClick={handleNewNext} className="w-full mt-3 py-3 rounded-[14px] lma-glass-btn text-white font-bold">Next: Booking →</button>
        </div>
      ):(
        <div>
          <div className="bg-white rounded-[18px] p-4 shadow-sm mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-lma-ink">Find Student / Receipt</h3>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={isCross} onChange={e=>{setIsCross(e.target.checked);setStudentResults([]);setReceiptResults([]);setHasSearched(false);}} className="w-4 h-4 accent-lma-primary"/>
                <span className="text-[11px] font-bold text-lma-ink-2">Cross-library</span>
              </label>
            </div>
            {isCross&&(
              <div className="mb-2">
                <FieldLabel>Student&apos;s home library</FieldLabel>
                <select value={crossOrigin} onChange={e=>{setCrossOrigin(e.target.value);setStudentResults([]);setReceiptResults([]);setHasSearched(false);}} className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand">
                  <option value="">Select origin…</option>
                  {allScopes.map(s=><option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
                <p className="text-[10px] text-lma-ink-3 mt-1">They&apos;ll keep their original ID but sit &amp; pay here.</p>
              </div>
            )}
            <div className="flex gap-2">
              <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doSearch();}} placeholder="Name, phone, F-ID, or R-no…" disabled={isCross&&!crossOrigin} className="flex-1 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand disabled:opacity-50"/>
              <button onClick={doSearch} disabled={searching||(isCross&&!crossOrigin)} className="px-5 py-3 rounded-[14px] bg-lma-primary text-white font-bold text-sm disabled:opacity-50">{searching?"…":"Search"}</button>
            </div>
            <p className="text-[10px] text-lma-ink-3 mt-1.5">Auto-detects type. Tip: R12 = receipt, F45 = student ID, digits = phone.</p>
          </div>

          {searching&&<div className="text-center text-sm text-lma-ink-3 py-3">Searching…</div>}

          {hasSearched&&!searching&&receiptsShown.length>0&&(
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-lma-ink-3 uppercase tracking-wider">🧾 Receipts ({receiptsShown.length})</p>
                {receiptsShown.length>5&&(<div className="flex items-center gap-2 text-[11px] font-bold text-lma-ink-2"><button type="button" onClick={()=>setRcptPage(p=>Math.max(0,p-1))} disabled={rcptPage===0} className="px-2 py-0.5 rounded bg-lma-bg disabled:opacity-40">‹</button><span>{rcptPage+1}/{Math.ceil(receiptsShown.length/5)}</span><button type="button" onClick={()=>setRcptPage(p=>Math.min(Math.ceil(receiptsShown.length/5)-1,p+1))} disabled={rcptPage>=Math.ceil(receiptsShown.length/5)-1} className="px-2 py-0.5 rounded bg-lma-bg disabled:opacity-40">›</button></div>)}
              </div>
              <div className="space-y-2">
                {receiptsShown.slice(rcptPage*5,rcptPage*5+5).map(r=>(
                  <button key={r.receipt_no} onClick={()=>pickRenewalReceipt(r)} className="w-full text-left bg-white rounded-[14px] p-3 shadow-sm hover:shadow-md active:scale-[0.99] flex items-center gap-3 border-l-4 border-lma-primary">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-lma-ink">{r.receipt_no}</span>
                        <span className="text-[10px] font-bold text-lma-brand bg-lma-brand-soft px-1.5 py-0.5 rounded">{r.student_id}</span>
                        <span className="text-[10px] text-lma-ink-3 ml-auto"><CodePill code={r.branch||r.library}/></span>
                      </div>
                      <div className="text-sm font-semibold text-lma-ink truncate">{r.name}</div>
                      <div className="text-[11px] text-lma-ink-3">{fmtDMY(r.booking_from)} → {fmtDMY(r.booking_to)} · {r.shift_name||r.shift}{r.seat_no?` · Seat ${r.seat_no}`:""}</div>
                    </div>
                    <span className="text-lma-ink-3">›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasSearched&&!searching&&studentResults.length>0&&(
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-lma-ink-3 uppercase tracking-wider">👤 Students ({studentResults.length})</p>
                {studentResults.length>5&&(<div className="flex items-center gap-2 text-[11px] font-bold text-lma-ink-2"><button type="button" onClick={()=>setStuPage(p=>Math.max(0,p-1))} disabled={stuPage===0} className="px-2 py-0.5 rounded bg-lma-bg disabled:opacity-40">‹</button><span>{stuPage+1}/{Math.ceil(studentResults.length/5)}</span><button type="button" onClick={()=>setStuPage(p=>Math.min(Math.ceil(studentResults.length/5)-1,p+1))} disabled={stuPage>=Math.ceil(studentResults.length/5)-1} className="px-2 py-0.5 rounded bg-lma-bg disabled:opacity-40">›</button></div>)}
              </div>
              <div className="space-y-2">
                {studentResults.slice(stuPage*5,stuPage*5+5).map(st=>(
                  <button key={`${st.library}-${st.student_id}`} onClick={()=>pickRenewalStudent(st)} className="w-full text-left bg-white rounded-[14px] p-3 shadow-sm hover:shadow-md active:scale-[0.99] flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-lma-ink">{st.student_id}</span>{st.is_past&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded">PAST</span>}<span className="text-[10px] text-lma-ink-3 ml-auto"><CodePill code={st.branch||st.library}/></span></div>
                      <div className="text-sm font-semibold text-lma-ink truncate">{st.name}</div>
                      {st.phones[0]&&<div className="text-[11px] text-lma-ink-3 font-mono">📱 {st.phones[0].number}</div>}
                    </div>
                    <span className="text-lma-ink-3">›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasSearched&&!searching&&studentResults.length===0&&receiptsShown.length===0&&(
            <div className="text-center text-sm text-lma-ink-3 py-3">No matches.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── STEP BOOKING (copied verbatim from admissions; submit unchanged) ──
function StepBooking({ init, resolvedLib, resolvedBranch, ctx, post, showToast, onBack, onDone, draft }:{
  init:any; resolvedLib:string; resolvedBranch:string; ctx:BookingCtx;
  post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void;
  onBack:()=>void; onDone:(r:ResultData)=>void; draft?:{current:any};
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
  // C1: read-only settlement preview (source of truth = PAYMENT_TAGS.settlement_days via init)
  const settleDays=(mode:string)=>Number(((init?.paymentTags)||[]).find((t:any)=>t.tag_name===mode)?.settlement_days||0);
  const settleOn=(mode:string,dmy:string)=>{
    const iso=dmyToIso(dmy); if(!iso) return "";
    const dt=new Date(iso+"T00:00:00"); if(isNaN(dt.getTime())) return "";
    dt.setDate(dt.getDate()+settleDays(mode));
    return fmtDMY(`${dt.getDate()}-${dt.getMonth()+1}-${dt.getFullYear()}`);
  };
  const [feesDue,setFeesDue]=useState("0");
  const [submitting,setSubmitting]=useState(false);
  const [showSeatPicker,setShowSeatPicker]=useState(false);
  const [shiftTime,setShiftTime]=useState("");
  const [remark,setRemark]=useState("");
  const [review,setReview]=useState(false);
  const restoredTime=useRef<string|null>(null);

  const shiftKey=normShiftKey(shift);
  const needsSeat=shift!==""&&shiftKey!=="OTHER";

  const ctxSig=(ctx.student?.student_id||"")+"|"+(ctx.renewFrom?.receipt_no||"");
  useEffect(()=>{
    if(draft?.current && draft.current.sig===ctxSig){
      const d=draft.current;
      setShift(d.shift); setSeat(d.seat); setBookingFrom(d.bookingFrom); setBookingTo(d.bookingTo);
      setToEdited(d.toEdited); setReceiptDate(d.receiptDate); setFee(d.fee); setPays(d.pays);
      setFeesDue(d.feesDue); setRemark(d.remark);
      restoredTime.current=d.shiftTime; setShiftTime(d.shiftTime);
      return;
    }
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

  useEffect(()=>{
    if(!shift) return;
    if(restoredTime.current!==null){ restoredTime.current=null; return; }
    const s=init.shifts.find((x:any)=>normShiftKey(x.shift_key)===shiftKey);
    setShiftTime(s?.shift_time||"");
  },[shift]);   // eslint-disable-line

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

  const setPay=(i:number,field:"mode"|"amount"|"date",val:string)=>{ const n=[...pays]; n[i]={...n[i],[field]:val}; setPays(n); };
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

  const handleSubmit=()=>{
    if(!shift){ showToast("Pick a shift","error"); return; }
    if(!fee){ showToast("Fee required","error"); return; }
    const validPays=pays.filter(p=>p.mode&&p.amount);
    if(validPays.length===0){ showToast("Add at least one payment","error"); return; }
    setReview(true);
  };
  const doSubmit=async()=>{
    const validPays=pays.filter(p=>p.mode&&p.amount);
    setReview(false);
    setSubmitting(true);
    const payload:any={
      library:resolvedLib, branch:resolvedBranch,
      name:ctx.student?.name,
      shift:shiftKey, shift_name:shiftObj?.shift_name||"", shift_time:(shiftTime||shiftObj?.shift_time||""),
      seat_no: needsSeat?seat:"",
      booking_from:bookingFrom, booking_to:bookingTo,
      receipt_date:receiptDate,
      fee:Number(fee),
      pay_modes:validPays.map(p=>({mode:p.mode,amount:Number(p.amount),date:p.date||receiptDate})),
      fees_due:Number(feesDue),
      type:ctx.admitType,
      remark:remark.trim(),
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
      if(ctx.admitType==="NEW"&&ctx.intakeCode){ // B6: one-time code consumed
        await post("intakeMarkUsed",{ code:ctx.intakeCode, receipt_no:res.receipt_no, used_by_library:resolvedBranch||resolvedLib });
      }
      onDone({ receipt_no:res.receipt_no, student_id:res.student_id, receipt_text:res.receipt_text, registration_text:res.registration_text, name:ctx.student?.name||"", library:resolvedBranch||resolvedLib, phones:ctx.student?.phones||[] });
    }
  };

  return (
    <div>
      <button onClick={()=>{ if(draft) draft.current={ sig:ctxSig, shift, seat, bookingFrom, bookingTo, toEdited, receiptDate, fee, pays, feesDue, shiftTime, remark }; onBack(); }} className="text-sm text-lma-ink-3 mb-3">← Back</button>
      <div className="bg-white rounded-[18px] space-y-3">
        <div className="bg-lma-bg rounded-[14px] p-2.5 flex items-center gap-2">
          <span className="text-[10px] font-bold bg-lma-brand-soft text-lma-brand px-2 py-0.5 rounded">{ctx.admitType}</span>
          <span className="text-sm font-bold text-lma-ink">{ctx.student?.student_id||"New"}</span>
          <span className="text-sm text-lma-ink-2 truncate">{ctx.student?.name}</span>
          {ctx.isCross&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded ml-auto">CROSS · {ctx.crossOrigin}</span>}
        </div>

        <div>
          <FieldLabel>Shift *</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {activeShifts.map((s:any)=>(
              <button key={s.shift_key} onClick={()=>{setShift(s.shift_key);setSeat("");}} className={`py-2.5 rounded-[14px] text-sm font-bold border-[1.5px] transition ${normShiftKey(shift)===normShiftKey(s.shift_key)?"bg-lma-brand-soft border-lma-primary text-lma-brand":"bg-lma-bg border-lma-line text-lma-ink-2"}`}>
                {s.shift_name}<div className="text-[9px] font-medium opacity-70">{s.shift_time}</div>
              </button>
            ))}
          </div>
        </div>

        {shift&&<div>
          <FieldLabel>Time window</FieldLabel>
          <Inp value={shiftTime} onChange={e=>setShiftTime(e.target.value)} placeholder="e.g. 7AM to 2PM"/>
        </div>}

        {needsSeat&&(
          <div>
            <FieldLabel>Seat</FieldLabel>
            <button onClick={()=>setShowSeatPicker(true)} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand text-left flex items-center justify-between">
              <span className={seat?"text-lma-ink font-bold":"text-lma-ink-3"}>{seat?`Seat ${seat}`:"Tap to pick a seat"}</span>
              <span className="text-lma-brand text-xs font-bold">{seat?"Change":"Pick →"}</span>
            </button>
            {!seat&&<p className="text-[10px] text-lma-ink-3 mt-1">Leave unset to assign later.</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>From</FieldLabel><input type="date" value={dmyToIso(bookingFrom)} onChange={e=>{setBookingFrom(isoToDmy(e.target.value));}} className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>{bookingFrom && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(bookingFrom)}</span>}</div>
          <div><FieldLabel>To</FieldLabel><input type="date" value={dmyToIso(bookingTo)} onChange={e=>{setBookingTo(isoToDmy(e.target.value));setToEdited(true);}} className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>{bookingTo && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(bookingTo)}</span>}</div>
        </div>

        <div><FieldLabel>Receipt Date</FieldLabel><input type="date" value={dmyToIso(receiptDate)} onChange={e=>setReceiptDate(isoToDmy(e.target.value))} className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>{receiptDate && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(receiptDate)}</span>}</div>

        <div><FieldLabel>Fee (₹)</FieldLabel><Inp type="number" inputMode="numeric" value={fee} onChange={e=>setFee(e.target.value)}/></div>

        <div>
          <FieldLabel>Payment</FieldLabel>
          {pays.map((p,i)=>(
            <div key={i} className="mb-2 rounded-[16px] border border-lma-line bg-lma-surface p-3">
              {pays.length>1&&(
                <div className="mb-2 flex items-center justify-between">
                  <span className="px-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Payment {i+1}</span>
                  <button onClick={()=>removeSplit(i)} className="h-8 rounded-full px-2.5 text-[12.5px] font-semibold text-lma-out active:bg-lma-out-soft">Remove</button>
                </div>
              )}
              <TagChips value={p.mode} onChange={v=>setPay(i,"mode",v)}/>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="w-16 shrink-0 px-0.5 text-[12.5px] font-semibold text-lma-ink-3">Amount</span>
                <input type="number" inputMode="numeric" value={p.amount} onChange={e=>setPay(i,"amount",e.target.value)} placeholder="₹" className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 font-lma-mono text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
              </div>
              {p.mode&&<TagBankNote tag={p.mode}/>}
              {p.mode&&<div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-bold text-lma-ink-3 shrink-0">Paid on</span>
                <input type="date" value={dmyToIso(p.date||receiptDate)} onChange={e=>setPay(i,"date",isoToDmy(e.target.value))} className="flex-1 h-11 px-3 rounded-[12px] border border-lma-line bg-lma-surface text-[14px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
              </div>}
              {p.mode&&settleDays(p.mode)>0&&<div className="text-[10px] font-bold text-lma-accent mt-1 pl-1">💳 settles on {settleOn(p.mode,p.date||receiptDate)} · T+{settleDays(p.mode)}</div>}
            </div>
          ))}
          {pays.length<3&&<button onClick={addSplit} className="text-xs font-bold text-lma-brand">+ Split payment</button>}
        </div>

        <div><FieldLabel>Fees Due (auto)</FieldLabel><Inp type="number" inputMode="numeric" value={feesDue} onChange={e=>setFeesDue(e.target.value)}/>
          {Number(feesDue)>0&&<p className="text-[10px] text-lma-warn font-bold mt-1">Due will be logged as PENDING.</p>}
        </div>

        <div><FieldLabel>Remark (optional)</FieldLabel><Inp value={remark} onChange={e=>setRemark(e.target.value)} placeholder="appears at the bottom of the receipt"/></div>

        {review&&(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center px-6" onClick={()=>setReview(false)}>
            <div className="absolute inset-0 bg-[rgb(15_23_42/0.45)]"/>
            <div className="relative w-full max-w-xs bg-white rounded-[18px] p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
              <h4 className="text-sm font-bold text-lma-ink mb-1">{ctx.admitType==="RENEWAL"?"Confirm renewal":"Confirm booking"}</h4>
              <p className="text-[12px] text-lma-ink-3 mb-3">Check the details before creating the receipt.</p>
              <div className="bg-lma-bg rounded-[14px] p-3 space-y-1 text-[12px] text-lma-ink-2">
                <div className="font-bold text-sm text-lma-ink">{ctx.student?.name||ctx.renewFrom?.name||""}</div>
                <div className="text-[11px] text-lma-ink-3">{ctx.student?.student_id||""}{ctx.student?.gender?` · ${ctx.student.gender}`:""}{ctx.student?.phones?.[0]?.number?` · ${ctx.student.phones[0].number}`:""}</div>
                <div><span className="font-bold">Plan:</span> {shiftObj?.shift_name||shift}{shiftTime?` (${shiftTime})`:""}</div>
                {needsSeat&&<div><span className="font-bold">Seat:</span> {seat||"—"}</div>}
                <div><span className="font-bold">Period:</span> {fmtDMY(bookingFrom)} → {fmtDMY(bookingTo)}</div>
                <div><span className="font-bold">Receipt date:</span> {fmtDMY(receiptDate)}</div>
                <div><span className="font-bold">Fee:</span> ₹{fee}{Number(feesDue)>0?` · Due ₹${feesDue}`:""}</div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={()=>setReview(false)} className="flex-1 py-2.5 rounded-[14px] bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold text-sm">← Edit</button>
                <button disabled={submitting} onClick={doSubmit} className="flex-1 py-2.5 rounded-[14px] lma-glass-btn text-white font-bold text-sm disabled:opacity-50">Confirm ✓</button>
              </div>
            </div>
          </div>
        )}
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-lma-line bg-[rgb(245_246_250/0.94)] px-4 pt-3 backdrop-blur" style={{ paddingBottom:"calc(env(safe-area-inset-bottom) + 12px)", marginBottom:"calc(-1 * (env(safe-area-inset-bottom) + 16px))" }}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-semibold text-lma-ink-3">Fee</div>
              <div className="font-lma-mono text-[18px] font-semibold leading-tight text-lma-ink">₹{Number(fee)||0}</div>
              {Number(feesDue)>0&&<div className="text-[11.5px] font-semibold text-lma-warn-2">₹{feesDue} due after this</div>}
            </div>
            <button onClick={handleSubmit} disabled={submitting} className="lma-glass-btn h-12 shrink-0 rounded-[14px] px-6 text-[15px] font-bold text-white disabled:opacity-60">
              {submitting?"Creating…":(ctx.admitType==="RENEWAL"?"Renew":"Create receipt")}
            </button>
          </div>
        </div>
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
      <div className="relative w-full max-w-md bg-white rounded-t-[24px] p-4 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-3"/>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-lma-ink">Pick a seat · {shift}</h3>
          <button onClick={()=>onPick("")} className="text-xs font-bold text-lma-brand">Assign later</button>
        </div>
        {loading?(
          <div className="text-center text-sm text-lma-ink-3 py-8">Loading layout…</div>
        ):!data||data.sections.length===0?(
          <div className="text-center text-sm text-lma-ink-3 py-8">No layout found for this library.</div>
        ):(
          <div className="space-y-4">
            {data.sections.sort((a,b)=>a.section_order-b.section_order).map(sec=>(
              <div key={sec.section_name}>
                <div className="text-[11px] font-bold text-lma-ink-3 mb-1.5">{sec.section_name}</div>
                <div className="overflow-x-auto">
                  <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${sec.cols}, minmax(30px, 1fr))`}}>
                    {Array.from({length:sec.rows*sec.cols}).map((_,idx)=>{
                      const r=Math.floor(idx/sec.cols)+1, c=(idx%sec.cols)+1;
                      const cell=sec.seats.find(s=>s.row_in_section===r&&s.col_in_section===c);
                      if(!cell) return <div key={idx} className="aspect-square"/>;
                      if(cell.cell_type==="DEAD"||cell.state==="DEAD") return <div key={idx} className="aspect-square rounded bg-lma-ink-3"/>;
                      const isCurrent=current===cell.display_label;
                      if(cell.state==="VACANT"){
                        return <button key={idx} onClick={()=>onPick(cell.display_label)} title={cell.share_note||""} className={`aspect-square rounded text-[11px] font-bold border ${isCurrent?"bg-lma-primary text-white border-lma-primary":"bg-lma-accent/15 text-lma-accent border-lma-accent/40 hover:bg-lma-accent/30"} flex items-center justify-center`}>{cell.display_label}</button>;
                      }
                      if(cell.state==="BLOCKED"){
                        return <div key={idx} className="aspect-square rounded bg-lma-danger/20 border border-lma-danger/40 flex items-center justify-center text-[10px] text-lma-danger" title="Blocked">{cell.display_label}</div>;
                      }
                      return <div key={idx} className="aspect-square rounded bg-lma-slate-200 border border-lma-line flex flex-col items-center justify-center text-[10px] text-lma-ink-3" title={cell.occupant?`${cell.occupant.name} (${cell.occupant.shift})`:"taken"}>{cell.display_label}<span className="text-[7px] leading-none truncate w-full text-center px-0.5">{cell.occupant?.student_id||""}</span></div>;
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

function FieldLabel({ children }:{ children:React.ReactNode }){ return <label className="mb-1.5 mt-3 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{children}</label>; }
function Inp(props:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none placeholder:text-lma-ink-3 focus:border-lma-brand"/>; }