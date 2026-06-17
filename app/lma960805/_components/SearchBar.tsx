import { parsePhone10 } from "../_lib/phone";
export type SearchType = "NAME"|"PHONE"|"STUDENT_ID"|"RECEIPT_NO";

export function autoDetectSearchType(q:string):SearchType{
  const t=q.trim(); if(!t)return"NAME";
  if(/^R\d+/i.test(t))return"RECEIPT_NO";
  const s=t.replace(/[\s\-\.\(\)\+]/g,"");
  if(/^\d{3,}$/.test(s))return"PHONE";
  if(/^F\d+/i.test(t))return"STUDENT_ID";
  return"NAME";
}

const DEFAULT_HINT = "Auto-detects type. Tip: R12 = receipt, F45 = student ID, digits = phone.";

// Shared client-side matcher for already-loaded lists (Renewals/Dues/Refunds), honoring auto-detect.
export function matchesSearch(item:any, query:string):boolean{
  const q=query.trim(); if(!q) return true;
  const typ=autoDetectSearchType(q); const Q=q.toUpperCase();
  if(typ==="RECEIPT_NO") return String(item.receipt_no||"").toUpperCase().includes(Q);
  if(typ==="STUDENT_ID") return String(item.student_id||"").toUpperCase().includes(Q);
  if(typ==="PHONE"){ const d=parsePhone10(Q); if(!d) return false; const nums:string[]=[]; if(item.phone)nums.push(item.phone); if(item.mobile)nums.push(item.mobile); if(Array.isArray(item.phones))item.phones.forEach((p:any)=>{if(p&&p.number)nums.push(p.number);}); return nums.some((n)=>parsePhone10(String(n)).includes(d)); }
  return String(item.name||"").toUpperCase().includes(Q);
}

// Shared common search bar (model: Admissions → Renewals). Controlled value; fires onSearch on click/Enter.
export default function SearchBar({ value, onChange, onSearch, searching, placeholder, hint }:{
  value:string; onChange:(v:string)=>void; onSearch:()=>void;
  searching?:boolean; placeholder?:string; hint?:string;
}){
  return (
    <div className="mb-3">
      <div className="flex gap-2">
        <input value={value} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")onSearch();}}
          placeholder={placeholder||"Name, phone, F-ID, or R-no…"}
          className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-sm font-medium"/>
        <button onClick={onSearch} disabled={searching}
          className="px-5 py-3 rounded-xl bg-lma-primary text-white font-bold text-sm disabled:opacity-50">{searching?"…":"Search"}</button>
      </div>
      {hint!=="" && <p className="text-[10px] text-lma-slate-500 mt-1.5">{hint||DEFAULT_HINT}</p>}
    </div>
  );
}