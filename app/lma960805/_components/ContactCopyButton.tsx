"use client";
import { useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { contactLabels, type ContactPhone } from "../_lib/contact";

// `content` (optional) shows in place of the text label — e.g. the student's name,
// so tapping the name copies the contact. `ariaLabel` names it for screen readers.
export default function ContactCopyButton({ name, library, studentId, phones, className, wrapperClassName, label, onCopied, content, ariaLabel }:{
  name:string; library:string; studentId:string; phones?:ContactPhone[];
  className?:string; wrapperClassName?:string; label?:string; onCopied?:(m:string)=>void;
  content?:ReactNode; ariaLabel?:string;
}){
  const [open,setOpen]=useState(false);
  const [copied,setCopied]=useState(false);
  const [idx,setIdx]=useState(-1);
  const wrap=useRef<HTMLDivElement>(null);
  const labels=contactLabels(name, library, studentId, phones);
  const multi=labels.length>1;
  const copyOne=(i:number)=>{
    navigator.clipboard.writeText(labels[i].label);
    setCopied(true); setIdx(i); if(onCopied) onCopied("Contact copied");
    setTimeout(()=>{ setCopied(false); setIdx(-1); },1200);
    if(multi) setTimeout(()=>setOpen(false),400);
  };
  const onClick=()=>{ if(!multi){ copyOne(0); } else { setOpen(o=>!o); } };
  const txt=copied?"Copied":(label||"📇 Contact");
  return (
    <div ref={wrap} className={wrapperClassName||"relative"}>
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={className||"w-full py-2 rounded-lg bg-lma-warn/10 text-lma-warn font-bold text-xs"}>{content ?? <>{txt}{multi?" ▾":""}</>}</button>
      {open && multi && typeof document!=="undefined" && createPortal((
        // Same sheet as WhatsApp's "Which number?" — only the colour (amber) and the button (Copy) differ.
        <div className="fixed inset-0 z-[10002] flex items-end justify-center" onClick={()=>setOpen(false)}>
          <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
          <div role="dialog" aria-modal="true" aria-label="Copy which number?"
            className="lma-sheet-up relative flex max-h-[86dvh] w-full max-w-[560px] flex-col rounded-t-[24px] bg-lma-bg pb-[env(safe-area-inset-bottom)] shadow-lma-float"
            onClick={e=>e.stopPropagation()}>
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[#dfe1ee]"/>
            <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-3">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f59e0b] text-white">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-bold tracking-[-0.01em] text-lma-ink">Copy which number?</div>
                <div className="truncate text-[12.5px] text-lma-ink-3">{labels.length} numbers{name?` · ${name}`:""}</div>
              </div>
              <button type="button" aria-label="Close" onClick={()=>setOpen(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
              {labels.map((l,i)=>(
                <button type="button" key={i} onClick={()=>copyOne(i)}
                  className="mb-2 flex w-full items-center gap-3 rounded-[18px] border border-lma-line bg-lma-surface p-3.5 text-left shadow-lma-card active:bg-[#fffbeb]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fef3c7] text-[13px] font-bold text-[#b45309]">{i+1}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-lma-mono text-[15px] font-semibold text-lma-ink">{l.number}</span>{l.tag&&<span className="text-[11px] font-bold uppercase tracking-wide text-lma-ink-3">{l.tag}</span>}</span>
                  <span className={"shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold text-white "+(idx===i?"bg-[#16a34a]":"bg-[#f59e0b]")}>{idx===i?"Copied ✓":"Copy"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}