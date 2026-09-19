"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useScopeChips } from "../_components/LMAProvider";
import OccupancyCard from "../_components/OccupancyCard";
import PeriodPicker from "../_components/PeriodPicker";
import { periodOf, isPreset, dmyOf, isoOf, localFromIso, ledgerHref, type Period, type LedgerDim, type LedgerSrc } from "../_lib/period";

const API = "/api/lma960805";

// ── Types matching getDashboard() (11_Dashboard.gs) ──
interface BreakRow { key:string; gross:number; refund:number; net:number; }
interface DailyPt  { date:string; gross:number; refund:number; net:number; }
interface Dash {
  ok:boolean;
  range:{ from:string; to:string; from_ymd:number; to_ymd:number };
  scope:string;
  headline:{ net:number; gross_in:number; refund_out:number; outstanding_dues:number; active_students:number };
  counts:{ receipts:number; dues_payments:number; misc_entries:number; refunds:number };
  by_source:{ RECEIPTS:number; DUES:number; MISC:number; REFUNDS:number };
  by_library:BreakRow[]; by_fees_mode:BreakRow[]; by_tag:BreakRow[];
  daily:DailyPt[];
}

// ── display helpers (local) ──
const _MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDMY=(iso:string)=>{const p=String(iso).slice(0,10).split("-");return p.length===3?`${+p[2]}-${_MON[+p[1]-1]}-${p[0]}`:iso;};
const fmtDM=(iso:string)=>{const p=String(iso).slice(0,10).split("-");return p.length===3?`${+p[2]}-${_MON[+p[1]-1]}`:iso;};
const fmtINR=(n:number)=>"₹"+Math.round(n).toLocaleString("en-IN");
const fmtShort=(n:number)=>{ const a=Math.abs(n); if(a>=100000)return (n/100000).toFixed(a>=1000000?0:1)+"L"; if(a>=1000)return (n/1000).toFixed(a>=10000?0:1)+"k"; return String(Math.round(n)); };

// ── Back-from-Ledger restore: the Dashboard remembers its chip + period only
//    when you leave it for the Ledger, and picks them up once on return. ──
const RETURN_KEY="lma.dashboard.return";
type Saved={ scope:string; preset:string; from:string; to:string };
function readSaved():Saved|null{
  if(typeof window==="undefined") return null;
  try{ const s=window.sessionStorage.getItem(RETURN_KEY); return s?JSON.parse(s) as Saved:null; }catch{ return null; }
}
function periodFromSaved(s:Saved|null):Period|null{
  if(!s) return null;
  if(isPreset(s.preset)) return periodOf(s.preset);
  const f=localFromIso(s.from), t=localFromIso(s.to);
  return f&&t?{preset:"custom",from:f,to:t}:null;
}

export default function DashboardPage(){
  const router=useRouter();
  const [saved]=useState<Saved|null>(()=>readSaved());
  const [scope,setScope]=useState(saved?.scope ?? "");
  const [period,setPeriod]=useState<Period>(()=>periodFromSaved(saved) ?? periodOf("today"));
  const [data,setData]=useState<Dash|null>(null);
  const [loading,setLoading]=useState(false);
  const [occKey,setOccKey]=useState(1);   // live seat state: loads with the page, refreshes on ↻

  // the saved state is used once
  useEffect(()=>{ try{ window.sessionStorage.removeItem(RETURN_KEY); }catch{ /* storage blocked: nothing to clear */ } },[]);

  const load=useCallback(async()=>{
    setLoading(true);
    const p=new URLSearchParams({ action:"getDashboard", from:dmyOf(period.from), to:dmyOf(period.to) });
    if(scope) p.set("library",scope);
    try{
      const r:Dash=await fetch(`${API}?${p}`).then(r=>r.json());
      setData(r&&r.ok?r:null);
    }catch{ setData(null); }
    setLoading(false);
  },[period,scope]);

  useEffect(()=>{ load(); },[load]);

  const chips = useScopeChips();

  // Open the Ledger for any figure, with this page's period + chip
  const openLedger=(o:{dim?:LedgerDim;key?:string;src?:LedgerSrc;period?:Period})=>{
    const dim=o.dim||"all";
    try{ window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ scope, preset:period.preset, from:isoOf(period.from), to:isoOf(period.to) })); }catch{ /* storage blocked: Back just shows Today */ }
    router.push(ledgerHref({ dim, key:o.key, src:o.src, period:o.period||period, lib:dim==="library"?"":scope }));
  };
  const openDay=(iso:string)=>{ const d=localFromIso(iso); if(d) openLedger({ period:{preset:"custom",from:d,to:d} }); };

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4 pb-10">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma960805" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Dashboard</h1>
          <p className="text-[11px] text-lma-slate-500 font-medium">{data?`${data.range.from} → ${data.range.to}`:"…"} · {scope||"All"}</p>
        </div>
        <button onClick={()=>{load();setOccKey(k=>k+1);}} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {/* library/branch chips */}
      <div className="flex gap-1.5 mb-2 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.emoji} {c.label}</button>
        ))}
      </div>

      {/* period pills + custom range (shared with the Ledger) */}
      <PeriodPicker value={period} onChange={setPeriod}/>

      <OccupancyCard scope={scope} reloadKey={occKey}/>

      {!data&&loading&&<div className="text-center text-sm text-lma-slate-500 py-12">Loading…</div>}
      {!data&&!loading&&<div className="text-center text-sm text-lma-slate-500 py-12">No data for this range.</div>}

      {data&&(
        <div className={loading?"opacity-50 pointer-events-none transition":"transition"}>
          {/* HERO: Net → every entry */}
          <button onClick={()=>openLedger({})} className="w-full text-left bg-gradient-to-br from-lma-primary to-lma-primary-2 rounded-2xl p-4 text-white shadow-md mb-2 lma-slide-up active:scale-[0.99] transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">Net Collection</span>
              <span className="text-[11px] font-bold opacity-80">All entries ›</span>
            </div>
            <div className="text-3xl font-extrabold mt-0.5">{fmtINR(data.headline.net)}</div>
            <div className="text-[11px] opacity-80 mt-1">Gross {fmtINR(data.headline.gross_in)} · Refunds {fmtINR(data.headline.refund_out)}</div>
          </button>

          {/* supporting cards */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Stat label="Gross In" value={fmtINR(data.headline.gross_in)} tone="accent" onClick={()=>openLedger({})}/>
            <Stat label="Refunds Out" value={fmtINR(data.headline.refund_out)} tone="danger" onClick={()=>openLedger({src:"REFUNDS"})}/>
            <Stat label="Outstanding Dues" value={fmtINR(data.headline.outstanding_dues)} tone="warn" sub="live"/>
            <Stat label="Active Students" value={String(data.headline.active_students)} tone="slate" sub="live"/>
          </div>

          {/* counts strip → that type's entries */}
          <div className="flex gap-1.5 mb-3 text-[10px] font-bold text-lma-slate-500">
            <button onClick={()=>openLedger({src:"RECEIPTS"})} className="flex-1 bg-white rounded-lg py-1.5 text-center shadow-sm active:scale-[0.97] transition">{data.counts.receipts} receipts</button>
            <button onClick={()=>openLedger({src:"DUES"})} className="flex-1 bg-white rounded-lg py-1.5 text-center shadow-sm active:scale-[0.97] transition">{data.counts.dues_payments} dues</button>
            <button onClick={()=>openLedger({src:"MISC"})} className="flex-1 bg-white rounded-lg py-1.5 text-center shadow-sm active:scale-[0.97] transition">{data.counts.misc_entries} misc</button>
            <button onClick={()=>openLedger({src:"REFUNDS"})} className="flex-1 bg-white rounded-lg py-1.5 text-center shadow-sm active:scale-[0.97] transition">{data.counts.refunds} refunds</button>
          </div>

          {/* DAILY CHART — tap a bar for that day's entries */}
          <Card title="Daily Collection" subtitle="net per day · tap a bar for that day" action={{label:"All entries ›",onClick:()=>openLedger({})}}>
            <DailyChart daily={data.daily} onDay={openDay}/>
          </Card>

          {/* BY LIBRARY chart + table */}
          {data.by_library.length>0&&(
            <Card title="By Library / Branch" subtitle="net comparison · tap for entries">
              <BarList rows={data.by_library} chips={chips} onRow={k=>openLedger({dim:"library",key:k})}/>
            </Card>
          )}

          {/* BY FEES MODE (bank reconciliation) */}
          {data.by_fees_mode.length>0&&(
            <Card title="By Bank / Fees Mode" subtitle="reconcile against passbooks · tap for entries">
              <BreakTable rows={data.by_fees_mode} onRow={k=>openLedger({dim:"bank",key:k})}/>
            </Card>
          )}

          {/* BY PAYMENT TAG */}
          {data.by_tag.length>0&&(
            <Card title="By Payment Tag" subtitle="payment channel · tap for entries">
              <BreakTable rows={data.by_tag} onRow={k=>openLedger({dim:"tag",key:k})}/>
            </Card>
          )}

          {/* BY SOURCE donut-ish bars */}
          <Card title="By Source" subtitle="where the money came from · tap for entries">
            <SourceBars bs={data.by_source} onRow={s=>openLedger({src:s})}/>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Stat card ──
function Stat({label,value,tone,sub,onClick}:{label:string;value:string;tone:"accent"|"danger"|"warn"|"slate";sub?:string;onClick?:()=>void}){
  const c = tone==="accent"?"text-lma-accent":tone==="danger"?"text-lma-danger":tone==="warn"?"text-lma-warn":"text-lma-slate-800";
  const body=(
    <>
      <div className="text-[10px] font-bold uppercase tracking-wide text-lma-slate-400">{label}{sub&&<span className="ml-1 normal-case text-lma-slate-300">· {sub}</span>}{onClick&&<span className="float-right normal-case text-lma-slate-300">›</span>}</div>
      <div className={`text-lg font-extrabold mt-0.5 ${c}`}>{value}</div>
    </>
  );
  return onClick
    ? <button onClick={onClick} className="w-full text-left bg-white rounded-xl p-3 shadow-sm active:scale-[0.98] transition">{body}</button>
    : <div className="bg-white rounded-xl p-3 shadow-sm">{body}</div>;
}

// ── Card wrapper ──
function Card({title,subtitle,action,children}:{title:string;subtitle?:string;action?:{label:string;onClick:()=>void};children:React.ReactNode}){
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm mb-2">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div><div className="text-sm font-extrabold text-lma-slate-900">{title}</div>{subtitle&&<div className="text-[11px] text-lma-slate-400 font-medium">{subtitle}</div>}</div>
        {action&&<button onClick={action.onClick} className="shrink-0 text-[11px] font-bold text-lma-primary">{action.label}</button>}
      </div>
      {children}
    </div>
  );
}

// ── Daily bar chart (pure SVG) — each day column is tappable ──
function DailyChart({daily,onDay}:{daily:DailyPt[];onDay:(iso:string)=>void}){
  if(!daily||daily.length===0) return <div className="text-center text-xs text-lma-slate-400 py-6">No collections in range.</div>;
  const max=Math.max(...daily.map(d=>Math.max(d.net,d.gross)),1);
  const barW=100/daily.length;
  const peak=daily.reduce((a,b)=>b.net>a.net?b:a,daily[0]);
  return (
    <div>
      <svg viewBox="0 0 100 46" preserveAspectRatio="none" className="w-full h-32">
        {[0.25,0.5,0.75].map(g=>(<line key={g} x1="0" x2="100" y1={40-40*g} y2={40-40*g} stroke="#f1f5f9" strokeWidth="0.4"/>))}
        {daily.map((d,i)=>{
          const h=Math.max((d.net/max)*40,d.net>0?0.6:0);
          const x=i*barW+barW*0.15, w=barW*0.7;
          return <rect key={i} x={x} y={40-h} width={w} height={h} rx="0.4" fill={d.net===peak.net?"#4f46e5":"#a5b4fc"}><title>{fmtDMY(d.date)}: {fmtINR(d.net)}</title></rect>;
        })}
        <line x1="0" x2="100" y1="40" y2="40" stroke="#e2e8f0" strokeWidth="0.5"/>
        {/* full-height tap targets, one per day (thin bars are hard to hit) */}
        {daily.map((d,i)=>(<rect key={"hit"+i} x={i*barW} y={0} width={barW} height={46} fill="transparent" className="cursor-pointer" onClick={()=>onDay(d.date)}><title>{fmtDMY(d.date)}: {fmtINR(d.net)}</title></rect>))}
      </svg>
      <div className="flex justify-between text-[9px] text-lma-slate-400 font-medium mt-1">
        <span>{fmtDM(daily[0].date)}</span>
        <span className="text-lma-slate-500">Peak {fmtDM(peak.date)} · {fmtINR(peak.net)}</span>
        <span>{fmtDM(daily[daily.length-1].date)}</span>
      </div>
    </div>
  );
}

// ── Horizontal bar list with gross/refund/net (for By Library) ──
function BarList({rows,chips,onRow}:{rows:BreakRow[];chips:{code:string;label:string;color?:string}[];onRow:(key:string)=>void}){
  const max=Math.max(...rows.map(r=>Math.abs(r.net)),1);
  const colorFor=(k:string)=> chips.find(c=>c.code===k)?.color || "#4f46e5";
  return (
    <div className="space-y-2.5">
      {rows.map(r=>(
        <button key={r.key} onClick={()=>onRow(r.key)} className="block w-full text-left active:opacity-70 transition">
          <div className="flex items-center justify-between text-[12px] mb-0.5">
            <span className="font-bold text-lma-slate-800">{r.key}</span>
            <span className="font-extrabold text-lma-slate-900">{fmtINR(r.net)} <span className="text-lma-slate-300 font-bold">›</span></span>
          </div>
          <div className="h-2 rounded-full bg-lma-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{width:`${Math.max((Math.abs(r.net)/max)*100,2)}%`,background:colorFor(r.key)}}/>
          </div>
          {r.refund>0&&<div className="text-[10px] text-lma-slate-400 mt-0.5">gross {fmtINR(r.gross)} · refund {fmtINR(r.refund)}</div>}
        </button>
      ))}
    </div>
  );
}

// ── gross/refund/net table (By Fees Mode, By Tag) — rows open the Ledger ──
function BreakTable({rows,onRow}:{rows:BreakRow[];onRow:(key:string)=>void}){
  const totG=rows.reduce((s,r)=>s+r.gross,0), totR=rows.reduce((s,r)=>s+r.refund,0), totN=rows.reduce((s,r)=>s+r.net,0);
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-lma-slate-400 text-[10px] uppercase font-bold">
            <th className="text-left py-1 px-1">Mode</th>
            <th className="text-right py-1 px-1">Gross</th>
            <th className="text-right py-1 px-1">Refund</th>
            <th className="text-right py-1 px-1">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.key} onClick={()=>onRow(r.key)} className="border-t border-lma-slate-100 cursor-pointer active:bg-lma-slate-50">
              <td className="py-1.5 px-1 font-bold text-lma-primary">{r.key==="—"?"— (blank)":r.key} <span className="text-lma-slate-300">›</span></td>
              <td className="py-1.5 px-1 text-right text-lma-slate-600">{fmtShort(r.gross)}</td>
              <td className="py-1.5 px-1 text-right text-lma-danger">{r.refund?fmtShort(r.refund):"—"}</td>
              <td className="py-1.5 px-1 text-right font-extrabold text-lma-slate-900">{fmtShort(r.net)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-lma-slate-200 font-extrabold">
            <td className="py-1.5 px-1 text-lma-slate-900">Total</td>
            <td className="py-1.5 px-1 text-right text-lma-slate-700">{fmtShort(totG)}</td>
            <td className="py-1.5 px-1 text-right text-lma-danger">{totR?fmtShort(totR):"—"}</td>
            <td className="py-1.5 px-1 text-right text-lma-primary">{fmtShort(totN)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── By Source stacked bars — rows open that type's entries ──
function SourceBars({bs,onRow}:{bs:{RECEIPTS:number;DUES:number;MISC:number;REFUNDS:number};onRow:(s:LedgerSrc)=>void}){
  // Refunds are an OUTFLOW → displayed as a negative amount (red).
  const items:{k:string;s:LedgerSrc;v:number;c:string;neg:boolean}[]=[
    {k:"Receipts",s:"RECEIPTS",v:bs.RECEIPTS,c:"#4f46e5",neg:false},
    {k:"Dues",s:"DUES",v:bs.DUES,c:"#10b981",neg:false},
    {k:"Misc",s:"MISC",v:bs.MISC,c:"#f59e0b",neg:false},
    {k:"Refunds",s:"REFUNDS",v:bs.REFUNDS,c:"#ef4444",neg:true},
  ];
  const max=Math.max(...items.map(i=>i.v),1); // bar length by magnitude
  return (
    <div className="space-y-2">
      {items.map(it=>(
        <button key={it.k} onClick={()=>onRow(it.s)} className="w-full flex items-center gap-2 active:opacity-70 transition">
          <span className="text-[11px] font-bold text-lma-slate-600 w-16 shrink-0 text-left">{it.k}</span>
          <div className="flex-1 h-3 rounded-full bg-lma-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{width:`${Math.max((it.v/max)*100,it.v>0?2:0)}%`,background:it.c}}/>
          </div>
          <span className={`text-[11px] font-extrabold w-16 text-right shrink-0 ${it.neg?"text-lma-danger":"text-lma-slate-800"}`}>{it.neg&&it.v>0?"−":""}{fmtShort(it.v)} <span className="text-lma-slate-300">›</span></span>
        </button>
      ))}
    </div>
  );
}