"use client";
// LMA — Receipts. Every receipt, searchable, with its lifecycle badge.
// Same data as before (getReceiptLog all=1, filtered here); tapping a card
// opens the shared receipt window.
import WhatsAppButton from "../_components/WhatsAppButton";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { fmtDMY, daysFromToday, inDateRange } from "../_lib/dates";
import { parsePhone10 } from "../_lib/phone";
import ReceiptModal from "../_components/ReceiptModal";
import SearchBar, { autoDetectSearchType } from "../_components/SearchBar";
import DateRangeFilter from "../_components/DateRangeFilter";
import Pager, { PAGE_SIZE } from "../_components/Pager";
import { Screen, Card, ScopeChips, Skeleton, Empty, IconButton, cx } from "../_ui/kit";
import { IconRefresh, IconBook } from "../_ui/icons";
import { inr } from "../_ui/format";

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

// Lifecycle badge + the seat chart's colour for the card edge.
function lifecycle(r:Receipt, alertDays:number, hasSuccessor:boolean):{label:string;chip:string;edge:string}{
  const st=(r.status||"").toUpperCase();
  if(st==="RENEWED"||hasSuccessor) return {label:"Renewed",      chip:"bg-lma-bg text-lma-ink-2 ring-1 ring-inset ring-lma-line", edge:"#cbd5e1"};
  if(st==="CANCELLED")             return {label:"Cancelled",    chip:"bg-lma-out-soft text-lma-out",                              edge:"#b42318"};
  if(st==="DO_NOT_RENEW")          return {label:"Do not renew", chip:"bg-lma-warn-soft text-lma-warn-2",                          edge:"#d97706"};
  const days=daysFromToday(r.booking_to);
  if(days===null)       return {label:"Current",  chip:"bg-lma-in-soft text-lma-in",   edge:"#16a34a"};
  if(days<0)            return {label:"Expired",  chip:"bg-[#fbeaea] text-[#6b0a0a]",  edge:"#6b0a0a"};
  if(days<=alertDays)   return {label:"Expiring", chip:"bg-[#fdecec] text-[#b91c1c]",  edge:"#dc2626"};
  return {label:"Current", chip:"bg-lma-in-soft text-lma-in", edge:"#16a34a"};
}

export default function ReceiptsPage(){
  const { init } = useLMA();
  const [scope,setScope]=useState("");          // library/branch filter, "" = all
  const [draft,setDraft]=useState("");
  const [search,setSearch]=useState("");
  const [dFrom,setDFrom]=useState(""); const [dTo,setDTo]=useState("");
  const [receipts,setReceipts]=useState<Receipt[]>([]);   // ALL rows
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [openRno,setOpenRno]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const params=new URLSearchParams({action:"getReceiptLog",all:"1"});
      const r=await fetch(`${API}?${params}`).then(r=>r.json());
      if(r.receipts){ setReceipts(r.receipts); setPage(1); }
    }catch{ /* keeps what was shown */ }
    setLoading(false); setLoaded(true);
  },[]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ setPage(1); },[search,dFrom,dTo,scope]);

  const chips = useScopeChips();

  // receipt_nos referenced as a predecessor (renewed_from) by another loaded receipt
  const successorOf = useMemo(()=>{
    const s=new Set<string>();
    receipts.forEach(r=>{ if(r.renewed_from) s.add(String(r.renewed_from).toUpperCase()); });
    return s;
  },[receipts]);

  // per-library renewal_alert_days from init.settings; fallback 5
  const alertDaysFor=useCallback((r:Receipt):number=>{
    const def=5;
    if(!init?.settings) return def;
    const row=(init.settings as any)[(r.library||"").toUpperCase()];
    if(!row) return def;
    const v=row["renewal_alert_days"]; const n=Number(v);
    return (v!==undefined&&v!==null&&v!==""&&!isNaN(n)&&n>0)?n:def;
  },[init]);

  // client search (mirrors the server's auto-detect; PHONE searches within phones[])
  const matchesReceipt=useCallback((r:Receipt,q:string):boolean=>{
    const t=q.trim(); if(!t) return true;
    const typ=autoDetectSearchType(t); const Q=t.toUpperCase();
    const seat=String(r.seat_no||"").trim().toUpperCase(); if(seat&&seat===Q) return true;   // exact seat label
    if(typ==="RECEIPT_NO") return String(r.receipt_no||"").toUpperCase().includes(Q);
    if(typ==="STUDENT_ID") return String(r.student_id||"").toUpperCase().includes(Q);
    if(typ==="PHONE"){ const d=parsePhone10(t); return (r.phones||[]).some(p=>parsePhone10(String(p.number||"")).includes(d)); }
    return String(r.name||"").toUpperCase().includes(Q);
  },[]);

  const base=useMemo(()=>receipts.filter(r=>matchesReceipt(r,search)&&inDateRange(r.receipt_date,dFrom,dTo)),[receipts,search,dFrom,dTo,matchesReceipt]);
  const counts=useMemo(()=>{ const m:Record<string,number>={"":base.length}; base.forEach(r=>{ const k=(r.branch||r.library); if(k) m[k]=(m[k]||0)+1; }); return m; },[base]);
  const filtered=useMemo(()=>scope?base.filter(r=>(r.branch||r.library)===scope):base,[base,scope]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const paged=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  return (
    <Screen>
      <header className="flex items-start gap-2 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Receipts</h1>
          <p className="mt-0.5 text-[12.5px] text-lma-ink-3">{filtered.length} {filtered.length===1?"receipt":"receipts"}{search?` matching “${search}”`:""}</p>
        </div>
        <IconButton label="Refresh" onClick={load} className="-mr-2"><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>
      </header>

      <ScopeChips chips={chips} value={scope} onChange={setScope} counts={counts}/>
      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      <DateRangeFilter from={dFrom} to={dTo} onChange={(f,t)=>{setDFrom(f);setDTo(t);setPage(1);}} className="mb-3"/>

      {!loaded||(loading&&receipts.length===0) ? (
        <div className="space-y-2">{[0,1,2,3].map(i=><Card key={i}><Skeleton className="h-4 w-40"/><Skeleton className="mt-2 h-3 w-56"/></Card>)}</div>
      ) : filtered.length===0 ? (
        <Card><Empty icon={<IconBook size={22}/>} title="No receipts found" body={search||dFrom||dTo?"Try another search or date range.":undefined}/></Card>
      ) : (
        <div className="space-y-2 pb-4">
          {paged.map(r=>{
            const b=lifecycle(r, alertDaysFor(r), successorOf.has(String(r.receipt_no).toUpperCase()));
            return (
              <div key={r.receipt_no} className="flex overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
                <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background:b.edge }}/>
                <button type="button" onClick={()=>setOpenRno(r.receipt_no)} className="lma-noscale min-w-0 flex-1 px-3.5 py-3 text-left active:bg-lma-bg">
                  <div className="flex items-center gap-2">
                    <span className="font-lma-mono text-[14px] font-semibold text-lma-ink">{r.receipt_no}</span>
                    <span className="font-lma-mono text-[12px] text-lma-ink-3">{r.student_id}</span>
                    <span className={cx("ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-bold", b.chip)}>{b.label}</span>
                  </div>
                  <div className="mt-1 truncate text-[15px] font-semibold text-lma-ink">{r.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-lma-ink-3">
                    <span className="font-semibold text-lma-ink-2">{r.branch||r.library}</span>
                    <span aria-hidden="true">·</span><span>Seat {r.seat_no||"—"}</span>
                    <span aria-hidden="true">·</span><span>{r.shift_name||r.shift}</span>
                    <span aria-hidden="true">·</span><span>till {fmtDMY(r.booking_to)}</span>
                    {r.fees_due_balance>0&&<span className="rounded-md bg-[#fef3c7] px-1.5 font-lma-mono font-bold text-[#92400e]">{inr(r.fees_due_balance)} due</span>}
                  </div>
                </button>
                <div className="flex shrink-0 items-center pr-3">
                  <WhatsAppButton phones={r.phones} chat label="WhatsApp" className="h-9 rounded-full bg-[#e3f6ec] px-3 text-[12.5px] font-semibold text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8] disabled:opacity-40"/>
                </div>
              </div>
            );
          })}
          <Pager page={page} totalPages={totalPages} onPage={setPage}/>
        </div>
      )}

      {openRno && <ReceiptModal receiptNo={openRno} onClose={()=>setOpenRno(null)} onSaved={()=>load()}/>}
    </Screen>
  );
}
