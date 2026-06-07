"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLMA, useScopeChips } from "../_components/LMAProvider";

const API = "/api/lma";

interface Library { library_code:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch  { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface Occupant {
  receipt_no:string; student_id:string; name:string; shift:string; shift_name:string;
  booking_to:string; fees_due_balance:number; dues_status:string; is_cross_library:string;
  color:"OK"|"EXPIRING"|"EXPIRED";
  urgent?:boolean;   // B1: within PRIMARY window → darkest-red text
  has_dues?:boolean;
  temporary_seat?:string;
}
interface TempHeldInfo { receipt_no:string; student_id:string; name:string; }
// A block on a specific shift of a specific seat.
interface BlockInfo {
  block_id:string;
  reason:string;
  shift:string; // shift_blocked normalized
  block_from?:string; // formatted d-MMM-yyyy (blank if column absent)
  block_to?:string;
  expired?:boolean;   // A3: block_to has passed — block stays active, show hint
}
interface BoardCell {
  row_in_section:number; col_in_section:number; seat_no:number; display_label:string; notes:string; cell_type:string;
  morning:Occupant|null; evening:Occupant|null; fullday:Occupant|null;
  blocked:{ morning:boolean; evening:boolean; fullday:boolean };
  block_info?:{ morning:BlockInfo|null; evening:BlockInfo|null; fullday:BlockInfo|null };
  temp_held?:{ morning:TempHeldInfo|null; evening:TempHeldInfo|null; fullday:TempHeldInfo|null };
}
// Vacancy picker types (getVacantSeats)
interface PickSeatCell { row_in_section:number; col_in_section:number; display_label:string; cell_type:string; state:string; occupant?:{name:string}|null; share_note?:string|null; temp_held?:{student_id:string}|null; }
interface PickResp { ok:boolean; needs_seat:boolean; sections:{section_name:string;section_order:number;rows:number;cols:number;seats:PickSeatCell[]}[]; }
interface SidePanelItem {
  receipt_no:string; student_id:string; name:string; shift:string; shift_name:string;
  booking_to:string; fees_due_balance:number; dues_status:string; seat_label:string; temporary_seat:string;
  color?:"OK"|"EXPIRING"|"EXPIRED"; has_dues?:boolean; is_cross_library?:string;
}
interface BoardResp {
  ok:boolean; library_code:string; branch_code:string;
  sections:{ section_name:string; section_order:number; rows:number; cols:number; seats:BoardCell[] }[];
  floating:SidePanelItem[]; unassigned:SidePanelItem[]; otherShift:SidePanelItem[];
  counts:{ floating:number; unassigned:number; other:number };
}
type ShiftView = "ALL"|"MORNING"|"EVENING"|"FULL DAY";

const COLOR: Record<string,{bg:string;text:string;border:string;label:string}> = {
  OK:       { bg:"#dcfce7", text:"#15803d", border:"#86efac", label:"Occupied" },
  EXPIRING:         { bg:"#fee2e2", text:"#b91c1c", border:"#fca5a5", label:"Expiring" },
  EXPIRING_PRIMARY: { bg:"#dc2626", text:"#ffffff", border:"#7f1d1d", label:"Expiring Soon" },
  EXPIRED:          { bg:"#6b0a0a", text:"#ffffff", border:"#450a0a", label:"Expired" },
  DUES:     { bg:"#fde68a", text:"#92400e", border:"#f59e0b", label:"Dues" },
};
const GOLD = "#f59e0b";
// Resolve an occupant's tile look: expiry decides the FILL; dues shows as a
// gold FILL when the seat is OK, or a gold RING when Expiring/Expired (so the
// expiry is never hidden but dues is always visible).
function occLook(o:{color:"OK"|"EXPIRING"|"EXPIRED";urgent?:boolean;has_dues?:boolean}){
  const key = (o.color==="EXPIRING" && o.urgent) ? "EXPIRING_PRIMARY" : o.color; // B1: primary window → solid red fill
  const base = COLOR[key] || COLOR.OK;
  if(o.has_dues && o.color==="OK") return { bg:COLOR.DUES.bg, text:COLOR.DUES.text, border:COLOR.DUES.border, ring:false };
  if(o.has_dues) return { bg:base.bg, text:base.text, border:GOLD, ring:true };  // expiring/expired + dues
  return { bg:base.bg, text:base.text, border:base.border, ring:false };
}


// Convert a side-panel booking (floating/unassigned/otherShift) into a faux
// BoardCell so the SAME DetailSheet can show it — full color/dues/actions.
function panelItemToCell(it:SidePanelItem):BoardCell{
  const occ:Occupant={
    receipt_no:it.receipt_no, student_id:it.student_id, name:it.name,
    shift:it.shift, shift_name:it.shift_name, booking_to:it.booking_to,
    fees_due_balance:it.fees_due_balance, dues_status:it.dues_status,
    is_cross_library:it.is_cross_library||"", color:(it.color||"OK"), has_dues:it.has_dues,
    temporary_seat:it.temporary_seat||"",
  };
  const su=(it.shift||"").toUpperCase();
  return {
    row_in_section:0, col_in_section:0, seat_no:0,
    display_label: it.temporary_seat||it.seat_label||"—",
    notes:"", cell_type:"SEAT",
    morning: su==="MORNING"?occ:null,
    evening: su==="EVENING"?occ:null,
    fullday: (su==="FULL DAY"||su==="FULLDAY"||su==="FD")?occ:(su!=="MORNING"&&su!=="EVENING"?occ:null),
    blocked:{morning:false,evening:false,fullday:false},
  };
}

export default function BoardPage(){
  const router = useRouter();
  const { init, showToast, post } = useLMA();
  const [scope,setScope]=useState<string>("");           // library or branch code
  const [board,setBoard]=useState<BoardResp|null>(null);
  const [loading,setLoading]=useState(false);
  const [shiftView,setShiftView]=useState<ShiftView>("ALL");
  const [detail,setDetail]=useState<{cell:BoardCell;panel?:boolean}|null>(null);
  const [zoomPx,setZoomPx]=useState(0); // 0 = fit-to-width; >0 = fixed px per seat (on-screen zoom)
  // Block form + block-detail sheets
  const [blockFormSeat,setBlockFormSeat]=useState<{label:string;suggestedShift:string;blockId?:string;reason?:string;from?:string;to?:string}|null>(null);
  const [blockDetail,setBlockDetail]=useState<{info:BlockInfo;seatLabel:string}|null>(null);
  // re-allot picker (from floating panel OR from DetailSheet "move"): receipt + context
  const [reAllot,setReAllot]=useState<{receipt_no:string;name:string;student_id:string;shift:string;original?:string}|null>(null);
  const [shareEvent,setShareEvent]=useState<{text:string;label:string}|null>(null);
  const [exporting,setExporting]=useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  // Pick a default scope (first active library or branch) once init lands.
  useEffect(()=>{
    if(!init||scope) return;
    const first=init.libraries.find(l=>l.active);
    if(!first) return;
    if(first.has_branches){
      const b=init.branches.find(x=>x.library_code===first.library_code&&x.active);
      setScope(b?b.branch_code:first.library_code);
    } else setScope(first.library_code);
  },[init,scope]);

  const resolved = useMemo(()=>{
    if(!init||!scope) return {lib:"",branch:"",label:""};
    const br=init.branches.find(b=>b.branch_code===scope);
    if(br) return {lib:br.library_code,branch:br.branch_code,label:`${br.library_code} · ${br.branch_code}`};
    const l=init.libraries.find(x=>x.library_code===scope);
    return {lib:scope,branch:"",label:l?.display_name||scope};
  },[init,scope]);

  const loadBoard=useCallback(async()=>{
    if(!resolved.lib) return;
    setLoading(true);
    const params=new URLSearchParams({action:"getBoardOccupancy",library_code:resolved.lib});
    if(resolved.branch) params.set("branch_code",resolved.branch);
    const r=await fetch(`${API}?${params}`).then(r=>r.json());
    setLoading(false);
    if(r.ok) setBoard(r);
  },[resolved]);

  useEffect(()=>{ if(resolved.lib) loadBoard(); },[resolved.lib,resolved.branch,loadBoard]);

  const [showExport,setShowExport]=useState(false);

  const downloadPng=async()=>{
    if(!board) return;
    setExporting(true);
    setShowExport(true);
    try{
      if(!(window as any).html2canvas){
        await new Promise<void>((res,rej)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload=()=>res(); s.onerror=()=>rej(new Error("Could not load html2canvas (network/firewall?)"));
          document.body.appendChild(s);
        });
      }
      // wait a tick for the export layout to render
      await new Promise(r=>setTimeout(r,150));
      const node=document.getElementById("board-detailed-export");
      if(!node){ alert("Export layout not found."); return; }
      const h2c=(window as any).html2canvas;
      const canvas=await h2c(node,{ backgroundColor:"#ffffff", scale:2.5, logging:false, useCORS:true, width:node.scrollWidth, height:node.scrollHeight, windowWidth:node.scrollWidth, windowHeight:node.scrollHeight });
      const link=document.createElement("a");
      link.download=`${resolved.label.replace(/[^a-z0-9]/gi,"_")}_${new Date().toISOString().slice(0,10)}.png`;
      link.href=canvas.toDataURL("image/png");
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }catch(e){
      console.error("PNG export error:",e);
      alert("Export failed: "+(e instanceof Error?e.message:String(e)));
    }finally{ setExporting(false); setShowExport(false); }
  };

  // chip list (libraries + branches, no "All")
  const chips = useScopeChips({ includeAll: false });

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Seat Chart</h1><p className="text-[11px] text-lma-slate-500 font-medium">{resolved.label}</p></div>
        <div className="inline-flex items-center rounded-lg bg-lma-slate-100 overflow-hidden">
          <button onClick={()=>setZoomPx(z=> z===0?0:(z<=44?0:z-14))} disabled={zoomPx===0} className="px-2.5 py-2 text-sm font-extrabold text-lma-slate-600 disabled:opacity-40">−</button>
          <button onClick={()=>setZoomPx(z=> z===0?44:Math.min(z+14,100))} className="px-2.5 py-2 text-sm font-extrabold text-lma-primary">+</button>
        </div>
        <button onClick={loadBoard} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
        <button onClick={downloadPng} disabled={exporting||!board} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-primary text-white disabled:opacity-50">{exporting?"...":"⬇ PNG"}</button>
      </header>

      {/* library chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.emoji} {c.label}</button>
        ))}
      </div>

      {/* shift view toggle */}
      <div className="bg-white rounded-2xl p-1 flex gap-1 mb-3 shadow-sm">
        {(["ALL","MORNING","EVENING","FULL DAY"] as ShiftView[]).map(v=>(
          <button key={v} onClick={()=>setShiftView(v)} className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition ${shiftView===v?"bg-lma-slate-900 text-white":"text-lma-slate-500"}`}>{v==="FULL DAY"?"Full":v.charAt(0)+v.slice(1).toLowerCase()}</button>
        ))}
      </div>

      {/* legend */}
      <div className="flex gap-3 mb-3 text-[10px] text-lma-slate-500 overflow-x-auto whitespace-nowrap pb-1">
        {(["OK","EXPIRING_PRIMARY","EXPIRING","EXPIRED","DUES"] as const).map((k)=>{const v=COLOR[k];return (<span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{background:v.bg,border:`1px solid ${v.border}`}}></span>{v.label}</span>);})}
        <span className="flex items-center gap-1 shrink-0"><span className="w-3 h-3 rounded inline-block" style={{background:"repeating-linear-gradient(45deg,#fecaca,#fecaca 2px,#fee2e2 2px,#fee2e2 4px)",border:"1px solid #b91c1c"}}></span>Blocked</span><span className="flex items-center gap-1 shrink-0"><span className="w-3 h-3 rounded inline-block bg-lma-slate-100 border border-lma-slate-200"></span>Vacant</span>
      </div>

      {loading&&!board?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading chart…</div>
      ):!board?(
        <div className="text-center text-sm text-lma-slate-500 py-8">No data.</div>
      ):(
        <div id="board-export-area" style={{background:"#fff",padding:"12px",borderRadius:"12px"}}>
          {/* export header */}
          <div className="text-center mb-3">
            <div className="text-base font-extrabold text-lma-slate-900">{resolved.label}</div>
            <div className="text-[10px] text-lma-slate-500">{new Date().toLocaleDateString()} · {shiftView==="ALL"?"All shifts":shiftView}</div>
          </div>

          {board.sections.sort((a,b)=>a.section_order-b.section_order).map(sec=>(
            <div key={sec.section_name} className="mb-4">
              {board.sections.length>1&&<div className="text-[11px] font-bold text-lma-slate-500 mb-1.5">{sec.section_name}</div>}
              <div className="overflow-x-auto board-scroller">
                <div className="grid gap-1" style={{gridTemplateColumns: zoomPx ? `repeat(${sec.cols}, ${zoomPx}px)` : `repeat(${sec.cols}, minmax(34px, 1fr))`}}>
                  {Array.from({length:sec.rows*sec.cols}).map((_,idx)=>{
                    const r=Math.floor(idx/sec.cols)+1,c=(idx%sec.cols)+1;
                    const cell=sec.seats.find(s=>s.row_in_section===r&&s.col_in_section===c);
                    if(!cell) return <div key={idx} className="aspect-square"/>;
                    return <SeatTile key={idx} cell={cell} shiftView={shiftView} onOpen={()=>setDetail({cell})}/>;
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* side panels */}
          <SidePanel title="Unassigned (booked, no seat)" items={board.unassigned} emoji="📋" onTap={(it)=>setDetail({cell:panelItemToCell(it),panel:true})}/>
          <SidePanel title="Floating (temp-vacated)" items={board.floating} emoji="🌀" onTap={(it)=>setDetail({cell:panelItemToCell(it),panel:true})} onReAllot={(it)=>setReAllot({receipt_no:it.receipt_no,name:it.name,student_id:it.student_id,shift:it.shift,original:it.temporary_seat})}/>
          <SidePanel title="Other shift (no fixed seat)" items={board.otherShift} emoji="🔄" onTap={(it)=>setDetail({cell:panelItemToCell(it),panel:true})}/>
        </div>
      )}

      {/* occupied detail popup */}
      {detail&&<DetailSheet
        cell={detail.cell}
        panel={detail.panel}
        onBlock={(label,shift)=>{ setBlockFormSeat({label,suggestedShift:shift}); setDetail(null); }}
        onEdit={(label,blk)=>{ setBlockFormSeat({label,suggestedShift:blk.shift,blockId:blk.block_id,reason:blk.reason,from:blk.block_from||"",to:blk.block_to||""}); setDetail(null); }}
        onClose={()=>setDetail(null)}
        router={router}
        scope={scope}
        lib={resolved.lib}
        branch={resolved.branch}
        post={post}
        showToast={showToast}
        onChanged={()=>{ setDetail(null); loadBoard(); }}
        onReAllot={(o)=>{ setDetail(null); setReAllot({receipt_no:o.receipt_no,name:o.name,student_id:o.student_id,shift:o.shift,original:o.temporary_seat||undefined}); }}
        onShare={(text,label)=>setShareEvent({text,label})}
      />}

      {/* block-create form */}
      {blockFormSeat&&<BlockForm seat={blockFormSeat.label} suggestedShift={blockFormSeat.suggestedShift} blockId={blockFormSeat.blockId} initReason={blockFormSeat.reason} initFrom={blockFormSeat.from} initTo={blockFormSeat.to} lib={resolved.lib} branch={resolved.branch} post={post} onClose={()=>setBlockFormSeat(null)} onSaved={()=>{ const wasEdit=!!blockFormSeat.blockId; setBlockFormSeat(null); showToast(wasEdit?"Block updated":"Seat blocked"); loadBoard(); }} showToast={showToast}/>}

      {/* tap on a BLOCK tile → detail + actions */}
      {blockDetail&&<BlockDetailSheet info={blockDetail.info} seatLabel={blockDetail.seatLabel} lib={resolved.lib} branch={resolved.branch} post={post} onClose={()=>setBlockDetail(null)} onRemoved={()=>{ setBlockDetail(null); showToast("Removed"); loadBoard(); }} showToast={showToast}/>}

      {/* re-allot seat picker (floating-restore OR move) */}
      {reAllot&&<ReAllotPicker
        ctx={reAllot}
        lib={resolved.lib}
        branch={resolved.branch}
        post={post}
        onClose={()=>setReAllot(null)}
        showToast={showToast}
        onDone={()=>{ setReAllot(null); setDetail(null); loadBoard(); }}
        onShare={(text,label)=>setShareEvent({text,label})}
      />}

      {/* event share prompt */}
      {shareEvent&&(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center px-6" onClick={()=>setShareEvent(null)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
            <h4 className="text-sm font-extrabold text-lma-slate-900 mb-1">{shareEvent.label}</h4>
            <p className="text-[12px] text-lma-slate-500 mb-3">Send the student a WhatsApp update?</p>
            <pre className="text-[10px] text-lma-slate-600 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-2.5 max-h-40 overflow-y-auto mb-3">{shareEvent.text}</pre>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={()=>setShareEvent(null)} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Skip</button>
              <button onClick={()=>{ navigator.clipboard.writeText(shareEvent.text); showToast("Copied"); }} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Copy</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareEvent.text)}`} target="_blank" rel="noopener noreferrer" onClick={()=>setShareEvent(null)} className="py-2.5 rounded-xl bg-lma-accent text-white font-bold text-xs text-center">Share</a>
            </div>
          </div>
        </div>
      )}

       {/* off-screen detailed export layout */}
      {showExport&&board&&<DetailedExport board={board} label={resolved.label} shiftView={shiftView}/>}
    </div>
  );
}

// shorten "21-12-2026" → "21-12-26" for tile display
function shortDate(dmy:string){
  if(!dmy) return "";
  const p=dmy.split("-");
  if(p.length!==3) return dmy;
  return `${p[0]}-${p[1]}-${p[2].slice(-2)}`;
}

// Auto-fit one short line (a date) to the cell width: the SVG scales to 100%
// width, height capped (maxPx) so it never gets huge on large tiles. The text
// always fits the available width — no truncation, sizes itself to the seat icon.
function FitText({ text, color="currentColor", maxPx=11 }:{ text:string; color?:string; maxPx?:number }){
  if(!text) return null;
  const vbW=Math.max(text.length,1)*12, vbH=22;
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{display:"block",maxHeight:`${maxPx}px`}}>
      <text x={vbW/2} y={17} textAnchor="middle" fontSize="17" fontWeight={800} fill={color}>{text}</text>
    </svg>
  );
}

// ── SEAT TILE ────────────────────────────────────────────────────
function SeatTile({ cell, shiftView, onOpen }:{ cell:BoardCell; shiftView:ShiftView; onOpen:()=>void }){
  if(cell.cell_type==="DEAD") return <div className="aspect-square rounded" style={{background:"#f8fafc",border:"1px solid #e2e8f0"}}/>;

  // TRUE occupancy — NEVER hidden by the shift view (the toggle bug: occupants
  // were nulled per-view, so taken seats looked vacant/bookable).
  const bi = cell.block_info || { morning:null, evening:null, fullday:null };
  const fd = cell.fullday;          // full-day booking → occupies whole seat
  const bF = bi.fullday;            // full-day block
  const m  = cell.morning, e  = cell.evening;
  const bM = bi.morning,   bE = bi.evening;

  // soft-hold: a temp-vacated receipt parked on THIS seat, tracked PER SHIFT.
  // (A2: full-day vacate holds BOTH halves; an evening vacate must affect the
  //  LOWER half only — never the whole tile.)
  const th = cell.temp_held;
  const heldFD = th ? th.fullday : null;
  const heldM  = th ? (th.morning || th.fullday) : null;
  const heldE  = th ? (th.evening || th.fullday) : null;

  // Bookability for the SELECTED shift (Morning + Evening = Full Day).
  const morningFree = !fd && !bF && !m && !bM;
  const eveningFree = !fd && !bF && !e && !bE;
  const bookableForView =
      shiftView==="MORNING"  ? morningFree :
      shiftView==="EVENING"  ? eveningFree :
      shiftView==="FULL DAY" ? (morningFree && eveningFree) :
      true; // ALL → no filtering
  const dim = shiftView!=="ALL" && !bookableForView;
  const dimStyle = dim ? { opacity:0.32 } : null;

  // FULL DAY occupant fills whole tile
  if(fd){
    const col=occLook(fd);
    return (
      <button onClick={onOpen} className="aspect-square rounded flex flex-col items-center justify-center overflow-hidden px-0.5" style={{background:col.bg,color:col.text,border:col.ring?`2px solid ${col.border}`:`1px solid ${col.border}`,boxShadow:col.ring?`inset 0 0 0 1px ${col.border}`:undefined,...dimStyle}}>
        <span className="text-[10px] font-extrabold leading-none">{cell.display_label}</span>
        <div className="w-full px-0.5 mt-0.5"><FitText text={shortDate(fd.booking_to)} color={col.text} maxPx={11}/></div>
      </button>
    );
  }

  // FULL-DAY BLOCK fills whole tile too
  if(bF){
    return (
      <button onClick={onOpen} className="aspect-square rounded flex flex-col items-center justify-center overflow-hidden px-0.5" style={{
        background: "repeating-linear-gradient(45deg,#fecaca,#fecaca 4px,#fee2e2 4px,#fee2e2 8px)",
        border: bF.expired?"1.5px dashed #b91c1c":"1.5px solid #b91c1c",
        color: "#7f1d1d", ...dimStyle
      }}>
        <span className="text-[10px] font-extrabold leading-none">{cell.display_label}</span>
        <div className="w-full px-0.5 mt-0.5"><FitText text={shortDate(bF.block_to||"")||"BLK"} color="#7f1d1d" maxPx={11}/></div>
      </button>
    );
  }

  // split tile: upper morning, lower evening
  const mCol = m?occLook(m):null;
  const eCol = e?occLook(e):null;
  const vacant = !m&&!e&&!bM&&!bE&&!heldM&&!heldE;   // truly empty (nothing booked/blocked/parked)
  const bothHeld = !!heldFD || (!!heldM && !!heldE); // whole-tile hold only when full-day or both halves parked

  const halfStyle=(occCol:any, blk:BlockInfo|null, held:any)=>{
    if(blk){
      return {
        background: "repeating-linear-gradient(45deg,#fecaca,#fecaca 3px,#fee2e2 3px,#fee2e2 6px)",
        color: "#7f1d1d",
        outline: blk.expired?"1.5px dashed #7f1d1d":undefined,
        outlineOffset: "-2px",
      };
    }
    if(occCol) return {background:occCol.bg,color:occCol.text,boxShadow:occCol.ring?`inset 0 0 0 2px ${occCol.border}`:undefined};
    if(held) return {background:"#fffbeb",color:"#b45309",boxShadow:"inset 0 0 0 1.5px #f59e0b"}; // soft-hold on THIS half only
    return (!vacant?{background:"rgba(0,0,0,0.08)",color:"#475569"}:{color:"#cbd5e1"});
  };
  const halfText=(occ:Occupant|null, blk:BlockInfo|null, held:any, defaultDot:string)=>{
    if(occ) return <div className="w-full px-0.5"><FitText text={shortDate(occ.booking_to)} maxPx={9}/></div>;
    if(blk) return <div className="w-full px-0.5"><FitText text={shortDate(blk.block_to||"")||"BLK"} color="#7f1d1d" maxPx={9}/></div>;
    if(held) return <div className="w-full px-0.5"><FitText text={held.student_id} color="#b45309" maxPx={9}/></div>;
    return defaultDot;
  };

  return (
    <div className="aspect-square rounded overflow-hidden flex flex-col" style={{
      border: bothHeld?"1.5px dashed #f59e0b":(vacant?"1.5px solid rgba(0,0,0,0.5)":"1px solid #cbd5e1"),
      background: bothHeld?"#fffbeb":(vacant?"rgba(0,0,0,0.06)":"#fff"),
      ...dimStyle
    }}>
      <button onClick={onOpen} className="flex-1 flex items-center justify-center text-[7px] font-bold leading-none" style={halfStyle(mCol,bM,heldM)}>
        {halfText(m,bM,heldM,(shiftView==="ALL"||shiftView==="MORNING")?"·":"") }
      </button>
      <button onClick={onOpen} className="text-[9px] font-extrabold text-lma-slate-700 leading-none py-0.5">{cell.display_label}</button>
      <button onClick={onOpen} className="flex-1 flex items-center justify-center text-[7px] font-bold leading-none" style={halfStyle(eCol,bE,heldE)}>
        {halfText(e,bE,heldE,(shiftView==="ALL"||shiftView==="EVENING")?"·":"") }
      </button>
    </div>
  );
}
// ── SIDE PANEL ───────────────────────────────────────────────────
function SidePanel({ title, items, emoji, onReAllot, onTap }:{ title:string; items:SidePanelItem[]; emoji:string; onReAllot?:(it:SidePanelItem)=>void; onTap?:(it:SidePanelItem)=>void }){
  if(!items||items.length===0) return null;
  // Full-tile color scheme (matches seat tiles), with legible text per state.
  // Dues = gold FILL when otherwise OK; gold RING when expiring/expired.
  const look=(it:SidePanelItem)=>{
    const dueGold = it.has_dues;
    if(it.color==="EXPIRED")  return { bg:"#6b0a0a", fg:"#ffffff", sub:"rgba(255,255,255,0.78)", ring:dueGold?"#f59e0b":"" };
    if(it.color==="EXPIRING" && (it as any).urgent) return { bg:"#dc2626", fg:"#ffffff", sub:"rgba(255,255,255,0.85)", ring:dueGold?"#f59e0b":"" };
    if(it.color==="EXPIRING") return { bg:"#fee2e2", fg:"#991b1b", sub:"#b91c1c", ring:dueGold?"#f59e0b":"" };
    if(dueGold)               return { bg:"#fde68a", fg:"#92400e", sub:"#a16207", ring:"" };
    return { bg:"#dcfce7", fg:"#15803d", sub:"#16a34a", ring:"" };
  };
  return (
    <div className="mt-3 bg-lma-slate-50 rounded-xl p-3">
      <div className="text-[11px] font-bold text-lma-slate-600 mb-2">{emoji} {title} · {items.length}</div>
      <div className="space-y-1.5">
        {items.map(it=>{
          const L=look(it);
          return (
          <div key={it.receipt_no} className="rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-[11px]"
               style={{background:L.bg, boxShadow:L.ring?`inset 0 0 0 2px ${L.ring}`:undefined}}>
            <button onClick={()=>onTap&&onTap(it)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
              <span className="font-extrabold shrink-0" style={{color:L.fg}}>{it.student_id}</span>
              <span className="truncate flex-1 font-medium" style={{color:L.fg}}>{it.name}</span>
              <span className="shrink-0" style={{color:L.sub}}>{it.shift_name||it.shift}</span>
              {it.temporary_seat&&<span className="text-[9px] font-bold px-1 rounded shrink-0" style={{color:L.fg,background:"rgba(255,255,255,0.35)"}}>was {it.temporary_seat}</span>}
              {it.fees_due_balance>0&&<span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0" style={{color:"#92400e",background:"#fde68a"}}>₹{it.fees_due_balance}</span>}
              {it.booking_to&&<span className="shrink-0" style={{color:L.sub}}>{it.booking_to}</span>}
            </button>
            {onReAllot&&<button onClick={()=>onReAllot(it)} className="text-[9px] font-extrabold text-white bg-lma-primary px-2 py-1 rounded shrink-0">Re-Allot</button>}
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DETAIL SHEET (occupied seat tap) ─────────────────────────────
// #26: on-demand copy row for a board occupant. Board occupancy doesn't carry
// receipt_text/registration_text, so fetch the receipt by receipt_no when a copy
// button is tapped. Group copy only for NEW receipts that have registration_text.
function DetailCopyRow({ occupant, lib, branch, showToast }:{ occupant:Occupant; lib:string; branch:string; showToast:(m:string,t?:"success"|"error")=>void }){
  const [loading,setLoading]=useState<""|"student"|"group"|"contact">("");
  const fetchReceipt=async()=>{
    const scope=branch||lib;
    const params=new URLSearchParams({action:"getReceiptLog",q:occupant.receipt_no,search_type:"RECEIPT_NO",limit:"5"});
    if(scope) params.set("library",scope);
    const r=await fetch(`${API}?${params}`).then(x=>x.json());
    if(r&&r.receipts&&r.receipts.length){
      const exact=r.receipts.find((x:any)=>String(x.receipt_no).toUpperCase()===String(occupant.receipt_no).toUpperCase())||r.receipts[0];
      return exact;
    }
    return null;
  };
  const copyStudent=async()=>{ setLoading("student"); const rec=await fetchReceipt(); setLoading(""); if(rec&&rec.receipt_text){ navigator.clipboard.writeText(rec.receipt_text); showToast("Student copy"); } else showToast("No receipt text","error"); };
  const copyGroup=async()=>{ setLoading("group"); const rec=await fetchReceipt(); setLoading(""); if(rec&&rec.registration_text){ navigator.clipboard.writeText(rec.registration_text); showToast("Group copy"); } else showToast("No group text (renewal?)","error"); };
  const copyContact=async()=>{ setLoading("contact"); const rec=await fetchReceipt(); setLoading(""); const L=rec?(rec.branch||rec.library):(branch||lib); navigator.clipboard.writeText(`${occupant.name} ${L} ${occupant.student_id}`); showToast("Contact copy"); };
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      <button disabled={!!loading} onClick={copyStudent} className="py-2 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs disabled:opacity-50">{loading==="student"?"…":"📋 Student"}</button>
      <button disabled={!!loading} onClick={copyGroup} className="py-2 rounded-lg bg-lma-primary/10 text-lma-primary font-bold text-xs disabled:opacity-50">{loading==="group"?"…":"📢 Group"}</button>
      <button disabled={!!loading} onClick={copyContact} className="py-2 rounded-lg bg-lma-warn/10 text-lma-warn font-bold text-xs disabled:opacity-50">{loading==="contact"?"…":"📇 Contact"}</button>
    </div>
  );
}

// ── LANE WRAPPER (a labeled section inside the unified seat card) ──
function Lane({ emoji, label, tone, children }:{ emoji:string; label:string; tone:string; children:React.ReactNode }){
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-1.5 text-[11px] font-extrabold uppercase tracking-wide ${tone}`}>
        <span>{emoji}</span><span>{label}</span>
      </div>
      {children}
    </div>
  );
}

// ── UNIFIED SEAT CARD ────────────────────────────────────────────
// Every seat tap opens this. A seat has up to 3 lanes (FULL DAY, or
// MORNING + EVENING). Each lane is independently BOOKED / BLOCKED / VACANT,
// rendered with the SAME architecture so blocks read like bookings.
function DetailSheet({ cell, panel, onClose, router, scope, lib, branch, post, showToast, onChanged, onReAllot, onShare, onBlock, onEdit }:{ cell:BoardCell; panel?:boolean; onClose:()=>void; router:any; scope:string; lib:string; branch:string; post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void; onChanged:()=>void; onReAllot:(o:Occupant)=>void; onShare:(text:string,label:string)=>void; onBlock:(seatLabel:string,shift:string)=>void; onEdit:(seatLabel:string,blk:BlockInfo)=>void }){
  const [busy,setBusy]=useState(false);
  const [confirmVacate,setConfirmVacate]=useState<Occupant|null>(null);
  const [chooseMode,setChooseMode]=useState<""|"ADD"|"BLOCK">(""); // fully-vacant: ask shift before booking/blocking
  const L = branch||lib;

  const goBook=(shift?:string)=>{ const q=new URLSearchParams({lib:L,seat:cell.display_label}); if(shift) q.set("shift",shift); router.push(`/lma/admissions?${q}`); };

  const doVacate=async(o:Occupant)=>{
    setBusy(true);
    const r=await post("tempVacateSeat",{receipt_no:o.receipt_no});
    setBusy(false);
    if(r&&r.vacated){ showToast(`${o.student_id} parked (seat ${r.original_seat} held)`); if(r.whatsapp_text) onShare(r.whatsapp_text,"Seat temporarily vacated"); onChanged(); }
    else showToast(r&&r.error?r.error:"Temp-vacate failed","error");
  };
  const removeBlock=async(blk:BlockInfo)=>{
    if(busy) return;
    if(!confirm("Remove this block?")) return;
    setBusy(true);
    const r=await post("removeSeatBlock",{ block_id:blk.block_id });
    setBusy(false);
    if(r&&r.ok!==false){ showToast("Removed"); onChanged(); } else showToast((r&&r.error)||"Failed","error");
  };

  // ── lane data ──
  const bi=cell.block_info||{morning:null,evening:null,fullday:null};
  const th=cell.temp_held||{morning:null,evening:null,fullday:null};
  const fdOcc=cell.fullday, fdBlk=bi.fullday;
  const mOcc=cell.morning,  mBlk=bi.morning;
  const eOcc=cell.evening,  eBlk=bi.evening;

  // ── BOOKED lane: details + actions ──
  const BookingPanel=(o:Occupant)=>{
    const col=COLOR[o.color]||COLOR.OK;
    return (
      <div className="border border-lma-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:col.bg,color:col.text}}>{o.shift_name||o.shift}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:col.bg,color:col.text}}>{col.label}</span>
          {o.has_dues&&<span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:COLOR.DUES.bg,color:COLOR.DUES.text}}>DUES</span>}
          {o.is_cross_library&&o.is_cross_library!=="NO"&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded ml-auto">CROSS · {o.is_cross_library}</span>}
        </div>
        <div className="text-sm font-extrabold text-lma-slate-900">{o.student_id} · {o.name}</div>
        <div className="text-[11px] text-lma-slate-500 mt-0.5">Receipt {o.receipt_no} · until {o.booking_to}</div>
        {o.fees_due_balance>0&&<div className="text-[11px] font-bold text-lma-danger mt-0.5">Dues: ₹{o.fees_due_balance} ({o.dues_status})</div>}
        <DetailCopyRow occupant={o} lib={lib} branch={branch} showToast={showToast}/>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={()=>{ const q=new URLSearchParams({lib:L,student_id:o.student_id,renew_from:o.receipt_no}); router.push(`/lma/admissions?${q}`); }} className="py-2 rounded-lg bg-lma-primary/10 text-lma-primary font-bold text-xs">Renew</button>
          <button onClick={()=>router.push("/lma/renewals")} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Cancel</button>
          {o.temporary_seat
            ? <div className="py-2 rounded-lg bg-lma-warn/10 text-lma-warn font-bold text-xs text-center">Floating · was {o.temporary_seat}</div>
            : <button disabled={busy} onClick={()=>setConfirmVacate(o)} className="py-2 rounded-lg bg-lma-warn/10 text-lma-warn font-bold text-xs disabled:opacity-50">Temp-Vacate</button>}
          <button disabled={busy} onClick={()=>onReAllot(o)} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs disabled:opacity-50">{o.temporary_seat?"Re-Allot (restore)":"Re-Allot"}</button>
        </div>
      </div>
    );
  };

  // ── BLOCKED lane: same architecture as a booking ──
  const BlockPanel=(blk:BlockInfo)=>(
    <div className="rounded-xl p-3" style={{border:"1.5px solid #fca5a5",background:"repeating-linear-gradient(45deg,#fff5f5,#fff5f5 8px,#fee2e2 8px,#fee2e2 16px)"}}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-lma-danger text-white">🚫 BLOCKED</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/70 text-lma-danger">{blk.shift==="ALL"?"All shifts":blk.shift}</span>
        <span className="text-[10px] font-mono text-lma-slate-500 ml-auto">{blk.block_id}</span>
      </div>
      <div className="text-[11px] text-lma-slate-600"><span className="font-bold">Reason: </span>{blk.reason||"—"}</div>
      {(blk.block_from||blk.block_to)&&<div className="text-[11px] text-lma-slate-600 mt-0.5"><span className="font-bold">Dates: </span>{blk.block_from||"…"} → {blk.block_to||"…"}</div>}
      <div className="grid grid-cols-2 gap-2 mt-2.5">
        <button disabled={busy} onClick={()=>onEdit(cell.display_label,blk)} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-700 font-bold text-xs disabled:opacity-50">Edit</button>
        <button disabled={busy} onClick={()=>removeBlock(blk)} className="py-2 rounded-lg bg-lma-danger text-white font-bold text-xs disabled:opacity-50">Remove Block</button>
      </div>
    </div>
  );

  // ── VACANT lane: add booking / block seat ──
  const VacantPanel=(shift:"MORNING"|"EVENING"|"FULL DAY"|undefined, held:TempHeldInfo|null)=>{
    // Fully-vacant seat (shift undefined): Add Booking AND Block Seat each ask the shift first.
    if(chooseMode && !shift){
      const isAdd=chooseMode==="ADD";
      const pick=(s:"MORNING"|"EVENING"|"FULL DAY")=>{ if(isAdd){ goBook(s); } else { setChooseMode(""); onBlock(cell.display_label,s); } };
      return (
        <div className="rounded-xl p-3 border border-dashed border-lma-slate-300 bg-lma-slate-50">
          <div className="text-[11px] font-bold text-lma-slate-500 mb-2">{isAdd?"Book which shift?":"Block which shift?"}</div>
          <div className="grid grid-cols-3 gap-2">
            {(["MORNING","EVENING","FULL DAY"] as const).map(s=>(
              <button key={s} onClick={()=>pick(s)} className={`py-2.5 rounded-lg font-bold text-xs ${isAdd?"bg-lma-primary/10 text-lma-primary":"bg-lma-danger/10 text-lma-danger"}`}>{s==="FULL DAY"?"Full Day":s.charAt(0)+s.slice(1).toLowerCase()}</button>
            ))}
          </div>
          <button onClick={()=>setChooseMode("")} className="w-full mt-2 py-1.5 rounded-lg text-lma-slate-500 font-bold text-[11px]">Back</button>
        </div>
      );
    }
    return (
      <div className="rounded-xl p-3 border border-dashed border-lma-slate-300 bg-lma-slate-50">
        {held&&<p className="text-[11px] text-lma-warn font-semibold mb-2">⚠ Held by <b>{held.name||held.student_id}</b> (temp-vacate). Use another seat unless you mean to reassign it.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>{ if(shift) goBook(shift); else setChooseMode("ADD"); }} className="py-2.5 rounded-lg bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-xs shadow-md">＋ Add Booking</button>
          <button onClick={()=>{ if(shift) onBlock(cell.display_label,shift); else setChooseMode("BLOCK"); }} className="py-2.5 rounded-lg bg-lma-danger/10 text-lma-danger font-bold text-xs">🚫 Block Seat</button>
        </div>
      </div>
    );
  };

  // ── status summary line ──
  const stateOf=(o:Occupant|null,b:BlockInfo|null)=> o?"booked":b?"blocked":"vacant";
  let summary="";
  if(panel) summary="Booking";
  else if(fdOcc) summary="Full day · booked";
  else if(fdBlk) summary="Full day · blocked";
  else if(!mOcc&&!eOcc&&!mBlk&&!eBlk) summary="Vacant";
  else summary=`Morning ${stateOf(mOcc,mBlk)} · Evening ${stateOf(eOcc,eBlk)}`;

  // ── body ──
  let body:React.ReactNode;
  if(panel){
    const occs=[fdOcc,mOcc,eOcc].filter(Boolean) as Occupant[];
    body=<div className="space-y-3">{occs.map(o=><div key={o.receipt_no}>{BookingPanel(o)}</div>)}</div>;
  } else if(fdOcc){
    body=<Lane emoji="🗓️" label="Full Day" tone="text-lma-slate-700">{BookingPanel(fdOcc)}</Lane>;
  } else if(fdBlk){
    body=<Lane emoji="🗓️" label="Full Day" tone="text-lma-danger">{BlockPanel(fdBlk)}</Lane>;
  } else if(!mOcc&&!eOcc&&!mBlk&&!eBlk){
    body=<Lane emoji="🪑" label="Full seat free" tone="text-lma-slate-500">{VacantPanel(undefined, th.fullday||th.morning||th.evening)}</Lane>;
  } else {
    body=(
      <div className="space-y-2">
        <Lane emoji="☀️" label="Morning" tone="text-lma-warn">
          {mOcc?BookingPanel(mOcc):mBlk?BlockPanel(mBlk):VacantPanel("MORNING", th.morning)}
        </Lane>
        <div className="h-px bg-lma-slate-200"/>
        <Lane emoji="🌙" label="Evening" tone="text-lma-primary">
          {eOcc?BookingPanel(eOcc):eBlk?BlockPanel(eBlk):VacantPanel("EVENING", th.evening)}
        </Lane>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        <div className="flex items-baseline gap-2 mb-3">
          <h3 className="text-base font-extrabold text-lma-slate-900">Seat {cell.display_label}</h3>
          <span className="text-[11px] font-semibold text-lma-slate-500">{summary}</span>
        </div>
        {body}
        <button onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Close</button>

        {confirmVacate&&(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" onClick={()=>setConfirmVacate(null)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
              <h4 className="text-sm font-extrabold text-lma-slate-900 mb-1">Temp-Vacate seat {cell.display_label}?</h4>
              <p className="text-[12px] text-lma-slate-500 mb-4">{confirmVacate.student_id} · {confirmVacate.name} will be parked. Seat {cell.display_label} is freed but held for them until you re-allot.</p>
              <div className="flex gap-2">
                <button onClick={()=>setConfirmVacate(null)} className="flex-1 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">No</button>
                <button disabled={busy} onClick={()=>{const o=confirmVacate;setConfirmVacate(null);doVacate(o);}} className="flex-1 py-2.5 rounded-xl bg-lma-warn text-white font-bold text-sm disabled:opacity-50">Park</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── DETAILED EXPORT LAYOUT (off-screen, captured by html2canvas) ──
function DetailedExport({ board, label, shiftView }:{ board:BoardResp; label:string; shiftView:ShiftView }){
  const EXPORT_COLOR: Record<string,{bg:string;text:string;border:string}> = {
    OK:       { bg:"#dcfce7", text:"#15803d", border:"#86efac" },
    EXPIRING:         { bg:"#fee2e2", text:"#b91c1c", border:"#fca5a5" },
    EXPIRING_PRIMARY: { bg:"#dc2626", text:"#ffffff", border:"#7f1d1d" },
    EXPIRED:          { bg:"#6b0a0a", text:"#ffffff", border:"#450a0a" },
    DUES:     { bg:"#fde68a", text:"#92400e", border:"#f59e0b" },
  };
  const EXPORT_GOLD = "#f59e0b";
  // Export look: expiry = fill; dues = gold fill when OK, else gold ring.
  function exLook(o:Occupant){
    const key = (o.color==="EXPIRING" && o.urgent) ? "EXPIRING_PRIMARY" : o.color; // B1: primary → solid red fill
    const base = EXPORT_COLOR[key] || EXPORT_COLOR.OK;
    if(o.has_dues && o.color==="OK") return { bg:EXPORT_COLOR.DUES.bg, text:EXPORT_COLOR.DUES.text, ring:false };
    if(o.has_dues) return { bg:base.bg, text:base.text, ring:true };
    return { bg:base.bg, text:base.text, ring:false };
  }
  // Gold, prominent due amount (always gold text on a chip so it stands out).
  const dueAmt=(o:Occupant)=> o.fees_due_balance>0
    ? <div style={{fontSize:"12px",fontWeight:900,textAlign:"center",lineHeight:1.2,minHeight:"15px",flexShrink:0,color:"#92400e",background:"#fde68a",borderRadius:"4px",margin:"1px 4px"}}>{`₹${o.fees_due_balance} DUE`}</div>
    : <div style={{minHeight:"15px",flexShrink:0}}/>;

  // side-panel item look — mirrors the on-screen SidePanel color logic
  function panelLook(it:SidePanelItem){
    const dueGold = it.has_dues;
    if(it.color==="EXPIRED")  return { bg:"#7f1d1d", fg:"#ffffff", sub:"rgba(255,255,255,0.75)", ring:!!dueGold };
    if(it.color==="EXPIRING") return { bg:"#fee2e2", fg:"#991b1b", sub:"#b91c1c", ring:!!dueGold };
    if(dueGold)               return { bg:"#fde68a", fg:"#92400e", sub:"#a16207", ring:false };
    return { bg:"#dcfce7", fg:"#15803d", sub:"#16a34a", ring:false };
  }

  function richCell(cell:BoardCell){
    if(cell.cell_type==="DEAD") return <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:"8px",width:"100%",height:"100%"}}/>;
    const fd=cell.fullday, m=cell.morning, e=cell.evening;
    const b=cell.blocked||{morning:false,evening:false,fullday:false};
    const bi=cell.block_info||{morning:null,evening:null,fullday:null};
    const vacantTile = !fd && !m && !e && !b.morning && !b.evening && !b.fullday;
    const th = cell.temp_held;
    const heldHolder = th ? (th.fullday||th.morning||th.evening) : null;
    const heldOnVacant = vacantTile && !!heldHolder;
    const heldLabel = heldHolder ? heldHolder.student_id : "";
    const VACANT_FILL = "rgba(0,0,0,0.08)";
    const VACANT_BORDER = "1.5px solid rgba(0,0,0,0.55)";
    const HELD_BORDER = "2px dashed rgba(0,0,0,0.75)";

    // Shrinks font so 3-line names never bury the date
const halfNameSize=(name:string)=>{
  const l=name.replace(/\s+/g," ").trim().length;
  if(l>22) return "9px";
  if(l>16) return "11px";
  return "13px";
};

    // one occupant's data block (used in a half, or full-day upper area)
    const dataRows=(o:Occupant)=>(
  <>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",fontWeight:900,lineHeight:1.2,gap:"4px",flexShrink:0}}>
      <span style={{whiteSpace:"nowrap"}}>{o.student_id}</span>
      <span style={{whiteSpace:"nowrap"}}>{o.receipt_no}</span>
    </div>

    {/* ↓ minHeight:0 lets flex shrink it; overflow:hidden clips; dynamic fontSize; center-align */}
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:halfNameSize(o.name),fontWeight:800,textAlign:"center",lineHeight:1.2,wordBreak:"break-word"}}>{o.name}</div>

    {dueAmt(o)}
    <div style={{fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.2,flexShrink:0,marginBottom:"3px"}}>{o.booking_to}</div>
  </>
);

    // block detail rows (mirrors a booking tile: tag+id top, reason middle, dates bottom)
    const blockRows=(blk:BlockInfo)=>{
      const dates=(blk.block_from||blk.block_to)?`${blk.block_from||"…"} → ${blk.block_to||"…"}`:"";
      return (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:"10px",fontWeight:900,lineHeight:1.2,gap:"4px",flexShrink:0,color:"#b91c1c"}}>
            <span style={{whiteSpace:"nowrap"}}>BLOCKED</span>
            {blk.block_id&&<span style={{whiteSpace:"nowrap",fontWeight:700,fontSize:"8px",opacity:0.85}}>{blk.block_id}</span>}
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800,textAlign:"center",lineHeight:1.2,wordBreak:"break-word",overflow:"hidden",color:"#7f1d1d"}}>{blk.reason||"—"}</div>
          {dates&&<div style={{fontSize:"9px",fontWeight:800,textAlign:"center",lineHeight:1.2,flexShrink:0,color:"#b91c1c"}}>{dates}</div>}
        </>
      );
    };

    // a half-zone: occupant data, blocked/hold stripe, or empty
    const halfZone=(o:Occupant|null, blk:BlockInfo|null)=>{
      if(o){
        const col=exLook(o);
        return <div style={{height:"100%",width:"100%",background:col.bg,color:col.text,borderRadius:"4px",padding:"1px 7px 9px 7px",display:"flex",flexDirection:"column",boxSizing:"border-box",overflow:"hidden",boxShadow:col.ring?`inset 0 0 0 3px ${EXPORT_GOLD}`:undefined}}>{dataRows(o)}</div>;
      }
      if(blk){
        return (
          <div style={{height:"100%",width:"100%",background:"repeating-linear-gradient(45deg,#fecaca,#fecaca 6px,#fee2e2 6px,#fee2e2 12px)",borderRadius:"4px",padding:"5px 7px",display:"flex",flexDirection:"column",boxSizing:"border-box",overflow:"hidden",border: blk.expired?"2px dashed #b91c1c":"1px solid #f87171"}}>
            {blockRows(blk)}
          </div>
        );
      }
      // empty half — dark fill when the OTHER half is occupied
      return <div style={{height:"100%",width:"100%",background: vacantTile?"transparent":VACANT_FILL,borderRadius:"4px"}}/>;
    };

    // notes badge (optional) — small line under seat number
    const notesText = (cell.notes && String(cell.notes).trim()) ? String(cell.notes).trim() : "";

    // number band (middle) — transparent when fully vacant so wrapper's dark fill shows uninterrupted
    const numberBand=(
      <div style={{flexShrink:0,minHeight:"30px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background: vacantTile?"transparent":"#fff",padding:"0px 0px 6px"}}>
        <span style={{fontWeight:900,fontSize:"24px",color:"#0f172a",lineHeight:1}}>{cell.display_label}</span>
        {notesText && <span style={{fontSize:"8px",fontWeight:700,color:"#94a3b8",lineHeight:1,marginTop:"1px",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{notesText}</span>}
      </div>
    );

    // FULL DAY (occupied)
    if(fd){
      const col=exLook(fd);
      return (
        <div style={{border:col.ring?`3px solid ${EXPORT_GOLD}`:"1.5px solid #cbd5e1",borderRadius:"8px",overflow:"hidden",height:"100%",display:"flex",flexDirection:"column",background:col.bg,color:col.text,boxSizing:"border-box",padding:"5px 7px"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",fontWeight:900,lineHeight:1.2,gap:"4px",flexShrink:0}}>
            <span style={{whiteSpace:"nowrap"}}>{fd.student_id}</span>
            <span style={{whiteSpace:"nowrap"}}>{fd.receipt_no}</span>
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",fontWeight:800,textAlign:"center",lineHeight:1.25,wordBreak:"break-word",overflow:"hidden"}}>{fd.name}</div>
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontWeight:900,fontSize:"24px",color:"#0f172a",lineHeight:1}}>{cell.display_label}</span>
            {notesText && <span style={{fontSize:"8px",fontWeight:700,color:"#475569",lineHeight:1,marginTop:"1px"}}>{notesText}</span>}
          </div>
          {dueAmt(fd)}
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.2}}>{fd.booking_to}</div>
        </div>
      );
    }

    // FULL-DAY BLOCK fills whole tile (with full detail)
    if(bi.fullday){
      const blk=bi.fullday;
      const dates=(blk.block_from||blk.block_to)?`${blk.block_from||"…"} → ${blk.block_to||"…"}`:"";
      return (
        <div style={{border: blk.expired?"2px dashed #b91c1c":"1.5px solid #b91c1c",borderRadius:"8px",overflow:"hidden",height:"100%",display:"flex",flexDirection:"column",background:"repeating-linear-gradient(45deg,#fecaca,#fecaca 6px,#fee2e2 6px,#fee2e2 12px)",color:"#b91c1c",boxSizing:"border-box",padding:"5px 7px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:"11px",fontWeight:900,gap:"4px",flexShrink:0}}>
            <span style={{whiteSpace:"nowrap"}}>{blk.expired?"BLOCK ENDED":"BLOCKED"}</span>
            {blk.block_id&&<span style={{whiteSpace:"nowrap",fontSize:"8px",fontWeight:700,opacity:0.85}}>{blk.block_id}</span>}
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.25,wordBreak:"break-word",overflow:"hidden",color:"#7f1d1d"}}>{blk.reason||"—"}</div>
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontWeight:900,fontSize:"24px",color:"#0f172a",lineHeight:1}}>{cell.display_label}</span>
            {notesText&&<span style={{fontSize:"8px",fontWeight:700,color:"#475569",lineHeight:1,marginTop:"1px"}}>{notesText}</span>}
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:800,textAlign:"center",lineHeight:1.2,color:"#b91c1c"}}>{dates}</div>
        </div>
      );
    }

    // MORNING (upper) + EVENING (lower), number band in middle — grid for deterministic html2canvas rendering
    const wrapperBorder = heldOnVacant ? HELD_BORDER : (vacantTile ? VACANT_BORDER : "1.5px solid #cbd5e1");
    const wrapperBg = vacantTile ? VACANT_FILL : "#fff";
    return (
      <div style={{border:wrapperBorder,borderRadius:"8px",overflow:"hidden",height:"100%",display:"grid",gridTemplateRows:"1fr 34px 1fr",rowGap:"6px",background:wrapperBg,boxSizing:"border-box",padding:"4px"}}>
        <div style={{overflow:"hidden",minWidth:0,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {heldOnVacant ? <span style={{fontSize:"11px",fontWeight:900,color:"rgba(0,0,0,0.75)",letterSpacing:"0.3px"}}>{heldLabel}</span> : halfZone(m, bi.morning)}
        </div>
        {numberBand}
        <div style={{overflow:"hidden",minWidth:0,minHeight:0}}>{halfZone(e, bi.evening)}</div>
      </div>
    );
  }

  const hasPanels = board.unassigned.length>0 || board.floating.length>0 || board.otherShift.length>0;

  return (
    <div id="board-detailed-export" style={{position:"fixed",left:"-99999px",top:0,background:"#fff",padding:"24px",width:"fit-content"}}>
      <div style={{textAlign:"center",marginBottom:"28px"}}>
        <div style={{fontSize:"54px",fontWeight:900,color:"#0f172a",letterSpacing:"1px",lineHeight:1.1}}>{label}</div>
        <div style={{fontSize:"22px",fontWeight:600,color:"#475569",marginTop:"8px",lineHeight:1.2}}>{new Date().toLocaleDateString()} · {shiftView==="ALL"?"All shifts":shiftView}</div>
      </div>
      <div style={{display:"flex",gap:"16px",alignItems:"flex-start"}}>
        {/* LEFT column — non-seat bookings, color-coded, narrow stacked cards */}
        {hasPanels && (
          <div style={{width:"260px",flexShrink:0,display:"flex",flexDirection:"column",gap:"12px"}}>
            {[["Unassigned",board.unassigned],["Floating",board.floating],["Other shift",board.otherShift]].map(([t,items]:any)=> items.length>0&&(
              <div key={t} style={{background:"#f8fafc",borderRadius:"8px",padding:"10px"}}>
                <div style={{fontSize:"12px",fontWeight:700,color:"#475569",marginBottom:"8px"}}>{t} · {items.length}</div>
                <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                {items.map((it:SidePanelItem)=>{
                  const L=panelLook(it);
                  return (
                  <div key={it.receipt_no} style={{borderRadius:"6px",padding:"8px 10px",background:L.bg,boxShadow:L.ring?`inset 0 0 0 2px ${EXPORT_GOLD}`:undefined}}>
                    {/* Row 1 — id left, receipt_no right */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"6px",marginBottom:"6px"}}>
                      <span style={{fontSize:"10px",fontWeight:900,color:L.fg,letterSpacing:"0.3px",lineHeight:1.4}}>{it.student_id}</span>
                      <span style={{fontSize:"10px",fontWeight:800,color:L.sub,letterSpacing:"0.3px",lineHeight:1.4}}>{it.receipt_no}</span>
                    </div>
                    {/* Row 2 — name centered, wraps if long */}
                    <div style={{fontSize:"11px",fontWeight:800,color:L.fg,lineHeight:1.4,textAlign:"center",wordBreak:"break-word",padding:"2px 0"}}>{it.name}</div>
                    {/* Row 3 — shift centered */}
                    <div style={{fontSize:"9px",fontWeight:700,color:L.sub,letterSpacing:"0.4px",textAlign:"center",lineHeight:1.4,marginBottom:"6px"}}>{it.shift_name||it.shift}</div>
                    {/* Row 4 — date left, chips right */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"6px",flexWrap:"wrap",rowGap:"3px"}}>
                      <span style={{fontSize:"9px",fontWeight:700,color:L.sub,lineHeight:1.4}}>{it.booking_to||""}</span>
                      <div style={{display:"flex",gap:"3px",flexShrink:0}}>
                        {it.temporary_seat&&<span style={{fontSize:"9px",fontWeight:800,padding:"2px 6px",borderRadius:"3px",color:L.fg,background:"rgba(255,255,255,0.5)",lineHeight:1.4}}>was {it.temporary_seat}</span>}
                        {it.fees_due_balance>0&&<span style={{fontSize:"9px",fontWeight:900,padding:"2px 6px",borderRadius:"3px",color:"#92400e",background:"#fde68a",lineHeight:1.4}}>₹{it.fees_due_balance} DUE</span>}
                      </div>
                    </div>
                  </div>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* RIGHT — seat chart sections */}
        <div style={{flexShrink:0}}>
          {board.sections.slice().sort((a,b)=>a.section_order-b.section_order).map(sec=>(
            <div key={sec.section_name} style={{marginBottom:"20px"}}>
              {board.sections.length>1&&<div style={{fontSize:"12px",fontWeight:700,color:"#64748b",marginBottom:"6px"}}>{sec.section_name}</div>}
              <div style={{display:"grid",gridTemplateColumns:`repeat(${sec.cols}, 140px)`,gridAutoRows:"230px",gap:"6px"}}>
                {Array.from({length:sec.rows*sec.cols}).map((_,idx)=>{
                  const r=Math.floor(idx/sec.cols)+1,c=(idx%sec.cols)+1;
                  const cell=sec.seats.find(s=>s.row_in_section===r&&s.col_in_section===c);
                  if(!cell) return <div key={idx}/>;
                  return <div key={idx} style={{height:"100%"}}>{richCell(cell)}</div>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ── RE-ALLOT SEAT PICKER ─────────────────────────────────────────
// Used in two modes (both call reAllotSeat):
//   • floating restore: ctx.original is the parked seat (pre-noted)
//   • move a seated student: no original; any vacant seat is the target
function ReAllotPicker({ ctx, lib, branch, post, onClose, showToast, onDone, onShare }:{
  ctx:{receipt_no:string;name:string;student_id:string;shift:string;original?:string};
  lib:string; branch:string;
  post:(a:string,p:any)=>Promise<any>;
  onClose:()=>void; showToast:(m:string,t?:"success"|"error")=>void; onDone:()=>void; onShare:(text:string,label:string)=>void;
}){
  const [data,setData]=useState<PickResp|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [picked,setPicked]=useState<string>("");

  useEffect(()=>{
    const params=new URLSearchParams({action:"getVacantSeats",library_code:lib,shift:ctx.shift});
    if(branch) params.set("branch_code",branch);
    fetch(`${API}?${params}`).then(r=>r.json()).then((r:PickResp)=>{ setData(r); setLoading(false); }).catch(()=>{ setLoading(false); });
  },[lib,branch,ctx.shift]);

  const submit=async(seat:string)=>{
    setBusy(true);
    const r=await post("reAllotSeat",{receipt_no:ctx.receipt_no,seat_no:seat});
    setBusy(false);
    if(r&&r.reallotted){ showToast(`${ctx.student_id} → seat ${r.seat_no}`); if(r.whatsapp_text) onShare(r.whatsapp_text,"Seat changed"); onDone(); }
    else showToast(r&&r.error?r.error:"Re-allot failed","error");
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Re-Allot seat</h3>
        <p className="text-[12px] text-lma-slate-500 mb-1">{ctx.student_id} · {ctx.name} · {ctx.shift}</p>
        {ctx.original&&<p className="text-[12px] text-lma-warn font-semibold mb-3">Original seat <b>{ctx.original}</b> is highlighted — tap it to restore, or pick another vacant seat.</p>}
        {!ctx.original&&<p className="text-[12px] text-lma-slate-500 mb-3">Pick a vacant seat to move them to.</p>}

        {loading?(
          <div className="text-center text-sm text-lma-slate-500 py-8">Loading seats…</div>
        ):!data||!data.sections?(
          <div className="text-center text-sm text-lma-slate-500 py-8">No layout.</div>
        ):(
          <div className="space-y-4">
            {data.sections.slice().sort((a,b)=>a.section_order-b.section_order).map(sec=>(
              <div key={sec.section_name}>
                {data.sections.length>1&&<div className="text-[11px] font-bold text-lma-slate-500 mb-1.5">{sec.section_name}</div>}
                <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${sec.cols}, minmax(30px, 1fr))`}}>
                  {Array.from({length:sec.rows*sec.cols}).map((_,idx)=>{
                    const r=Math.floor(idx/sec.cols)+1,c=(idx%sec.cols)+1;
                    const cell=sec.seats.find(s=>s.row_in_section===r&&s.col_in_section===c);
                    if(!cell) return <div key={idx} className="aspect-square"/>;
                    if(cell.cell_type==="DEAD") return <div key={idx} className="aspect-square rounded bg-lma-slate-500"/>;
                    const isVacant=cell.state==="VACANT";
                    const isOriginal=ctx.original&&cell.display_label===ctx.original;
                    const isPicked=picked===cell.display_label;
                    const tone=isPicked?{bg:"#4f46e5",fg:"#fff",bd:"#4f46e5"}
                      :isOriginal?{bg:"#fffbeb",fg:"#b45309",bd:"#f59e0b"}
                      :isVacant?{bg:"#f0fdf4",fg:"#15803d",bd:"#86efac"}
                      :{bg:"#f1f5f9",fg:"#94a3b8",bd:"#e2e8f0"};
                    return (
                      <button key={idx} disabled={!isVacant||busy}
                        onClick={()=>setPicked(cell.display_label)}
                        title={cell.occupant?cell.occupant.name:(cell.share_note||"")}
                        className="aspect-square rounded text-[9px] font-extrabold flex items-center justify-center disabled:cursor-not-allowed"
                        style={{background:tone.bg,color:tone.fg,border:`${isOriginal?"1.5px dashed":"1px solid"} ${tone.bd}`}}>
                        {cell.display_label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-5 sticky bottom-0 bg-white pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
          <button disabled={!picked||busy} onClick={()=>submit(picked)} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50">{busy?"…":picked?`Allot ${picked}`:"Pick a seat"}</button>
        </div>
      </div>
    </div>
  );
}
// ── BLOCK FORM + DETAIL ──────────────────────────────────

// Map a tile's tap area to the SEAT_BLOCKS shift value.
// Upper half = MORNING, lower = EVENING, full tile = FULL DAY by default.
// User can override on the form (ALL = blocks every shift on that seat).
const BLOCK_SHIFTS=["MORNING","EVENING","FULL DAY"];

function ShiftPicker({ value, onChange }:{ value:string; onChange:(v:string)=>void }){
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {BLOCK_SHIFTS.map(s=>(
        <button key={s} onClick={()=>onChange(s)} className={`py-2 rounded-lg text-[11px] font-bold border ${value===s?"bg-lma-primary text-white border-lma-primary":"bg-lma-slate-50 text-lma-slate-700 border-lma-slate-200"}`}>{s}</button>
      ))}
    </div>
  );
}

function BlockForm({ seat, suggestedShift, blockId, initReason, initFrom, initTo, lib, branch, post, onClose, onSaved, showToast }:{ seat:string; suggestedShift:string; blockId?:string; initReason?:string; initFrom?:string; initTo?:string; lib:string; branch:string; post:(a:string,p:any)=>Promise<any>; onClose:()=>void; onSaved:()=>void; showToast:(m:string,t?:"success"|"error")=>void }){
  const isEdit=!!blockId;
  const [shift,setShift]=useState(suggestedShift||"FULL DAY");
  const [reason,setReason]=useState(initReason||"");
  const [from,setFrom]=useState(initFrom||"");
  const [to,setTo]=useState(initTo||"");
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy) return;
    setBusy(true);
    const r=isEdit
      ? await post("updateSeatBlock",{ block_id:blockId, shift_blocked:shift, reason, block_from:from, block_to:to })
      : await post("addSeatBlock",{ library_code:lib, branch_code:branch, seat_display_label:seat, shift_blocked:shift, reason, block_from:from, block_to:to });
    setBusy(false);
    if(r&&r.ok!==false){ onSaved(); }
    else { showToast((r&&r.error)||"Failed","error"); }
  };
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">🚫 {isEdit?"Edit Block":"Block Seat"} {seat}</h3>
        <p className="text-[11px] text-lma-slate-500 mb-3">{isEdit?"Update this block's shift, dates or reason.":"Walls off the seat for the chosen shift(s). No student attached."}</p>
        <Lbl>Shift</Lbl>
        <ShiftPicker value={shift} onChange={setShift}/>
        <Lbl>Reason (optional)</Lbl>
        <Txt value={reason} onChange={e=>setReason(e.target.value)} placeholder="Repair, reserved, etc."/>
        <div className="grid grid-cols-2 gap-2">
          <div><Lbl>From (info)</Lbl><Txt value={from} onChange={e=>setFrom(e.target.value)} placeholder="DD-M-YYYY"/></div>
          <div><Lbl>To (info)</Lbl><Txt value={to} onChange={e=>setTo(e.target.value)} placeholder="DD-M-YYYY"/></div>
        </div>
        <p className="text-[10px] text-lma-slate-400 mt-1">Dates are informational — block stays active until removed.</p>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
          <button disabled={busy} onClick={submit} className="flex-1 py-3 rounded-xl bg-lma-danger text-white font-bold shadow-md disabled:opacity-50">{busy?"…":(isEdit?"Save Changes":"Block Seat")}</button>
        </div>
      </div>
    </div>
  );
}

function BlockDetailSheet({ info, seatLabel, lib, branch, post, onClose, onRemoved, showToast }:{ info:BlockInfo; seatLabel:string; lib:string; branch:string; post:(a:string,p:any)=>Promise<any>; onClose:()=>void; onRemoved:()=>void; showToast:(m:string,t?:"success"|"error")=>void }){
  const [busy,setBusy]=useState(false);
  const remove=async()=>{
    if(busy) return;
    if(!confirm("Remove this block?")) return;
    setBusy(true);
    const r=await post("removeSeatBlock",{ block_id:info.block_id });
    setBusy(false);
    if(r&&r.ok!==false){ onRemoved(); } else showToast((r&&r.error)||"Failed","error");
  };
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">🚫 Block · Seat {seatLabel} · {info.block_id}</h3>
        <p className="text-[11px] text-lma-slate-500 mb-3">{info.shift==="ALL"?"All shifts":info.shift}</p>
        <div className="bg-lma-danger/10 rounded-xl p-3 mb-3 text-sm text-lma-danger">
          <div className="font-bold">Reason</div>
          <div>{info.reason||"—"}</div>
        </div>
        <div className="flex flex-col gap-2">
          <button disabled={busy} onClick={remove} className="w-full py-3 rounded-xl bg-lma-danger text-white font-bold disabled:opacity-50">Remove Block</button>
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── form helpers (scoped so they don't clash with anything) ──
function Lbl({ children }:{ children:React.ReactNode }){ return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1 mt-2">{children}</label>; }
function Txt(props:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium"/>; }
function normalizePhone(input:string):string{
  if(!input) return "";
  let c=input.replace(/[\s\-\.\(\)]/g,"");
  if(c.startsWith("+91")) c=c.slice(3);
  else if(c.startsWith("91")&&c.length>10) c=c.slice(2);
  c=c.replace(/\D/g,"");
  if(c.length>10) c=c.slice(-10);
  return c;
}