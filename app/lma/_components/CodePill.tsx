"use client";
import { useLMA } from "./LMAProvider";

/**
 * CodePill — pill for a library/branch code (emoji + code).
 * White at rest; solid library color + white text when `active` (matches Seat Chart chips).
 * Looks up emoji/color by code from init.branches / init.libraries.
 */
export default function CodePill({ code, active=false, className="" }: { code?:string; active?:boolean; className?:string }){
  const { init } = useLMA();
  const raw = (code||"").toUpperCase();
  if(!raw) return null;
  const br     = init?.branches?.find((b:{branch_code:string})=>b.branch_code===raw);
  const lib    = init?.libraries?.find((l:{library_code:string})=>l.library_code===raw);
  const parent = br ? init?.libraries?.find((l:{library_code:string})=>l.library_code===br.library_code) : null;
  const emoji  = br?.emoji || parent?.emoji || lib?.emoji || "";
  const color  = br?.color || parent?.color || lib?.color || "";
  const on = active && !!color;
  return (
    <span
      style={on?{background:color,color:"#fff"}:undefined}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold leading-none whitespace-nowrap shadow-sm ${on?"":"bg-white text-lma-slate-600 border border-lma-slate-200"} ${className}`}
    >{emoji?<span className="leading-none">{emoji}</span>:null}{raw}</span>
  );
}