"use client";

import WhatsAppButton from "../_components/WhatsAppButton";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { fmtDMY, daysFromToday, inDateRange } from "../_lib/dates";
import { parsePhone10 } from "../_lib/phone";
import CodePill from "../_components/CodePill";
import ReceiptModal from "../_components/ReceiptModal";
import SearchBar, { autoDetectSearchType } from "../_components/SearchBar";
import DateRangeFilter from "../_components/DateRangeFilter";
import Pager, { PAGE_SIZE } from "../_components/Pager";

const API = "/api/lma960805";

interface PhoneEntry { number:string; tag:string; }
interface Receipt {
  receipt_no:string; student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[];
  seat_no:string; shift:string; shift_name:string; shift_time:string;
  booking_from:string; booking_to:string; receipt_date:string; fee:number;
  pay_mode_1:string; pay_amount_1:number; pay_mode_2:string; pay_amount_2:number; pay_mode_3:string; pay_amount_3:number;
  fees_due:number; fees_due_balance:number; type:string; is_cross_library:string;
  status:string; dues_status:string; renewed_from:string;
  receipt_text:string; registration_text:string;
}

function homeLib(r:Receipt){ return (r.is_cross_library && r.is_cross_library!=="NO") ? String(r.is_cross_library) : (r.branch||r.library); }
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

export default function ReceiptsPage(){
  const { init } = useLMA();

  const [scope,setScope]=useState("");          // library/branch filter, "" = all
  const [draft,setDraft]=useState("");
  const [search,setSearch]=useState("");
  const [dFrom,setDFrom]=useState(""); const [dTo,setDTo]=useState("");
  const [receipts,setReceipts]=useState<Receipt[]>([]);   // ALL rows for the current scope
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(false);
  const [openRno,setOpenRno]=useState<string|null>(null); // receipt_no of the open modal

  // scope is server-side (one library at a time); search + date + pagination are client-side.
  const load=useCallback(async()=>{
    setLoading(true);
    const params=new URLSearchParams({action:"getReceiptLog",all:"1"});
    // scope filtered client-side for B4 counts
    const r=await fetch(`${API}?${params}`).then(r=>r.json());
    setLoading(false);
    if(r.receipts){ setReceipts(r.receipts); setPage(1); }
  },[]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[search,dFrom,dTo,scope]);

  const chips = useScopeChips();

  // receipt_nos referenced as a predecessor (renewed_from) by another loaded receipt.
  const successorOf = useMemo(()=>{
    const s=new Set<string>();
    receipts.forEach(r=>{ if(r.renewed_from) s.add(String(r.renewed_from).toUpperCase()); });
    return s;
  },[receipts]);

  // per-library renewal_alert_days from init.settings; fallback 5.
  const alertDaysFor=useCallback((r:Receipt):number=>{
    const def=5;
    if(!init?.settings) return def;
    const key=(r.library||"").toUpperCase();
    const row=init.settings[key];
    if(!row) return def;
    const v=row["renewal_alert_days"];
    const n=Number(v);
    return (v!==undefined&&v!==null&&v!==""&&!isNaN(n)&&n>0)?n:def;
  },[init]);

  // client search (mirrors server auto-detect; PHONE searches within phones[])
  const matchesReceipt=useCallback((r:Receipt,q:string):boolean=>{
    const t=q.trim(); if(!t) return true;
    const typ=autoDetectSearchType(t); const Q=t.toUpperCase();
    if(typ==="RECEIPT_NO") return String(r.receipt_no||"").toUpperCase().includes(Q);
    if(typ==="STUDENT_ID") return String(r.student_id||"").toUpperCase().includes(Q);
    if(typ==="PHONE"){ const d=parsePhone10(t); return (r.phones||[]).some(p=>parsePhone10(String(p.number||"")).includes(d)); }
    return String(r.name||"").toUpperCase().includes(Q);
  },[]);

  const base=useMemo(
    ()=>receipts.filter(r=>matchesReceipt(r,search)&&inDateRange(r.receipt_date,dFrom,dTo)),
    [receipts,search,dFrom,dTo,matchesReceipt]
  );
  const counts=useMemo(()=>{ const m:Record<string,number>={}; base.forEach(r=>{ const k=homeLib(r); if(k) m[k]=(m[k]||0)+1; }); return m; },[base]);
  const filtered=useMemo(()=>scope?base.filter(r=>homeLib(r)===scope):base,[base,scope]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const paged=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma960805" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Receipts</h1><p className="text-[11px] text-lma-slate-500 font-medium">{filtered.length} total</p></div>
        <button onClick={()=>load()} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {/* scope chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.emoji} {c.label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${scope===c.code?"bg-white/25 text-white":"bg-lma-slate-100 text-lma-slate-500"}`}>{c.code?(counts[c.code]||0):base.length}</span></button>
        ))}
      </div>

      {/* search + date range */}
      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      <DateRangeFilter from={dFrom} to={dTo} onChange={(f,t)=>{setDFrom(f);setDTo(t);setPage(1);}} className="mb-3"/>

      {/* list */}
      {loading&&receipts.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):filtered.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">No receipts found.</div>
      ):(
        <div className="space-y-2">
          {paged.map(r=>{
            const badge=lifecycleBadge(r, alertDaysFor(r), successorOf.has(String(r.receipt_no).toUpperCase()));
            return (
              <div key={r.receipt_no} className="flex items-stretch gap-1 bg-white rounded-xl shadow-sm hover:shadow-md">
                <button onClick={()=>setOpenRno(r.receipt_no)} className="flex-1 min-w-0 text-left p-3 active:scale-[0.99]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-extrabold text-lma-slate-900">{r.receipt_no}</span>
                    <span className="text-[10px] font-bold text-lma-slate-400">{r.student_id}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="text-sm font-semibold text-lma-slate-800 truncate">{r.name}</div>
                  <div className="text-[11px] text-lma-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                    <CodePill code={r.branch||r.library}/>
                    <span>· Seat {r.seat_no||"—"}</span>
                    <span>· {r.shift_name||r.shift}</span>
                    <span>· till {fmtDMY(r.booking_to)}</span>
                    {r.fees_due_balance>0&&<span className="font-bold text-lma-danger">· Due ₹{r.fees_due_balance}</span>}
                  </div>
                </button>
                <div className="flex items-center pr-2 shrink-0"><WhatsAppButton phones={r.phones} className="px-2.5 py-2 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs disabled:opacity-40"/></div>
              </div>
            );
          })}
          <Pager page={page} totalPages={totalPages} onPage={setPage}/>
        </div>
      )}

      {/* Shared receipt view/edit/history modal — opens from any card */}
      {openRno && <ReceiptModal receiptNo={openRno} onClose={()=>setOpenRno(null)} onSaved={()=>load()}/>}
    </div>
  );
}