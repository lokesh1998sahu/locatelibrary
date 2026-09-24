"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { type ContactPhone } from "../_lib/contact";
import { parsePhone10 } from "../_lib/phone";

// B5: optional `variants` — when 2+ are provided, tapping the button first shows a
// message chooser (e.g. Initial / Follow-up), THEN the phones step when there are
// several numbers. With no variants the behaviour is exactly as before.
// The chooser is a bottom sheet: every message is readable before you send it.
export default function WhatsAppButton({ phones, className, label, text, variants, chat }:{
  phones?:ContactPhone[]; className?:string; label?:string; text?:string;
  variants?:{label:string;text:string;getText?:()=>Promise<string>;pick?:boolean}[]; chat?:boolean;
}){
  const [open,setOpen]=useState(false);
  const [chosen,setChosen]=useState<string|null>(null);
  const [loadingIdx,setLoadingIdx]=useState(-1);
  const wrap=useRef<HTMLDivElement>(null);
  const list=(phones||[]).filter(p=>p&&p.number);
  const multi=list.length>1;
  const vlist=(variants||[]).filter(v=>v&&(v.text||v.getText));
  const items = chat ? [{label:"Open WhatsApp chat", text:""}, ...vlist] : vlist;
  const soleVar = items.length===1 ? items[0].text : undefined;
  const hasVar = items.length>1;
  useEffect(()=>{ if(!open) setChosen(null); },[open]);
  const openChat=(num:string,t?:string)=>{ const p=parsePhone10(num||""); const msg=t!==undefined?t:(chosen!==null?chosen:(text!==undefined?text:soleVar)); if(p) window.open(msg?`https://wa.me/91${p}?text=${encodeURIComponent(msg)}`:`https://wa.me/91${p}`,"_blank"); setOpen(false); };
  const onClick=()=>{ if(list.length===0) return; if(hasVar){ setChosen(null); setOpen(o=>!o); return; } if(!multi){ openChat(list[0].number); } else { setOpen(o=>!o); } };
  const pickVariant=(t:string)=>{ if(!multi){ openChat(list[0].number,t); } else { setChosen(t); } };
  const showVarStep = hasVar && chosen===null;
  useEffect(()=>{
    if(!open) return;
    const k=(e:KeyboardEvent)=>{ if(e.key==="Escape") setOpen(false); };
    window.addEventListener("keydown",k);
    return ()=>window.removeEventListener("keydown",k);
  },[open]);
  const title = showVarStep ? "Send on WhatsApp" : "Which number?";
  const sub = showVarStep ? `Pick a message · ${items.length} options` : chosen!==null ? "Message ready — pick the number" : `${list.length} numbers`;
  return (
    <div ref={wrap} className="relative shrink-0">
      <button type="button" onClick={onClick} disabled={list.length===0} className={className||"px-2.5 py-2.5 rounded-xl bg-lma-accent/10 text-lma-accent font-bold text-xs disabled:opacity-40"}>{label||"💬"}{(multi||hasVar)?" ▾":""}</button>
      {open && (multi||hasVar) && typeof document!=="undefined" && createPortal((
        <div className="fixed inset-0 z-[10002] flex items-end justify-center" onClick={()=>setOpen(false)}>
          <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
          <div role="dialog" aria-modal="true" aria-label={title}
            className="lma-sheet-up relative flex max-h-[86dvh] w-full max-w-[560px] flex-col rounded-t-[24px] bg-lma-bg pb-[env(safe-area-inset-bottom)] shadow-lma-float"
            onClick={e=>e.stopPropagation()}>
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[#dfe1ee]"/>
            <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-3">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25d366] text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2Zm0 16a7.2 7.2 0 0 1-3.7-1l-.3-.2-2.7.7.7-2.6-.2-.3A7.2 7.2 0 1 1 12 19.2Zm4-5.4c-.2-.1-1.3-.7-1.5-.7s-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a5.9 5.9 0 0 1-2.9-2.6c-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.4l-.7-1.6c-.2-.4-.4-.4-.5-.4h-.4a.8.8 0 0 0-.6.3 2.4 2.4 0 0 0-.8 1.8 4.2 4.2 0 0 0 .9 2.2 9.6 9.6 0 0 0 3.7 3.3c1.4.6 1.9.6 2.6.5a2.2 2.2 0 0 0 1.4-1c.2-.5.2-.9.1-1l-.4-.2Z"/></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-bold tracking-[-0.01em] text-lma-ink">{title}</div>
                <div className="truncate text-[12.5px] text-lma-ink-3">{sub}</div>
              </div>
              <button type="button" aria-label="Close" onClick={()=>setOpen(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
            {showVarStep ? items.map((v,i)=>(
              <button type="button" key={i} disabled={loadingIdx>=0} onClick={async()=>{ if(v.getText){ setLoadingIdx(i); const t=await v.getText().catch(()=>""); setLoadingIdx(-1); if(t){ if(v.pick){ window.open(`https://wa.me/?text=${encodeURIComponent(t)}`,"_blank"); setOpen(false); } else { pickVariant(t); } } } else { pickVariant(v.text); } }} className="mb-2 flex w-full items-start gap-3 rounded-[18px] border border-lma-line bg-lma-surface p-3.5 text-left shadow-lma-card active:bg-[#f0fdf4] disabled:opacity-60">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e3f6ec] text-[13px] font-bold text-[#0b7a52]">{i+1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-lma-ink">{v.label}</span>
                  <span className="mt-1 line-clamp-4 block whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-lma-ink-3">{v.text || (v.getText ? "Fetched when you tap, then sent on WhatsApp" : "Just opens the chat — no message")}</span>
                </span>
                <span className="mt-0.5 shrink-0 rounded-full bg-[#25d366] px-3 py-1.5 text-[12px] font-bold text-white">{loadingIdx===i?"…":v.text||v.getText?"Send":"Open"}</span>
              </button>
            )) : (
              <>
                {hasVar&&<button type="button" onClick={()=>setChosen(null)} className="mb-2 h-10 px-1 text-[13px] font-semibold text-[#0b7a52]">‹ Back to messages</button>}
                {list.map((l,i)=>(
                  <button type="button" key={i} onClick={()=>openChat(l.number)} className="mb-2 flex w-full items-center gap-3 rounded-[18px] border border-lma-line bg-lma-surface p-3.5 text-left shadow-lma-card active:bg-[#f0fdf4]">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e3f6ec] text-[13px] font-bold text-[#0b7a52]">{i+1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-lma-mono text-[15px] font-semibold text-lma-ink">{l.number}</span>{l.tag&&<span className="text-[11px] font-bold uppercase tracking-wide text-lma-ink-3">{l.tag}</span>}</span>
                    <span className="shrink-0 rounded-full bg-[#25d366] px-3 py-1.5 text-[12px] font-bold text-white">Open</span>
                  </button>
                ))}
              </>
            )}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
