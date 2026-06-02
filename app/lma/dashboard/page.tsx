"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLMA, useScopeChips } from "../layout";

const API = "/api/lma";

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

// ── date helpers (local, dd-mm-yyyy <-> Date) ──
const pad=(n:number)=>("0"+n).slice(-2);
const toDmy=(d:Date)=>`${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`;
const fmtINR=(n:number)=>"₹"+Math.round(n).toLocaleString("en-IN");
const fmtShort=(n:number)=>{ const a=Math.abs(n); if(a>=100000)return (n/100000).toFixed(a>=1000000?0:1)+"L"; if(a>=1000)return (n/1000).toFixed(a>=10000?0:1)+"k"; return String(Math.round(n)); };

type Preset = "today"|"week"|"month"|"lastmonth"|"year"|"lastyear";
function presetRange(p:Preset):{from:Date;to:Date}{
  const now=new Date(); now.setHours(0,0,0,0);
  const y=now.getFullYear(), m=now.getMonth();
  if(p==="today") return {from:now,to:now};
  if(p==="week"){ const d=new Date(now); const dow=(d.getDay()+6)%7; d.setDate(d.getDate()-dow); return {from:d,to:now}; } // Mon-start
  if(p==="month") return {from:new Date(y,m,1),to:now};
  if(p==="lastmonth") return {from:new Date(y,m-1,1),to:new Date(y,m,0)};
  // Indian FY: Apr 1 – Mar 31
  if(p==="year"){ const fy = m>=3?y:y-1; return {from:new Date(fy,3,1),to:now}; }
  // lastyear FY
  const fy=(m>=3?y:y-1)-1; return {from:new Date(fy,3,1),to:new Date(fy+1,2,31)};
}

export default function DashboardPage(){
  const { init, showToast, post } = useLMA();

  const [scope,setScope]=useState("");
  const [preset,setPreset]=useState<Preset>("month");
  const [from,setFrom]=useState<Date>(presetRange("month").from);
  const [to,setTo]=useState<Date>(presetRange("month").to);
  const [data,setData]=useState<Dash|null>(null);
  const [loading,setLoading]=useState(false);
  const [customOpen,setCustomOpen]=useState(false);

  const applyPreset=(p:Preset)=>{ const r=presetRange(p); setPreset(p); setFrom(r.from); setTo(r.to); setCustomOpen(false); };

  const load=useCallback(async()=>{
    setLoading(true);
    const p=new URLSearchParams({ action:"getDashboard", from:toDmy(from), to:toDmy(to) });
    if(scope) p.set("library",scope);
    try{
      const r:Dash=await fetch(`${API}?${p}`).then(r=>r.json());
      setData(r&&r.ok?r:null);
    }catch{ setData(null); }
    setLoading(false);
  },[from,to,scope]);

  useEffect(()=>{ load(); },[load]);

  const chips = useScopeChips();

  const presets:{k:Preset;label:string}[]=[
    {k:"today",label:"Today"},{k:"week",label:"This Week"},{k:"month",label:"This Month"},
    {k:"lastmonth",label:"Last Month"},{k:"year",label:"This FY"},{k:"lastyear",label:"Last FY"},
  ];

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4 pb-10">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Dashboard</h1>
          <p className="text-[11px] text-lma-slate-500 font-medium">{data?`${data.range.from} → ${data.range.to}`:"…"} · {scope||"All"}</p>
        </div>
        <button onClick={load} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {/* library/branch chips */}
      <div className="flex gap-1.5 mb-2 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.label}</button>
        ))}
      </div>

      {/* preset pills */}
      <div className="flex gap-1.5 mb-2 overflow-x-auto -mx-4 px-4 pb-1">
        {presets.map(p=>(
          <button key={p.k} onClick={()=>applyPreset(p.k)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${preset===p.k&&!customOpen?"bg-lma-primary text-white":"bg-white text-lma-slate-600"}`}>{p.label}</button>
        ))}
        <button onClick={()=>setCustomOpen(v=>!v)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${customOpen?"bg-lma-primary text-white":"bg-white text-lma-slate-600"}`}>Custom</button>
      </div>

      {/* custom date range */}
      {customOpen&&(
        <div className="bg-white rounded-xl p-3 mb-3 shadow-sm flex items-end gap-2 lma-slide-up">
          <label className="flex-1 text-[11px] font-bold text-lma-slate-500">From
            <input type="date" value={`${from.getFullYear()}-${pad(from.getMonth()+1)}-${pad(from.getDate())}`} onChange={e=>{const d=new Date(e.target.value);if(!isNaN(d.getTime()))setFrom(d);}} className="w-full mt-1 px-2 py-2 rounded-lg border-[1.5px] border-lma-slate-200 text-sm font-medium text-lma-slate-800"/>
          </label>
          <label className="flex-1 text-[11px] font-bold text-lma-slate-500">To
            <input type="date" value={`${to.getFullYear()}-${pad(to.getMonth()+1)}-${pad(to.getDate())}`} onChange={e=>{const d=new Date(e.target.value);if(!isNaN(d.getTime()))setTo(d);}} className="w-full mt-1 px-2 py-2 rounded-lg border-[1.5px] border-lma-slate-200 text-sm font-medium text-lma-slate-800"/>
          </label>
          <button onClick={load} className="px-4 py-2 rounded-lg bg-lma-primary text-white font-bold text-sm shrink-0">Go</button>
        </div>
      )}

      {!data&&loading&&<div className="text-center text-sm text-lma-slate-500 py-12">Loading…</div>}
      {!data&&!loading&&<div className="text-center text-sm text-lma-slate-500 py-12">No data for this range.</div>}

      {data&&(
        <div className={loading?"opacity-50 pointer-events-none transition":"transition"}>
          {/* HERO: Net */}
          <div className="bg-gradient-to-br from-lma-primary to-lma-primary-2 rounded-2xl p-4 text-white shadow-md mb-2 lma-slide-up">
            <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">Net Collection</div>
            <div className="text-3xl font-extrabold mt-0.5">{fmtINR(data.headline.net)}</div>
            <div className="text-[11px] opacity-80 mt-1">Gross {fmtINR(data.headline.gross_in)} · Refunds {fmtINR(data.headline.refund_out)}</div>
          </div>

          {/* supporting cards */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Stat label="Gross In" value={fmtINR(data.headline.gross_in)} tone="accent"/>
            <Stat label="Refunds Out" value={fmtINR(data.headline.refund_out)} tone="danger"/>
            <Stat label="Outstanding Dues" value={fmtINR(data.headline.outstanding_dues)} tone="warn" sub="live"/>
            <Stat label="Active Students" value={String(data.headline.active_students)} tone="slate" sub="live"/>
          </div>

          {/* counts strip */}
          <div className="flex gap-1.5 mb-3 text-[10px] font-bold text-lma-slate-500">
            <span className="flex-1 bg-white rounded-lg py-1.5 text-center shadow-sm">{data.counts.receipts} receipts</span>
            <span className="flex-1 bg-white rounded-lg py-1.5 text-center shadow-sm">{data.counts.dues_payments} dues</span>
            <span className="flex-1 bg-white rounded-lg py-1.5 text-center shadow-sm">{data.counts.misc_entries} misc</span>
            <span className="flex-1 bg-white rounded-lg py-1.5 text-center shadow-sm">{data.counts.refunds} refunds</span>
          </div>

          {/* DAILY CHART */}
          <Card title="Daily Collection" subtitle="net per day">
            <DailyChart daily={data.daily}/>
          </Card>

          {/* BY LIBRARY chart + table */}
          {data.by_library.length>0&&(
            <Card title="By Library / Branch" subtitle="net comparison">
              <BarList rows={data.by_library} chips={chips}/>
            </Card>
          )}

          {/* BY FEES MODE (bank reconciliation) */}
          {data.by_fees_mode.length>0&&(
            <Card title="By Bank / Fees Mode" subtitle="reconcile against passbooks">
              <BreakTable rows={data.by_fees_mode}/>
            </Card>
          )}

          {/* BY PAYMENT TAG */}
          {data.by_tag.length>0&&(
            <Card title="By Payment Tag" subtitle="payment channel">
              <BreakTable rows={data.by_tag}/>
            </Card>
          )}

          {/* BY SOURCE donut-ish bars */}
          <Card title="By Source" subtitle="where the money came from">
            <SourceBars bs={data.by_source}/>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Stat card ──
function Stat({label,value,tone,sub}:{label:string;value:string;tone:"accent"|"danger"|"warn"|"slate";sub?:string}){
  const c = tone==="accent"?"text-lma-accent":tone==="danger"?"text-lma-danger":tone==="warn"?"text-lma-warn":"text-lma-slate-800";
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-lma-slate-400">{label}{sub&&<span className="ml-1 normal-case text-lma-slate-300">· {sub}</span>}</div>
      <div className={`text-lg font-extrabold mt-0.5 ${c}`}>{value}</div>
    </div>
  );
}

// ── Card wrapper ──
function Card({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}){
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm mb-2">
      <div className="mb-3"><div className="text-sm font-extrabold text-lma-slate-900">{title}</div>{subtitle&&<div className="text-[11px] text-lma-slate-400 font-medium">{subtitle}</div>}</div>
      {children}
    </div>
  );
}

// ── Daily bar chart (pure SVG) ──
function DailyChart({daily}:{daily:DailyPt[]}){
  if(!daily||daily.length===0) return <div className="text-center text-xs text-lma-slate-400 py-6">No collections in range.</div>;
  const max=Math.max(...daily.map(d=>Math.max(d.net,d.gross)),1);
  const barW=100/daily.length;
  const total=daily.reduce((s,d)=>s+d.net,0);
  const peak=daily.reduce((a,b)=>b.net>a.net?b:a,daily[0]);
  return (
    <div>
      <svg viewBox="0 0 100 46" preserveAspectRatio="none" className="w-full h-32">
        {[0.25,0.5,0.75].map(g=>(<line key={g} x1="0" x2="100" y1={40-40*g} y2={40-40*g} stroke="#f1f5f9" strokeWidth="0.4"/>))}
        {daily.map((d,i)=>{
          const h=Math.max((d.net/max)*40,d.net>0?0.6:0);
          const x=i*barW+barW*0.15, w=barW*0.7;
          return <rect key={i} x={x} y={40-h} width={w} height={h} rx="0.4" fill={d.net===peak.net?"#4f46e5":"#a5b4fc"}><title>{d.date}: {fmtINR(d.net)}</title></rect>;
        })}
        <line x1="0" x2="100" y1="40" y2="40" stroke="#e2e8f0" strokeWidth="0.5"/>
      </svg>
      <div className="flex justify-between text-[9px] text-lma-slate-400 font-medium mt-1">
        <span>{daily[0].date.slice(5)}</span>
        <span className="text-lma-slate-500">Peak {peak.date.slice(5)} · {fmtINR(peak.net)}</span>
        <span>{daily[daily.length-1].date.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Horizontal bar list with gross/refund/net (for By Library) ──
function BarList({rows,chips}:{rows:BreakRow[];chips:{code:string;label:string;color?:string}[]}){
  const max=Math.max(...rows.map(r=>Math.abs(r.net)),1);
  const colorFor=(k:string)=> chips.find(c=>c.code===k)?.color || "#4f46e5";
  return (
    <div className="space-y-2.5">
      {rows.map(r=>(
        <div key={r.key}>
          <div className="flex items-center justify-between text-[12px] mb-0.5">
            <span className="font-bold text-lma-slate-800">{r.key}</span>
            <span className="font-extrabold text-lma-slate-900">{fmtINR(r.net)}</span>
          </div>
          <div className="h-2 rounded-full bg-lma-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{width:`${Math.max((Math.abs(r.net)/max)*100,2)}%`,background:colorFor(r.key)}}/>
          </div>
          {r.refund>0&&<div className="text-[10px] text-lma-slate-400 mt-0.5">gross {fmtINR(r.gross)} · refund {fmtINR(r.refund)}</div>}
        </div>
      ))}
    </div>
  );
}

// ── gross/refund/net table (By Fees Mode, By Tag) ──
function BreakTable({rows}:{rows:BreakRow[]}){
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
            <tr key={r.key} className="border-t border-lma-slate-100">
              <td className="py-1.5 px-1 font-bold text-lma-slate-800">{r.key}</td>
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

// ── By Source stacked bars ──
function SourceBars({bs}:{bs:{RECEIPTS:number;DUES:number;MISC:number;REFUNDS:number}}){
  // Refunds are an OUTFLOW → displayed as a negative amount (red).
  const items=[
    {k:"Receipts",v:bs.RECEIPTS,disp:bs.RECEIPTS,c:"#4f46e5",neg:false},
    {k:"Dues",v:bs.DUES,disp:bs.DUES,c:"#10b981",neg:false},
    {k:"Misc",v:bs.MISC,disp:bs.MISC,c:"#f59e0b",neg:false},
    {k:"Refunds",v:bs.REFUNDS,disp:-bs.REFUNDS,c:"#ef4444",neg:true},
  ];
  const max=Math.max(...items.map(i=>i.v),1); // bar length by magnitude
  return (
    <div className="space-y-2">
      {items.map(it=>(
        <div key={it.k} className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-lma-slate-600 w-16 shrink-0">{it.k}</span>
          <div className="flex-1 h-3 rounded-full bg-lma-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{width:`${Math.max((it.v/max)*100,it.v>0?2:0)}%`,background:it.c}}/>
          </div>
          <span className={`text-[11px] font-extrabold w-16 text-right shrink-0 ${it.neg?"text-lma-danger":"text-lma-slate-800"}`}>{it.neg&&it.v>0?"−":""}{fmtShort(it.v)}</span>
        </div>
      ))}
    </div>
  );
}