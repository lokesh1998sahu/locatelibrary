"use client";
// LMA — a student's booking history (opened from the student window).
// Same data as before (getStudentBookingHistory), same search and paging;
// tapping a booking opens the shared receipt window. New look only.
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLMA } from "./LMAProvider";
import { fmtDMY, daysFromToday } from "../_lib/dates";
import ReceiptModal from "./ReceiptModal";
import SearchBar from "./SearchBar";
import Pager, { PAGE_SIZE } from "./Pager";
import { Chip, Skeleton, cx } from "../_ui/kit";
import { inr } from "../_ui/format";

const API = "/api/lma960805";

interface Receipt {
  receipt_no:string; student_id:string; library:string; branch:string; name:string;
  seat_no:string; shift:string; shift_name:string; shift_time:string;
  booking_from:string; booking_to:string; receipt_date:string; fee:number;
  fees_due_balance:number; type:string; is_cross_library:string;
  status:string; dues_status:string; renewed_from:string; gender:string; cancelled_on:string;
}

// Status badge + the seat chart's colour for the card edge.
function lifecycle(r:Receipt, alertDays:number, hasSuccessor:boolean):{label:string;chip:string;edge:string}{
  const st=(r.status||"").toUpperCase();
  if(st==="RENEWED"||hasSuccessor) return {label:"Renewed",      chip:"bg-lma-bg text-lma-ink-2 ring-1 ring-inset ring-lma-line", edge:"#cbd5e1"};
  if(st==="CANCELLED")             return {label:"Cancelled",    chip:"bg-lma-out-soft text-lma-out",                              edge:"#b42318"};
  if(st==="DO_NOT_RENEW")          return {label:"Do not renew", chip:"bg-lma-warn-soft text-lma-warn-2",                          edge:"#d97706"};
  const days=daysFromToday(r.booking_to);
  if(days===null)     return {label:"Current",  chip:"bg-lma-in-soft text-lma-in",  edge:"#16a34a"};
  if(days<0)          return {label:"Expired",  chip:"bg-[#fbeaea] text-[#6b0a0a]", edge:"#6b0a0a"};
  if(days<=alertDays) return {label:"Expiring", chip:"bg-[#fdecec] text-[#b91c1c]", edge:"#dc2626"};
  return {label:"Current", chip:"bg-lma-in-soft text-lma-in", edge:"#16a34a"};
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
    const row=(init.settings as any)[(r.library||"").toUpperCase()]; if(!row) return def;
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
        <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
        <div role="dialog" aria-modal="true" aria-label="Booking history"
          className="lma-sheet-up relative max-h-[92dvh] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lma-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-lma-float"
          onClick={e=>e.stopPropagation()}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#dfe1ee]"/>

          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[18px] font-bold tracking-[-0.01em] text-lma-ink">Booking history</h3>
              <p className="mt-0.5 truncate text-[12.5px] text-lma-ink-3">{studentName||studentId} · {receipts.length} {receipts.length===1?"booking":"bookings"}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>

          {/* where the bookings were: home library first, then any cross-library ones */}
          <div className="-mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <Chip on={pill==="__HOME__"} onClick={()=>setPill("__HOME__")}>
              <span aria-hidden="true" className="mr-1">🏠</span>{homeLib}
              <span className={cx("ml-1 font-lma-mono text-[12px]", pill==="__HOME__"?"text-white/80":"text-lma-ink-3")}>{homeCount}</span>
            </Chip>
            {crossLocs.length>0&&<span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.06em] text-lma-ink-3">Cross-library</span>}
            {crossLocs.map(loc=>{
              const n=receipts.filter(r=>isCrossRow(r)&&crossKey(r)===loc).length;
              return (
                <Chip key={loc} on={pill===loc} onClick={()=>setPill(loc)}>
                  {loc}<span className={cx("ml-1 font-lma-mono text-[12px]", pill===loc?"text-white/80":"text-lma-ink-3")}>{n}</span>
                </Chip>
              );
            })}
          </div>

          <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} placeholder="Receipt #, seat, shift…" hint="Search by receipt #, seat, shift, or library."/>

          {loading?(
            <div className="space-y-2">{[0,1,2].map(i=><div key={i} className="rounded-[18px] border border-lma-line bg-lma-surface p-3.5"><Skeleton className="h-4 w-32"/><Skeleton className="mt-2 h-3 w-56"/></div>)}</div>
          ):filtered.length===0?(
            <p className="rounded-[18px] border border-lma-line bg-lma-surface px-4 py-8 text-center text-[13.5px] text-lma-ink-3">{search?"No bookings match that search.":"No bookings in this group."}</p>
          ):(
            <div className="space-y-2">
              {filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(r=>{
                const b=lifecycle(r, alertDaysFor(r), successorOf.has(String(r.receipt_no).toUpperCase()));
                return (
                  <button key={r.receipt_no} type="button" onClick={()=>setOpenRno(r.receipt_no)}
                    className="lma-noscale flex w-full overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface text-left shadow-lma-card active:bg-lma-bg">
                    <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background:b.edge }}/>
                    <span className="min-w-0 flex-1 px-3.5 py-3">
                      <span className="flex items-center gap-2">
                        <span className="font-lma-mono text-[15px] font-semibold text-lma-ink">{r.receipt_no}</span>
                        <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-lma-ink-3">{r.type}</span>
                        <span className={cx("ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-bold", b.chip)}>{b.label}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-lma-ink-2">
                        <span className="font-semibold text-lma-ink">Seat {r.seat_no||"—"}</span>
                        <span aria-hidden="true" className="text-lma-ink-3">·</span><span>{r.shift_name||r.shift}</span>
                        {isCrossRow(r)&&<><span aria-hidden="true" className="text-lma-ink-3">·</span><span className="font-semibold text-[#7c3aed]">at {crossKey(r)}</span></>}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-lma-ink-3">
                        <span>{fmtDMY(r.booking_from)} → {fmtDMY(r.booking_to)}</span>
                        <span aria-hidden="true">·</span><span className="font-lma-mono">{inr(r.fee)}</span>
                        {r.fees_due_balance>0&&<span className="rounded-md bg-[#fef3c7] px-1.5 font-lma-mono font-bold text-[#92400e]">{inr(r.fees_due_balance)} due</span>}
                      </span>
                    </span>
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
