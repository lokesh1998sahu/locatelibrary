// Shared pagination control: minimal Prev / "Page X / Y" / Next. Hidden when only one page.
export const PAGE_SIZE = 20;

export default function Pager({ page, totalPages, onPage }:{
  page:number; totalPages:number; onPage:(p:number)=>void;
}){
  if(totalPages<=1) return null;
  return (
    <div className="flex items-center justify-center gap-4 mt-4 mb-1">
      <button disabled={page<=1} onClick={()=>onPage(page-1)}
        className="px-4 py-2 rounded-xl bg-white border border-lma-slate-200 text-lma-slate-700 font-bold text-sm disabled:opacity-40">‹ Prev</button>
      <span className="text-xs font-bold text-lma-slate-500 tabular-nums">Page {page} / {totalPages}</span>
      <button disabled={page>=totalPages} onClick={()=>onPage(page+1)}
        className="px-4 py-2 rounded-xl bg-white border border-lma-slate-200 text-lma-slate-700 font-bold text-sm disabled:opacity-40">Next ›</button>
    </div>
  );
}