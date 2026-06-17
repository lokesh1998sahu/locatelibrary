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

import { useState, useEffect } from "react";
import { useLMA } from "./LMAProvider";
import { fmtDMY, toIsoInput } from "../_lib/dates";
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>

        {loading ? (
          <div className="py-10 text-center text-sm text-lma-slate-500">Loading…</div>
        ) : !student ? (
          <div className="py-10 text-center">
            <p className="text-sm text-lma-slate-500 mb-4">Student not found.</p>
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Close</button>
          </div>
        ) : mode === "view" ? (
          <>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-extrabold text-lma-slate-900">{student.student_id}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${student.is_past?"bg-lma-warn/10 text-lma-warn":"bg-lma-accent/10 text-lma-accent"}`}>{student.is_past?"PAST":"ON APP"}</span>
                </div>
                <p className="text-base font-bold text-lma-slate-800 truncate">{student.name}</p>
                <p className="text-xs text-lma-slate-500"><CodePill code={student.branch||student.library}/></p>
              </div>
              <button onClick={onClose} className="text-lma-slate-400 text-2xl leading-none -mt-1">×</button>
            </div>

            <div className="space-y-2 bg-lma-slate-50 rounded-xl p-3">
              {(student.phones||[]).filter(p=>p.number).length>0 ? (
                <div>
                  <p className="text-[10px] font-bold text-lma-slate-400 uppercase tracking-wider mb-1">Phones</p>
                  {(student.phones||[]).filter(p=>p.number).map((p,i)=>(
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-mono font-semibold text-lma-slate-800">📱 {p.number}</span>
                      {p.tag && <span className="text-[10px] font-bold text-lma-slate-500 bg-white px-1.5 py-0.5 rounded">{p.tag}</span>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-lma-slate-400">No phone on record</p>}

              {genderLabel(student.gender)!=="—" && <Row label="Gender">{genderLabel(student.gender)}</Row>}
              {student.preparing_for && <Row label="Preparing For">{student.preparing_for}</Row>}
              {student.address && <Row label="Address">{student.address}</Row>}
              {student.aadhaar_last4 && <Row label="Aadhaar">•••• {student.aadhaar_last4}</Row>}
              {student.date_of_birth && <Row label="DOB">{fmtDMY(student.date_of_birth)}</Row>}
              {student.added_on && <Row label="Added">{fmtDMY(student.added_on)}</Row>}
            </div>

            <div className={`grid gap-2 mt-4 ${onDelete?"grid-cols-3":"grid-cols-2"}`}>
              <button onClick={()=>{ navigator.clipboard.writeText(`${student.name} ${student.branch||student.library} ${student.student_id}`); showToast("Contact copied"); }} className="py-2.5 rounded-xl bg-lma-warn/10 text-lma-warn font-bold text-xs">📇 Copy</button>
              {onDelete && <button onClick={onDelete} className="py-2.5 rounded-xl bg-lma-danger/10 text-lma-danger font-bold text-xs">🗑 Delete</button>}
              <button onClick={startEdit} className="py-2.5 rounded-xl bg-lma-primary text-white font-bold text-sm">✏️ Edit</button>
            </div>
            <button onClick={()=>setShowHistory(true)} className="w-full mt-2 py-2.5 rounded-xl bg-lma-accent/10 text-lma-accent font-bold text-sm">📋 Booking History</button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-extrabold text-lma-slate-900">Edit {student.student_id}</h3>
              <button onClick={()=>setMode("view")} className="text-lma-slate-400 text-2xl leading-none">×</button>
            </div>

            {/* Library is locked (cannot move a student between libraries here) */}
            <FieldLabel>Library</FieldLabel>
            <div className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-100 text-sm font-semibold text-lma-slate-500 mb-3"><CodePill code={f.library}/></div>

            {hasBranches && (
              <>
                <FieldLabel>Branch *</FieldLabel>
                <select value={f.branch} onChange={e=>setF({...f, branch:e.target.value})} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium mb-3">
                  <option value="">Select branch…</option>
                  {branchOpts.map(b=><option key={b.branch_code} value={b.branch_code}>{b.branch_code} — {b.branch_display}</option>)}
                </select>
              </>
            )}

            <FieldLabel>Name *</FieldLabel>
            <input value={f.name} onChange={e=>setF({...f, name:e.target.value.toUpperCase()})} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium mb-3"/>

            <FieldLabel>Gender</FieldLabel>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button type="button" onClick={()=>setF({...f, gender:"M"})} className={`py-2.5 rounded-xl font-bold text-sm border-[1.5px] transition ${f.gender==="M"?"bg-[#dbe6fb] border-[#93b4f0] text-[#1e3a8a]":"bg-lma-slate-50 border-lma-slate-200 text-lma-slate-500"}`}>♂ Male</button>
              <button type="button" onClick={()=>setF({...f, gender:"F"})} className={`py-2.5 rounded-xl font-bold text-sm border-[1.5px] transition ${f.gender==="F"?"bg-[#fbdbe8] border-[#f0a6c4] text-[#9d174d]":"bg-lma-slate-50 border-lma-slate-200 text-lma-slate-500"}`}>♀ Female</button>
            </div>

            <FieldLabel>Phones</FieldLabel>
            <div className="space-y-2 mb-2">
              {f.phones.map((ph:PhoneEntry,i:number)=>(
                <div key={i} className="flex gap-2">
                  <input type="tel" inputMode="numeric" value={ph.number}
                    onChange={e=>{ const n=[...f.phones]; n[i]={...n[i],number:parsePhone10(e.target.value)}; setF({...f,phones:n}); }}
                    placeholder={i===0?"SELF (primary)":`Phone ${i+1}`}
                    className="flex-1 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
                  <input value={ph.tag}
                    onChange={e=>{ const n=[...f.phones]; n[i]={...n[i],tag:e.target.value.toUpperCase()}; setF({...f,phones:n}); }}
                    placeholder="TAG" className="w-20 px-2 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium uppercase"/>
                  {i>0 && <button type="button" onClick={()=>setF({...f, phones:f.phones.filter((_:any,j:number)=>j!==i)})} className="px-3 rounded-xl bg-lma-slate-100 text-lma-slate-500 font-extrabold text-lg leading-none">×</button>}
                </div>
              ))}
            </div>
            {f.phones.length<4 && <button type="button" onClick={()=>setF({...f, phones:[...f.phones,{number:"",tag:""}]})} className="text-sm font-bold text-lma-primary mb-3">+ Add phone</button>}

            <FieldLabel>Address</FieldLabel>
            <input value={f.address} onChange={e=>setF({...f, address:e.target.value.toUpperCase()})} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium mb-3"/>

            <FieldLabel>Preparing For</FieldLabel>
            <input value={f.preparing_for} onChange={e=>setF({...f, preparing_for:e.target.value.toUpperCase()})} placeholder="NEET, JEE, UPSC…" className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium mb-3"/>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Aadhaar (last 4)</FieldLabel>
                <input value={f.aadhaar_last4} onChange={e=>setF({...f, aadhaar_last4:e.target.value.replace(/\D/g,"").slice(0,4)})} placeholder="1234" maxLength={4} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
              </div>
              <div>
                <FieldLabel>Date of Birth</FieldLabel>
                <input type="date" value={toIsoInput(f.date_of_birth)} onChange={e=>setF({...f, date_of_birth:e.target.value})} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>{f.date_of_birth && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(f.date_of_birth)}</span>}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-lma-slate-500">
              <span className={`text-[10px] font-bold px-2 py-1 rounded ${student.is_past?"bg-lma-warn/10 text-lma-warn":"bg-lma-accent/10 text-lma-accent"}`}>{student.is_past?"PAST STUDENT":"ON APP"}</span>
              <span>Library &amp; this flag are locked.</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={()=>setMode("view")} disabled={saving} className="py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold disabled:opacity-50">Cancel</button>
              <button onClick={save} disabled={saving} className="py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50">{saving?"Saving…":"Save"}</button>
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
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-[10px] font-bold text-lma-slate-400 uppercase tracking-wider w-24 shrink-0">{label}</span>
      <span className="font-semibold text-lma-slate-800">{children}</span>
    </div>
  );
}

function FieldLabel({ children }:{ children:React.ReactNode }){
  return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wider mb-1">{children}</label>;
}