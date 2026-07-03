"use client";
import { useState, useRef, useEffect } from "react";
import { contactLabels, type ContactPhone } from "../_lib/contact";

export default function ContactCopyButton({ name, library, studentId, phones, className, wrapperClassName, label, onCopied }:{
  name:string; library:string; studentId:string; phones?:ContactPhone[];
  className?:string; wrapperClassName?:string; label?:string; onCopied?:(m:string)=>void;
}){
  const [open,setOpen]=useState(false);
  const [copied,setCopied]=useState(false);
  const [idx,setIdx]=useState(-1);
  const wrap=useRef<HTMLDivElement>(null);
  const labels=contactLabels(name, library, studentId, phones);
  const multi=labels.length>1;
  useEffect(()=>{
    if(!open) return;
    const h=(e:MouseEvent)=>{ if(wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[open]);
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
      <button type="button" onClick={onClick} className={className||"w-full py-2 rounded-lg bg-lma-warn/10 text-lma-warn font-bold text-xs"}>{txt}{multi?" ▾":""}</button>
      {open && multi && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center px-8" onClick={()=>setOpen(false)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="relative w-full max-w-xs bg-white rounded-2xl overflow-hidden shadow-xl lma-slide-up" onClick={e=>e.stopPropagation()}>
            <div className="px-4 py-3 bg-lma-warn/10 border-b border-lma-warn/20 flex items-center">
              <span className="text-sm font-extrabold text-lma-warn">Copy contact</span>
              <span className="ml-auto text-[11px] font-bold text-lma-slate-400">{labels.length} numbers</span>
            </div>
            {labels.map((l,i)=>(
              <button type="button" key={i} onClick={()=>copyOne(i)} className="flex items-center gap-3 w-full px-4 py-3 text-left border-b border-lma-slate-100 last:border-b-0 hover:bg-lma-warn/5 active:bg-lma-warn/10">
                <span className="w-7 h-7 rounded-full bg-lma-warn/10 text-lma-warn text-xs font-extrabold flex items-center justify-center shrink-0">{i+1}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-lma-slate-800 font-mono truncate">{l.number}</span>{l.tag&&<span className="text-[10px] font-bold text-lma-slate-400 uppercase tracking-wide">{l.tag}</span>}</span>
                <span className="shrink-0 text-xs font-extrabold text-lma-warn">{idx===i?"Copied ✓":"Copy"}</span>
              </button>
            ))}
            <button type="button" onClick={()=>setOpen(false)} className="w-full py-2.5 text-xs font-bold text-lma-slate-500 bg-lma-slate-50">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}