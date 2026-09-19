"use client";
// Shared period picker — preset pills + Custom from/to. Used by Dashboard and Ledger.
// Presets and date maths live in ../_lib/period (single source).
import { useState } from "react";
import { PRESETS, periodOf, isoOf, localFromIso, type Period } from "../_lib/period";
import { fmtDMY } from "../_lib/dates";

export default function PeriodPicker({ value, onChange }:{ value:Period; onChange:(p:Period)=>void }){
  const [open,setOpen]=useState(value.preset==="custom");
  const pill=(on:boolean)=>`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${on?"bg-lma-primary text-white":"bg-white text-lma-slate-600"}`;
  const setDate=(which:"from"|"to",v:string)=>{
    const d=localFromIso(v); if(!d) return;
    onChange({ preset:"custom", from:which==="from"?d:value.from, to:which==="to"?d:value.to });
  };
  return (
    <>
      <div className="flex gap-1.5 mb-2 overflow-x-auto -mx-4 px-4 pb-1">
        {PRESETS.map(p=>(
          <button key={p.k} onClick={()=>{ setOpen(false); onChange(periodOf(p.k)); }} className={pill(value.preset===p.k&&!open)}>{p.label}</button>
        ))}
        <button onClick={()=>setOpen(v=>!v)} className={pill(open||value.preset==="custom")}>Custom</button>
      </div>
      {open&&(
        <div className="bg-white rounded-xl p-3 mb-3 shadow-sm flex items-end gap-2 lma-slide-up">
          <label className="flex-1 text-[11px] font-bold text-lma-slate-500">From
            <input type="date" value={isoOf(value.from)} onChange={e=>setDate("from",e.target.value)} className="w-full mt-1 px-2 py-2 rounded-lg border-[1.5px] border-lma-slate-200 text-sm font-medium text-lma-slate-800"/>
            <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(isoOf(value.from))}</span>
          </label>
          <label className="flex-1 text-[11px] font-bold text-lma-slate-500">To
            <input type="date" value={isoOf(value.to)} onChange={e=>setDate("to",e.target.value)} className="w-full mt-1 px-2 py-2 rounded-lg border-[1.5px] border-lma-slate-200 text-sm font-medium text-lma-slate-800"/>
            <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(isoOf(value.to))}</span>
          </label>
        </div>
      )}
    </>
  );
}