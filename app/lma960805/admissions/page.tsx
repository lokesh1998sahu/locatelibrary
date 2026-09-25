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
    <Suspense fallback={<div className="lma-page-body max-w-md mx-auto px-4 pt-4 text-center text-sm text-lma-ink-3 py-8">Loading…</div>}>
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
    <div className="mx-auto w-full max-w-[560px] px-4 pb-10">
      <header className="flex items-center gap-1 pb-4 pt-[calc(env(safe-area-inset-top)+10px)]">
        <Link href="/lma960805/board" aria-label="Back to the seat chart" className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-lma-ink-2 active:bg-lma-line/50">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-lma-ink">Direct admission</h1>
          <p className="text-[12.5px] text-lma-ink-3">Pick a library to start a new admission</p>
        </div>
      </header>

      {!init?(
        <div className="space-y-2">{[0,1,2].map(i=><div key={i} className="lma-skeleton h-16 rounded-[18px]"/>)}</div>
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
      <p className="mb-3 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Which library or branch?</p>
      <div className="space-y-2">
        {init.libraries.filter(l=>l.active).map(lib=>(
          <div key={lib.library_code}>
            <button onClick={()=>!lib.has_branches&&onPick(lib.library_code)} disabled={lib.has_branches}
              className={`lma-noscale flex w-full items-center gap-3 rounded-[18px] border border-lma-line bg-lma-surface p-3.5 text-left shadow-lma-card ${lib.has_branches?"cursor-default":"active:bg-lma-bg"}`}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-[18px]" style={lib.color?{background:lib.color+"22",color:lib.color}:{background:"#e2e8f0"}}>{lib.emoji}</div>
              <div className="flex-1"><div className="text-[15.5px] font-semibold text-lma-ink">{lib.library_code}</div><div className="text-[12.5px] text-lma-ink-3">{lib.display_name}</div></div>
              {!lib.has_branches&&<span className="text-lma-ink-3 text-lg">›</span>}
              {lib.has_branches&&<span className="text-[10px] font-bold text-lma-ink-3">pick branch →</span>}
            </button>
            {lib.has_branches&&(
              <div className="grid grid-cols-2 gap-2 mt-2 pl-4">
                {init.branches.filter(b=>b.library_code===lib.library_code&&b.active).map(br=>(
                  <button key={br.branch_code} onClick={()=>onPick(br.branch_code)} className="lma-noscale flex min-h-[56px] items-center gap-2.5 rounded-[14px] border border-lma-line bg-lma-surface p-3 text-left active:bg-lma-bg">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[15px]" style={(br.color||lib.color)?{background:(br.color||lib.color)+"22",color:(br.color||lib.color)}:{background:"#e2e8f0"}}>{br.emoji||lib.emoji}</div>
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold text-lma-ink">{br.branch_code}</div>
                      <div className="truncate text-[12px] text-lma-ink-3">{br.branch_display}</div>
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