// ── SHARED LMA DATE HELPERS ──────────────────────────────────────
// Single source of truth for date parsing/formatting across /lma960805 pages.
// Display "d-MMM-yyyy" (fmtDMY) + native-picker ISO (toIsoInput) + d-m-yyyy (toDmy).
const _MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const _MONL=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
export function parseAnyDate(v:any):Date|null{
  if(v==null||v==="")return null;
  if(v instanceof Date)return isNaN(v.getTime())?null:v;
  let s=String(v).trim(); if(!s)return null;
  s=s.replace(/\s*\([^)]*\)\s*$/,"").trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1]);
  m=s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})$/);
  if(m){const i=_MONL.indexOf(m[2].slice(0,3).toLowerCase());if(i>=0)return new Date(+m[3],i,+m[1]);}
  const d=new Date(s);return isNaN(d.getTime())?null:d;
}
export function fmtDMY(v:any):string{ const d=parseAnyDate(v); return d?`${d.getDate()}-${_MON[d.getMonth()]}-${d.getFullYear()}`:(v?String(v):""); }
export function toIsoInput(v:any):string{ const d=parseAnyDate(v); return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`:""; }
export function toDmy(v:any):string{ const d=parseAnyDate(v); return d?`${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`:(v?String(v):""); }
export function daysFromToday(v:any):number|null{ const d=parseAnyDate(v); if(!d)return null; const a=new Date(d.getFullYear(),d.getMonth(),d.getDate()); const t=new Date(); const b=new Date(t.getFullYear(),t.getMonth(),t.getDate()); return Math.round((a.getTime()-b.getTime())/86400000); }
// Inclusive day-granular range test. Empty from+to ⇒ no constraint. Unparseable value ⇒ excluded when a range is set.
export function inDateRange(v:any, fromIso:string, toIso:string):boolean{
  if(!fromIso && !toIso) return true;
  const d=parseAnyDate(v); if(!d) return false;
  const t=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  if(fromIso){ const f=parseAnyDate(fromIso); if(f && t < new Date(f.getFullYear(),f.getMonth(),f.getDate()).getTime()) return false; }
  if(toIso){ const e=parseAnyDate(toIso); if(e && t > new Date(e.getFullYear(),e.getMonth(),e.getDate()).getTime()) return false; }
  return true;
}
