"use client";
import { fmtDMY } from "../_lib/dates";

export default function DateRangeFilter({from,to,onChange,className=""}:{from:string;to:string;onChange:(from:string,to:string)=>void;className?:string;}){
  const active = !!(from||to);
  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <div className="flex-1">
        <label className="mb-1 block px-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-lma-ink-3">From</label>
        <input type="date" value={from} onChange={e=>onChange(e.target.value,to)} className="h-11 w-full rounded-[12px] border border-lma-line bg-lma-surface px-3 text-[14px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
        {from && <span className="mt-1 block px-1 text-[11px] font-semibold text-lma-ink-3">{fmtDMY(from)}</span>}
      </div>
      <div className="flex-1">
        <label className="mb-1 block px-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-lma-ink-3">To</label>
        <input type="date" value={to} onChange={e=>onChange(from,e.target.value)} className="h-11 w-full rounded-[12px] border border-lma-line bg-lma-surface px-3 text-[14px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
        {to && <span className="mt-1 block px-1 text-[11px] font-semibold text-lma-ink-3">{fmtDMY(to)}</span>}
      </div>
      {active && <button onClick={()=>onChange("","")} className="px-3 py-2 rounded-[14px] border-[1.5px] border-lma-line text-xs font-bold text-lma-ink-3 hover:bg-lma-bg">Clear</button>}
    </div>
  );
}