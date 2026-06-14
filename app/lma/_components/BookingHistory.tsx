import { useState, useEffect, useMemo, useCallback } from "react";
import { useLMA } from "./LMAProvider";
import { fmtDMY, daysFromToday } from "../_lib/dates";
import { genderCardStyle } from "../_lib/genderTheme";
import ReceiptModal from "./ReceiptModal";
import CodePill from "./CodePill";
import SearchBar from "./SearchBar";
import Pager, { PAGE_SIZE } from "./Pager";

const API = "/api/lma";

interface Receipt {
  receipt_no:string; student_id:string; library:string; branch:string; name:string;
  seat_no:string; shift:string; shift_name:string; shift_time:string;
  booking_from:string; booking_to:string; receipt_date:string; fee:number;
  fees_due_balance:number; type:string; is_cross_library:string;
  status:string; dues_status:string; renewed_from:string; gender:string; cancelled_on:string;
}

function lifecycleBadge(r:Receipt, alertDays:number, hasSuccessor:boolean):{label:string;cls:string}{
  const st=(r.status||"").toUpperCase();
  if(st==="RENEWED")       return {label:"Renewed",      cls:"bg-lma-slate-200 text-lma-slate-600"};
  if(st==="CANCELLED")     return {label:"Cancelled",    cls:"bg-lma-danger/15 text-lma-danger"};
  if(st==="DO_NOT_RENEW")  return {label:"Do Not Renew", cls:"bg-lma-warn/15 text-lma-warn"};
  if(hasSuccessor)         return {label:"Renewed",      cls:"bg-lma-slate-200 text-lma-slate-600"};
  const days=daysFromToday(r.booking_to);
  if(days===null) return {label:"Current", cls:"bg-lma-accent/15 text-lma-accent"};
  if(days<0)      return {label:"Expired", cls:"bg-red-900/15 text-red-900"};
  if(days<=alertDays) return {label:"Expiring",cls:"bg-lma-danger/15 text-lma-danger"};
  return {label:"Current", cls:"bg-lma-accent/15 text-lma-accent"};
}

export default function BookingHistory({ studentId, homeLib, studentName, onClose }:{
  studentId:string; homeLib:string; studentName?:string; onClose:()=>void;
}){
  const { init } = useLMA();
  const [receipts,setReceipts]=useState<Receipt[]>([]);
  const [loading,setLoading]=useState(true);
  const [pill,setPill]=useState<string>("__HOME__");
  const [openRno,setOpenRno]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  const [draft,setDraft]=useState("");
  const [page,setPage]=useState(1);

  const load=useCallback(async(silent?:boolean)=>{
    if(!silent) setLoading(true);
    try{
      const qs=new URLSearchParams({ action:"getStudentBookingHistory", student_id:studentId, home_library:homeLib });
      const r=await fetch(`${API}?${qs}`).then(x=>x.json());
      setReceipts((r&&r.receipts)||[]);
    }catch{ setReceipts([]); }
    if(!silent) setLoading(false);
  },[studentId,homeLib]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[pill,search]);

  const isCrossRow=(r:Receipt)=>{ const c=(r.is_cross_library||"").toUpperCase(); return !!c && c!=="NO"; };
  const crossKey=(r:Receipt)=> (r.branch||r.library||"").toUpperCase();

  const crossLocs=useMemo(()=>{
    const seen:string[]=[];
    receipts.forEach(r=>{ if(isCrossRow(r)){ const k=crossKey(r); if(k&&seen.indexOf(k)<0) seen.push(k); } });
    return seen;
  },[receipts]);

  const successorOf=useMemo(()=>{ const s=new Set<string>(); receipts.forEach(r=>{ if(r.renewed_from) s.add(String(r.renewed_from).toUpperCase()); }); return s; },[receipts]);

  const alertDaysFor=useCallback((r:Receipt):number=>{
    const def=5; if(!init?.settings) return def;
    const row=init.settings[(r.library||"").toUpperCase()]; if(!row) return def;
    const v=row["renewal_alert_days"]; const n=Number(v);
    return (v!==undefined&&v!==null&&v!==""&&!isNaN(n)&&n>0)?n:def;
  },[init]);

  const homeCount=useMemo(()=>receipts.filter(r=>!isCrossRow(r)).length,[receipts]);
  const shown=useMemo(()=>{
    if(pill==="__HOME__") return receipts.filter(r=>!isCrossRow(r));
    return receipts.filter(r=>isCrossRow(r)&&crossKey(r)===pill);
  },[receipts,pill]);
  const filtered=useMemo(()=>{
    const q=search.trim().toUpperCase();
    if(!q) return shown;
    return shown.filter(r=>(
      (r.receipt_no||"").toUpperCase().indexOf(q)>=0 ||
      (r.seat_no||"").toUpperCase().indexOf(q)>=0 ||
      (r.shift_name||r.shift||"").toUpperCase().indexOf(q)>=0 ||
      (r.library||"").toUpperCase().indexOf(q)>=0 ||
      (r.branch||"").toUpperCase().indexOf(q)>=0
    ));
  },[shown,search]);

  return (
    <>
      <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
        <div className="relative w-full max-w-md bg-lma-slate-50 rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
          <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-base font-extrabold text-lma-slate-900">Booking History</h3>
              <p className="text-xs text-lma-slate-500">{studentName||studentId} · {receipts.length} booking{receipts.length===1?"":"s"}</p>
            </div>
            <button onClick={onClose} className="text-lma-slate-400 text-2xl leading-none -mt-1">×</button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3 items-center">
            <button onClick={()=>setPill("__HOME__")} className="inline-flex items-center gap-1 active:scale-95"><span className="text-xs" title="Home library">🏠</span><CodePill code={homeLib} active={pill==="__HOME__"}/><span className="text-[10px] font-bold text-lma-slate-400">({homeCount})</span></button>
            {crossLocs.length>0 && <span className="text-[10px] font-bold text-lma-slate-400 ml-1">Cross Library:</span>}
            {crossLocs.map(loc=>{
              const n=receipts.filter(r=>isCrossRow(r)&&crossKey(r)===loc).length;
              return <button key={loc} onClick={()=>setPill(loc)} className="inline-flex items-center gap-1 active:scale-95"><CodePill code={loc} active={pill===loc}/><span className="text-[10px] font-bold text-lma-slate-400">({n})</span></button>;
            })}
          </div>

          <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} placeholder="Search receipt #, seat, shift…" hint="Search by receipt #, seat, shift, or library."/>
          {loading?(
            <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
          ):filtered.length===0?(
            <div className="text-center text-sm text-lma-slate-500 py-8">No bookings in this group.</div>
          ):(
            <div className="space-y-2">
              {filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(r=>{
                const badge=lifecycleBadge(r, alertDaysFor(r), successorOf.has(String(r.receipt_no).toUpperCase()));
                return (
                  <button key={r.receipt_no} onClick={()=>setOpenRno(r.receipt_no)} className="w-full text-left rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99]" style={genderCardStyle(r.gender)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-extrabold text-lma-slate-900">{r.receipt_no}</span>
                      <span className="text-[10px] font-bold text-lma-slate-400">{r.type}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="text-[11px] text-lma-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                      <span>Seat {r.seat_no||"—"}</span>
                      <span>· {r.shift_name||r.shift}</span>
                      <span>· {fmtDMY(r.booking_from)} → {fmtDMY(r.booking_to)}</span>
                      <span>· ₹{r.fee}</span>
                      {r.fees_due_balance>0&&<span className="font-bold text-lma-danger">· Due ₹{r.fees_due_balance}</span>}
                    </div>
                  </button>
                );
              })}
              <Pager page={page} totalPages={Math.max(1,Math.ceil(filtered.length/PAGE_SIZE))} onPage={setPage}/>
            </div>
          )}
        </div>
      </div>

      {openRno && <ReceiptModal receiptNo={openRno} onClose={()=>setOpenRno(null)} onSaved={()=>load(true)}/>}
    </>
  );
}