"use client";
import { useState, useRef, useEffect } from "react";
import { type ContactPhone } from "../_lib/contact";
import { parsePhone10 } from "../_lib/phone";

// B5: optional `variants` — when 2+ are provided, tapping the button first shows a
// message chooser (e.g. Initial / Follow-up), THEN the existing phones flow.
// With no variants the behavior is exactly as before.
export default function WhatsAppButton({ phones, className, label, text, variants }:{
  phones?:ContactPhone[]; className?:string; label?:string; text?:string;
  variants?:{label:string;text:string}[];
}){
  const [open,setOpen]=useState(false);
  const [chosen,setChosen]=useState<string|null>(null);
  const wrap=useRef<HTMLDivElement>(null);
  const list=(phones||[]).filter(p=>p&&p.number);
  const multi=list.length>1;
  const vlist=(variants||[]).filter(v=>v&&v.text);
  const hasVar=vlist.length>1;
  useEffect(()=>{
    if(!open){ setChosen(null); return; }
    const h=(e:MouseEvent)=>{ if(wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[open]);
  const openChat=(num:string,t?:string)=>{ const p=parsePhone10(num||""); const msg=t!==undefined?t:(chosen!==null?chosen:text); if(p) window.open(msg?`https://wa.me/91${p}?text=${encodeURIComponent(msg)}`:`https://wa.me/91${p}`,"_blank"); setOpen(false); };
  const onClick=()=>{ if(list.length===0) return; if(hasVar){ setChosen(null); setOpen(o=>!o); return; } if(!multi){ openChat(list[0].number); } else { setOpen(o=>!o); } };
  const pickVariant=(t:string)=>{ if(!multi){ openChat(list[0].number,t); } else { setChosen(t); } };
  const showVarStep = hasVar && chosen===null;
  return (
    <div ref={wrap} className="relative shrink-0">
      <button type="button" onClick={onClick} disabled={list.length===0} className={className||"px-2.5 py-2.5 rounded-xl bg-lma-accent/10 text-lma-accent font-bold text-xs disabled:opacity-40"}>{label||"💬"}{(multi||hasVar)?" ▾":""}</button>
      {open && (multi||hasVar) && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center px-8" onClick={()=>setOpen(false)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="relative w-full max-w-xs bg-white rounded-2xl overflow-hidden shadow-xl lma-slide-up" onClick={e=>e.stopPropagation()}>
            <div className="px-4 py-3 bg-lma-accent/10 border-b border-lma-accent/20 flex items-center">
              <span className="text-sm font-extrabold text-lma-accent">{showVarStep?"Choose message":"WhatsApp chat"}</span>
              <span className="ml-auto text-[11px] font-bold text-lma-slate-400">{showVarStep?`${vlist.length} options`:`${list.length} numbers`}</span>
            </div>
            {showVarStep ? vlist.map((v,i)=>(
              <button type="button" key={i} onClick={()=>pickVariant(v.text)} className="flex items-center gap-3 w-full px-4 py-3 text-left border-b border-lma-slate-100 last:border-b-0 hover:bg-lma-accent/5 active:bg-lma-accent/10">
                <span className="w-7 h-7 rounded-full bg-lma-accent/10 text-lma-accent text-xs font-extrabold flex items-center justify-center shrink-0">{i+1}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-lma-slate-800 truncate">{v.label}</span><span className="block text-[10px] text-lma-slate-400 truncate">{v.text}</span></span>
                <span className="shrink-0 text-xs font-extrabold text-lma-accent">→</span>
              </button>
            )) : list.map((l,i)=>(
              <button type="button" key={i} onClick={()=>openChat(l.number)} className="flex items-center gap-3 w-full px-4 py-3 text-left border-b border-lma-slate-100 last:border-b-0 hover:bg-lma-accent/5 active:bg-lma-accent/10">
                <span className="w-7 h-7 rounded-full bg-lma-accent/10 text-lma-accent text-xs font-extrabold flex items-center justify-center shrink-0">{i+1}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-lma-slate-800 font-mono truncate">{l.number}</span>{l.tag&&<span className="text-[10px] font-bold text-lma-slate-400 uppercase tracking-wide">{l.tag}</span>}</span>
                <span className="shrink-0 text-xs font-extrabold text-lma-accent">Open →</span>
              </button>
            ))}
            <button type="button" onClick={()=>setOpen(false)} className="w-full py-2.5 text-xs font-bold text-lma-slate-500 bg-lma-slate-50">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}