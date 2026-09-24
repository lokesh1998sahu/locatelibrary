"use client";

// ── Universal Student View/Edit modal ────────────────────────────
// Open from ANY page with just a student_id (+ optional library to
// disambiguate cross-library). Fetches its own data, shows details,
// lets you edit in place, saves, and returns — the host page never
// navigates away. On save it calls onSaved(updatedStudent) so the
// host can refresh its own list.
//
//   const [stuId,setStuId] = useState<string|null>(null);
//   ...onClick={()=>setStuId(s.student_id)} (+ optionally pass library)
//   {stuId && <StudentModal studentId={stuId} library={lib}
//                onClose={()=>setStuId(null)} onSaved={reload}/>}

import ContactCopyButton from "./ContactCopyButton";
import WhatsAppButton from "./WhatsAppButton";
import { useState, useEffect } from "react";
import { useLMA } from "./LMAProvider";
import { fmtDMY, fmtDMYT, toIsoInput } from "../_lib/dates";
import { parsePhone10 } from "../_lib/phone";
import { genderLabel } from "../_lib/genderTheme";
import CodePill from "./CodePill";
import dynamic from "next/dynamic";

const API = "/api/lma960805";
const BookingHistory = dynamic(()=>import("./BookingHistory"), { ssr:false });

interface PhoneEntry { number:string; tag:string; }
interface Student {
  s_no?:number; student_id:string; library:string; branch:string; name:string;
  phones:PhoneEntry[]; added_on:string; address:string; preparing_for:string;
  aadhaar_last4:string; date_of_birth:string; gender?:string; is_past:boolean;
}

export default function StudentModal({ studentId, library, crossOrigin, onClose, onSaved, onDelete }:{
  studentId:string; library?:string; crossOrigin?:string; onClose:()=>void; onSaved?:(s:Student)=>void; onDelete?:()=>void;
}) {
  const { init, post, showToast } = useLMA();
  const [student,setStudent] = useState<Student|null>(null);
  const [loading,setLoading] = useState(true);
  const [mode,setMode]       = useState<"view"|"edit">("view");
  const [saving,setSaving]   = useState(false);
  const [f,setF]             = useState<any>(null);
  const [showHistory,setShowHistory] = useState(false);

  // fetch on open / id change
  useEffect(()=>{ let alive=true; (async()=>{
    setLoading(true); setMode("view");
    try{
      const qs = new URLSearchParams({ action:"getStudentById", student_id:studentId });
      const homeLib = (crossOrigin && crossOrigin.trim().toUpperCase()!=="NO") ? crossOrigin : library;
      if(homeLib) qs.set("library", homeLib);
      const r = await fetch(`${API}?${qs}`).then(x=>x.json());
      if(alive) setStudent(r?.student || null);
    }catch{ if(alive) showToast("Couldn't load student","error"); }
    if(alive) setLoading(false);
  })(); return ()=>{ alive=false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  },[studentId,library,crossOrigin]);

  const selLib      = init?.libraries.find(l=>l.library_code===(f?.library));
  const hasBranches = selLib?.has_branches || false;
  const branchOpts  = (init?.branches || []).filter(b=>b.library_code===(f?.library) && b.active);

  const startEdit=()=>{
    if(!student) return;
    setF({
      student_id: student.student_id,
      library: student.library,
      branch: student.branch || "",
      name: student.name || "",
      phones: (student.phones && student.phones.length)
        ? student.phones.map(p=>({number:p.number||"",tag:p.tag||""}))
        : [{ number:"", tag:"SELF" }],
      address: student.address || "",
      preparing_for: student.preparing_for || "",
      aadhaar_last4: student.aadhaar_last4 || "",
      date_of_birth: student.date_of_birth || "",
      gender: student.gender || "",
    });
    setMode("edit");
  };

  const save=async()=>{
    if(!f.name.trim()){ showToast("Name is required","error"); return; }
    const lib   = init?.libraries.find(l=>l.library_code===f.library);
    const hb    = lib?.has_branches || false;
    const payload = {
      student_id: f.student_id,
      library: f.library,
      branch: hb ? f.branch : "",
      has_branches: hb,
      name: f.name.trim(),
      phones: f.phones.filter((p:PhoneEntry)=>p.number.trim()),
      address: f.address,
      preparing_for: f.preparing_for,
      aadhaar_last4: f.aadhaar_last4,
      date_of_birth: f.date_of_birth,
      gender: f.gender,
    };
    setSaving(true);
    const r = await post("updateStudent", payload);
    setSaving(false);
    const ok = r && (r.updated || r.ok === true);
    if(ok){
      const updated:Student = { ...(student as Student), ...payload, phones: payload.phones };
      setStudent(updated); setMode("view"); showToast("Saved");
      onSaved && onSaved(updated);
    } else {
      showToast((r && r.error) || "Save failed","error");
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
      <div role="dialog" aria-modal="true" aria-label="Student" className="lma-sheet-up relative w-full max-w-[560px] max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lma-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-lma-float" onClick={e=>e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#dfe1ee]"/>

        {loading ? (
          <div className="py-10 text-center text-sm text-lma-ink-3">Loading…</div>
        ) : !student ? (
          <div className="py-10 text-center">
            <p className="text-sm text-lma-ink-3 mb-4">Student not found.</p>
            <button onClick={onClose} className="px-5 py-2.5 rounded-[14px] bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold text-sm">Close</button>
          </div>
        ) : mode === "view" ? (
          <>
            {(()=>{ const xl=(crossOrigin&&crossOrigin.trim().toUpperCase()!=="NO")?crossOrigin.trim().toUpperCase():""; return (
            <div className="mb-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[20px] font-bold leading-snug tracking-[-0.01em] text-lma-ink">{student.name}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-md px-1.5 py-0.5 font-lma-mono text-[13px] font-semibold ring-1 ring-inset ${xl?"bg-[#f5f0ff] text-[#7c3aed] ring-[#e4d9fb]":"bg-lma-surface text-lma-ink ring-lma-line"}`}>{student.student_id}{xl?`-${xl}`:""}</span>
                  <CodePill code={student.branch||student.library}/>
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${student.is_past?"bg-lma-warn-soft text-lma-warn-2":"bg-lma-in-soft text-lma-in"}`}>{student.is_past?"Past student":"On app"}</span>
                </div>
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>); })()}

            <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Contact</div>
            <div className="divide-y divide-lma-line overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface">
              {(student.phones||[]).filter(p=>p.number).length>0 ? (student.phones||[]).filter(p=>p.number).map((p,i)=>{
                const d=String(p.number).replace(/\D/g,""); const tel=d.length===10?`+91${d}`:d;
                return (
                  <div key={i} className="flex min-h-[56px] items-center gap-2 px-3.5 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-lma-mono text-[15px] font-semibold text-lma-ink">{p.number}</div>
                      {p.tag&&<div className="text-[11px] font-bold uppercase tracking-wide text-lma-ink-3">{p.tag}</div>}
                    </div>
                    <a href={`tel:${tel}`} aria-label={`Call ${p.number}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lma-brand-soft text-lma-brand ring-1 ring-inset ring-[#dcdffb]">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z"/></svg>
                    </a>
                    <WhatsAppButton phones={[p]} chat label="WhatsApp" className="h-10 rounded-full bg-[#e3f6ec] px-3 text-[12.5px] font-semibold text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8] disabled:opacity-40"/>
                  </div>
                );
              }) : <p className="px-3.5 py-3 text-[13px] text-lma-ink-3">No phone on record</p>}
            </div>

            {(genderLabel(student.gender)!=="—"||student.preparing_for||student.address||student.aadhaar_last4||student.date_of_birth||student.added_on)&&(
              <>
                <div className="mb-1.5 mt-4 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Details</div>
                <div className="divide-y divide-lma-line overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface">
                  {genderLabel(student.gender)!=="—" && <Row label="Gender">{genderLabel(student.gender)}</Row>}
                  {student.preparing_for && <Row label="Preparing for">{student.preparing_for}</Row>}
                  {student.address && <Row label="Address">{student.address}</Row>}
                  {student.aadhaar_last4 && <Row label="Aadhaar">•••• {student.aadhaar_last4}</Row>}
                  {student.date_of_birth && <Row label="Date of birth">{fmtDMY(student.date_of_birth)}</Row>}
                  {student.added_on && <Row label="Added">{fmtDMYT(student.added_on)}</Row>}
                </div>
              </>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={()=>setShowHistory(true)} className="h-12 rounded-[14px] bg-lma-surface text-[14px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Booking history</button>
              <button onClick={startEdit} className="lma-glass-btn h-12 rounded-[14px] text-[15px] font-bold text-white">Edit</button>
            </div>
            <div className="mt-2"><ContactCopyButton name={student.name} library={student.branch||student.library} studentId={student.student_id} phones={student.phones} onCopied={showToast} label="Copy contact" wrapperClassName="relative w-full" className="h-12 w-full rounded-[14px] bg-lma-surface text-[14px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line"/></div>
            {onDelete&&(
              <div className="mt-6 border-t border-lma-line pt-4">
                <button onClick={onDelete} className="h-11 w-full rounded-[14px] text-[14px] font-semibold text-lma-out active:bg-lma-out-soft">Delete this student</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[18px] font-bold tracking-[-0.01em] text-lma-ink">Edit {student.student_id}</h3>
              <button type="button" aria-label="Close" onClick={()=>setMode("view")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>

            {/* Library is locked (cannot move a student between libraries here) */}
            <FieldLabel>Library</FieldLabel>
            <div className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-semibold text-lma-ink outline-none focus:border-lma-brand text-lma-ink-3 mb-3"><CodePill code={f.library}/></div>

            {hasBranches && (
              <>
                <FieldLabel>Branch *</FieldLabel>
                <select value={f.branch} onChange={e=>setF({...f, branch:e.target.value})} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand mb-3">
                  <option value="">Select branch…</option>
                  {branchOpts.map(b=><option key={b.branch_code} value={b.branch_code}>{b.branch_code} — {b.branch_display}</option>)}
                </select>
              </>
            )}

            <FieldLabel>Name *</FieldLabel>
            <input value={f.name} onChange={e=>setF({...f, name:e.target.value.toUpperCase()})} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand mb-3"/>

            <FieldLabel>Gender</FieldLabel>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button type="button" onClick={()=>setF({...f, gender:"M"})} className={`py-2.5 rounded-[14px] font-bold text-sm border-[1.5px] transition ${f.gender==="M"?"bg-[#dbe6fb] border-[#93b4f0] text-[#1e3a8a]":"bg-lma-bg border-lma-line text-lma-ink-3"}`}>♂ Male</button>
              <button type="button" onClick={()=>setF({...f, gender:"F"})} className={`py-2.5 rounded-[14px] font-bold text-sm border-[1.5px] transition ${f.gender==="F"?"bg-[#fbdbe8] border-[#f0a6c4] text-[#9d174d]":"bg-lma-bg border-lma-line text-lma-ink-3"}`}>♀ Female</button>
            </div>

            <FieldLabel>Phones</FieldLabel>
            <div className="space-y-2 mb-2">
              {f.phones.map((ph:PhoneEntry,i:number)=>(
                <div key={i} className="flex gap-2">
                  <input type="tel" inputMode="numeric" value={ph.number}
                    onChange={e=>{ const n=[...f.phones]; n[i]={...n[i],number:parsePhone10(e.target.value)}; setF({...f,phones:n}); }}
                    placeholder={i===0?"SELF (primary)":`Phone ${i+1}`}
                    className="flex-1 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
                  <input value={ph.tag}
                    onChange={e=>{ const n=[...f.phones]; n[i]={...n[i],tag:e.target.value.toUpperCase()}; setF({...f,phones:n}); }}
                    placeholder="TAG" className="w-20 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand uppercase"/>
                  {i>0 && <button type="button" onClick={()=>setF({...f, phones:f.phones.filter((_:any,j:number)=>j!==i)})} className="px-3 rounded-[14px] bg-lma-bg text-lma-ink-3 font-bold text-lg leading-none">×</button>}
                </div>
              ))}
            </div>
            {f.phones.length<4 && <button type="button" onClick={()=>setF({...f, phones:[...f.phones,{number:"",tag:""}]})} className="text-sm font-bold text-lma-brand mb-3">+ Add phone</button>}

            <FieldLabel>Address</FieldLabel>
            <input value={f.address} onChange={e=>setF({...f, address:e.target.value.toUpperCase()})} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand mb-3"/>

            <FieldLabel>Preparing For</FieldLabel>
            <input value={f.preparing_for} onChange={e=>setF({...f, preparing_for:e.target.value.toUpperCase()})} placeholder="NEET, JEE, UPSC…" className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand mb-3"/>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Aadhaar (last 4)</FieldLabel>
                <input value={f.aadhaar_last4} onChange={e=>setF({...f, aadhaar_last4:e.target.value.replace(/\D/g,"").slice(0,4)})} placeholder="1234" maxLength={4} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
              </div>
              <div>
                <FieldLabel>Date of Birth</FieldLabel>
                <input type="date" value={toIsoInput(f.date_of_birth)} onChange={e=>setF({...f, date_of_birth:e.target.value})} className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>{f.date_of_birth && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(f.date_of_birth)}</span>}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-lma-ink-3">
              <span className={`text-[10px] font-bold px-2 py-1 rounded ${student.is_past?"bg-lma-warn/10 text-lma-warn":"bg-lma-accent/10 text-lma-accent"}`}>{student.is_past?"PAST STUDENT":"ON APP"}</span>
              <span>Library &amp; this flag are locked.</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={()=>setMode("view")} disabled={saving} className="py-3 rounded-[14px] bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold disabled:opacity-50">Cancel</button>
              <button onClick={save} disabled={saving} className="py-3 rounded-[14px] lma-glass-btn text-white font-bold disabled:opacity-50">{saving?"Saving…":"Save"}</button>
            </div>
          </>
        )}
      </div>
    </div>
    {showHistory && student && <BookingHistory studentId={student.student_id} homeLib={(student.branch||student.library)} studentName={student.name} onClose={()=>setShowHistory(false)}/>}
    </>
  );
}

function Row({ label, children }:{ label:string; children:React.ReactNode }){
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-3.5 py-2.5">
      <span className="w-28 shrink-0 text-[12.5px] text-lma-ink-3">{label}</span>
      <span className="min-w-0 flex-1 text-right text-[14px] font-semibold text-lma-ink">{children}</span>
    </div>
  );
}

function FieldLabel({ children }:{ children:React.ReactNode }){
  return <label className="mb-1.5 mt-3 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{children}</label>;
}