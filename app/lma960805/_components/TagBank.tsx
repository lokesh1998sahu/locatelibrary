"use client";
// ── TAG → BANK (single source) ────────────────────────────────────
// Every payment tag lands in one bank / cash account (Settings → Payment Tags).
// LMA shows that link wherever a tag is picked or shown — inside the app only,
// never in receipt text or WhatsApp messages sent to students.
//   useTagBank()  → bankOf(tag): the tag's CURRENT bank ("" if unknown)
//   useTagText()  → text(tag): "GSP-UPI → BOB-BITTU" (for picker options)
//   <BankCheck/>  → edit screens: saved bank vs the tag's current bank, with a
//                   "Move" button. Nothing moves unless you tap it.
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

export function useTagText(){
  const bankOf=useTagBank();
  return useCallback((tag:string):string=>{ const b=bankOf(tag); return b?`${tag} → ${b}`:tag; },[bankOf]);
}

/** Edit screens: shows the payment's saved bank. If its tag now goes to a
 *  different bank, highlights it with a "Move to …" toggle (off by default). */
export function BankCheck({ tag, savedTag, savedBank, move, onMove }:{ tag:string; savedTag:string; savedBank:string; move:boolean; onMove:(v:boolean)=>void }){
  const bankOf=useTagBank();
  const t=norm(tag);
  if(!t) return null;
  const now=bankOf(t);
  if(t!==norm(savedTag)) return <div className="text-[10px] font-bold text-lma-slate-500 mt-1">Bank: {now||"none set for this tag"}</div>;
  const saved=norm(savedBank);
  if(!now||now===saved) return <div className="text-[10px] font-bold text-lma-slate-500 mt-1">Bank: {saved||"none saved"}</div>;
  return (
    <div className="mt-1 rounded-lg bg-lma-warn/10 px-2.5 py-2 flex items-center gap-2">
      <span className="flex-1 text-[10px] font-bold text-lma-warn">⚠ Saved in {saved||"no bank"} · {t} now goes to {now}</span>
      <button type="button" onClick={()=>onMove(!move)} className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-extrabold ${move?"bg-lma-warn text-white":"bg-white text-lma-warn border border-lma-warn/40"}`}>{move?`✓ Will move to ${now}`:`Move to ${now}`}</button>
    </div>
  );
}
