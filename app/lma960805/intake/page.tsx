"use client";
// B6 — ENQUIRY CODE (owner surface, front of LMA beside Admissions / Seat Chart).
// Generate one-time codes per library/branch, share link + code as TWO separate
// WhatsApp messages, track ISSUED → SUBMITTED → USED (side exit VOID).
// Consumed by BookingFlow NEW admission.
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useLMA } from "../_components/LMAProvider";
import { parsePhone10 } from "../_lib/phone";

const API = "/api/lma960805";
const PUBLIC_PATH = "/jn-x7k2q";
const FILTERS = ["ALL","ISSUED","SUBMITTED","USED"] as const;
type Filt = typeof FILTERS[number];

export default function EnquiryCodePage(){
  const { init, post, showToast } = useLMA();
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [scope,setScope]=useState("");
  const [fresh,setFresh]=useState<{pretty:string;scope:string;remark:string;mobile:string}|null>(null);
  const [filter,setFilter]=useState<Filt>("ALL");
  const [busy,setBusy]=useState(false);
  const [confirmVoid,setConfirmVoid]=useState<any>(null);
  const [mobile,setMobile]=useState("");   // required — normalised by the shared parser
  const [remark,setRemark]=useState("");
  const [confirmGen,setConfirmGen]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch(`${API}?action=intakeList`).then(x=>x.json());
      if(r&&r.ok) setItems(r.items||[]);
      else showToast((r&&r.error)||"Could not load codes","error");
    }catch{ showToast("Network error","error"); }
    setLoading(false);
  },[showToast]);
  useEffect(()=>{ load(); },[load]);

  const scopes = useMemo(()=>{
    const out:{value:string;label:string;library:string;branch:string}[]=[];
    ((init?.libraries)||[]).filter((l:any)=>l.active).forEach((l:any)=>{
      if(l.has_branches) ((init?.branches)||[]).filter((b:any)=>b.active&&b.library_code===l.library_code).forEach((b:any)=>out.push({value:b.branch_code,label:b.branch_code,library:l.library_code,branch:b.branch_code}));
      else out.push({value:l.library_code,label:l.library_code,library:l.library_code,branch:""});
    });
    return out;
  },[init]);

  const counts=useMemo(()=>({
    ALL:items.length,
    ISSUED:items.filter(i=>i.status==="ISSUED").length,
    SUBMITTED:items.filter(i=>i.status==="SUBMITTED").length,
    USED:items.filter(i=>i.status==="USED").length,
  }),[items]);

  // Link and code go as TWO messages: the student taps the link in one and
  // long-press-copies the bare code from the other — nothing to select by hand.
  const linkUrl=()=>(typeof window!=="undefined"?window.location.origin:"")+PUBLIC_PATH;
  const wa=(t:string,to?:string)=>window.open(to?`https://wa.me/91${to}?text=${encodeURIComponent(t)}`:`https://wa.me/?text=${encodeURIComponent(t)}`,"_blank");
  const cp=(t:string,l:string)=>{ navigator.clipboard.writeText(t); showToast(`${l} copied`); };

  const generate=async()=>{
    const s=scopes.find(x=>x.value===scope);
    if(!s){ showToast("Pick a library/branch first","error"); return; }
    if(!mobOk){ showToast("Enter a valid 10-digit mobile number","error"); return; }
    setConfirmGen(false); setBusy(true);
    const r=await post("intakeGenerateCode",{ library:s.library, branch:s.branch, mobile, remark:remark.trim() });
    setBusy(false);
    if(r&&r.ok){ setFresh({pretty:r.pretty,scope:s.label,remark:remark.trim(),mobile}); setMobile(""); setRemark(""); showToast("Code generated"); load(); } // scope stays selected — next code is one tap
  };
  const doVoid=async(it:any)=>{
    setConfirmVoid(null);
    const r=await post("intakeVoid",{ code:it.code });
    if(r&&r.ok){ showToast(`${it.code} voided`); load(); }
  };

  const mobOk=/^[6-9]\d{9}$/.test(mobile);
  const shown=items.filter(i=>filter==="ALL"||i.status===filter);
  const meta=(s:string)=>s==="SUBMITTED"?{chip:"bg-lma-accent text-white",bar:"bg-lma-accent",hint:"Ready — enter this code in a NEW admission"}
    :s==="ISSUED"?{chip:"bg-lma-slate-200 text-lma-slate-700",bar:"bg-lma-slate-300",hint:"Waiting for the student to fill the form"}
    :s==="USED"?{chip:"bg-lma-primary/10 text-lma-primary",bar:"bg-lma-primary",hint:""}
    :{chip:"bg-lma-danger/10 text-lma-danger",bar:"bg-lma-danger",hint:""};

  // Share block: two numbered green sends (they teach the order), copy demoted
  // to text links, Void tucked on the same row so it never floats alone.
  // Colour = action type: green sends, blue copies, red void. Columns stay
  // aligned (link | code) so the grid reads down as well as across.
  const Share=({ code, mob, onVoid }:{ code:string; mob?:string; onVoid?:()=>void })=>(
    <>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={()=>wa(linkUrl(),mob)} style={{borderRadius:12}} className="h-10 bg-lma-accent text-white font-bold text-[12px] active:scale-[0.98]">Send link</button>
        <button onClick={()=>wa(code,mob)} style={{borderRadius:12}} className="h-10 bg-lma-accent text-white font-bold text-[12px] active:scale-[0.98]">Send code</button>
        <button onClick={()=>cp(linkUrl(),"Link")} style={{borderRadius:12}} className="h-10 bg-lma-primary/10 text-lma-primary font-bold text-[12px] active:scale-[0.98]">Copy link</button>
        <button onClick={()=>cp(code,"Code")} style={{borderRadius:12}} className="h-10 bg-lma-primary/10 text-lma-primary font-bold text-[12px] active:scale-[0.98]">Copy code</button>
      </div>
      {onVoid&&<button onClick={onVoid} style={{borderRadius:12}} className="w-full h-9 mt-2 bg-lma-danger/10 text-lma-danger font-bold text-[12px] active:scale-[0.98]">Void code</button>}
    </>
  );

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      {/* HEADER */}
      <header className="flex items-center gap-3 mb-4">
        <Link href="/lma960805" className="text-xl leading-none text-lma-slate-600">←</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900 leading-none">Enquiry Codes</h1>
          <p className="text-[11px] font-semibold text-lma-slate-500 mt-1">
            {counts.SUBMITTED>0
              ? <span className="text-lma-accent">{counts.SUBMITTED} ready to admit</span>
              : "Share a code · student fills details · you admit"}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="w-9 h-9 shrink-0 rounded-xl bg-white shadow-sm text-lma-slate-500 font-bold disabled:opacity-50">{loading?"·":"↻"}</button>
      </header>

      {/* GENERATE */}
      <div className="bg-white rounded-2xl p-3.5 shadow-sm mb-3">
        <div className="text-[10px] font-extrabold text-lma-slate-400 tracking-wider mb-2">NEW CODE FOR</div>
        <div className="flex gap-1.5 flex-wrap mb-2.5">
          {scopes.map(s=>(
            <button key={s.value} onClick={()=>{setScope(s.value);setFresh(null);}} style={{borderRadius:10}}
              className={`px-3.5 h-9 text-[12px] font-extrabold ${scope===s.value?"bg-lma-primary text-white shadow-sm":"bg-lma-slate-100 text-lma-slate-600"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <input value={mobile} onChange={e=>setMobile(parsePhone10(e.target.value))} inputMode="numeric"
          placeholder="Student mobile number (required)"
          style={{borderRadius:10}} className={`w-full h-10 px-3 mb-2 border-[1.5px] text-[13px] font-semibold text-lma-slate-800 placeholder:text-lma-slate-400 placeholder:font-medium ${mobile&&!mobOk?"border-lma-danger bg-lma-danger/5":"border-lma-slate-200 bg-lma-slate-50"}`}/>
        {mobile&&!mobOk&&<div className="text-[10px] font-bold text-lma-danger mb-2 -mt-1">Needs 10 digits starting 6&ndash;9. Paste any format &mdash; +91, 0091, spaces or dashes all work.</div>}
        <input value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Remark — who is this code for? (optional)"
          style={{borderRadius:10}} className="w-full h-10 px-3 mb-2.5 border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-[13px] font-medium text-lma-slate-800 placeholder:text-lma-slate-400"/>
        <button onClick={()=>setConfirmGen(true)} disabled={!scope||!mobOk||busy}
          style={{borderRadius:12, height:54}}
          className={`w-full font-extrabold text-[15px] ${(!scope||!mobOk||busy)?"bg-lma-slate-100 text-lma-slate-400":"bg-lma-primary text-white shadow-md"}`}>
          {busy?"Generating…":!scope?"Pick a library above":!mobOk?"Enter the student's mobile number":`Generate code for ${scope}`}
        </button>
        {fresh&&(
          <div className="mt-3 pt-3 border-t border-lma-slate-100">
            <div className="flex items-baseline justify-center gap-2 mb-2">
              <span className="text-[22px] font-extrabold font-mono tracking-[0.08em] text-lma-slate-900 select-all">{fresh.pretty}</span>
              <span className="text-[10px] font-extrabold text-lma-slate-400">{fresh.scope}</span>
            </div>
            <div className="text-[11px] font-bold text-lma-slate-600 text-center mb-2">📱 {fresh.mobile}{fresh.remark?` · ${fresh.remark}`:""}</div>
            <Share code={fresh.pretty} mob={fresh.mobile}/>
          </div>
        )}
      </div>

      {/* FILTERS — segmented control; count sits beside the label, lighter weight */}
      <div className="flex bg-white rounded-xl shadow-sm p-1 mb-3">
        {FILTERS.map(f=>{
          const on=filter===f;
          return (
            <button key={f} onClick={()=>setFilter(f)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[10px] font-extrabold tracking-wide ${on?"bg-lma-slate-900 text-white":"text-lma-slate-500"}`}>
              <span>{f}</span>
              <span className={`font-bold ${on?"text-white/55":"text-lma-slate-300"}`}>{counts[f]}</span>
            </button>
          );
        })}
      </div>

      {/* LIST */}
      {shown.length===0
        ? <div className="bg-white rounded-2xl p-7 text-center shadow-sm">
            <div className="text-3xl mb-2">🎟️</div>
            <div className="text-[13px] font-bold text-lma-slate-700 mb-1">{loading?"Loading…":filter==="ALL"?"No codes yet":`Nothing in ${filter}`}</div>
            {!loading&&filter==="ALL"&&<p className="text-[12px] text-lma-slate-500 leading-snug">Pick a library above and tap Generate.</p>}
          </div>
        : <div className="space-y-2 pb-10">
            {shown.map(it=>{ const m=meta(it.status); const live=it.status==="ISSUED"||it.status==="SUBMITTED"; return (
              <div key={it.code} className="bg-white rounded-2xl shadow-sm overflow-hidden flex">
                <div className={`w-1 shrink-0 ${m.bar}`}/>
                <div className="flex-1 min-w-0 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-extrabold font-mono tracking-wide text-lma-slate-900 select-all">{it.code}</span>
                    <span className={`text-[9px] font-extrabold tracking-wide px-1.5 py-0.5 rounded ${m.chip}`}>{it.status}</span>
                    <span className="ml-auto text-[11px] font-bold text-lma-slate-500 shrink-0">{it.branch||it.library}</span>
                  </div>
                  {(it.mobile||it.remark)&&<div className="text-[12px] font-bold text-lma-slate-800 mt-1.5 leading-snug">
                    {it.mobile&&<span className="font-mono">📱 {it.mobile}</span>}{it.mobile&&it.remark?" · ":""}{it.remark}
                  </div>}
                  {m.hint&&<div className="text-[11px] text-lma-slate-500 mt-1 leading-snug">{m.hint}</div>}
                  <div className="text-[10px] text-lma-slate-400 mt-1">
                    Issued {it.issued_on}
                    {it.used_receipt?<> · <span className="font-bold text-lma-slate-600">{it.used_receipt}</span></>:null}
                    {it.used_by_library&&it.used_by_library!==(it.branch||it.library)?<> · used at {it.used_by_library}</>:null}
                  </div>
                  {live&&<div className="mt-3"><Share code={it.code} mob={it.mobile} onVoid={()=>setConfirmVoid(it)}/></div>}
                </div>
              </div>
            ); })}
          </div>}

      {/* GENERATE CONFIRM */}
      {confirmGen&&(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" onClick={()=>setConfirmGen(false)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
            <h4 className="text-sm font-extrabold text-lma-slate-900 mb-2">Generate a new enquiry code?</h4>
            <div className="bg-lma-slate-50 rounded-xl p-3 mb-3 space-y-1">
              <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-lma-slate-400 w-12">FOR</span><span className="text-[13px] font-extrabold text-lma-slate-900">{scope}</span></div>
              <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-lma-slate-400 w-12">MOBILE</span><span className="text-[13px] font-extrabold text-lma-slate-900 font-mono">{mobile}</span></div>
              <div className="flex items-start gap-2"><span className="text-[10px] font-bold text-lma-slate-400 w-12 shrink-0 pt-0.5">REMARK</span><span className={`text-[13px] font-semibold ${remark.trim()?"text-lma-slate-800":"text-lma-slate-400"}`}>{remark.trim()||"none"}</span></div>
            </div>
            <p className="text-[11px] text-lma-slate-500 mb-4 leading-snug">The code works once. Share it with one student only.</p>
            <div className="flex gap-2">
              <button onClick={()=>setConfirmGen(false)} style={{borderRadius:12}} className="flex-1 py-2.5 bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Cancel</button>
              <button onClick={generate} disabled={busy} style={{borderRadius:12}} className="flex-1 py-2.5 bg-lma-primary text-white font-bold text-sm disabled:opacity-50">{busy?"…":"Generate"}</button>
            </div>
          </div>
        </div>
      )}

      {/* VOID CONFIRM */}
      {confirmVoid&&(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" onClick={()=>setConfirmVoid(null)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
            <h4 className="text-sm font-extrabold text-lma-slate-900 mb-1.5">Void code {confirmVoid.code}?</h4>
            <p className="text-[12px] text-lma-slate-600 mb-4 leading-snug">
              It stops working immediately and can&rsquo;t be reused or un-voided.
              {confirmVoid.status==="SUBMITTED"?" The student has already submitted their details — they'd have to fill the form again with a new code.":""}
            </p>
            <div className="flex gap-2">
              <button onClick={()=>setConfirmVoid(null)} className="flex-1 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Keep</button>
              <button onClick={()=>doVoid(confirmVoid)} className="flex-1 py-2.5 rounded-xl bg-lma-danger text-white font-bold text-sm">Void</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}