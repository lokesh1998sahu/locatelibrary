"use client";
import { fmtDMY } from "../_lib/dates";

export default function DateRangeFilter({from,to,onChange,className=""}:{from:string;to:string;onChange:(from:string,to:string)=>void;className?:string;}){
  const active = !!(from||to);
  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <div className="flex-1">
        <label className="block text-[10px] font-bold text-lma-slate-400 mb-0.5">From</label>
        <input type="date" value={from} onChange={e=>onChange(e.target.value,to)} className="w-full px-3 py-2 rounded-xl border-[1.5px] border-lma-slate-200 bg-white focus:border-lma-primary outline-none text-sm"/>
        {from && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(from)}</span>}
      </div>
      <div className="flex-1">
        <label className="block text-[10px] font-bold text-lma-slate-400 mb-0.5">To</label>
        <input type="date" value={to} onChange={e=>onChange(from,e.target.value)} className="w-full px-3 py-2 rounded-xl border-[1.5px] border-lma-slate-200 bg-white focus:border-lma-primary outline-none text-sm"/>
        {to && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(to)}</span>}
      </div>
      {active && <button onClick={()=>onChange("","")} className="px-3 py-2 rounded-xl border-[1.5px] border-lma-slate-200 text-xs font-bold text-lma-slate-500 hover:bg-lma-slate-50">Clear</button>}
    </div>
  );
}