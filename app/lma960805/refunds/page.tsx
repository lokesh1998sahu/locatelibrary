"use client";
// LMA — Refunds. Money handed back, against a receipt.
// Same data and actions as before (getRefundLog · issueRefund · updateRefund ·
// deleteRefund; receipts found with getReceiptLog). New look: a total card,
// refunds grouped by day, keypad + tag chips when issuing or editing.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { fmtDMY, fmtDMYT, toIsoInput, inDateRange } from "../_lib/dates";
import ReceiptModal from "../_components/ReceiptModal";
import StudentModal from "../_components/StudentModal";
import SearchBar, { matchesSearch } from "../_components/SearchBar";
import DateRangeFilter from "../_components/DateRangeFilter";
import { BankCheck, TagBankNote, TagChips } from "../_components/TagBank";
import {
  Screen, Card, Chip, ScopeChips, Sheet, Button, Skeleton, Empty, IconButton, AmountPad, DateChips, TextInput, inputCls, cx,
} from "../_ui/kit";
import { IconRefresh, IconUndo, IconPlus, IconSearch } from "../_ui/icons";
import { inr, todayIso, shiftIso, dayLabel } from "../_ui/format";

const API = "/api/lma960805";

// REFUND_LOG headers (exact, 16): s_no, refund_id, original_receipt_no, student_id,
//   library, branch, name, phone, refund_mode, refund_fees_mode, amount, refund_date,
//   refund_reason, linked_to_cancellation, timestamp, refund_whatsapp_text
interface Refund {
  s_no:number; refund_id:string; original_receipt_no:string; student_id:string;
  library:string; branch:string; name:string; phone:string;
  refund_mode:string; refund_fees_mode:string; amount:number; refund_date:string;
  refund_reason:string; linked_to_cancellation:boolean; timestamp:string; refund_whatsapp_text:string;
  seat_no?:string;
}
type LinkFilter = "ANY"|"TRUE"|"FALSE";

function homeLib(it:any){ return (it.is_cross_library && it.is_cross_library!=="NO") ? it.is_cross_library : (it.branch||it.library); }
const daysAgo = (iso:string) => Math.round((new Date(todayIso()+"T00:00:00").getTime()-new Date(iso+"T00:00:00").getTime())/86400000);
const keyRules = (s:string,k:string) => { if(k==="<") return s.slice(0,-1); if(k==="."&&s.includes(".")) return s; if(s.replace(".","").length>=8) return s; return (s+k).replace(/^0(?=\d)/,""); };
const dmyOf = (iso:string) => { const d=new Date(iso+"T00:00:00"); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; };

export default function RefundsPage(){
  const { init, showToast, post, confirm: ask } = useLMA();
  const [openRno,setOpenRno]=useState<string|null>(null);
  const [openStu,setOpenStu]=useState<{ id:string; library:string }|null>(null);
  const [scope,setScope]=useState("");
  const [linkFilter,setLinkFilter]=useState<LinkFilter>("ANY");
  const [dFrom,setDFrom]=useState(""); const [dTo,setDTo]=useState("");
  const [refunds,setRefunds]=useState<Refund[]>([]);
  const [draft,setDraft]=useState("");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [issuing,setIssuing]=useState(false);
  const [editFor,setEditFor]=useState<Refund|null>(null);
  const [viewFor,setViewFor]=useState<Refund|null>(null);
  const [resultText,setResultText]=useState<{title:string;text:string}|null>(null);
  const [openDays,setOpenDays]=useState<Record<string,boolean>>({});

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const p=new URLSearchParams();
      p.set("all","1");   // all scopes; filtered here
      if(linkFilter!=="ANY") p.set("linked_to_cancellation",linkFilter);
      p.set("page","1"); p.set("limit","100");
      const r=await fetch(`${API}?action=getRefundLog&${p}`).then(r=>r.json());
      const raw:any[]=r.refunds||[];
      setRefunds(raw.map((x:any)=>({
        s_no:Number(x.s_no||0), refund_id:String(x.refund_id||""), original_receipt_no:String(x.original_receipt_no||""),
        seat_no:String(x.seat_no||""), student_id:String(x.student_id||""), library:String(x.library||""), branch:String(x.branch||""),
        name:String(x.name||""), phone:String(x.phone||""), refund_mode:String(x.refund_mode||""), refund_fees_mode:String(x.refund_fees_mode||""),
        amount:Number(x.amount||0), refund_date:String(x.refund_date||""), refund_reason:String(x.refund_reason||""),
        linked_to_cancellation:!!x.linked_to_cancellation, timestamp:String(x.timestamp||""), refund_whatsapp_text:String(x.refund_whatsapp_text||""),
      })));
    }catch{ showToast("Couldn’t load refunds","error"); }
    setLoading(false); setLoaded(true);
  },[linkFilter,showToast]);
  useEffect(()=>{ load(); },[linkFilter,load]);

  const chips = useScopeChips();
  const base=refunds.filter(r=>matchesSearch({...r, receipt_no:r.original_receipt_no}, search) && inDateRange(r.refund_date,dFrom,dTo));
  const counts:Record<string,number>={"":base.length}; base.forEach(r=>{ const k=homeLib(r); if(k) counts[k]=(counts[k]||0)+1; });
  const refundsF=scope?base.filter(r=>homeLib(r)===scope):base;
  const total=refundsF.reduce((s,r)=>s+r.amount,0);

  const days=useMemo(()=>{
    const m=new Map<string,Refund[]>();
    [...refundsF].sort((a,b)=>toIsoInput(b.refund_date).localeCompare(toIsoInput(a.refund_date))||b.s_no-a.s_no)
      .forEach(r=>{ const k=toIsoInput(r.refund_date)||"—"; if(!m.has(k)) m.set(k,[]); m.get(k)!.push(r); });
    return [...m.entries()];
  },[refundsF]);

  const del=async(r:Refund)=>{
    if(!(await ask({ title:`Delete refund ${r.refund_id}?`, body:"This can’t be undone.", confirmLabel:"Delete refund", danger:true }))) return;
    const x=await post("deleteRefund",{refund_id:r.refund_id});
    if(x){ setViewFor(null); showToast("Refund deleted"); load(); }
  };

  return (
    <Screen>
      <header className="flex items-start gap-2 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Refunds</h1>
          <p className="mt-0.5 text-[12.5px] text-lma-ink-3">Money handed back, against a receipt</p>
        </div>
        <IconButton label="Refresh" onClick={load} className="-mr-2"><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>
      </header>

      <ScopeChips chips={chips} value={scope} onChange={setScope} counts={counts}/>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {(["ANY","TRUE","FALSE"] as LinkFilter[]).map(f=>(
          <Chip key={f} on={linkFilter===f} onClick={()=>setLinkFilter(f)}>{f==="ANY"?"All":f==="TRUE"?"From cancellation":"Standalone"}</Chip>
        ))}
      </div>

      <section className="mb-3 rounded-[22px] p-5 text-white"
        style={{ background:"radial-gradient(120% 90% at 0% 0%, rgb(255 255 255 / .18), transparent 55%), linear-gradient(160deg,#dc2626 0%,#b42318 55%,#7a1414 100%)", boxShadow:"0 22px 44px -22px rgb(122 20 20 / .7)" }}>
        <div className="text-[13px] font-semibold text-white/80">Refunded{scope?` · ${scope}`:""}</div>
        <div className="mt-1 font-lma-mono text-[32px] font-medium leading-none tracking-[-0.02em]">{inr(total)}</div>
        <div className="mt-1.5 text-[12px] text-white/80">{refundsF.length} {refundsF.length===1?"refund":"refunds"}</div>
      </section>

      <Button size="lg" full className="mb-3" onClick={()=>setIssuing(true)}><IconPlus size={18}/> Issue refund</Button>

      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      <DateRangeFilter from={dFrom} to={dTo} onChange={(f,t)=>{setDFrom(f);setDTo(t);}} className="mb-3"/>

      {!loaded||(loading&&refunds.length===0) ? (
        <Card pad={false}>{[0,1,2].map(i=><div key={i} className={cx("flex items-center gap-3 px-4 py-4",i<2&&"border-b border-lma-line")}><div className="flex-1"><Skeleton className="h-4 w-32"/><Skeleton className="mt-2 h-3 w-24"/></div><Skeleton className="h-4 w-16"/></div>)}</Card>
      ) : refundsF.length===0 ? (
        <Card><Empty icon={<IconUndo size={22}/>} title="No refunds found"/></Card>
      ) : (
        <div className="space-y-4 pb-4">
          {days.length>1&&(
            <div className="flex justify-end gap-3 px-1">
              <button type="button" onClick={()=>setOpenDays(Object.fromEntries(days.map(([d])=>[d,true])))} className="text-[12.5px] font-semibold text-lma-brand">Expand all</button>
              <button type="button" onClick={()=>setOpenDays(Object.fromEntries(days.map(([d])=>[d,false])))} className="text-[12.5px] font-semibold text-lma-brand">Collapse all</button>
            </div>
          )}
          {days.map(([iso,list],di)=>{
            const tot=list.reduce((s,r)=>s+r.amount,0); const open=openDays[iso]??(di===0);
            return (
              <section key={iso}>
                <button type="button" onClick={()=>setOpenDays(o=>({...o,[iso]:!open}))} aria-expanded={open}
                  className="lma-noscale mb-1.5 flex min-h-[40px] w-full items-center gap-2 rounded-[12px] px-1 text-left">
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
                    className="shrink-0 text-lma-ink-3 transition" style={{transform:open?"rotate(90deg)":"none"}}><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>
                  <h2 className="flex-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{iso==="—"?"No date":dayLabel(iso)} <span className="font-semibold normal-case tracking-normal">· {list.length}</span></h2>
                  <span className="font-lma-mono text-[12.5px] font-semibold text-lma-out">−{inr(tot)}</span>
                </button>
                {open&&(
                  <div className="divide-y divide-lma-line overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
                    {list.map(r=>(
                      <button key={r.refund_id} type="button" onClick={()=>setViewFor(r)} className="lma-noscale flex min-h-[62px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-lma-bg">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-semibold text-lma-ink">{r.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-lma-ink-3">
                            <span className="font-semibold text-lma-ink-2">{r.branch||r.library}</span><span aria-hidden="true">·</span>
                            <span className="font-lma-mono">{r.original_receipt_no}</span><span aria-hidden="true">·</span><span>{r.refund_mode}</span>
                            <span className={cx("rounded px-1 text-[10.5px] font-bold", r.linked_to_cancellation?"bg-lma-out-soft text-lma-out":"bg-lma-bg text-lma-ink-3")}>{r.linked_to_cancellation?"Cancellation":"Standalone"}</span>
                          </span>
                        </span>
                        <span className="shrink-0 font-lma-mono text-[15px] font-semibold text-lma-out">−{inr(r.amount)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={issuing&&!!init} onClose={()=>setIssuing(false)} title="Issue refund">
        {issuing&&<IssueForm post={post} onDone={(text)=>{ setIssuing(false); if(text) setResultText({title:"Refund confirmation",text}); showToast("Refund issued"); load(); }}/>}
      </Sheet>

      <Sheet open={!!viewFor} onClose={()=>setViewFor(null)} title={viewFor?viewFor.refund_id:""}>
        {viewFor&&(
          <div className="pb-2">
            <div className="mb-3 text-center">
              <div className="font-lma-mono text-[28px] font-semibold text-lma-out">−{inr(viewFor.amount)}</div>
              <div className="mt-0.5 text-[13px] text-lma-ink-2">{viewFor.name}</div>
            </div>
            <div className="divide-y divide-lma-line overflow-hidden rounded-[16px] border border-lma-line bg-lma-surface">
              {([["Paid by",`${viewFor.refund_mode}${viewFor.refund_fees_mode?` · ${viewFor.refund_fees_mode}`:""}`],["Date",fmtDMYT(viewFor.refund_date)],["Library",viewFor.branch||viewFor.library],
                 ["Type",viewFor.linked_to_cancellation?"From cancellation":"Standalone"],...(viewFor.refund_reason?[["Reason",viewFor.refund_reason]]:[])] as [string,string][]).map(([k,v])=>(
                <div key={k} className="flex min-h-[46px] items-center gap-3 px-3.5 py-2"><span className="w-20 shrink-0 text-[12.5px] text-lma-ink-3">{k}</span><span className="min-w-0 flex-1 text-right text-[14px] font-semibold text-lma-ink">{v}</span></div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={()=>{ const r=viewFor; setViewFor(null); setOpenRno(r.original_receipt_no); }} className="inline-flex h-9 items-center rounded-[10px] bg-lma-bg px-3 font-lma-mono text-[12.5px] font-semibold text-lma-ink ring-1 ring-inset ring-lma-line">{viewFor.original_receipt_no} ↗</button>
              <button type="button" onClick={()=>{ const r=viewFor; setViewFor(null); setOpenStu({id:r.student_id,library:homeLib(r)}); }} className="inline-flex h-9 items-center rounded-[10px] bg-lma-bg px-3 font-lma-mono text-[12.5px] font-semibold text-lma-ink ring-1 ring-inset ring-lma-line">{viewFor.student_id} ↗</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {viewFor.refund_whatsapp_text
                ? <Button variant="secondary" onClick={()=>{ const r=viewFor; setViewFor(null); setResultText({title:"Refund confirmation",text:r.refund_whatsapp_text}); }}>Message</Button>
                : <span/>}
              <Button onClick={()=>{ const r=viewFor; setViewFor(null); setEditFor(r); }}>Edit</Button>
            </div>
            <button type="button" onClick={()=>del(viewFor)} className="mt-3 h-11 w-full rounded-[14px] text-[14px] font-semibold text-lma-out active:bg-lma-out-soft">Delete this refund</button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!editFor&&!!init} onClose={()=>setEditFor(null)} title={editFor?`Edit ${editFor.refund_id}`:""}>
        {editFor&&<EditForm refund={editFor} onSave={async(payload)=>{ const r=await post("updateRefund",{...payload,refund_id:editFor.refund_id}); if(r){ setEditFor(null); showToast("Refund updated"); load(); } }}/>}
      </Sheet>

      <Sheet open={!!resultText} onClose={()=>setResultText(null)} title={resultText?.title||""}>
        {resultText&&(
          <div className="pb-2">
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-[14px] border border-lma-line bg-lma-surface p-3 font-lma-mono text-[12px] leading-relaxed text-lma-ink-2">{resultText.text}</pre>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <a href={`https://wa.me/?text=${encodeURIComponent(resultText.text)}`} target="_blank" rel="noopener noreferrer" className="grid h-12 place-items-center rounded-[14px] bg-[#16a34a] text-[14.5px] font-bold text-white">Share on WhatsApp</a>
              <Button variant="secondary" onClick={()=>{ navigator.clipboard.writeText(resultText.text); showToast("Copied"); }}>Copy</Button>
            </div>
          </div>
        )}
      </Sheet>

      {openRno && <ReceiptModal receiptNo={openRno} context="refunds" onClose={()=>setOpenRno(null)} onSaved={load}/>}
      {openStu && <StudentModal studentId={openStu.id} library={openStu.library} onClose={()=>setOpenStu(null)} onSaved={load}/>}
    </Screen>
  );
}

// A receipt as returned by getReceiptLog (only fields we display/use)
interface PickReceipt {
  receipt_no:string; student_id:string; library:string; branch:string;
  name:string; phone:string; shift:string; shift_name:string;
  seat_no:string; booking_from:string; booking_to:string; status:string;
}
function autoDetectReceiptSearch(q:string):"NAME"|"PHONE"|"RECEIPT_NO"|"STUDENT_ID"{
  const t=q.trim(); if(!t) return "NAME";
  const s=t.replace(/[\s\-\.\(\)\+]/g,"");
  if(/^R\d+/i.test(t)) return "RECEIPT_NO";
  if(/^F\d+/i.test(t)) return "STUDENT_ID";
  if(/^\d{3,}$/.test(s)) return "PHONE";
  return "NAME";
}

function IssueForm({ post, onDone }:{ post:(a:string,p:any)=>Promise<any>; onDone:(text:string)=>void }){
  // Step 1: find & pick the receipt
  const [scope,setScope]=useState("");
  const [search,setSearch]=useState("");
  const [results,setResults]=useState<PickReceipt[]>([]);
  const [searching,setSearching]=useState(false);
  const [picked,setPicked]=useState<PickReceipt|null>(null);
  const debounceRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  // Step 2: refund details
  const [amountStr,setAmountStr]=useState("");
  const [mode,setMode]=useState("");
  const [dateIso,setDateIso]=useState(todayIso());
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const chips = useScopeChips();

  // debounced receipt search (same request as before)
  useEffect(()=>{
    if(picked) return;
    if(debounceRef.current) clearTimeout(debounceRef.current);
    const q=search.trim();
    if(q.length<2){ setResults([]); return; }
    debounceRef.current=setTimeout(async()=>{
      setSearching(true);
      const params=new URLSearchParams({action:"getReceiptLog",q,search_type:autoDetectReceiptSearch(q),page:"1",limit:"30"});
      if(scope) params.set("library",scope);
      try{
        const r=await fetch(`${API}?${params}`).then(r=>r.json());
        setResults((r.receipts||[]).map((x:any)=>({
          receipt_no:String(x.receipt_no||""), student_id:String(x.student_id||""), library:String(x.library||""), branch:String(x.branch||""),
          name:String(x.name||""), phone:String((x.phone||(x.phones&&x.phones[0]&&x.phones[0].number))||""),
          shift:String(x.shift||""), shift_name:String(x.shift_name||""), seat_no:String(x.seat_no||""),
          booking_from:String(x.booking_from||""), booking_to:String(x.booking_to||""), status:String(x.status||""),
        })));
      }catch{ setResults([]); }
      setSearching(false);
    },300);
  },[search,scope,picked]);

  const amount=Number(amountStr||0);
  const blocker=!picked?"Pick the receipt first":amount<=0?"Enter the amount":!mode?"Pick how it was paid back":"";
  const submit=async()=>{
    if(blocker||!picked) return;
    setBusy(true);
    // issueRefund reads: original_receipt_no, refund_mode, amount, refund_date?, refund_reason?, linked_to_cancellation?
    const r=await post("issueRefund",{ original_receipt_no:picked.receipt_no, refund_mode:mode, amount, refund_date:dmyOf(dateIso), refund_reason:reason, linked_to_cancellation:false });
    setBusy(false);
    if(r) onDone(String(r.refund_whatsapp_text||""));
  };

  if(!picked) return (
    <div className="pb-2">
      <p className="mb-2 px-1 text-[12.5px] text-lma-ink-3">Find the receipt this refund is against.</p>
      <ScopeChips chips={chips} value={scope} onChange={setScope}/>
      <div className="relative">
        <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lma-ink-3"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} autoFocus placeholder="Name, phone, F-ID or R-number" aria-label="Find receipt" className={cx(inputCls,"pl-10")}/>
      </div>
      <div className="mt-3 space-y-2">
        {searching&&<p className="px-1 text-[12.5px] text-lma-ink-3">Searching…</p>}
        {!searching&&search.trim().length>=2&&results.length===0&&<p className="px-1 text-[12.5px] text-lma-ink-3">No receipts match.</p>}
        {results.map(r=>(
          <button key={r.receipt_no} type="button" onClick={()=>setPicked(r)} className="lma-noscale flex w-full items-center gap-3 rounded-[14px] border border-lma-line bg-lma-surface px-3.5 py-2.5 text-left active:bg-lma-bg">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold text-lma-ink">{r.name}</span>
              <span className="mt-0.5 block truncate font-lma-mono text-[12px] text-lma-ink-3">{r.receipt_no} · {r.branch||r.library} · Seat {r.seat_no||"—"} · till {fmtDMY(r.booking_to)}</span>
            </span>
            <span className="shrink-0 text-[12.5px] font-semibold text-lma-brand">Pick</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="pb-2">
      <div className="mb-3 flex items-center gap-3 rounded-[14px] border border-lma-line bg-lma-surface px-3.5 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-lma-ink">{picked.name}</span>
          <span className="block truncate font-lma-mono text-[12px] text-lma-ink-3">{picked.receipt_no} · {picked.branch||picked.library} · Seat {picked.seat_no||"—"}</span>
        </span>
        <button type="button" onClick={()=>setPicked(null)} className="shrink-0 text-[12.5px] font-semibold text-lma-brand">Change</button>
      </div>
      <AmountPad value={amountStr} onKey={k=>setAmountStr(s=>keyRules(s,k))} label="Refund amount"/>
      <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Paid back by</div>
      <TagChips value={mode} onChange={setMode} label="Paid back by"/>
      <div className="mb-3 mt-1"><TagBankNote tag={mode}/></div>
      <DateChips title="On" value={dateIso} onChange={setDateIso} ago={daysAgo(dateIso)} label={dayLabel(dateIso)} today={todayIso()} yesterday={shiftIso(todayIso(),-1)}/>
      <div className="mb-4"><TextInput value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Reason"/></div>
      <Button size="lg" full variant={blocker?"primary":"danger"} disabled={!!blocker||busy} loading={busy} loadingText="Refunding…" onClick={submit}>{blocker||`Refund ${inr(amount)}`}</Button>
    </div>
  );
}

function EditForm({ refund, onSave }:{ refund:Refund; onSave:(p:any)=>void }){
  const origIso=toIsoInput(refund.refund_date)||todayIso();
  const [amountStr,setAmountStr]=useState(String(refund.amount));
  const [mode,setMode]=useState(refund.refund_mode);
  const [move,setMove]=useState(false);
  const [dateIso,setDateIso]=useState(origIso);
  const [reason,setReason]=useState(refund.refund_reason);
  const amount=Number(amountStr||0);
  const save=()=>{
    if(!amount||!mode) return;
    // updateRefund edits: refund_mode, amount, refund_date, refund_reason (matched by refund_id).
    // An untouched date goes back exactly as it was saved.
    onSave({ refund_mode:mode, amount, refund_date:dateIso===origIso?refund.refund_date:dmyOf(dateIso), refund_reason:reason, ...(move?{move_bank:true}:{}) });
  };
  return (
    <div className="pb-2">
      <p className="mb-3 px-1 text-[12.5px] text-lma-ink-3">{refund.name} · against {refund.original_receipt_no}</p>
      <AmountPad value={amountStr} onKey={k=>setAmountStr(s=>keyRules(s,k))} label="Refund amount"/>
      <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Paid back by</div>
      <TagChips value={mode} onChange={setMode} keep={refund.refund_mode} label="Paid back by"/>
      <div className="mb-3 mt-1"><BankCheck tag={mode} savedTag={refund.refund_mode} savedBank={refund.refund_fees_mode} move={move} onMove={setMove}/></div>
      <DateChips title="On" value={dateIso} onChange={setDateIso} ago={daysAgo(dateIso)} label={dayLabel(dateIso)} today={todayIso()} yesterday={shiftIso(todayIso(),-1)}/>
      <div className="mb-4"><TextInput value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Reason"/></div>
      <Button size="lg" full disabled={!amount||!mode} onClick={save}>Save changes</Button>
    </div>
  );
}
