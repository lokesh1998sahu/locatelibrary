"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLMA, useScopeChips } from "./_components/LMAProvider";
import { buildVacancyText, type VacPlan } from "./_lib/vacancy";

const API = "/api/lma960805";

type Card = { href:string; label:string; emoji:string; desc:string; badgeKey?:"renewals"|"dues" };
const CARDS: Card[] = [
  { href:"/lma960805/admissions",  label:"Admissions",  emoji:"📝", desc:"New & renewal receipts" },
  { href:"/lma960805/board",       label:"Seat Chart",  emoji:"🪑", desc:"Live seat map" },
  { href:"/lma960805/intake",      label:"Enquiry Codes",emoji:"🎟️", desc:"Student self-fill details" },
  { href:"/lma960805/renewals",    label:"Renewals",    emoji:"🔁", desc:"expiring & cancellations", badgeKey:"renewals" },
  { href:"/lma960805/students",    label:"Students",    emoji:"👥", desc:"Browse & edit" },
  { href:"/lma960805/dues",        label:"Dues",        emoji:"💰", desc:"Pending & written-off", badgeKey:"dues" },
  { href:"/lma960805/misc-income", label:"Misc Income", emoji:"💵", desc:"Day-pass, locker, xerox" },
  { href:"/lma960805/refunds",     label:"Refunds",     emoji:"↩️", desc:"Issue & track" },
  { href:"/lma960805/receipts",    label:"Receipts",    emoji:"🧾", desc:"Full log & edits" },
  { href:"/lma960805/dashboard",   label:"Dashboard",   emoji:"📊", desc:"Collection & analytics" },
  { href:"/lma960805/settings",    label:"Settings",    emoji:"⚙️", desc:"Libraries, fees, layouts" },
];

function greeting(){ const h=new Date().getHours(); if(h<12)return "Good morning"; if(h<17)return "Good afternoon"; return "Good evening"; }
const fmtINR=(n:number)=>"₹"+Math.round(n).toLocaleString("en-IN");
const todayDmy=()=>{ const d=new Date(); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; };

export default function LmaHomePage() {
  const { init, lock } = useLMA();
  const [connected, setConnected] = useState<boolean|null>(null);
  const [scope,setScope]=useState("");

  // live numbers (null = loading)
  const [today,setToday]=useState<{net:number;receipts:number;dues:number}|null>(null);
  const [badges,setBadges]=useState<{renewals:number;dues:number}>({renewals:0,dues:0});
  const [statsLoading,setStatsLoading]=useState(false);

  // Mark connected once init lands (or stay loading if still null)
  useEffect(()=>{ if(init) setConnected(true); },[init]);

  // live stats — non-blocking; refetch on scope change
  const loadStats=useCallback(async()=>{
    setStatsLoading(true);
    const sp=(extra:Record<string,string>)=>{ const p=new URLSearchParams(extra); if(scope)p.set("library",scope); return p.toString(); };
    try{
      const [dash,ren,dues]=await Promise.all([
        fetch(`${API}?${sp({action:"getDashboard",from:todayDmy(),to:todayDmy()})}`).then(r=>r.json()).catch(()=>null),
        fetch(`${API}?${sp({action:"getRenewalsQueue"})}`).then(r=>r.json()).catch(()=>null),
        fetch(`${API}?${sp({action:"getPendingDues"})}`).then(r=>r.json()).catch(()=>null),
      ]);
      if(dash&&dash.ok) setToday({ net:dash.headline.net, receipts:dash.counts.receipts, dues:dash.headline.outstanding_dues });
      else setToday({net:0,receipts:0,dues:0});
      const expiredCount=(ren?.expired?.length||0);
      setBadges({ renewals:expiredCount, dues:(dues?.pending?.length||dues?.total||0) });
    }catch{ setToday({net:0,receipts:0,dues:0}); setConnected(false); }
    setStatsLoading(false);
  },[scope]);
  useEffect(()=>{ loadStats(); },[loadStats]);

  const dotCls = connected===null ? "bg-lma-warn animate-pulse" : connected ? "bg-lma-accent" : "bg-lma-danger";
  const dotTxt = connected===null ? "Checking…" : connected ? "Connected" : "Offline";

  const chips = useScopeChips();

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-6 pb-10">
      {/* Hero */}
      <header className="mb-4 lma-slide-up">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-lma-slate-500">{greeting()}</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-lma-slate-500"><span className={`w-2 h-2 rounded-full ${dotCls}`}></span>{dotTxt}</span>
            <button onClick={lock} title="Lock" className="text-[13px] text-lma-slate-400 hover:text-lma-slate-700 active:scale-90 transition">🔒</button>
          </div>
        </div>
        <h1 className="text-[34px] leading-none font-extrabold tracking-tight text-lma-slate-900 mt-1">LMA</h1>
      </header>

      {/* library chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"}`}>{c.emoji} {c.label}</button>
        ))}
      </div>

      {/* TODAY cockpit */}
      <div className="bg-gradient-to-br from-lma-primary to-lma-primary-2 rounded-2xl p-4 text-white shadow-md mb-3 lma-slide-up">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">Today {scope?`· ${scope}`:""}</span>
          {statsLoading&&<span className="text-[10px] opacity-70">updating…</span>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <CockpitCell label="Collected" value={today?fmtINR(today.net):"…"}/>
          <CockpitCell label="Receipts" value={today?String(today.receipts):"…"}/>
          <CockpitCell label="Dues (live)" value={today?fmtINR(today.dues):"…"}/>
        </div>
      </div>

      <VacantSeatsCard scope={scope}/>

      {/* Launcher grid */}
      <section className="lma-slide-up">
        <div className="grid grid-cols-2 gap-2.5">
          {CARDS.map((c,i)=>{
            const badge = c.badgeKey ? badges[c.badgeKey] : 0;
            return (
              <Link key={c.href} href={c.href} className="group relative bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition active:scale-[0.97] overflow-hidden lma-slide-up" style={{animationDelay:`${i*30}ms`}}>
                <div className="absolute -right-3 -top-3 text-5xl opacity-[0.06] group-hover:opacity-10 transition select-none">{c.emoji}</div>
                {badge>0&&<div className="absolute top-2.5 right-2.5 min-w-[20px] h-5 px-1.5 rounded-full bg-lma-danger text-white text-[11px] font-extrabold flex items-center justify-center shadow-sm">{badge}</div>}
                <div className="text-2xl mb-2">{c.emoji}</div>
                <div className="text-[15px] font-extrabold text-lma-slate-900 leading-tight">{c.label}</div>
                <div className="text-[11px] text-lma-slate-500 leading-tight mt-0.5">{c.desc}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="text-center text-[10px] text-lma-slate-300 mt-5 font-medium">Locate Library</footer>
    </div>
  );
}

function CockpitCell({label,value}:{label:string;value:string}){
  return (
    <div className="bg-white/12 rounded-xl px-2.5 py-2 backdrop-blur-sm">
      <div className="text-[9px] font-bold uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-[15px] font-extrabold mt-0.5 leading-none truncate">{value}</div>
    </div>
  );
}

// ── B1: VACANT SEATS — same shared vacancy computer as the seat chart ──
// Uses the page's own library/branch chips as the selector. Nothing is
// pre-selected: you tap the plans you actually want in the list.
function VacantSeatsCard({ scope }:{ scope:string }){
  const { init, showToast }=useLMA();
  const ORDER:VacPlan[]=["MORNING","EVENING","FULL DAY"];
  const [sel,setSel]=useState<VacPlan[]>([]);
  const [side,setSide]=useState(false);
  const [busy,setBusy]=useState(false);
  const [text,setText]=useState("");
  const toggle=(p:VacPlan)=>{ setText(""); setSel(c=>c.includes(p)?c.filter(x=>x!==p):[...c,p]); };
  const plans=ORDER.filter(p=>sel.includes(p));
  const any=plans.length>0||side;
  const go=async()=>{
    if(!scope){ showToast("Pick a library/branch chip above first","error"); return; }
    if(!any){ showToast("Tap a time plan first","error"); return; }
    const b=((init?.branches)||[]).find((x:any)=>x.branch_code===scope);
    const lib=b?b.library_code:scope, br=b?scope:"";
    const libName=((init?.libraries)||[]).find((l:any)=>l.library_code===lib)?.display_name||"";
    const libLabel=libName?`${libName} (${scope})`:scope;
    setBusy(true); setText("");
    try{
      const p=new URLSearchParams({action:"getBoardOccupancy",library_code:lib});
      if(br) p.set("branch_code",br);
      const r=await fetch(`${API}?${p}`).then(x=>x.json());
      if(r&&r.ok){ const d=new Date(); setText(buildVacancyText(libLabel,`${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`,r,plans,side)); }
      else showToast((r&&r.error)||"Could not load board","error");
    }catch{ showToast("Network error","error"); }
    setBusy(false);
  };
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm mb-3 lma-slide-up">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-extrabold text-lma-slate-900">🪑 Vacant seats</h3>
        <span className="text-[10px] font-bold text-lma-slate-400">{scope||"pick a chip above"}</span>
      </div>
      <div className="flex gap-1.5 mb-2 flex-wrap">
        {ORDER.map(p=>(
          <button key={p} onClick={()=>toggle(p)} style={{borderRadius:10}}
            className={`px-3 h-9 text-[11px] font-extrabold ${sel.includes(p)?"bg-lma-primary text-white":"bg-lma-slate-100 text-lma-slate-600"}`}>{p}</button>
        ))}
        <button onClick={()=>{setText("");setSide(v=>!v);}} style={{borderRadius:10}}
          className={`px-3 h-9 text-[11px] font-extrabold ${side?"bg-lma-primary text-white":"bg-lma-slate-100 text-lma-slate-600"}`}>SIDE PANEL</button>
        <button onClick={go} disabled={busy||!any} style={{borderRadius:10}}
          className="ml-auto px-4 h-9 text-[11px] font-extrabold bg-lma-slate-900 text-white disabled:opacity-40">{busy?"…":"Get list"}</button>
      </div>
      {text&&(
        <>
          <pre className="text-[11px] font-medium text-lma-slate-800 bg-lma-slate-50 rounded-xl p-3 mb-2 whitespace-pre-wrap break-words">{text}</pre>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>{ navigator.clipboard.writeText(text); showToast("Copied"); }} style={{borderRadius:10}} className="h-9 bg-lma-primary/10 text-lma-primary font-bold text-[11px]">Copy</button>
            <button onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank")} style={{borderRadius:10}} className="h-9 bg-lma-accent text-white font-bold text-[11px]">WhatsApp</button>
          </div>
        </>
      )}
    </div>
  );
}