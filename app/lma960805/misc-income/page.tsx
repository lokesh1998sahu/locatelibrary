"use client";
// LMA — Misc income (day-pass, locker, xerox …). Same requests as before:
// getMiscIncome · addMiscIncome · updateMiscIncome · deleteMiscIncome · restoreMiscIncome.
// New look: period chips + a total card, entries grouped by day, and a
// keypad-first sheet for adding or editing an entry.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLMA, useScopeChips, type LMAInitData as InitData } from "../_components/LMAProvider";
import { fmtDMY, toIsoInput } from "../_lib/dates";
import { BankCheck, TagBankNote } from "../_components/TagBank";
import {
  Screen, Card, Button, Chip, ChipGroup, ScopeChips, Segmented, Sheet, Skeleton, Empty, IconButton,
  AmountPad, DateChips, TextInput, inputCls, cx,
} from "../_ui/kit";
import { IconRupee, IconRefresh, IconPlus } from "../_ui/icons";
import { inr, isoOf, todayIso, shiftIso, dayLabel } from "../_ui/format";

const API = "/api/lma960805";

// MISC_INCOME headers (exact): s_no, timestamp, date, month, library, branch,
//                              amount, payment_tag, fees_mode, category, remark
interface MiscRow {
  s_no:number; timestamp:string; date:string; month:string;
  library:string; branch:string; amount:number;
  payment_tag:string; fees_mode:string; category:string; remark:string;
  status:string; delete_reason:string; deleted_on:string;
}
type Period = "ALL"|"TODAY"|"MONTH"|"LAST"|"CUSTOM";
type Cat = { id:number; name:string; active:boolean; sort:number; uses:number };

const daysAgo = (iso:string) => Math.round((new Date(todayIso()+"T00:00:00").getTime()-new Date(iso+"T00:00:00").getTime())/86400000);
const keyRules = (s:string,k:string) => {
  if(k==="<") return s.slice(0,-1);
  if(k==="."&&s.includes(".")) return s;
  if(s.replace(".","").length>=8) return s;
  return (s+k).replace(/^0(?=\d)/,"");
};

export default function MiscIncomePage(){
  const { init, showToast, post } = useLMA();

  const [scope,setScope]=useState("");
  const [rows,setRows]=useState<MiscRow[]>([]);
  const [fromDate,setFromDate]=useState("");
  const [toDate,setToDate]=useState("");
  const [period,setPeriod]=useState<Period>("ALL");
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [modal,setModal]=useState<{mode:"add"|"edit";row?:MiscRow}|null>(null);
  const [showDeleted,setShowDeleted]=useState(false);
  const [openDays,setOpenDays]=useState<Record<string,boolean>>({});   // tapped open/closed; default: newest day open
  const [cats,setCats]=useState<Cat[]>([]);          // managed categories (table misc_categories)
  const [catsReady,setCatsReady]=useState(false);    // false until the table exists → form falls back to typing
  const [manage,setManage]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const p=new URLSearchParams(); p.set("all","1"); if(showDeleted) p.set("deleted","1");
    try{
      const r=await fetch(`${API}?action=getMiscIncome&${p}&page=1&limit=100`).then(r=>r.json());
      const raw:any[]=r.entries||[];
      setRows(raw.map((x:any)=>({
        s_no:Number(x.s_no||0), timestamp:String(x.timestamp||""), date:String(x.date||""), month:String(x.month||""),
        library:String(x.library||""), branch:String(x.branch||""), amount:Number(x.amount||0),
        payment_tag:String(x.payment_tag||""), fees_mode:String(x.fees_mode||""), category:String(x.category||""),
        remark:String(x.remark||""), status:String(x.status||""), delete_reason:String(x.delete_reason||""), deleted_on:String(x.deleted_on||""),
      })));
    }catch{ showToast("Couldn’t load misc income","error"); }
    setLoading(false); setLoaded(true);
  },[showDeleted,showToast]);
  useEffect(()=>{ load(); },[load]);

  const loadCats=useCallback(async()=>{
    try{
      const r=await fetch(`${API}?action=getMiscCategories`).then(x=>x.json());
      if(r&&r.ok){ setCats(r.categories||[]); setCatsReady(!!r.ready); }
    }catch{ /* list stays empty — the form still lets you type */ }
  },[]);
  useEffect(()=>{ loadCats(); },[loadCats]);

  const pickPeriod=(p:Period)=>{
    setPeriod(p);
    const t=todayIso(); const d=new Date();
    if(p==="ALL"){ setFromDate(""); setToDate(""); }
    else if(p==="TODAY"){ setFromDate(t); setToDate(t); }
    else if(p==="MONTH"){ setFromDate(isoOf(new Date(d.getFullYear(),d.getMonth(),1))); setToDate(t); }
    else if(p==="LAST"){ setFromDate(isoOf(new Date(d.getFullYear(),d.getMonth()-1,1))); setToDate(isoOf(new Date(d.getFullYear(),d.getMonth(),0))); }
  };

  const chips = useScopeChips();
  const base=rows.filter(r=>{ const iso=toIsoInput(r.date); if(fromDate&&iso<fromDate) return false; if(toDate&&iso>toDate) return false; return true; });
  const counts:Record<string,number>={}; base.forEach(r=>{ const k=(r.branch||r.library); if(k) counts[k]=(counts[k]||0)+1; });
  counts[""]=base.length;
  const rowsF=scope?base.filter(r=>(r.branch||r.library)===scope):base;
  const sumF=rowsF.reduce((s,r)=>s+(Number(r.amount)||0),0);

  // entries grouped by day, newest first
  const days=useMemo(()=>{
    const m=new Map<string,MiscRow[]>();
    [...rowsF].sort((a,b)=>toIsoInput(b.date).localeCompare(toIsoInput(a.date))||b.s_no-a.s_no)
      .forEach(r=>{ const k=toIsoInput(r.date)||"—"; if(!m.has(k)) m.set(k,[]); m.get(k)!.push(r); });
    return [...m.entries()];
  },[rowsF]);

  // most-used categories, offered as one-tap chips in the form. Only short,
  // name-like values count: old entries that used the category box for a phone
  // number or a note are left out, so they never show up as a "category".
  const recent=useMemo(()=>{
    const f:Record<string,number>={};
    const looksLikeName=(c:string)=>c.length<=24 && !/\d{5,}/.test(c);
    rows.forEach(r=>{ const c=r.category.trim(); if(c&&looksLikeName(c)) f[c]=(f[c]||0)+1; });
    return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c])=>c);
  },[rows]);

  const periodText = period==="ALL" ? "All dates" : `${fmtDMY(fromDate)||"…"} → ${fmtDMY(toDate)||"…"}`;

  return (
    <Screen>
      <header className="flex items-start gap-2 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Misc income</h1>
          <p className="mt-0.5 text-[12.5px] text-lma-ink-3">Day-pass, locker, xerox and the rest</p>
        </div>
        <IconButton label="Refresh" onClick={load} className="-mr-2"><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>
      </header>

      <ScopeChips chips={chips} value={scope} onChange={setScope} counts={counts}/>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {([["ALL","All"],["TODAY","Today"],["MONTH","This month"],["LAST","Last month"],["CUSTOM","Custom"]] as [Period,string][]).map(([k,l])=>(
          <Chip key={k} on={period===k} onClick={()=>pickPeriod(k)}>{l}</Chip>
        ))}
      </div>
      {period==="CUSTOM"&&(
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block"><span className="mb-1 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">From</span>
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className={inputCls}/></label>
          <label className="block"><span className="mb-1 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">To</span>
            <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className={inputCls}/></label>
        </div>
      )}

      {/* total for what is showing */}
      <section className="lma-glass-dark mb-3 rounded-[22px] p-5 text-white">
        <div className="text-[13px] font-semibold text-white/75">{showDeleted?"Deleted entries":"Collected"}{scope?` · ${scope}`:""}</div>
        <div className="mt-1 font-lma-mono text-[32px] font-medium leading-none tracking-[-0.02em]">{inr(sumF)}</div>
        <div className="mt-1.5 text-[12px] text-white/75">{rowsF.length} {rowsF.length===1?"entry":"entries"} · {periodText}</div>
      </section>

      <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
        {!showDeleted
          ? <Button size="lg" full onClick={()=>setModal({mode:"add"})}><IconPlus size={18}/> Add income</Button>
          : <div/>}
        <Segmented value={showDeleted?"DEL":"ACT"} onChange={v=>setShowDeleted(v==="DEL")}
          options={[{v:"ACT",label:"Active"},{v:"DEL",label:"Deleted"}]}/>
      </div>

      {!loaded||(loading&&rows.length===0) ? (
        <Card pad={false}>{[0,1,2].map(i=><div key={i} className={cx("flex items-center gap-3 px-4 py-4",i<2&&"border-b border-lma-line")}><div className="flex-1"><Skeleton className="h-4 w-32"/><Skeleton className="mt-2 h-3 w-24"/></div><Skeleton className="h-4 w-16"/></div>)}</Card>
      ) : rowsF.length===0 ? (
        <Card><Empty icon={<IconRupee size={22}/>} title={showDeleted?"Nothing deleted":"No income here yet"}
          body={showDeleted?undefined:"Add a day-pass, locker or xerox payment and it shows up here, grouped by day."}/></Card>
      ) : (
        <div className="space-y-4 pb-4">
          {days.length>1&&(
            <div className="flex justify-end gap-3 px-1">
              <button type="button" onClick={()=>setOpenDays(Object.fromEntries(days.map(([d])=>[d,true])))} className="text-[12.5px] font-semibold text-lma-brand">Expand all</button>
              <button type="button" onClick={()=>setOpenDays(Object.fromEntries(days.map(([d])=>[d,false])))} className="text-[12.5px] font-semibold text-lma-brand">Collapse all</button>
            </div>
          )}
          {days.map(([iso,list],di)=>{
            const tot=list.reduce((s,r)=>s+(Number(r.amount)||0),0);
            const open=openDays[iso]??(di===0);
            return (
              <section key={iso}>
                <button type="button" onClick={()=>setOpenDays(o=>({...o,[iso]:!open}))} aria-expanded={open}
                  className="lma-noscale mb-1.5 flex min-h-[40px] w-full items-center gap-2 rounded-[12px] px-1 text-left active:bg-lma-line/40">
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
                    className="shrink-0 text-lma-ink-3 transition" style={{transform:open?"rotate(90deg)":"none"}}><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>
                  <h2 className="flex-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{iso==="—"?"No date":dayLabel(iso)} <span className="font-semibold normal-case tracking-normal">· {list.length}</span></h2>
                  <span className={cx("font-lma-mono text-[12.5px] font-semibold", showDeleted?"text-lma-ink-3 line-through":"text-lma-in")}>{inr(tot)}</span>
                </button>
                {open&&<div className="divide-y divide-lma-line overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
                  {list.map((r,i)=> showDeleted ? (
                    <div key={`${r.s_no}-${i}`} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-lma-ink-3 line-through">{r.category||"Income"}</span>
                        <span className="font-lma-mono text-[14px] text-lma-ink-3 line-through">{inr(r.amount)}</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-lma-ink-3">{r.branch||r.library} · {r.payment_tag}</div>
                      <div className="mt-1 text-[12px] font-semibold text-lma-out">Deleted{r.deleted_on?` on ${fmtDMY(r.deleted_on)}`:""}{r.delete_reason?` — ${r.delete_reason}`:""}</div>
                      <Button variant="secondary" full className="mt-2 h-10" onClick={async()=>{ const res=await post("restoreMiscIncome",{s_no:r.s_no}); if(res){ showToast("Entry restored"); load(); } }}>Restore</Button>
                    </div>
                  ) : (
                    <button key={`${r.s_no}-${i}`} type="button" onClick={()=>setModal({mode:"edit",row:r})}
                      className="lma-noscale flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-lma-bg">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-semibold text-lma-ink">{r.category||"Income"}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-lma-ink-3">{r.branch||r.library} · {r.payment_tag}{r.remark?` · ${r.remark}`:""}</span>
                      </span>
                      <span className="shrink-0 font-lma-mono text-[15px] font-semibold text-lma-in">+{inr(r.amount)}</span>
                    </button>
                  ))}
                </div>}
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={!!modal&&!!init} onClose={()=>setModal(null)} title={modal?.mode==="edit"?"Edit income":"Add income"}>
        {modal&&init&&(
          <MiscForm key={modal.row?.s_no??"new"} init={init} mode={modal.mode} row={modal.row} recent={recent} defaultScope={scope}
            cats={catsReady?cats.filter(c=>c.active):null} onManage={()=>setManage(true)}
            onSave={async(payload)=>{
              const action=modal.mode==="add"?"addMiscIncome":"updateMiscIncome";
              const body=modal.mode==="edit"?{...payload,s_no:modal.row!.s_no}:payload;
              const r=await post(action,body);
              if(r){ setModal(null); showToast(modal.mode==="add"?"Income added":"Updated"); load(); }
            }}
            onDelete={modal.mode==="edit"?async(reason:string)=>{
              const r=await post("deleteMiscIncome",{s_no:modal.row!.s_no,reason});
              if(r){ setModal(null); showToast("Entry deleted"); load(); }
            }:undefined}/>
        )}
      </Sheet>

      <Sheet open={manage} onClose={()=>setManage(false)} title="Categories">
        {manage&&<ManageCategories cats={cats} ready={catsReady} onChanged={async()=>{ await loadCats(); load(); }}/>}
      </Sheet>
    </Screen>
  );
}

function MiscForm({ init, mode, row, recent, defaultScope, cats, onManage, onSave, onDelete }:{
  init:InitData; mode:"add"|"edit"; row?:MiscRow; recent:string[]; defaultScope:string;
  cats:Cat[]|null; onManage:()=>void;
  onSave:(p:any)=>Promise<void>|void; onDelete?:(reason:string)=>Promise<void>|void;
}){
  const libs:{code:string;label:string}[]=[];
  init.libraries.filter(l=>l.active).forEach(l=>{
    if(l.has_branches) init.branches.filter(b=>b.library_code===l.library_code&&b.active).forEach(b=>libs.push({code:b.branch_code,label:b.branch_code}));
    else libs.push({code:l.library_code,label:l.library_code});
  });
  const [libSel,setLibSel]=useState(row?(row.branch||row.library):(libs.find(o=>o.code===defaultScope)?.code||libs[0]?.code||""));
  const [dateIso,setDateIso]=useState(row?(toIsoInput(row.date)||todayIso()):todayIso());
  const [category,setCategory]=useState(row?.category||"");
  const [amountStr,setAmountStr]=useState(row?String(row.amount):"");
  const [tag,setTag]=useState(row?.payment_tag||"");
  const [move,setMove]=useState(false);
  const [remark,setRemark]=useState(row?.remark||"");
  const [confirmDel,setConfirmDel]=useState(false);
  const [delReason,setDelReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [typing,setTyping]=useState(false);
  const tags=init.paymentTags.filter(t=>t.active);
  const amount=Number(amountStr||0);
  const blocker=!libSel?"Pick a library":amount<=0?"Enter the amount":!category.trim()?"Pick or type a category":!tag?"Pick how it was paid":"";

  const save=async()=>{
    if(blocker) return;
    const br=init.branches.find(b=>b.branch_code===libSel);
    const library=br?br.library_code:libSel;
    const branch=br?br.branch_code:"";
    setBusy(true);
    // payload keys match MISC_INCOME columns the backend writes
    await onSave({ library, branch, date:dateIso, category:category.trim(), amount, payment_tag:tag, remark, ...(move?{move_bank:true}:{}) });
    setBusy(false);
  };

  return (
    <div className="pb-2">
      <AmountPad value={amountStr} onKey={k=>setAmountStr(s=>keyRules(s,k))} label="Amount"/>

      {mode==="add" ? (
        <ChipGroup label="Library">
          {libs.map(o=><Chip key={o.code} on={libSel===o.code} onClick={()=>setLibSel(o.code)}>{o.label}</Chip>)}
        </ChipGroup>
      ) : (
        <p className="mb-3 px-1 text-[12.5px] text-lma-ink-3">Library <span className="font-semibold text-lma-ink">{libSel}</span> · can’t be changed on a saved entry</p>
      )}

      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Category</span>
        <button type="button" onClick={onManage} className="text-[12.5px] font-semibold text-lma-brand">Manage</button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {(cats ? cats.map(c=>c.name) : recent).map(c=>(
          <Chip key={c} on={category.trim().toUpperCase()===c.toUpperCase()} onClick={()=>{ setCategory(c); setTyping(false); }}>{c}</Chip>
        ))}
        {cats&&<Chip on={typing||(!!category.trim()&&!cats.some(c=>c.name.toUpperCase()===category.trim().toUpperCase()))} onClick={()=>{ setTyping(true); if(cats.some(c=>c.name.toUpperCase()===category.trim().toUpperCase())) setCategory(""); }}>Other…</Chip>}
      </div>
      {(!cats||typing||(!!category.trim()&&!cats.some(c=>c.name.toUpperCase()===category.trim().toUpperCase())))&&(
        <div className="mb-3"><TextInput value={category} onChange={e=>setCategory(e.target.value)} placeholder={cats?"Type the category":"Day pass, locker, xerox…"} aria-label="Category" autoFocus={typing}/></div>
      )}

      <ChipGroup label="Paid by">
        {tags.map(t=><Chip key={t.tag_name} on={tag===t.tag_name} onClick={()=>setTag(t.tag_name)}>{t.tag_name}</Chip>)}
      </ChipGroup>
      <div className="-mt-1 mb-3">
        {mode==="edit"&&row?<BankCheck tag={tag} savedTag={row.payment_tag} savedBank={row.fees_mode} move={move} onMove={setMove}/>:<TagBankNote tag={tag}/>}
      </div>

      <DateChips title="On" value={dateIso} onChange={setDateIso} ago={daysAgo(dateIso)} label={dayLabel(dateIso)} today={todayIso()} yesterday={shiftIso(todayIso(),-1)}/>

      <div className="mb-4"><TextInput value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Remark: name, phone, days… (optional)" aria-label="Remark"/></div>

      <Button size="lg" full disabled={!!blocker||busy} loading={busy} loadingText="Saving…" onClick={save}>
        {blocker || `${mode==="add"?"Add":"Save"} ${inr(amount)}`}
      </Button>

      {onDelete&&(
        confirmDel ? (
          <div className="mt-4 rounded-[16px] bg-lma-out-soft p-3.5">
            <div className="mb-2 text-[13px] font-semibold text-lma-out">Why delete this entry?</div>
            <TextInput value={delReason} onChange={e=>setDelReason(e.target.value)} placeholder="e.g. duplicate entry, wrong amount" autoFocus aria-label="Reason for deletion"/>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={()=>{setConfirmDel(false);setDelReason("");}}>Keep</Button>
              <Button variant="danger" disabled={!delReason.trim()} onClick={()=>onDelete(delReason.trim())}>Delete</Button>
            </div>
            <p className="mt-2 text-center text-[11.5px] text-lma-out/80">The entry is kept and can be restored later.</p>
          </div>
        ) : (
          <button type="button" onClick={()=>setConfirmDel(true)} className="mt-3 h-11 w-full rounded-[14px] text-[14px] font-semibold text-lma-out active:bg-lma-out-soft">Delete this entry</button>
        )
      )}
    </div>
  );
}

// ── Categories: add, rename (optionally past entries too), hide, reorder ──
function ManageCategories({ cats, ready, onChanged }:{ cats:Cat[]; ready:boolean; onChanged:()=>Promise<void> }){
  const { post, confirm: ask, showToast } = useLMA();
  const [newName,setNewName]=useState("");
  const [editId,setEditId]=useState<number|null>(null);
  const [editName,setEditName]=useState("");
  const [busy,setBusy]=useState(false);
  const run=async(payload:any, done?:string)=>{ setBusy(true); const r=await post("saveMiscCategory",payload); setBusy(false); if(r){ if(done) showToast(done); await onChanged(); } return r; };

  if(!ready) return (
    <div className="pb-3 text-[13.5px] leading-relaxed text-lma-ink-2">
      The categories list isn’t set up yet. Run <span className="font-lma-mono font-semibold">misc-categories-setup.sql</span> (Part 1) once in Supabase, then come back here.
    </div>
  );
  const add=async()=>{ const n=newName.trim(); if(!n) return; const r=await run({ name:n },"Added "+n.toUpperCase()); if(r) setNewName(""); };
  const rename=async(c:Cat)=>{
    const n=editName.trim().toUpperCase(); if(!n||n===c.name){ setEditId(null); return; }
    let past=false;
    if(c.uses>0) past=await ask({ title:`Rename ${c.name} to ${n}?`, body:`${c.uses} past ${c.uses===1?"entry uses":"entries use"} ${c.name}. Rename ${c.uses===1?"it":"them"} too?`, confirmLabel:"Rename past too", cancelLabel:"Only the list" });
    const r=await run({ id:c.id, name:n, apply_to_past:past }, past?`Renamed, ${c.uses} past updated`:"Renamed");
    if(r) setEditId(null);
  };
  return (
    <div className="pb-2">
      <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-lma-ink-3">These show as chips when you add income. Put names, phone numbers and days in the remark, not here. ↑↓ reorder · ✎ rename · the eye hides or shows one.</p>
      <div className="divide-y divide-lma-line overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface">
        {cats.map((c,i)=>(
          <div key={c.id} className="flex min-h-[56px] items-center gap-1 px-3 py-2">
            {editId===c.id ? (
              <>
                <input value={editName} onChange={e=>setEditName(e.target.value)} autoFocus aria-label="New name"
                  onKeyDown={e=>{ if(e.key==="Enter") rename(c); if(e.key==="Escape") setEditId(null); }}
                  className={cx(inputCls,"h-11 flex-1 uppercase")}/>
                <Button className="h-11 px-3" loading={busy} onClick={()=>rename(c)}>Save</Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className={cx("truncate text-[14.5px] font-semibold", c.active?"text-lma-ink":"text-lma-ink-3 line-through")}>{c.name}</div>
                  <div className="text-[11.5px] text-lma-ink-3">{c.uses} {c.uses===1?"entry":"entries"}{c.active?"":" · hidden"}</div>
                </div>
                <button type="button" aria-label={`Move ${c.name} up`} disabled={busy||i===0} onClick={()=>run({ id:c.id, move:"up" })}
                  className="grid h-9 w-9 place-items-center rounded-full text-lma-ink-2 disabled:opacity-30 active:bg-lma-bg">↑</button>
                <button type="button" aria-label={`Move ${c.name} down`} disabled={busy||i===cats.length-1} onClick={()=>run({ id:c.id, move:"down" })}
                  className="grid h-9 w-9 place-items-center rounded-full text-lma-ink-2 disabled:opacity-30 active:bg-lma-bg">↓</button>
                <button type="button" aria-label={`Rename ${c.name}`} onClick={()=>{ setEditId(c.id); setEditName(c.name); }}
                  className="grid h-9 w-9 place-items-center rounded-full text-lma-brand active:bg-lma-bg"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg></button>
                <button type="button" aria-label={c.active?`Hide ${c.name}`:`Show ${c.name}`} disabled={busy} onClick={()=>run({ id:c.id, active:!c.active }, c.active?`${c.name} hidden`:`${c.name} shown`)}
                  className={cx("grid h-9 w-9 place-items-center rounded-full active:bg-lma-bg", c.active?"text-lma-ink-3":"text-lma-in")}>{c.active?<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>:<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.9A16.7 16.7 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>}</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New category" aria-label="New category"
          onKeyDown={e=>{ if(e.key==="Enter") add(); }} className={cx(inputCls,"flex-1 uppercase")}/>
        <Button className="h-12 px-4" disabled={!newName.trim()} loading={busy} onClick={add}>Add</Button>
      </div>
    </div>
  );
}
