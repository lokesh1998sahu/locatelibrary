"use client";

// Admissions = pick a library (Step 1), then hand off to the shared
// BookingFlow modal (New/Renewal → student → booking → done).
// Deep links are mapped straight to BookingFlow:
//   ?renew_from=R123&lib=X          → renewal
//   ?lib=X[&seat=12&shift=MORNING]  → new admission (optionally on a seat)

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLMA, type LMAInitData as InitData } from "../_components/LMAProvider";
import BookingFlow from "../_components/BookingFlow";

export default function AdmissionsPage(){
  return (
    <Suspense fallback={<div className="lma-page-body max-w-md mx-auto px-4 pt-4 text-center text-sm text-lma-slate-500 py-8">Loading…</div>}>
      <AdmissionsPageInner/>
    </Suspense>
  );
}

type Flow = { mode:"add"|"renew"; libCode:string; renewReceiptNo?:string; seat?:string; shift?:string };

function AdmissionsPageInner(){
  const searchParams=useSearchParams();
  const { init, showToast } = useLMA();
  const [flow,setFlow]=useState<Flow|null>(null);
  const [preloadHandled,setPreloadHandled]=useState(false);

  // honor deep links → open BookingFlow directly
  useEffect(()=>{
    if(!init||preloadHandled) return;
    const lib=searchParams.get("lib")||"";
    const rno=searchParams.get("renew_from")||"";
    const seatP=searchParams.get("seat")||"";
    const shiftP=(searchParams.get("shift")||"").toUpperCase();
    if(lib){
      const known = init.branches.find(b=>b.branch_code===lib) || init.libraries.find(l=>l.library_code===lib);
      if(!known){ showToast(`Unknown library: ${lib}`,"error"); }
      else if(rno){ setFlow({ mode:"renew", libCode:lib, renewReceiptNo:rno, seat:seatP, shift:shiftP }); }
      else { setFlow({ mode:"add", libCode:lib, seat:seatP, shift:shiftP }); }
    }
    setPreloadHandled(true);
  },[init,searchParams,preloadHandled,showToast]);

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-4">
        <Link href="/lma960805" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Admissions</h1>
          <p className="text-[11px] text-lma-slate-500 font-medium">Pick a library to start a new admission or renewal</p>
        </div>
      </header>

      {!init?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):(
        <StepLibrary init={init} onPick={c=>setFlow({ mode:"add", libCode:c })}/>
      )}

      {flow && (
        flow.mode==="renew"
          ? <BookingFlow renewReceiptNo={flow.renewReceiptNo} libCode={flow.libCode} presetSeat={flow.seat} presetShift={flow.shift} onClose={()=>setFlow(null)} onComplete={()=>showToast("Receipt created")}/>
          : <BookingFlow addMode libCode={flow.libCode} presetSeat={flow.seat} presetShift={flow.shift} onClose={()=>setFlow(null)} onComplete={()=>showToast("Receipt created")}/>
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
                  <button key={br.branch_code} onClick={()=>onPick(br.branch_code)} className="bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.98] text-left flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={(br.color||lib.color)?{background:(br.color||lib.color)+"22",color:(br.color||lib.color)}:{background:"#e2e8f0"}}>{br.emoji||lib.emoji}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-lma-slate-900">{br.branch_code}</div>
                      <div className="text-[10px] text-lma-slate-500 truncate">{br.branch_display}</div>
                    </div>
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