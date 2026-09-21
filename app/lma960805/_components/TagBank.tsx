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
