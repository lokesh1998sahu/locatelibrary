"use client";
// ── TAG → BANK (single source) ────────────────────────────────────
// Every payment tag lands in one bank / cash account (Settings → Payment Tags).
// Pickers list tag names only; once a tag is picked, its bank shows BELOW the
// field as a highlighted chip. Inside the app only — never in receipt text or
// WhatsApp messages sent to students.
//   useTagBank()   → bankOf(tag): the tag's CURRENT bank ("" if unknown)
//   <TagBankNote/> → making screens: the picked tag's bank under the field
//   <BankCheck/>   → editing screens: the payment's saved bank; if the tag now
//                    goes elsewhere, a highlight with a "Move to …" toggle.
//                    Nothing moves unless you tap it.
import { useCallback } from "react";
import { useLMA } from "./LMAProvider";
import { Chip, cx } from "../_ui/kit";

const norm=(v?:string|null)=>String(v??"").trim().toUpperCase();

export function useTagBank(){
  const { init }=useLMA();
  return useCallback((tag?:string|null):string=>{
    const t=norm(tag); if(!t) return "";
    const row=(init?.paymentTags||[]).find(x=>norm(x.tag_name)===t);
    return norm(row?.fees_mode);
  },[init]);
}

// The highlighted bank chip shown under a tag field.
function BankChip({ bank, empty, right=false }:{ bank:string; empty:string; right?:boolean }){
  return (
    <div className={`mt-1.5 ${right?"flex justify-end":""}`}>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${bank?"bg-lma-primary/10 text-lma-primary":"bg-lma-danger/10 text-lma-danger"}`}>
        <span aria-hidden="true">🏦</span>
        {bank?<><span className="font-bold opacity-70">Bank</span><span>{bank}</span></>:<span>{empty}</span>}
      </span>
    </div>
  );
}

/** Making screens: shows the picked tag's bank under the field (nothing until a tag is picked). */
export function TagBankNote({ tag, right=false }:{ tag?:string|null; right?:boolean }){
  const bankOf=useTagBank();
  if(!norm(tag)) return null;
  return <BankChip bank={bankOf(tag)} empty="No bank set for this tag" right={right}/>;
}

/** Editing screens: shows the payment's saved bank. If its tag now goes to a
 *  different bank, highlights it with a "Move to …" toggle (off by default). */
export function BankCheck({ tag, savedTag, savedBank, move, onMove }:{ tag:string; savedTag:string; savedBank:string; move:boolean; onMove:(v:boolean)=>void }){
  const bankOf=useTagBank();
  const t=norm(tag);
  if(!t) return null;
  const now=bankOf(t);
  if(t!==norm(savedTag)) return <BankChip bank={now} empty="No bank set for this tag"/>;   // tag changed: its current bank applies
  const saved=norm(savedBank);
  if(!now||now===saved) return <BankChip bank={saved} empty="No bank saved"/>;
  return (
    <div className="mt-1.5 rounded-lg bg-lma-warn/10 px-2.5 py-2 flex items-center gap-2">
      <span className="flex-1 text-[11px] font-bold text-lma-warn">⚠ Saved in {saved||"no bank"} · {t} now goes to {now}</span>
      <button type="button" onClick={()=>onMove(!move)} className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-extrabold ${move?"bg-lma-warn text-white":"bg-white text-lma-warn border border-lma-warn/40"}`}>{move?`✓ Will move to ${now}`:`Move to ${now}`}</button>
    </div>
  );
}

// ── Pick a payment tag with one tap (replaces the old dropdowns) ───────
// Shows every switched-on tag as a chip. `keep` is the tag already saved on an
// entry: if it has since been switched off it still shows (marked "off"), so
// editing an old payment can never lose or silently change it.
// The value handed back is the tag name, exactly what the dropdowns sent.
export function TagChips({ value, onChange, keep, label="Paid by", className, size="md" }:{
  value:string; onChange:(tag:string)=>void; keep?:string; label?:string; className?:string;
  size?:"md"|"sm";   // "sm" for narrow inline forms (seat sheet, receipt window)
}){
  const { init } = useLMA();
  const active=(init?.paymentTags||[]).filter((t:any)=>t.active).map((t:any)=>String(t.tag_name));
  const kept=(keep||"").trim().toUpperCase();
  const extra=kept && !active.some(t=>t.toUpperCase()===kept) ? [keep as string] : [];
  const list=[...active, ...extra];
  if(list.length===0) return <p className={cx("px-1 text-[12.5px] text-lma-ink-3", className)}>No payment tags switched on. Add one in Settings.</p>;
  return (
    <div role="radiogroup" aria-label={label} className={cx("flex flex-wrap", size==="sm"?"gap-1.5":"gap-2", className)}>
      {list.map(t=>{
        const on=value.trim().toUpperCase()===t.toUpperCase();
        const off=extra.includes(t);
        if(size==="sm") return (
          <button key={t} type="button" role="radio" aria-checked={on} onClick={()=>onChange(t)}
            className={cx("lma-btn inline-flex h-9 items-center rounded-full px-3 text-[13px] font-semibold",
              on?"lma-glass-btn text-white":"bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg")}>
            {t}{off&&<span className={cx("ml-1 text-[11px] font-bold", on?"text-white/80":"text-lma-ink-3")}>· off</span>}
          </button>
        );
        return (
          <Chip key={t} on={on} onClick={()=>onChange(t)}>
            {t}{off&&<span className={cx("ml-1 text-[11px] font-bold", on?"text-white/80":"text-lma-ink-3")}>· off</span>}
          </Chip>
        );
      })}
    </div>
  );
}
