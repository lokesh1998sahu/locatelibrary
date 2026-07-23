"use client";
// B6 — public self-service admission intake (outside the app lock, noindex).
// Step 1: code check · Step 2: details form · Step 3: done.
import { useState } from "react";

const API = "/api/lma960805";

export default function IntakeForm(){
  const [step,setStep]=useState<"CODE"|"FORM"|"DONE">("CODE");
  const [code,setCode]=useState("");
  const [libLabel,setLibLabel]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [f,setF]=useState({ name:"", gender:"", whatsapp_no:"", date_of_birth:"", address:"", preparing_for:"" });
  const set=(k:keyof typeof f,v:string)=>setF(s=>({...s,[k]:v}));
  const [doneCode,setDoneCode]=useState("");

  const checkCode=async()=>{
    setErr(""); setBusy(true);
    try{
      const r=await fetch(`${API}?action=intakeCheck&code=${encodeURIComponent(code)}`).then(x=>x.json());
      if(r&&r.ok){ setLibLabel(r.library||""); setStep("FORM"); }
      else setErr((r&&r.error)||"Get your code from your library.");
    }catch{ setErr("Network problem — please try again."); }
    setBusy(false);
  };

  const submit=async()=>{
    setErr(""); setBusy(true);
    try{
      const r=await fetch(API,{ method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"intakeSubmit", payload:{ code, ...f } }) }).then(x=>x.json());
      if(r&&r.ok){ setDoneCode(r.code||code); setStep("DONE"); }
      else setErr((r&&r.error)||"Could not submit — please try again.");
    }catch{ setErr("Network problem — please try again."); }
    setBusy(false);
  };

  const inp="w-full px-3.5 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-sm font-medium focus:outline-none focus:border-lma-primary";
  const lbl="block text-[11px] font-extrabold text-lma-slate-500 mb-1 mt-3";

  return (
    <div className="min-h-screen bg-lma-slate-50 flex items-start justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-5">
        <h1 className="text-lg font-extrabold text-lma-slate-900">📚 Library Admission</h1>
        <p className="text-[12px] text-lma-slate-500 mb-3">{step==="FORM"?`Filling details for ${libLabel}`:"Fill your details before visiting the desk."}</p>

        {err&&<div className="text-[12px] font-bold text-lma-danger bg-lma-danger/10 rounded-lg p-2.5 mb-3">{err}</div>}

        {step==="CODE"&&(<>
          <label className={lbl}>YOUR CODE</label>
          <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX" autoCapitalize="characters" autoComplete="off" className={inp+" font-mono tracking-widest text-center"}/>
          <button onClick={checkCode} disabled={busy||!code.trim()} className="w-full mt-4 py-3 rounded-xl bg-lma-primary text-white font-bold text-sm disabled:opacity-50">{busy?"…":"Continue"}</button>
          <p className="text-[11px] text-lma-slate-400 mt-3 text-center">Don&rsquo;t have a code? Get your code from your library.</p>
        </>)}

        {step==="FORM"&&(<>
          <label className={lbl}>FULL NAME</label>
          <input value={f.name} onChange={e=>set("name",e.target.value)} className={inp} autoComplete="name"/>
          <label className={lbl}>GENDER</label>
          <div className="flex gap-2">
            {(["M","F"] as const).map(g=>(
              <button key={g} type="button" onClick={()=>set("gender",g)} className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-[1.5px] ${f.gender===g?"bg-lma-primary text-white border-lma-primary":"bg-white text-lma-slate-600 border-lma-slate-200"}`}>{g==="M"?"Male":"Female"}</button>
            ))}
          </div>
          <label className={lbl}>WHATSAPP NUMBER</label>
          <input value={f.whatsapp_no} onChange={e=>set("whatsapp_no",e.target.value.replace(/[^\d]/g,"").slice(0,10))} inputMode="numeric" placeholder="10-digit number" className={inp}/>
          <label className={lbl}>DATE OF BIRTH</label>
          <input type="date" value={f.date_of_birth} onChange={e=>set("date_of_birth",e.target.value)} max={new Date().toISOString().slice(0,10)} className={inp}/>
          <label className={lbl}>CURRENT ADDRESS</label>
          <textarea value={f.address} onChange={e=>set("address",e.target.value)} rows={2} className={inp}/>
          <label className={lbl}>WHAT ARE YOU STUDYING / PREPARING FOR?</label>
          <input value={f.preparing_for} onChange={e=>set("preparing_for",e.target.value)} placeholder="e.g. NEET, RAS, B.Com" className={inp}/>
          <button onClick={submit} disabled={busy||!f.name.trim()||!f.gender||f.whatsapp_no.length!==10||!f.date_of_birth||!f.address.trim()||!f.preparing_for.trim()} className="w-full mt-4 py-3 rounded-xl bg-lma-primary text-white font-bold text-sm disabled:opacity-50">{busy?"…":"Submit details"}</button>
        </>)}

        {step==="DONE"&&(
          <div className="text-center py-4">
            <div className="text-4xl mb-2">✅</div>
            <div className="text-sm font-extrabold text-lma-slate-900 mb-1">Details received!</div>
            <p className="text-[12px] text-lma-slate-500">Show this code at the desk to complete your admission:</p>
            <div className="mt-3 text-xl font-extrabold font-mono tracking-widest text-lma-primary">{doneCode}</div>
          </div>
        )}
      </div>
    </div>
  );
}