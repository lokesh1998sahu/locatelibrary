// Shared pagination control: minimal Prev / "Page X / Y" / Next. Hidden when only one page.
export const PAGE_SIZE = 20;

export default function Pager({ page, totalPages, onPage }:{
  page:number; totalPages:number; onPage:(p:number)=>void;
}){
  if(totalPages<=1) return null;
  return (
    <div className="flex items-center justify-center gap-4 mt-4 mb-1">
      <button disabled={page<=1} onClick={()=>onPage(page-1)}
        className="h-11 rounded-[12px] bg-lma-surface px-4 text-[14px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line disabled:opacity-40">‹ Prev</button>
      <span className="font-lma-mono text-[13px] font-semibold text-lma-ink-3">Page {page} / {totalPages}</span>
      <button disabled={page>=totalPages} onClick={()=>onPage(page+1)}
        className="h-11 rounded-[12px] bg-lma-surface px-4 text-[14px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line disabled:opacity-40">Next ›</button>
    </div>
  );
}