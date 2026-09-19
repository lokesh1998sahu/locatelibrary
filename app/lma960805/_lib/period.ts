// ── SHARED PERIODS + LEDGER LINKS ────────────────────────────────
// Single source for the period pills used by Dashboard and Ledger, and for
// every link into the Ledger (Dashboard figures, Home "Collected", Home card).
// Dates are LOCAL calendar dates (the app runs in IST).

export type Preset = "today"|"week"|"month"|"lastmonth"|"year"|"lastyear";
export type Period = { preset:Preset|"custom"; from:Date; to:Date };
export type LedgerDim = "all"|"bank"|"tag"|"library";
export type LedgerSrc = "RECEIPTS"|"DUES"|"MISC"|"REFUNDS";

export const PRESETS:{k:Preset;label:string}[] = [
  {k:"today",label:"Today"},{k:"week",label:"This Week"},{k:"month",label:"This Month"},
  {k:"lastmonth",label:"Last Month"},{k:"year",label:"This FY"},{k:"lastyear",label:"Last FY"},
];

export function isPreset(v:unknown):v is Preset{ return PRESETS.some(p=>p.k===v); }

export function presetRange(p:Preset):{from:Date;to:Date}{
  const now=new Date(); now.setHours(0,0,0,0);
  const y=now.getFullYear(), m=now.getMonth();
  if(p==="today") return {from:now,to:now};
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