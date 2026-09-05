"use client";

// ── OCCUPANCY (shared) ───────────────────────────────────────────────
// ONE component, mounted by the home cockpit ("Load live data") and by
// the Dashboard. It computes NOTHING itself: the API action
// getOccupancySummary feeds every library through the SAME shared
// computer the seat chart uses (_lib/vacancy.ts → occupancyStats), so
// the board, the tile and this report can never disagree.
//
// LOCKED MODEL (owner-signed):
//   Every seat lands in exactly ONE of five buckets, and they add up to
//   the seat count: full-day + shared + morning-only + evening-only + free.
//   A seat sold for one shift only is HALF sold.
//     seats sold  = full-day + shared + (morning-only + evening-only)/2
//     occupancy % = seats sold ÷ seats
//   • BLOCKED seats count as capacity, exactly like a free seat
//   • off-chart bookings (floating / unassigned / other-shift / temp-held)
//     are NOT occupancy — reported separately as "off-chart"

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLMA, useScopeChips } from "./LMAProvider";

const API = "/api/lma960805";

// bucket palette — indigo ramp, deliberately NOT the lifecycle colours
const C_FULLDAY = "#4338ca";
const C_SHARED  = "#4f46e5";
const C_MORNING = "#818cf8";
const C_EVENING = "#a5b4fc";
const C_FREE    = "#e2e8f0";

interface PlanStat { occ:number; vac:number; total:number; pct:number; }
interface OccBase {
  seats:number; lanes:number; occLanes:number; occPct:number;
  soldSeats:number; freeSeats:number; bookings:number;
  fdSeats:number; pairSeats:number; morningOnlySeats:number; eveningOnlySeats:number; seatsEmpty:number;
  seatsFull:number; seatsHalf:number;
  blockedLanes:number; heldLanes:number; blockedSeats:number; heldSeats:number;
  worthSold:number; worthFullDay:number; worthCeiling:number; ratesMissing:number;
  plan:Record<"MORNING"|"EVENING"|"FULL DAY",PlanStat>;
  offboard:{ floating:number; unassigned:number; other:number; total:number };
}
interface OccRow extends OccBase { key:string; library_code:string; branch_code:string; library_name:string; }
interface OccSummary { ok:boolean; generated_at:string; total:OccBase; libraries:OccRow[]; }

// 208 -> "208", 25.5 -> "25.5"
const n1 = (v:number|undefined|null)=> !Number.isFinite(v as number) ? "—" : (Number.isInteger(v) ? String(v) : (v as number).toFixed(1));
const inr = (v:number|undefined|null)=> !Number.isFinite(v as number) ? "—" : "₹"+Math.round(v as number).toLocaleString("en-IN");
const wPct = (n:number,d:number)=> d>0 ? Math.round((n/d)*100) : 0;
// slots left on seats that are ALREADY earning in the other shift
const morningSlots = (r:OccBase)=> Math.max(r.plan.MORNING.vac - r.plan["FULL DAY"].vac, 0);
const eveningSlots = (r:OccBase)=> Math.max(r.plan.EVENING.vac - r.plan["FULL DAY"].vac, 0);

// ── the tile ────────────────────────────────────────────────────────
// reloadKey <= 0 → dormant, nothing is fetched (home stays quiet until
// the owner taps "Load live data"). Bump the key to (re)load.
export default function OccupancyCard({ scope, reloadKey }:{ scope:string; reloadKey:number }){
  const { showToast } = useLMA();
  const [data,setData] = useState<OccSummary|null>(null);
  const [busy,setBusy] = useState(false);
  const [open,setOpen] = useState(false);

  useEffect(()=>{
    if(reloadKey<=0) return;
    let dead=false;
    setBusy(true);
    fetch(`${API}?action=getOccupancySummary`,{cache:"no-store"})
      .then(r=>r.json())
      .then(j=>{ if(!dead) setData(j&&j.ok?j:null); })
      .catch(()=>{ if(!dead) setData(null); })
      .finally(()=>{ if(!dead) setBusy(false); });
    return ()=>{ dead=true; };
  },[reloadKey]);

  if(reloadKey<=0) return null;

  // chip selected -> that library's rate; "All" -> the combined rate.
  // The report sheet always shows every library either way.
  const row  = scope ? (data?.libraries.find(l=>l.key===scope) || null) : null;
  const shown: OccBase|null = data ? (scope ? row : data.total) : null;

  return (
    <>
      <button onClick={()=>{ if(data) setOpen(true); }} disabled={!data}
        className="w-full text-left bg-white rounded-2xl p-4 shadow-sm mb-3 active:scale-[0.99] transition lma-slide-up">
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold text-lma-slate-900">🪑 Occupancy</span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-lma-slate-100 text-lma-slate-500">{scope||"ALL"}</span>
          </span>
          <span className="text-[11px] font-extrabold text-lma-primary shrink-0">{busy?"…":"report ›"}</span>
        </div>
        {shown ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-extrabold text-lma-slate-900 leading-none">{shown.occPct}%</span>
              <span className="text-[11px] font-semibold text-lma-slate-500 leading-tight">{n1(shown.soldSeats)} of {shown.seats} seats&rsquo; worth sold</span>
            </div>
            <div className="h-2 rounded-full bg-lma-slate-100 overflow-hidden mt-2">
              <div className="h-full rounded-full bg-lma-primary transition-all" style={{width:`${Math.min(shown.occPct,100)}%`}}/>
            </div>
            <div className="flex items-baseline gap-1.5 mt-2.5">
              <span className="text-[15px] font-extrabold text-lma-slate-900">{inr(shown.worthSold)}</span>
              <span className="text-[10px] font-semibold text-lma-slate-500">/mo at list rates</span>
            </div>
            <div className="text-[10px] font-semibold text-lma-slate-500 mt-0.5">
              {wPct(shown.worthSold,shown.worthFullDay)}% of full-day base · {wPct(shown.worthSold,shown.worthCeiling)}% of split ceiling
              {shown.ratesMissing>0 && <span className="text-lma-warn"> · {shown.ratesMissing} rate set{shown.ratesMissing===1?"":"s"} missing</span>}
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              <MiniCell n={shown.plan["FULL DAY"].vac} t="whole seats free"/>
              <MiniCell n={morningSlots(shown)}        t="morning slots"/>
              <MiniCell n={eveningSlots(shown)}        t="evening slots"/>
            </div>
          </>
        ) : (
          <div className="text-[12px] font-semibold text-lma-slate-400 py-3">
            {busy ? "loading…" : scope ? `No seat chart for ${scope}` : "unavailable"}
          </div>
        )}
      </button>
      {open&&data&&<OccReport data={data} scope={scope} onClose={()=>setOpen(false)} showToast={showToast}/>}
    </>
  );
}

// ── plain-text report (Copy / WhatsApp) ──
function buildText(d:OccSummary):string{
  const T=d.total;
  const dot=" \u00B7 ";
  const L:string[]=[
    "\u{1F4CA} OCCUPANCY REPORT", d.generated_at, "",
    `OVERALL ${T.occPct}%  \u2014  ${n1(T.soldSeats)} of ${T.seats} seats' worth sold`,
    `WORTH ${inr(T.worthSold)}/mo${dot}${wPct(T.worthSold,T.worthFullDay)}% of full-day base${dot}${wPct(T.worthSold,T.worthCeiling)}% of split ceiling`,
    "",
    `SEATS (${T.seats})`,
    `  full-day ${T.fdSeats}${dot}shared ${T.pairSeats}${dot}morning only ${T.morningOnlySeats}${dot}evening only ${T.eveningOnlySeats}${dot}nothing booked ${T.seatsEmpty}`,
    "",
    "FREE TO SELL",
    `  ${T.plan["FULL DAY"].vac} whole seats${dot}${morningSlots(T)} morning slots${dot}${eveningSlots(T)} evening slots`,
  ];
  if(T.blockedSeats||T.heldSeats)
    L.push(`  not sellable: ${T.blockedSeats} blocked${dot}${T.heldSeats} held`);
  L.push("", "BY SHIFT", `  morning ${T.plan.MORNING.occ}/${T.seats} (${T.plan.MORNING.pct}%)${dot}evening ${T.plan.EVENING.occ}/${T.seats} (${T.plan.EVENING.pct}%)`);
  d.libraries.forEach(r=>{
    L.push("", `${r.key} \u2014 ${r.occPct}%  (${n1(r.soldSeats)} of ${r.seats})${dot}${inr(r.worthSold)}/mo`);
    L.push(`  full-day ${r.fdSeats}${dot}shared ${r.pairSeats}${dot}mor-only ${r.morningOnlySeats}${dot}eve-only ${r.eveningOnlySeats}${dot}free ${r.seatsEmpty}`);
    L.push(`  to sell: ${r.plan["FULL DAY"].vac} whole${dot}${morningSlots(r)} morning${dot}${eveningSlots(r)} evening` +
      (r.blockedSeats?`${dot}${r.blockedSeats} blocked`:"") + (r.offboard.total?`${dot}${r.offboard.total} off-chart`:""));
  });
  return L.join("\n");
}

// ── the report sheet ──
// PORTALED to <body>. `lma-slide-up` animates a transform, and a transformed
// element becomes the containing block for any position:fixed descendant —
// so a sheet rendered inside an animated card gets trapped inside that card
// instead of covering the screen. The portal makes placement irrelevant.
function OccReport({ data, scope, onClose, showToast }:{ data:OccSummary; scope:string; onClose:()=>void; showToast:(m:string,t?:"success"|"error")=>void }){
  const chips = useScopeChips({ includeAll:false });
  const [rank,setRank] = useState(false);
  const [openKey,setOpenKey] = useState<string>(scope||"");
  const T = data.total;
  const libs = rank ? [...data.libraries].sort((a,b)=>b.occPct-a.occPct) : data.libraries;
  const colorOf=(k:string)=> chips.find(c=>c.code===k)?.color || "#4f46e5";
  const emojiOf=(k:string)=> chips.find(c=>c.code===k)?.emoji || "";
  const text = buildText(data);

  useEffect(()=>{
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return ()=>{ document.body.style.overflow = prev; };
  },[]);

  const sheet = (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl max-h-[92vh] flex flex-col lma-slide-up" onClick={e=>e.stopPropagation()}>

        {/* sticky header */}
        <div className="shrink-0 px-5 pt-3 pb-3 border-b border-lma-slate-100">
          <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-3"/>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-lma-slate-900 leading-tight">Occupancy Report</h3>
              <p className="text-[11px] font-semibold text-lma-slate-400 truncate">{data.generated_at} · {data.libraries.length} librar{data.libraries.length===1?"y":"ies"}</p>
            </div>
            <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full bg-lma-slate-100 text-lma-slate-500 text-lg leading-none font-bold active:scale-90 transition">×</button>
          </div>
        </div>

        {/* scrolling body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* HERO */}
          <div className="bg-gradient-to-br from-lma-primary to-lma-primary-2 rounded-2xl p-4 text-white shadow-sm mb-2">
            <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">Overall · all libraries</div>
            <div className="text-[38px] font-extrabold leading-none mt-0.5">{T.occPct}%</div>
            <div className="text-[12px] font-semibold opacity-90 mt-1">{n1(T.soldSeats)} of {T.seats} seats&rsquo; worth sold</div>
            <div className="text-[15px] font-extrabold mt-2">{inr(T.worthSold)}<span className="text-[11px] font-semibold opacity-80"> /mo at list rates</span></div>
            <div className="text-[11px] font-semibold opacity-80 mt-0.5">{wPct(T.worthSold,T.worthFullDay)}% of full-day base · {wPct(T.worthSold,T.worthCeiling)}% of split ceiling</div>
            <div className="h-2 rounded-full bg-white/25 overflow-hidden mt-2">
              <div className="h-full rounded-full bg-white" style={{width:`${Math.min(T.occPct,100)}%`}}/>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <HeroCell label="Seats"      value={String(T.seats)}/>
              <HeroCell label="Bookings"   value={String(T.bookings)} sub="on the chart"/>
              <HeroCell label="Still free" value={n1(T.freeSeats)} sub="seats’ worth"/>
              <HeroCell label="Fully free" value={String(T.plan["FULL DAY"].vac)} sub="whole seats"/>
            </div>
          </div>

          {/* FIVE BUCKETS */}
          <Block title="Seat states" sub={`every one of the ${T.seats} seats, counted once`}>
            <BucketBar r={T}/>
            <div className="mt-3 space-y-1.5">
              <BucketRow c={C_FULLDAY} label="Full-day"          n={T.fdSeats}          note="whole seat, one booking"/>
              <BucketRow c={C_SHARED}  label="Morning + Evening" n={T.pairSeats}        note="whole seat, two students"/>
              <BucketRow c={C_MORNING} label="Morning only"      n={T.morningOnlySeats} note="evening still to sell"/>
              <BucketRow c={C_EVENING} label="Evening only"      n={T.eveningOnlySeats} note="morning still to sell"/>
              <BucketRow c={C_FREE}    label="Nothing booked"    n={T.seatsEmpty}       note="whole seat idle"/>
            </div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-lma-slate-100">
              <span className="text-[11px] font-extrabold text-lma-slate-500">Total</span>
              <span className="text-[13px] font-extrabold text-lma-slate-900">{T.seats} seats</span>
            </div>
          </Block>

          {/* FREE TO SELL */}
          <Block title="Free to sell" sub={`${n1(T.freeSeats)} seats’ worth of unsold capacity`}>
            <div className="space-y-2">
              <SellRow n={T.plan["FULL DAY"].vac} label="whole seats"   note="full-day, or split into two"/>
              <SellRow n={morningSlots(T)}        label="morning slots" note="seat already earns in the evening"/>
              <SellRow n={eveningSlots(T)}        label="evening slots" note="seat already earns in the morning"/>
            </div>
            {(T.blockedSeats>0||T.heldSeats>0)&&(
              <p className="text-[10px] font-semibold text-lma-slate-500 mt-2.5 pt-2.5 border-t border-lma-slate-100 leading-snug">
                Not sellable right now:
                {T.blockedSeats>0&&<> <span className="text-lma-danger font-extrabold">{T.blockedSeats}</span> blocked</>}
                {T.blockedSeats>0&&T.heldSeats>0&&<> ·</>}
                {T.heldSeats>0&&<> <span className="text-lma-warn font-extrabold">{T.heldSeats}</span> held by temp-vacated bookings</>}
                . Blocked seats still count as capacity, exactly like a free seat.
              </p>
            )}
          </Block>

          {/* BY SHIFT */}
          <Block title="By shift" sub={`how full each shift is, out of ${T.seats} seats`}>
            <div className="grid grid-cols-2 gap-2">
              {(["MORNING","EVENING"] as const).map(p=>(
                <div key={p} className="bg-lma-slate-50 rounded-xl p-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-lma-slate-400">{p}</div>
                  <div className="text-xl font-extrabold text-lma-slate-900 leading-none mt-1">{T.plan[p].pct}%</div>
                  <div className="h-1.5 rounded-full bg-lma-slate-200 overflow-hidden mt-1.5">
                    <div className="h-full rounded-full bg-lma-primary" style={{width:`${Math.min(T.plan[p].pct,100)}%`}}/>
                  </div>
                  <div className="text-[10px] font-semibold text-lma-slate-500 mt-1">{T.plan[p].occ} of {T.plan[p].total} seats</div>
                  <div className="text-[10px] font-bold text-lma-accent">{T.plan[p].vac} free</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] font-semibold text-lma-slate-400 mt-2 leading-snug">
              Full-day bookings sit inside both figures — a full-day seat is booked morning and evening. The overall {T.occPct}% is these two averaged.
            </p>
          </Block>

          {/* PER LIBRARY */}
          <div className="flex items-center justify-between mb-2 mt-3">
            <div className="text-sm font-extrabold text-lma-slate-900">Library by library</div>
            <button onClick={()=>setRank(v=>!v)} className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg ${rank?"bg-lma-slate-900 text-white":"bg-lma-slate-100 text-lma-slate-600"}`}>{rank?"↓ by rate":"chip order"}</button>
          </div>
          <div className="space-y-2">
            {libs.map(r=>{
              const on = openKey===r.key;
              const c = colorOf(r.key);
              return (
                <div key={r.key} className={`rounded-2xl overflow-hidden bg-white shadow-sm ${r.key===scope?"ring-2 ring-lma-primary/40":""}`}>
                  <button onClick={()=>setOpenKey(on?"":r.key)} className="w-full text-left p-3 active:bg-lma-slate-50 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-lma-slate-900">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:c}}/>
                        {emojiOf(r.key)} {r.key}
                        <span className="text-[10px] font-semibold text-lma-slate-400">{r.seats} seats</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[15px] font-extrabold text-lma-slate-900">{r.occPct}%</span>
                        <span className="text-[10px] font-bold text-lma-slate-400">{on?"▲":"▼"}</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-lma-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{width:`${Math.max(Math.min(r.occPct,100),1)}%`,background:c}}/>
                    </div>
                    <div className="text-[10px] font-semibold text-lma-slate-500 mt-1">{n1(r.soldSeats)} of {r.seats} sold · to sell: {r.plan["FULL DAY"].vac} whole · {morningSlots(r)} mor · {eveningSlots(r)} eve</div>
                    <div className="text-[10px] mt-0.5"><span className="font-extrabold text-lma-slate-900">{inr(r.worthSold)}/mo</span><span className="font-semibold text-lma-slate-500"> · {wPct(r.worthSold,r.worthFullDay)}% of full-day base</span></div>
                  </button>
                  {on&&(
                    <div className="px-3 pb-3">
                      <BucketBar r={r}/>
                      <div className="mt-2.5 space-y-1">
                        <BucketRow c={C_FULLDAY} label="Full-day"          n={r.fdSeats}          compact/>
                        <BucketRow c={C_SHARED}  label="Morning + Evening" n={r.pairSeats}        compact/>
                        <BucketRow c={C_MORNING} label="Morning only"      n={r.morningOnlySeats} compact/>
                        <BucketRow c={C_EVENING} label="Evening only"      n={r.eveningOnlySeats} compact/>
                        <BucketRow c={C_FREE}    label="Nothing booked"    n={r.seatsEmpty}       compact/>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-lma-slate-100 text-[11px] font-extrabold">
                        <span className="text-lma-slate-500">Total</span>
                        <span className="text-lma-slate-900">{r.seats} seats</span>
                      </div>
                      {(r.blockedSeats>0||r.heldSeats>0||r.offboard.total>0)&&(
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] font-bold">
                          {r.blockedSeats>0&&<span className="text-lma-danger">{r.blockedSeats} blocked</span>}
                          {r.heldSeats>0&&<span className="text-lma-warn">{r.heldSeats} held</span>}
                          {r.offboard.total>0&&<span className="text-lma-slate-500">{r.offboard.total} off-chart</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* off-chart footnote */}
          {T.offboard.total>0&&(
            <div className="bg-lma-slate-50 rounded-xl p-3 mt-3">
              <div className="text-[11px] font-extrabold text-lma-slate-800">{T.offboard.total} booking{T.offboard.total===1?"":"s"} off the seat chart</div>
              <div className="text-[10px] font-semibold text-lma-slate-500 mt-0.5 leading-snug">
                {T.offboard.floating} floating · {T.offboard.unassigned} unassigned · {T.offboard.other} other-shift — live and paying, but not sitting on a mapped seat, so they are not part of any occupancy figure.
              </div>
            </div>
          )}
        </div>

        {/* pinned actions */}
        <div className="shrink-0 grid grid-cols-2 gap-2 px-5 py-3 border-t border-lma-slate-100">
          <button onClick={()=>{ navigator.clipboard.writeText(text); showToast("Report copied"); }} className="h-10 rounded-xl bg-lma-primary/10 text-lma-primary font-extrabold text-[12px]">Copy report</button>
          <button onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank")} className="h-10 rounded-xl bg-lma-accent text-white font-extrabold text-[12px]">WhatsApp</button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(sheet, document.body);
}

// ── small parts ──
function MiniCell({n,t}:{n:number;t:string}){
  return (
    <div className="bg-lma-slate-50 rounded-xl px-2 py-1.5">
      <div className="text-[15px] font-extrabold text-lma-slate-800 leading-none">{n}</div>
      <div className="text-[9px] font-bold text-lma-slate-500 mt-1 leading-tight">{t}</div>
    </div>
  );
}
function HeroCell({label,value,sub}:{label:string;value:string;sub?:string}){
  return (
    <div className="bg-white/12 rounded-xl px-2.5 py-2 backdrop-blur-sm">
      <div className="text-[9px] font-bold uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-[17px] font-extrabold leading-none mt-0.5">{value}</div>
      {sub&&<div className="text-[9px] font-semibold opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}
function Block({title,sub,children}:{title:string;sub?:string;children:React.ReactNode}){
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm mb-2">
      <div className="mb-2.5"><div className="text-sm font-extrabold text-lma-slate-900">{title}</div>{sub&&<div className="text-[10px] text-lma-slate-400 font-medium">{sub}</div>}</div>
      {children}
    </div>
  );
}
// five-segment bar — buckets in the same order as the rows beneath it
function BucketBar({r}:{r:OccBase}){
  const tot=Math.max(r.seats,1);
  const seg=(n:number,c:string,k:string)=> n>0
    ? <div key={k} style={{width:`${(n/tot)*100}%`,background:c}}/>
    : null;
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-lma-slate-100">
      {seg(r.fdSeats,C_FULLDAY,"a")}
      {seg(r.pairSeats,C_SHARED,"b")}
      {seg(r.morningOnlySeats,C_MORNING,"c")}
      {seg(r.eveningOnlySeats,C_EVENING,"d")}
      {seg(r.seatsEmpty,C_FREE,"e")}
    </div>
  );
}
function BucketRow({c,label,n,note,compact}:{c:string;label:string;n:number;note?:string;compact?:boolean}){
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:c}}/>
      <span className={`${compact?"text-[11px]":"text-[12px]"} font-bold text-lma-slate-800 shrink-0`}>{label}</span>
      {note&&!compact&&<span className="text-[10px] font-medium text-lma-slate-400 truncate">{note}</span>}
      <span className={`ml-auto ${compact?"text-[12px]":"text-[13px]"} font-extrabold text-lma-slate-900 shrink-0`}>{n}</span>
    </div>
  );
}
function SellRow({n,label,note}:{n:number;label:string;note:string}){
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-10 shrink-0 text-[17px] font-extrabold text-lma-primary leading-none text-right">{n}</span>
      <span className="min-w-0">
        <span className="block text-[12px] font-bold text-lma-slate-800 leading-tight">{label}</span>
        <span className="block text-[10px] font-medium text-lma-slate-400 leading-tight">{note}</span>
      </span>
    </div>
  );
}