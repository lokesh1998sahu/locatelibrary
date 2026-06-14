"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { fmtDMY, daysFromToday } from "../_lib/dates";
import CodePill from "../_components/CodePill";
import ReceiptModal from "../_components/ReceiptModal";
import SearchBar from "../_components/SearchBar";
import Pager from "../_components/Pager";

const API = "/api/lma";

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

type SearchType = "NAME"|"PHONE"|"STUDENT_ID"|"RECEIPT_NO";

function autoDetect(q:string): SearchType {
  const t=q.trim();
  if(!t) return "NAME";
  const s=t.replace(/[\s\-\.\(\)\+]/g,"");
  if(/^R\d+/i.test(t)) return "RECEIPT_NO";
  if(/^F\d+/i.test(t)) return "STUDENT_ID";
  if(/^\d{3,}$/.test(s)) return "PHONE";
  return "NAME";
}
function lifecycleBadge(r:Receipt, alertDays:number, hasSuccessor:boolean):{label:string;cls:string}{
  const st=(r.status||"").toUpperCase();
  if(st==="RENEWED")       return {label:"Renewed",      cls:"bg-lma-slate-200 text-lma-slate-600"};
  if(st==="CANCELLED")     return {label:"Cancelled",    cls:"bg-lma-danger/15 text-lma-danger"};
  if(st==="DO_NOT_RENEW")  return {label:"Do Not Renew", cls:"bg-lma-warn/15 text-lma-warn"};
  // Rule-C orphan recovery — if a successor receipt exists (renewed_from=this), treat as RENEWED.
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
  const [search,setSearch]=useState("");
  const [receipts,setReceipts]=useState<Receipt[]>([]);
  const [page,setPage]=useState(1);
  const [totalPages,setTotalPages]=useState(1);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [openRno,setOpenRno]=useState<string|null>(null);   // receipt_no of the open modal
  

  const load=useCallback(async(pg:number,replace:boolean)=>{
    setLoading(true);
    const q=search.trim();
    const params=new URLSearchParams({action:"getReceiptLog",page:String(pg),limit:"20"});
    if(scope) params.set("library",scope);
    if(q){ params.set("q",q); params.set("search_type",autoDetect(q)); }
    const r=await fetch(`${API}?${params}`).then(r=>r.json());
    setLoading(false);
    if(r.receipts){
      setReceipts(prev=>replace?r.receipts:[...prev,...r.receipts]);
      setTotalPages(r.totalPages||1); setTotal(r.total||0); setPage(pg);
    }
  },[scope,search]);

  // reload on scope change only (search is button/Enter-triggered)
  useEffect(()=>{
    load(1,true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scope]);

  // chips (libraries + branches + an "All")
  const chips = useScopeChips();

  // set of receipt_nos referenced as a predecessor (renewed_from) by another loaded receipt.
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

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Receipts</h1><p className="text-[11px] text-lma-slate-500 font-medium">{total} total</p></div>
        <button onClick={()=>load(1,true)} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {/* scope chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.emoji} {c.label}</button>
        ))}
      </div>

      {/* search */}
      <SearchBar value={search} onChange={setSearch} onSearch={()=>load(1,true)} searching={loading}/>

      {/* list */}
      {loading&&receipts.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):receipts.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">No receipts found.</div>
      ):(
        <div className="space-y-2">
          {receipts.map(r=>{
            const badge=lifecycleBadge(r, alertDaysFor(r), successorOf.has(String(r.receipt_no).toUpperCase()));
            return (
              <button key={r.receipt_no} onClick={()=>setOpenRno(r.receipt_no)} className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99]">
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
            );
          })}
          <Pager page={page} totalPages={totalPages} onPage={(p)=>load(p,true)}/>
        </div>
      )}

      {/* Shared receipt view/edit/history modal — opens from any card */}
      {openRno && <ReceiptModal receiptNo={openRno} onClose={()=>setOpenRno(null)} onSaved={()=>load(1,true)}/>}
    </div>
  );
}