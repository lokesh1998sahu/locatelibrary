// ── SHARED PERIODS + LEDGER LINKS ────────────────────────────────
// Single source for the period pills used by Dashboard and Ledger, and for
// every link into the Ledger (Dashboard figures, Home "Collected", Home card).
// Dates are LOCAL calendar dates (the app runs in IST).

export type Preset = "today"|"yesterday"|"week"|"month"|"lastmonth"|"year"|"lastyear"|"all";
// "day" = one chosen date (the "Other date" chip); "mon" = one chosen month (the
// "Other Month" chip); "custom" = a from–to range.
export type Period = { preset:Preset|"custom"|"day"|"mon"; from:Date; to:Date };
export type LedgerDim = "all"|"bank"|"tag"|"library";
export type LedgerSrc = "RECEIPTS"|"DUES"|"MISC"|"REFUNDS"|"PAST";

export const PRESETS:{k:Preset;label:string}[] = [
  {k:"today",label:"Today"},{k:"yesterday",label:"Yesterday"},{k:"week",label:"This Week"},{k:"month",label:"This Month"},
  {k:"year",label:"This FY"},{k:"lastyear",label:"Last FY"},{k:"all",label:"All time"},
];

// "All time" skips dates: it asks for everything from the first day LMA could
// hold to far ahead (so credits landing after today are in too).
export const ALL_FROM = new Date(2000, 0, 1);
export const ALL_TO = new Date(2099, 11, 31);

// "lastmonth" has no chip any more (the Other Month chip covers it) but old links still open it.
export function isPreset(v:unknown):v is Preset{ return v==="lastmonth" || PRESETS.some(p=>p.k===v); }

/** The month a period stands for when it is one whole month ("mon", or an old "lastmonth"), else null. */
export function monthOf(p:Period):Date|null{ return p.preset==="mon"||p.preset==="lastmonth" ? p.from : null; }
/** Every month from last month back, newest first (for the Other Month list). */
export function pastMonths(count=36):Date[]{
  const n=new Date(); const out:Date[]=[];
  for(let i=1;i<=count;i++) out.push(new Date(n.getFullYear(), n.getMonth()-i, 1));
  return out;
}
/** A whole month as a period. */
export function monthPeriod(first:Date):Period{
  return { preset:"mon", from:new Date(first.getFullYear(), first.getMonth(), 1), to:new Date(first.getFullYear(), first.getMonth()+1, 0) };
}

export function presetRange(p:Preset):{from:Date;to:Date}{
  const now=new Date(); now.setHours(0,0,0,0);
  const y=now.getFullYear(), m=now.getMonth();
  if(p==="today") return {from:now,to:now};
  if(p==="yesterday"){ const d=new Date(now); d.setDate(d.getDate()-1); return {from:d,to:d}; }
  if(p==="all") return {from:new Date(ALL_FROM),to:new Date(ALL_TO)};
  if(p==="week"){ const d=new Date(now); const dow=(d.getDay()+6)%7; d.setDate(d.getDate()-dow); return {from:d,to:now}; } // Mon-start
  if(p==="month") return {from:new Date(y,m,1),to:now};
  if(p==="lastmonth") return {from:new Date(y,m-1,1),to:new Date(y,m,0)};
  // Indian FY: 1 Apr – 31 Mar
  if(p==="year"){ const fy=m>=3?y:y-1; return {from:new Date(fy,3,1),to:now}; }
  const fy=(m>=3?y:y-1)-1; return {from:new Date(fy,3,1),to:new Date(fy+1,2,31)};
}

export function periodOf(p:Preset):Period{ const r=presetRange(p); return {preset:p,from:r.from,to:r.to}; }

const pad=(n:number)=>("0"+n).slice(-2);
/** d-m-yyyy — the format the API takes */
export const dmyOf=(d:Date)=>`${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`;
/** yyyy-mm-dd — the format native date inputs take */
export const isoOf=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
/** yyyy-mm-dd (from a date input) → local Date, or null */
export function localFromIso(v:string):Date|null{
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||""); if(!m) return null;
  const d=new Date(+m[1],+m[2]-1,+m[3]); return isNaN(d.getTime())?null:d;
}

/** Words for a period where the screen names it ("today", "yesterday", "all time"), else null. */
const _MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/** "24 Sep 2026" */
export const dayName=(d:Date)=>`${d.getDate()} ${_MON[d.getMonth()]} ${d.getFullYear()}`;
export function periodWords(p:Period):string|null{
  if(p.preset==="day") return `on ${dayName(p.from)}`;
  if(p.preset==="mon"||p.preset==="lastmonth") return `in ${_MON[p.from.getMonth()]} ${p.from.getFullYear()}`;
  return p.preset==="today"?"today":p.preset==="yesterday"?"yesterday":p.preset==="all"?"all time":null;
}

/** Link into the Ledger. from/to always travel with the link, so the Ledger
 *  opens on exactly the range of the figure that was tapped. */
export function ledgerHref(o:{dim?:LedgerDim;key?:string;period?:Period;lib?:string;src?:LedgerSrc}):string{
  const q=new URLSearchParams();
  q.set("dim",o.dim||"all");
  if(o.key) q.set("key",o.key);
  if(o.period){
    q.set("from",dmyOf(o.period.from)); q.set("to",dmyOf(o.period.to));
    if(o.period.preset!=="custom") q.set("p",o.period.preset);
  }
  if(o.lib) q.set("lib",o.lib);
  if(o.src) q.set("src",o.src);
  return `/lma960805/dashboard/ledger?${q.toString()}`;
}