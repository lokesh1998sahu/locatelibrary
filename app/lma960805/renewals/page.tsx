"use client";
// LMA — Renewals. Who is expiring, who has expired, who was cancelled.
// Same data and actions as before (getRenewalsQueue · getCancellationsQueue ·
// markReceiptDoNotRenew · resetReceiptStatus); renewing opens the booking flow
// in place, cancelling opens the shared cancel & refund sheet.
import { useState, useEffect, useCallback } from "react";
import CancelRefundSheet from "../_components/CancelRefundSheet";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { fmtDMY, inDateRange } from "../_lib/dates";
import ReceiptModal from "../_components/ReceiptModal";
import StudentModal from "../_components/StudentModal";
import SearchBar, { matchesSearch } from "../_components/SearchBar";
import DateRangeFilter from "../_components/DateRangeFilter";
import { buildRenewReminder, buildRenewFollowUpPay, buildRenewFollowUpAsk } from "../_lib/reminderText";
import WhatsAppButton from "../_components/WhatsAppButton";
import Pager, { PAGE_SIZE } from "../_components/Pager";
import BookingFlow from "../_components/BookingFlow";
import { Screen, Card, Chip, ScopeChips, Sheet, Button, Skeleton, Empty, IconButton, cx } from "../_ui/kit";
import { IconRefresh, IconRepeat } from "../_ui/icons";
import { inr } from "../_ui/format";

const API = "/api/lma960805";

interface QueueItem {
  receipt_no:string; student_id:string; library:string; branch:string; name:string;
  seat_no:string; shift:string; shift_name:string; booking_from:string; booking_to:string;
  fee:number; fees_due_balance:number; dues_status:string; is_cross_library:string;
  status:string; renewed_from:string; lifecycle:string; days_until_expiry:number;
  receipt_text:string; cancel_whatsapp_text?:string; cancelled_on?:string; phone?:string; phones?:{number:string;tag:string}[]; remark?:string;
}
type Tab = "EXPIRING"|"EXPIRED"|"CANCELLED";

// student's HOME library (cross students keep their original ID)
function homeLib(it:QueueItem){ return (it.is_cross_library&&it.is_cross_library!=="NO") ? it.is_cross_library : (it.branch||it.library); }
function relTime(days:number, kind:"expiring"|"expired"){
  if(kind==="expiring"){ if(days<=0) return "Due today"; if(days===1) return "1 day left"; return `${days} days left`; }
  const d=Math.abs(days); if(d===0) return "Expired today"; if(d===1) return "1 day ago"; return `${d} days ago`;
}

export default function RenewalsPage(){
  const { init, showToast, post, confirm: ask } = useLMA();
  const [tab,setTab]=useState<Tab>("EXPIRED");
  const [dFrom,setDFrom]=useState(""); const [dTo,setDTo]=useState("");
  const [scope,setScope]=useState("");          // "" = all
  const [expiring,setExpiring]=useState<QueueItem[]>([]);
  const [expired,setExpired]=useState<QueueItem[]>([]);
  const [cancellations,setCancellations]=useState<QueueItem[]>([]);
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [actionFor,setActionFor]=useState<QueueItem|null>(null);   // cancel/refund sheet
  const [resultText,setResultText]=useState<{title:string;text:string}|null>(null);
  const [openRno,setOpenRno]=useState<string|null>(null);
  const [openStu,setOpenStu]=useState<{id:string;library:string}|null>(null);
  const [renew,setRenew]=useState<QueueItem|null>(null);           // in-place renewal
  const [expSub,setExpSub]=useState<"ALL"|"SOON"|"LATER">("ALL");   // inside Expiring
  const [draft,setDraft]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const p=new URLSearchParams();   // all scopes; filtered here
      const [rq,cq]=await Promise.all([
        fetch(`${API}?action=getRenewalsQueue&${p}`).then(r=>r.json()),
        fetch(`${API}?action=getCancellationsQueue&${p}`).then(r=>r.json()),
      ]);
      setExpiring(rq.expiring||[]); setExpired(rq.expired||[]);
      setCancellations(cq.items||[]);
    }catch{ showToast("Couldn’t load renewals","error"); }
    setLoading(false); setLoaded(true);
  },[showToast]);
  useEffect(()=>{ load(); },[load]);

  const libName=(it:QueueItem)=>(init?.libraries?.find(l=>l.library_code===it.library)?.display_name)||it.library;
  const remind=(it:QueueItem, exp:boolean)=>buildRenewReminder(it.name, libName(it), fmtDMY(it.booking_to), exp);
  const followUpPay=(it:QueueItem, exp:boolean)=>buildRenewFollowUpPay(it.name, libName(it), fmtDMY(it.booking_to), exp);
  const followUpAsk=(it:QueueItem, exp:boolean)=>buildRenewFollowUpAsk(it.name, libName(it), fmtDMY(it.booking_to), exp);

  const doDoNotRenew=async(it:QueueItem)=>{
    if(!(await ask({ title:`Do not renew ${it.receipt_no}?`, body:`${it.name} will leave this list and stop appearing in renewal reminders.`, confirmLabel:"Do not renew", danger:true }))) return;
    const r=await post("markReceiptDoNotRenew",{receipt_no:it.receipt_no});
    if(r){ showToast("Marked do not renew"); load(); }
  };
  const doReset=async(it:QueueItem)=>{
    if(!(await ask({ title:"Set back to active?", body:`${it.name} · ${it.receipt_no} goes back to active (clears Cancelled / Do not renew).`, confirmLabel:"Set active" }))) return;
    const r=await post("resetReceiptStatus",{receipt_no:it.receipt_no});
    if(r&&r.reset){ showToast("Set back to active"); load(); }
    else if(r&&r.error) showToast(r.error,"error");
  };

  const chips = useScopeChips();
  const tabs:{key:Tab;label:string;count:number;bg:string}[]=[
    { key:"EXPIRING",  label:"Expiring",  count:expiring.length,      bg:"#dc2626" },
    { key:"EXPIRED",   label:"Expired",   count:expired.length,       bg:"#6b0a0a" },
    { key:"CANCELLED", label:"Cancelled", count:cancellations.length, bg:"#0f172a" },
  ];

  // Expiring splits into Soon (primary window) and Later — same two tiers as the seat chart
  const primaryDays=(it:QueueItem)=>{ const s=(init?.settings as any)?.[it.branch||it.library]||(init?.settings as any)?.[it.library]; const n=Number(s?.renewal_alert_days_primary); return n>0?n:3; };
  const tierOf=(it:QueueItem):"soon"|"expiring"=> it.days_until_expiry<=primaryDays(it) ? "soon" : "expiring";
  const byQuery=(it:QueueItem)=>matchesSearch(it,search) && inDateRange(it.booking_to,dFrom,dTo);
  const expiringBase=expiring.filter(byQuery), expiredBase=expired.filter(byQuery), cancelledBase=cancellations.filter(byQuery);
  const activeBase=tab==="EXPIRING"?expiringBase:tab==="EXPIRED"?expiredBase:cancelledBase;
  const counts:Record<string,number>={"":activeBase.length}; activeBase.forEach(it=>{ const k=(it.branch||it.library); if(k) counts[k]=(counts[k]||0)+1; });
  const inScope=(it:QueueItem)=>!scope||(it.branch||it.library)===scope;
  const expiringF=expiringBase.filter(inScope), expiredF=expiredBase.filter(inScope), cancelledF=cancelledBase.filter(inScope);
  const soonList=expiringF.filter(it=>tierOf(it)==="soon");
  const laterList=expiringF.filter(it=>tierOf(it)==="expiring");
  const expShown = expSub==="SOON"?soonList : expSub==="LATER"?laterList : expiringF;
  useEffect(()=>{ setPage(1); },[tab,search,expSub,scope,dFrom,dTo]);

  const list = tab==="EXPIRING" ? expShown : tab==="EXPIRED" ? expiredF : cancelledF;
  const shown = list.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const totalPages = Math.max(1,Math.ceil(list.length/PAGE_SIZE));

  return (
    <Screen>
      <header className="flex items-start gap-2 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Renewals</h1>
          <p className="mt-0.5 text-[12.5px] text-lma-ink-3">{expiring.length} expiring · {expired.length} expired · {cancellations.length} cancelled</p>
        </div>
        <IconButton label="Refresh" onClick={load} className="-mr-2"><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>
      </header>

      {/* tabs, each in the seat chart's colour when chosen */}
      <div role="tablist" className="mb-3 grid grid-cols-3 gap-1 rounded-[16px] bg-lma-surface p-1 ring-1 ring-inset ring-lma-line">
        {tabs.map(t=>{ const on=tab===t.key; return (
          <button key={t.key} role="tab" aria-selected={on} type="button" onClick={()=>setTab(t.key)}
            style={on?{ background:t.bg, color:"#fff" }:undefined}
            className={cx("lma-btn flex h-11 items-center justify-center gap-1.5 rounded-[12px] text-[13.5px] font-semibold", on?"":"text-lma-ink-2 active:bg-lma-bg")}>
            {t.label}
            <span className={cx("rounded-full px-1.5 font-lma-mono text-[11.5px] font-bold", on?"bg-white/25":"bg-lma-bg text-lma-ink-3")}>{t.count}</span>
          </button>
        ); })}
      </div>

      <ScopeChips chips={chips} value={scope} onChange={setScope} counts={counts}/>
      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      <DateRangeFilter from={dFrom} to={dTo} onChange={(f,t)=>{setDFrom(f);setDTo(t);setPage(1);}} className="mb-3"/>

      {tab==="EXPIRING"&&expiringF.length>0&&(
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip on={expSub==="ALL"} onClick={()=>setExpSub("ALL")}>All {expiringF.length}</Chip>
          <Chip on={expSub==="SOON"} onClick={()=>setExpSub("SOON")}><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#dc2626]"/>Soon {soonList.length}</Chip>
          <Chip on={expSub==="LATER"} onClick={()=>setExpSub("LATER")}><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#fca5a5]"/>Later {laterList.length}</Chip>
        </div>
      )}

      {!loaded||(loading&&expiring.length===0&&expired.length===0&&cancellations.length===0) ? (
        <div className="space-y-2">{[0,1,2].map(i=><Card key={i}><Skeleton className="h-4 w-44"/><Skeleton className="mt-2 h-3 w-56"/><Skeleton className="mt-3 h-11"/></Card>)}</div>
      ) : list.length===0 ? (
        <Card><Empty icon={<IconRepeat size={22}/>}
          title={tab==="EXPIRING"?(expiringF.length?"None in this group":"Nothing expiring soon"):tab==="EXPIRED"?"No expired receipts":"No cancelled receipts"}/></Card>
      ) : (
        <div className="space-y-2 pb-4">
          {shown.map(it=> tab==="CANCELLED" ? (
            <CancelledCard key={it.receipt_no} it={it} showToast={showToast}
              onRenew={()=>setRenew(it)} onReset={()=>doReset(it)}
              onRno={()=>setOpenRno(it.receipt_no)} onStu={()=>setOpenStu({id:it.student_id,library:homeLib(it)})}/>
          ) : (
            <ReviewCard key={it.receipt_no} it={it} kind={tab==="EXPIRED"?"expired":tierOf(it)}
              onRenew={()=>setRenew(it)}
              onSecondary={tab==="EXPIRED" ? ()=>doDoNotRenew(it) : ()=>setActionFor(it)}
              remindText={remind(it,tab==="EXPIRED")} remindFollowUpPay={followUpPay(it,tab==="EXPIRED")} remindFollowUpAsk={followUpAsk(it,tab==="EXPIRED")}
              onRno={()=>setOpenRno(it.receipt_no)} onStu={()=>setOpenStu({id:it.student_id,library:homeLib(it)})}/>
          ))}
          <Pager page={page} totalPages={totalPages} onPage={setPage}/>
        </div>
      )}

      {actionFor&&init&&(
        <CancelRefundSheet target={{receipt_no:actionFor.receipt_no,name:actionFor.name,seat_no:actionFor.seat_no,shift_name:actionFor.shift_name,shift:actionFor.shift,fees_due_balance:actionFor.fees_due_balance}}
          presentation="sheet" post={post} showToast={showToast} onClose={()=>setActionFor(null)}
          onDone={(r)=>{ setActionFor(null); if(r.whatsapp_text) setResultText({title:r.refunded?"Cancellation + refund":"Cancellation",text:r.whatsapp_text}); showToast("Done"); load(); }}/>
      )}

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

      {openRno&&<ReceiptModal receiptNo={openRno} onClose={()=>setOpenRno(null)} onSaved={load}/>}
      {openStu&&<StudentModal studentId={openStu.id} library={openStu.library} onClose={()=>setOpenStu(null)} onSaved={load}/>}
      {renew&&<BookingFlow renewReceiptNo={renew.receipt_no} libCode={renew.branch||renew.library} onClose={()=>setRenew(null)} onComplete={load}/>}
    </Screen>
  );
}

// seat-chart palette: soon = solid red, expiring = pink, expired = maroon
const LOOK:Record<"soon"|"expiring"|"expired",{edge:string;pillBg:string;pillFg:string}> = {
  soon:     { edge:"#dc2626", pillBg:"#dc2626", pillFg:"#ffffff" },
  expiring: { edge:"#fca5a5", pillBg:"#fee2e2", pillFg:"#b91c1c" },
  expired:  { edge:"#6b0a0a", pillBg:"#6b0a0a", pillFg:"#ffffff" },
};

// Student + receipt: small tappable cards, same idea as the seat sheet
function Refs({ it, onRno, onStu }:{ it:QueueItem; onRno:()=>void; onStu:()=>void }){
  const cross=!!(it.is_cross_library&&it.is_cross_library!=="NO");
  const open=<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M8 16 16 8M9 8h7v7"/></svg>;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      <button type="button" onClick={onStu} aria-label={`Open student ${it.student_id}`}
        className={cx("inline-flex h-8 items-center gap-1 rounded-[10px] px-2.5 font-lma-mono text-[12.5px] font-semibold ring-1 ring-inset active:brightness-95",
          cross?"bg-[#f5f0ff] text-[#7c3aed] ring-[#e4d9fb]":"bg-lma-bg text-lma-ink ring-lma-line")}>
        {it.student_id}{cross?`-${it.is_cross_library}`:""}{open}
      </button>
      <button type="button" onClick={onRno} aria-label={`Open receipt ${it.receipt_no}`}
        className="inline-flex h-8 items-center gap-1 rounded-[10px] bg-lma-bg px-2.5 font-lma-mono text-[12.5px] font-semibold text-lma-ink ring-1 ring-inset ring-lma-line active:brightness-95">
        {it.receipt_no}{open}
      </button>
    </div>
  );
}

function ReviewCard({ it, kind, onRenew, onSecondary, onRno, onStu, remindText, remindFollowUpPay, remindFollowUpAsk }:{
  it:QueueItem; kind:"soon"|"expiring"|"expired"; onRenew:()=>void; onSecondary:()=>void; onRno:()=>void; onStu:()=>void;
  remindText?:string; remindFollowUpPay?:string; remindFollowUpAsk?:string;
}){
  const lk=LOOK[kind]; const isExpired=kind==="expired";
  const variants=[
    ...(remindText?[{label:"Renewal reminder",text:remindText}]:[]),
    ...(remindFollowUpPay?[{label:"Follow-up · deposit fees",text:remindFollowUpPay}]:[]),
    ...(remindFollowUpAsk?[{label:"Follow-up · confirm continuing",text:remindFollowUpAsk}]:[]),
  ];
  return (
    <div className="flex overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
      <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background:lk.edge }}/>
      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[15.5px] font-bold leading-snug text-lma-ink">{it.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-lma-ink-3">
              <span className="font-semibold text-lma-ink-2">{it.branch||it.library}</span>
              <span aria-hidden="true">·</span><span>Seat {it.seat_no||"—"}</span>
              <span aria-hidden="true">·</span><span>{it.shift_name||it.shift}</span>
              <span aria-hidden="true">·</span><span>till {fmtDMY(it.booking_to)}</span>
            </div>
          </div>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background:lk.pillBg, color:lk.pillFg }}>{relTime(it.days_until_expiry, isExpired?"expired":"expiring")}</span>
        </div>
        {it.fees_due_balance>0&&<div className="mt-2 inline-flex rounded-md bg-[#fef3c7] px-2 py-0.5 font-lma-mono text-[12px] font-bold text-[#92400e] ring-1 ring-inset ring-[#f5d88a]">{inr(it.fees_due_balance)} due</div>}
        {it.remark&&<div className="mt-1.5 truncate text-[12px] italic text-lma-ink-3">{it.remark}</div>}
        <Refs it={it} onRno={onRno} onStu={onStu}/>
        <div className="mt-3 grid grid-cols-[1.25fr_1fr_1fr] gap-2">
          <button type="button" onClick={onRenew} className="lma-glass-btn h-11 rounded-[12px] text-[14px] font-bold text-white">Renew</button>
          <WhatsAppButton phones={it.phones} chat text={remindText} variants={variants.length?variants:undefined} label="WhatsApp"
            className="h-11 w-full whitespace-nowrap rounded-[12px] bg-[#e3f6ec] text-[13px] font-semibold text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8] disabled:opacity-40"/>
          {isExpired
            ? <button type="button" onClick={onSecondary} className="h-11 whitespace-nowrap rounded-[12px] bg-lma-surface text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Don’t renew</button>
            : <button type="button" onClick={onSecondary} className="h-11 rounded-[12px] bg-lma-surface text-[13px] font-semibold text-lma-out ring-1 ring-inset ring-lma-line">Cancel</button>}
        </div>
      </div>
    </div>
  );
}

function CancelledCard({ it, onRenew, onReset, onRno, onStu, showToast }:{
  it:QueueItem; onRenew:()=>void; onReset:()=>void; onRno:()=>void; onStu:()=>void; showToast:(m:string,t?:"success"|"error")=>void;
}){
  return (
    <div className="flex overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
      <span aria-hidden="true" className="w-1.5 shrink-0 bg-lma-ink-3"/>
      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[15.5px] font-bold leading-snug text-lma-ink">{it.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-lma-ink-3">
              <span className="font-semibold text-lma-ink-2">{it.branch||it.library}</span>
              <span aria-hidden="true">·</span><span>Seat {it.seat_no||"—"}</span>
              <span aria-hidden="true">·</span><span>{it.shift_name||it.shift}</span>
              <span aria-hidden="true">·</span><span>was till {fmtDMY(it.booking_to)}</span>
              {it.cancelled_on&&<><span aria-hidden="true">·</span><span className="font-semibold text-lma-out">cancelled {fmtDMY(it.cancelled_on)}</span></>}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-lma-out-soft px-2 py-0.5 text-[11px] font-bold text-lma-out">Cancelled</span>
        </div>
        <Refs it={it} onRno={onRno} onStu={onStu}/>
        <div className={cx("mt-3 grid gap-2", it.cancel_whatsapp_text?"grid-cols-3":"grid-cols-2")}>
          <button type="button" onClick={onRenew} className="lma-glass-btn h-11 rounded-[12px] text-[14px] font-bold text-white">Renew</button>
          {it.cancel_whatsapp_text&&<button type="button" onClick={()=>{ navigator.clipboard.writeText(it.cancel_whatsapp_text!); showToast("Copied cancel message"); }}
            className="h-11 whitespace-nowrap rounded-[12px] bg-[#e3f6ec] text-[13px] font-semibold text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8]">Copy message</button>}
          <button type="button" onClick={onReset} className="h-11 rounded-[12px] bg-lma-surface text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Undo</button>
        </div>
      </div>
    </div>
  );
}
