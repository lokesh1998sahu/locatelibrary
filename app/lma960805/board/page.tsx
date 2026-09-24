"use client";

import ContactCopyButton from "../_components/ContactCopyButton";
import WhatsAppButton from "../_components/WhatsAppButton";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { laneFree, buildVacancyText, occupancyStats, type VacPlan } from "../_lib/vacancy";
import CancelRefundSheet from "../_components/CancelRefundSheet";
import { buildRenewReminder, buildDuesReminder, buildRenewFollowUpPay, buildRenewFollowUpAsk } from "../_lib/reminderText";
import ReceiptModal from "../_components/ReceiptModal";
import StudentModal from "../_components/StudentModal";
import BookingFlow from "../_components/BookingFlow";
import { toIsoInput, fmtDMY, fmtDMYT, daysFromToday } from "../_lib/dates";
import { normGender } from "../_lib/genderTheme";
import { TagBankNote, TagChips } from "../_components/TagBank";
import { ScopeChips, Sheet, Segmented, Chip, Button, IconButton, Skeleton, Empty, inputCls, cx } from "../_ui/kit";
import { IconSearch, IconClose, IconDots, IconSeat, IconChevron } from "../_ui/icons";

const API = "/api/lma960805";

interface Library { library_code:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch  { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface Occupant {
  receipt_no:string; student_id:string; name:string; shift:string; shift_name:string;
  booking_to:string; fees_due_balance:number; dues_status:string; is_cross_library:string; phones?:{number:string;tag:string}[]; phone?:string;
  color:"OK"|"EXPIRING"|"EXPIRED";
  urgent?:boolean;   // B1: within PRIMARY window → darkest-red text
  has_dues?:boolean;
  gender?:string;
  receipt_type?:string;
  remark?:string;
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
  gender?:string;     // O5: optional block gender → M/F border
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
  phones?:{number:string;tag:string}[]; gender?:string;
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

// ── v4 seat-token: tokens + element (mirrors the board tile inside the detail card) ──
const V4_TINT: Record<string,string> = { OK:"#e6f7f0", EXPIRING:"#ffe3ea", EXPIRED:"#efdada" };
const V4_VAC = "#f3f4fa";
const V4_HATCH = "repeating-linear-gradient(45deg,#e4e6f0 0 5px,#eef0f6 5px 10px)";
function v4HalfBg(o:Occupant|null|undefined, b:BlockInfo|null|undefined):string{
  if(o) return V4_TINT[o.color] || V4_TINT.OK;
  if(b) return V4_HATCH;
  return V4_VAC;
}
function SeatToken({ cell }:{ cell:BoardCell }){
  const bi = cell.block_info || { morning:null, evening:null, fullday:null };
  const isFull = !!(cell.fullday || bi.fullday) || (!cell.morning && !cell.evening && !bi.morning && !bi.evening);
  const num = <span style={{ fontFamily:"'JetBrains Mono',ui-monospace,monospace", fontSize:19, fontWeight:700, color:"#1b1d2e", background:"rgba(255,255,255,.85)", borderRadius:7, padding:"2px 7px", lineHeight:1.15, boxShadow:"0 1px 2px rgba(31,28,84,.10)" }}>{cell.display_label}</span>;
  return (
    <div style={{ width:56, flexShrink:0, borderRadius:14, overflow:"hidden", display:"flex", flexDirection:"column", position:"relative", boxShadow:"inset 0 0 0 1px rgba(31,28,84,.08)" }}>
      {isFull
        ? <div style={{ flex:1, background:v4HalfBg(cell.fullday, bi.fullday), display:"flex", alignItems:"center", justifyContent:"center" }}>{num}</div>
        : <><div style={{ flex:1, background:v4HalfBg(cell.morning, bi.morning) }}/><div style={{ flex:1, background:v4HalfBg(cell.evening, bi.evening) }}/><div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>{num}</div></>}
    </div>
  );
}
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
    phones:it.phones, gender:it.gender,
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
  const [openRno,setOpenRno]=useState<string|null>(null);
  const [openStu,setOpenStu]=useState<{id:string;library:string;crossOrigin?:string}|null>(null);
  const [renew,setRenew]=useState<{rno:string;libCode:string;seat?:string;shift?:string}|null>(null);
  const [addBk,setAddBk]=useState<{libCode:string;seat:string;shift?:string}|null>(null);
  const [zoomPx,setZoomPx]=useState(0); // 0 = fit-to-width; >0 = fixed px per seat (on-screen zoom)
  // Block form + block-detail sheets
  const [blockFormSeat,setBlockFormSeat]=useState<{label:string;suggestedShift:string;blockId?:string;reason?:string;from?:string;to?:string;gender?:string}|null>(null);
  const [blockDetail,setBlockDetail]=useState<{info:BlockInfo;seatLabel:string}|null>(null);
  // re-allot picker (from floating panel OR from DetailSheet "move"): receipt + context
  const [reAllot,setReAllot]=useState<{receipt_no:string;name:string;student_id:string;shift:string;original?:string;phones?:{number:string;tag:string}[]}|null>(null);
  const [shareEvent,setShareEvent]=useState<{text:string;label:string;phones?:{number:string;tag:string}[]}|null>(null);
  const [exporting,setExporting]=useState(false);
  const [showPngMenu,setShowPngMenu]=useState(false);
  const [customScale,setCustomScale]=useState("2.5");
  const boardRef = useRef<HTMLDivElement>(null);
  const [menuOpen,setMenuOpen]=useState(false);     // ⋯ : plan, highlight, zoom, lists, PNG, refresh
  const [q,setQ]=useState("");                       // search: seat, name, student id, receipt or phone
  const [flash,setFlash]=useState("");               // seat briefly highlighted after a search jump

  

  const resolved = useMemo(()=>{
    if(!init||!scope) return {lib:"",branch:"",libName:"",label:""};
    const br=init.branches.find(b=>b.branch_code===scope);
    if(br){ const pl=init.libraries.find(x=>x.library_code===br.library_code); const nm=pl?.display_name||br.library_code; return {lib:br.library_code,branch:br.branch_code,libName:nm,label:`${nm} · ${br.branch_code}`}; }
    const l=init.libraries.find(x=>x.library_code===scope);
    return {lib:scope,branch:"",libName:l?.display_name||scope,label:l?.display_name||scope};
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
  const [showVacList,setShowVacList]=useState(false); // B1
  const [genderM,setGenderM]=useState(false);
  const [genderF,setGenderF]=useState(false);
  const [colorFilter,setColorFilter]=useState<string>("");
  const occ=useMemo(()=>board?occupancyStats(board):null,[board]); // B4: same shared vacancy computer
  const legendCounts=useMemo(()=>{
    const c:Record<string,number>={OK:0,EXPIRING_PRIMARY:0,EXPIRING:0,EXPIRED:0,DUES:0,BLOCKED:0,VACANT:0};
    if(!board) return c;
    const occs=(o:any)=>{ if(!o) return; const k=(o.color==="EXPIRING"&&o.urgent)?"EXPIRING_PRIMARY":o.color; if(c[k]!==undefined) c[k]++; if(o.has_dues||o.fees_due_balance>0) c.DUES++; };
    board.sections.forEach(sec=>sec.seats.forEach(cell=>{
      if(cell.cell_type==="DEAD") return;
      const bi=cell.block_info||{morning:null,evening:null,fullday:null};
      occs(cell.fullday); occs(cell.morning); occs(cell.evening);
      if(bi.fullday||bi.morning||bi.evening) c.BLOCKED++;
      const mF=laneFree(cell,"morning");   // B1: shared vacancy computer (now also respects temp-holds)
      const eF=laneFree(cell,"evening");
      const v=shiftView==="MORNING"?mF:shiftView==="EVENING"?eF:shiftView==="FULL DAY"?(mF&&eF):(mF||eF);
      if(v) c.VACANT++;
    }));
    [...(board.unassigned||[]),...(board.floating||[]),...(board.otherShift||[])].forEach(occs);
    return c;
  },[board,shiftView]);

  const downloadPng=async(scale:number=2.5, nodeId:string="board-detailed-export")=>{
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
      const node=document.getElementById(nodeId);
      if(!node){ showToast("Export layout not found","error"); return; }
      const h2c=(window as any).html2canvas;
      const canvas=await h2c(node,{ backgroundColor:"#ffffff", scale:scale, logging:false, useCORS:true, width:node.scrollWidth, height:node.scrollHeight, windowWidth:node.scrollWidth, windowHeight:node.scrollHeight });
      const link=document.createElement("a");
      link.download=`${resolved.label.replace(/[^a-z0-9]/gi,"_")}_${nodeId==="board-vacancy-export"?"vacancy_":""}${new Date().toISOString().slice(0,10)}.png`;
      link.href=canvas.toDataURL("image/png");
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }catch(e){
      console.error("PNG export error:",e);
      showToast("Export failed: "+(e instanceof Error?e.message:String(e)),"error");
    }finally{ setExporting(false); setShowExport(false); }
  };

  // chip list (libraries + branches, no "All")
  const chips = useScopeChips({ includeAll: false });

  // Opens straight into the library used last (or the first one).
  const SCOPE_KEY="lma.board.scope";
  useEffect(()=>{
    if(scope||chips.length===0) return;
    let saved=""; try{ saved=window.localStorage.getItem(SCOPE_KEY)||""; }catch{ /* storage blocked */ }
    setScope(chips.find(c=>c.code===saved)?.code||chips[0].code);
  },[chips,scope]);
  const pickScope=(code:string)=>{
    if(code===scope) return;
    setScope(code); setBoard(null); setLoading(true); setQ("");
    try{ window.localStorage.setItem(SCOPE_KEY,code); }catch{ /* storage blocked */ }
  };

  // Search: seat number (exact), or a name / student id / receipt / phone on any lane or side list.
  type Hit={ seat:string; title:string; sub:string; cell?:BoardCell; item?:SidePanelItem };
  const hits=useMemo<Hit[]>(()=>{
    const t=q.trim(); if(!board||!t) return [];
    const T=t.toUpperCase(); const digits=t.replace(/\D/g,"");
    const match=(o:any)=>!!o&&(
      String(o.name||"").toUpperCase().includes(T)||String(o.student_id||"").toUpperCase().includes(T)||
      String(o.receipt_no||"").toUpperCase()===T||
      (digits.length>=4&&(o.phones||[]).some((p:any)=>normalizePhone(String(p?.number||"")).includes(digits))));
    const out:Hit[]=[];
    board.sections.forEach(sec=>sec.seats.forEach(cell=>{
      if(cell.cell_type==="DEAD") return;
      const label=String(cell.display_label||"");
      const lanes:[string,any][]=[["Full day",cell.fullday],["Morning",cell.morning],["Evening",cell.evening]];
      if(label.toUpperCase()===T){
        out.unshift({ seat:label, title:`Seat ${label}`, sub:lanes.filter(([,o])=>o).map(([n,o])=>`${n}: ${o.name}`).join(" · ")||"Free", cell });
        return;
      }
      lanes.forEach(([n,o])=>{ if(match(o)) out.push({ seat:label, title:o.name, sub:`${n} · ${o.student_id}${o.fees_due_balance>0?` · dues ₹${o.fees_due_balance}`:""}`, cell }); });
    }));
    [...(board.unassigned||[]),...(board.floating||[]),...(board.otherShift||[])].forEach(it=>{
      if(match(it)) out.push({ seat:it.temporary_seat?`was ${it.temporary_seat}`:"—", title:it.name, sub:`Not on a seat · ${it.shift_name||it.shift}`, item:it });
    });
    return out.slice(0,30);
  },[board,q]);
  const openHit=(h:Hit)=>{
    setQ("");
    if(h.item){ setDetail({cell:panelItemToCell(h.item),panel:true}); return; }
    if(h.cell){
      const label=String(h.cell.display_label);
      document.querySelector(`[data-seat="${label.replace(/"/g,"")}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
      setFlash(label); setTimeout(()=>setFlash(""),2600);
      setDetail({cell:h.cell});
    }
  };

  // Settings tucked in the ⋯ menu stay visible here when they are not the default.
  const tucked=[shiftView!=="ALL"?(shiftView==="FULL DAY"?"Full day":shiftView[0]+shiftView.slice(1).toLowerCase()):"",
    genderM?"♂ highlighted":"", genderF?"♀ highlighted":"", zoomPx?"Zoomed":""].filter(Boolean);
  const LEGEND:{k:string;label:string;swatch:React.CSSProperties}[]=[
    ...(["OK","EXPIRING_PRIMARY","EXPIRING","EXPIRED","DUES"] as const).map(k=>({k,label:COLOR[k].label,swatch:{background:COLOR[k].bg,border:`1px solid ${COLOR[k].border}`}})),
    {k:"BLOCKED",label:"Blocked",swatch:{background:"repeating-linear-gradient(45deg,#fecaca,#fecaca 2px,#fee2e2 2px,#fee2e2 4px)",border:"1px solid #b91c1c"}},
    {k:"VACANT",label:"Vacant",swatch:{background:"#f1f5f9",border:"1px solid #e2e8f0"}},
  ];

  return (
   <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      {openRno && <ReceiptModal receiptNo={openRno} onClose={()=>setOpenRno(null)} onSaved={loadBoard}/>}
     {openStu && <StudentModal studentId={openStu.id} library={openStu.library} crossOrigin={openStu.crossOrigin} onClose={()=>setOpenStu(null)} onSaved={loadBoard}/>}
      {renew && <BookingFlow renewReceiptNo={renew.rno} libCode={renew.libCode} presetSeat={renew.seat} presetShift={renew.shift} onClose={()=>setRenew(null)} onComplete={loadBoard}/>}
      {addBk && <BookingFlow addMode libCode={addBk.libCode} presetSeat={addBk.seat} presetShift={addBk.shift} onClose={()=>setAddBk(null)} onComplete={loadBoard}/>}
      <header className="lma-glass-light sticky top-0 z-30 -mx-4 mb-2 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-bold tracking-[-0.01em] text-lma-ink">Seat chart</h1>
            <p className="truncate text-[12px] font-medium text-lma-ink-3">
              {resolved.libName||"Pick a library"}{board&&occ?` · ${occ.occPct}% full`:""}{loading?" · updating…":""}
            </p>
          </div>
          <IconButton label="Chart options" onClick={()=>setMenuOpen(true)} className="-mr-2"><IconDots size={22}/></IconButton>
        </div>
      </header>

      <ScopeChips chips={chips} value={scope} onChange={pickScope}/>

      {/* search — jumps straight to the seat */}
      <div className="relative mb-3">
        <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lma-ink-3"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Seat, name, ID or phone" aria-label="Search seats"
          onKeyDown={e=>{ if(e.key==="Enter"&&hits.length===1) openHit(hits[0]); if(e.key==="Escape") setQ(""); }}
          className={cx(inputCls,"pl-10 pr-11")}/>
        {q&&<button type="button" aria-label="Clear search" onClick={()=>setQ("")} className="lma-btn absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-lma-ink-3"><IconClose size={18}/></button>}
        {q.trim()&&board&&(
          <div className="absolute inset-x-0 top-[54px] z-20 max-h-[55dvh] overflow-y-auto rounded-lma border border-lma-line bg-lma-surface shadow-lma-float">
            {hits.length===0
              ? <p className="px-4 py-3 text-[13px] text-lma-ink-3">Nothing matches “{q.trim()}” in {resolved.label}.</p>
              : hits.map((h,idx)=>(
                <button key={idx} type="button" onClick={()=>openHit(h)}
                  className="lma-noscale flex w-full items-center gap-3 border-b border-lma-line px-4 py-2.5 text-left last:border-b-0 active:bg-lma-bg">
                  <span className="grid h-9 min-w-[40px] place-items-center rounded-[10px] bg-lma-brand-soft px-1.5 font-lma-mono text-[12.5px] font-semibold text-lma-brand">{h.seat}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-lma-ink">{h.title}</span>
                    <span className="block truncate text-[12px] text-lma-ink-3">{h.sub}</span>
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* legend counts — the numbers you watch; tap one to show only those seats */}
      <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {LEGEND.map(L=>{ const on=colorFilter===L.k; return (
          <button key={L.k} type="button" aria-pressed={on} onClick={()=>setColorFilter(f=>f===L.k?"":L.k)}
            className={cx("lma-btn inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold",
              on?"lma-glass-btn text-white":"bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line")}>
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={L.swatch}/>
            <span className={cx("font-lma-mono font-semibold",on?"text-white":"text-lma-ink")}>{legendCounts[L.k]??0}</span>
            <span className={on?"text-white/85":"text-lma-ink-3"}>{L.label}</span>
          </button>
        ); })}
      </div>

      {(tucked.length>0||colorFilter)&&(
        <div className="mb-3 flex items-center gap-2 rounded-[12px] bg-lma-brand-soft px-3 py-2 text-[12px] font-semibold text-lma-brand">
          <span className="min-w-0 flex-1 truncate">
            Showing {colorFilter?(LEGEND.find(L=>L.k===colorFilter)?.label||colorFilter).toLowerCase()+" only":"all seats"}{tucked.length?` · ${tucked.join(" · ")}`:""}
          </span>
          <button type="button" onClick={()=>{ setColorFilter(""); setShiftView("ALL"); setGenderM(false); setGenderF(false); setZoomPx(0); }}
            className="lma-btn shrink-0 rounded-[8px] px-2 py-1 underline">Reset</button>
        </div>
      )}

      {showVacList&&board&&<VacancyListDialog board={board} libCode={resolved.lib} scopeCode={resolved.branch||resolved.lib} onClose={()=>setShowVacList(false)}/>}

      {/* ⋯ menu: everything used less often */}
      <Sheet open={menuOpen} onClose={()=>setMenuOpen(false)} title="Chart options">
        <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Show plan</div>
        <Segmented className="mb-4" value={shiftView} onChange={setShiftView}
          options={[{v:"ALL",label:"All"},{v:"MORNING",label:"Morning"},{v:"EVENING",label:"Evening"},{v:"FULL DAY",label:"Full"}]}/>
        <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Highlight</div>
        <div className="mb-4 flex gap-2">
          <Chip on={genderM} onClick={()=>setGenderM(v=>!v)}>♂ Male</Chip>
          <Chip on={genderF} onClick={()=>setGenderF(v=>!v)}>♀ Female</Chip>
        </div>
        <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Zoom</div>
        <div className="mb-4 flex items-center gap-2">
          <Button variant="secondary" className="w-12" aria-label="Zoom out" disabled={zoomPx===0} onClick={()=>setZoomPx(z=> z===0?0:(z<=44?0:z-14))}>−</Button>
          <span className="flex-1 text-center text-[13px] font-semibold text-lma-ink-2">{zoomPx?`${zoomPx}px per seat`:"Fit to screen"}</span>
          <Button variant="secondary" className="w-12" aria-label="Zoom in" onClick={()=>setZoomPx(z=> z===0?44:Math.min(z+14,100))}>+</Button>
        </div>
        <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Lists &amp; refresh</div>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={!board} onClick={()=>{ setMenuOpen(false); setShowVacList(true); }}>Vacant seats</Button>
          <Button variant="secondary" loading={loading} loadingText="Refreshing…" onClick={()=>{ setMenuOpen(false); loadBoard(); }}>Refresh</Button>
        </div>
        <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Download PNG</div>
        <p className="mb-2 px-1 text-[12px] text-lma-ink-3">Detailed · with names</p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {([{label:"HD",scale:2.5},{label:"MD",scale:1.8},{label:"SD",scale:1.2}]).map(o=>(
            <Button key={o.scale} variant="secondary" disabled={exporting||!board} onClick={()=>{ setMenuOpen(false); downloadPng(o.scale); }}>{o.label} · {o.scale}x</Button>
          ))}
        </div>
        <p className="mb-2 px-1 text-[12px] text-lma-ink-3">Vacancy chart · no names</p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {([{label:"HD",scale:2.5},{label:"MD",scale:1.8},{label:"SD",scale:1.2}]).map(o=>(
            <Button key={"v"+o.scale} variant="secondary" disabled={exporting||!board} onClick={()=>{ setMenuOpen(false); downloadPng(o.scale,"board-vacancy-export"); }}>{o.label} · {o.scale}x</Button>
          ))}
        </div>
        <p className="mb-2 px-1 text-[12px] text-lma-ink-3">Custom size (1.2 – 2.5)</p>
        <div className="flex items-center gap-2 pb-2">
          <Button variant="secondary" className="w-12" onClick={()=>setCustomScale(v=>String(Math.max(1.2,parseFloat(v)-0.1).toFixed(1)))}>−</Button>
          <input type="number" min={1.2} max={2.5} step={0.1} value={customScale} onChange={e=>setCustomScale(e.target.value)} aria-label="Custom scale"
            className={cx(inputCls,"h-11 w-20 text-center font-lma-mono")}/>
          <Button variant="secondary" className="w-12" onClick={()=>setCustomScale(v=>String(Math.min(2.5,parseFloat(v)+0.1).toFixed(1)))}>+</Button>
          <Button className="flex-1" disabled={exporting||!board} onClick={()=>{ const v=parseFloat(customScale); if(v>=1.2&&v<=2.5){ setMenuOpen(false); downloadPng(v); } else showToast("Enter a size between 1.2 and 2.5","error"); }}>Download</Button>
        </div>
      </Sheet>

      {(!board&&(loading||(!scope&&chips.length>0)))?(
        <div className="rounded-lma border border-lma-line bg-lma-surface p-3 shadow-lma-card" aria-label="Loading the chart">
          <div className="grid grid-cols-8 gap-1">{Array.from({length:32}).map((_,k)=><Skeleton key={k} className="aspect-square rounded"/>)}</div>
        </div>
      ):!board?(
        chips.length===0
          ? <Empty icon={<IconSeat size={22}/>} title="No libraries yet" body="Add a library in Settings and its seat chart appears here."/>
          : <Empty icon={<IconSeat size={22}/>} title="Couldn’t load the chart" body="Check the connection, then use ⋯ → Refresh."
              action={<Button onClick={loadBoard}>Try again</Button>}/>
      ):(
        <div id="board-export-area" className="rounded-lma border border-lma-line bg-lma-surface p-3 shadow-lma-card">
          {/* export header */}
          <div className="text-center mb-3">
            <div className="text-base font-extrabold text-lma-slate-900">{resolved.label}</div>
            <div className="text-[10px] text-lma-slate-500">{fmtDMY(new Date())} · {!occ?(shiftView==="ALL"?"All shifts":shiftView):shiftView==="ALL"
              ?`${occ.occPct}% occupied · vac M ${occ.plan["MORNING"].vac} · E ${occ.plan["EVENING"].vac} · FD ${occ.plan["FULL DAY"].vac}`
              :`${shiftView} · ${occ.plan[shiftView].occ} occ · ${occ.plan[shiftView].vac} vac · ${occ.plan[shiftView].pct}%`}</div>
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
                    const label=String(cell.display_label||"");
                    return (
                      <div key={idx} data-seat={label.replace(/"/g,"")} className={flash&&flash===label?"relative grid rounded ring-4 ring-lma-brand ring-offset-1 animate-pulse":"relative grid"}>
                        <SeatTile cell={cell} shiftView={shiftView} genderM={genderM} genderF={genderF} colorFilter={colorFilter} onOpen={()=>setDetail({cell})}/>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* not on a seat: bookings without a fixed seat, in one clear group */}
          {((board.unassigned?.length||0)+(board.floating?.length||0)+(board.otherShift?.length||0))>0&&(
            <div className="mt-5 flex items-baseline justify-between px-1">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Not on a seat</h2>
              <span className="font-lma-mono text-[12px] font-semibold text-lma-ink-3">{(board.unassigned?.length||0)+(board.floating?.length||0)+(board.otherShift?.length||0)}</span>
            </div>
          )}
          <SidePanel title="Unassigned (booked, no seat)" items={board.unassigned} emoji="📋" colorFilter={colorFilter} onTap={(it)=>setDetail({cell:panelItemToCell(it),panel:true})}/>
          <SidePanel title="Floating (temp-vacated)" items={board.floating} emoji="🌀" colorFilter={colorFilter} onTap={(it)=>setDetail({cell:panelItemToCell(it),panel:true})} onReAllot={(it)=>setReAllot({receipt_no:it.receipt_no,name:it.name,student_id:it.student_id,shift:it.shift,original:it.temporary_seat,phones:it.phones})}/>
          <SidePanel title="Other shift (no fixed seat)" items={board.otherShift} emoji="🔄" colorFilter={colorFilter} onTap={(it)=>setDetail({cell:panelItemToCell(it),panel:true})}/>
        </div>
      )}

      {/* occupied detail popup */}
      {detail&&<DetailSheet
        cell={detail.cell}
        panel={detail.panel}
        onBlock={(label,shift)=>{ setBlockFormSeat({label,suggestedShift:shift}); setDetail(null); }}
        onEdit={(label,blk)=>{ setBlockFormSeat({label,suggestedShift:blk.shift,blockId:blk.block_id,reason:blk.reason,from:blk.block_from||"",to:blk.block_to||"",gender:blk.gender||""}); setDetail(null); }}
        onClose={()=>setDetail(null)}
       router={router}
        onViewReceipt={(rno:string)=>{ setDetail(null); setOpenRno(rno); }}
        onViewStudent={(sid:string,cross?:string)=>{ setDetail(null); setOpenStu({id:sid,library:resolved.branch||resolved.lib,crossOrigin:cross}); }}
        onRenew={(rno:string,seat:string,shift:string)=>{ setDetail(null); setRenew({rno,libCode:resolved.branch||resolved.lib,seat,shift}); }}
        onAddBooking={(seat:string,shift:string)=>{ setDetail(null); setAddBk({libCode:resolved.branch||resolved.lib,seat,shift}); }}
        scope={scope}
        lib={resolved.lib}
        branch={resolved.branch}
        post={post}
        showToast={showToast}
        onChanged={()=>{ setDetail(null); loadBoard(); }}
        onReAllot={(o)=>{ setDetail(null); setReAllot({receipt_no:o.receipt_no,name:o.name,student_id:o.student_id,shift:o.shift,original:o.temporary_seat||undefined,phones:o.phones}); }}
        onShare={(text,label,phones)=>setShareEvent({text,label,phones})}
      />}

      {/* block-create form */}
      {blockFormSeat&&<BlockForm seat={blockFormSeat.label} suggestedShift={blockFormSeat.suggestedShift} blockId={blockFormSeat.blockId} initReason={blockFormSeat.reason} initFrom={blockFormSeat.from} initTo={blockFormSeat.to} initGender={blockFormSeat.gender} lib={resolved.lib} branch={resolved.branch} post={post} onClose={()=>setBlockFormSeat(null)} onSaved={()=>{ const wasEdit=!!blockFormSeat.blockId; setBlockFormSeat(null); showToast(wasEdit?"Block updated":"Seat blocked"); loadBoard(); }} showToast={showToast}/>}

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
        onShare={(text,label,phones)=>setShareEvent({text,label,phones})}
      />}

      {/* event share prompt */}
      {shareEvent&&(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center px-6" onClick={()=>setShareEvent(null)}>
          <div className="absolute inset-0 bg-black/40"/>
          <div className="lma-sheet-up relative w-full max-w-xs rounded-[20px] bg-lma-surface p-5 shadow-lma-float" onClick={e=>e.stopPropagation()}>
            <h4 className="mb-1 text-[16px] font-bold text-lma-ink">{shareEvent.label}</h4>
            <p className="text-[12px] text-lma-slate-500 mb-3">Send the student a WhatsApp update?</p>
            <pre className="text-[10px] text-lma-slate-600 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-2.5 max-h-40 overflow-y-auto mb-3">{shareEvent.text}</pre>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={()=>setShareEvent(null)} className="h-11 rounded-[12px] bg-lma-bg text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Skip</button>
              <button onClick={()=>{ navigator.clipboard.writeText(shareEvent.text); showToast("Copied"); }} className="h-11 rounded-[12px] bg-lma-bg text-[13px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Copy</button>
              <WhatsAppButton phones={shareEvent.phones} text={shareEvent.text} label="Send" className="h-11 w-full rounded-[12px] bg-[#16a34a] text-[13px] font-semibold text-white text-center disabled:opacity-40"/>
            </div>
          </div>
        </div>
      )}

       {/* off-screen detailed export layout */}
      {showExport&&board&&<DetailedExport board={board} label={resolved.label} shiftView={shiftView} genderM={genderM} genderF={genderF}/>}
      {showExport&&board&&<VacancyExport board={board} label={resolved.label} shiftView={shiftView} genderM={genderM} genderF={genderF}/>}
    </div>
  );
}

// shorten "21-12-2026" → "21-12-26" for tile display
function shortDate(dmy:string){
  if(!dmy) return "";
  const p=dmy.split("-");
  if(p.length!==3) return dmy;
  const _f=fmtDMY(dmy).split("-"); return _f.length===3?`${_f[0]}-${_f[1]}`:fmtDMY(dmy);
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
function SeatTile({ cell, shiftView, onOpen, genderM, genderF, colorFilter }:{ cell:BoardCell; shiftView:ShiftView; onOpen:()=>void; genderM:boolean; genderF:boolean; colorFilter?:string }){
  if(cell.cell_type==="DEAD") return <div className="aspect-square rounded" style={{background:"#f8fafc",border:"1px solid #e2e8f0"}}/>;

  // TRUE occupancy — NEVER hidden by the shift view (the toggle bug: occupants
  // were nulled per-view, so taken seats looked vacant/bookable).
  const ovl=(g?:string)=>{ const n=normGender(g||""); if(genderM&&n==="M") return "#2563eb"; if(genderF&&n==="F") return "#db2777"; return null; };
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
  const matchColor=(o:Occupant|null)=>{ if(!o) return false; if(colorFilter==="DUES") return !!o.has_dues||o.fees_due_balance>0; const key=(o.color==="EXPIRING"&&o.urgent)?"EXPIRING_PRIMARY":o.color; return key===colorFilter; };
  const _anyBlk=!!(bF||bM||bE);
  const _vac=shiftView==="MORNING"?morningFree:shiftView==="EVENING"?eveningFree:shiftView==="FULL DAY"?(morningFree&&eveningFree):(morningFree||eveningFree);
  const colorDim = !!colorFilter && !(colorFilter==="BLOCKED"?_anyBlk:colorFilter==="VACANT"?_vac:(matchColor(fd)||matchColor(m)||matchColor(e)));
  const dim = (shiftView!=="ALL" && !bookableForView) || colorDim;
  const dimStyle = dim ? { opacity:0.32 } : null;

  // FULL DAY occupant fills whole tile
  if(fd){
    const col=occLook(fd);
    return (
      <button onClick={onOpen} className="aspect-square rounded flex flex-col items-center justify-center overflow-hidden px-0.5 relative" style={{background:col.bg,color:col.text,border:col.ring?`2px solid ${col.border}`:`1px solid ${col.border}`,boxShadow:col.ring?`inset 0 0 0 1px ${col.border}`:undefined,...dimStyle}}>
        {ovl(fd.gender)&&<><span style={{position:"absolute",inset:0,border:`1.5px solid ${ovl(fd.gender)}`,borderRadius:"4px",pointerEvents:"none"}}/><span style={{position:"absolute",inset:"1.5px",border:"1px solid #ffffff",borderRadius:"2px",pointerEvents:"none"}}/></>}
        <span className="text-[10px] font-extrabold leading-none">{cell.display_label}</span>
        <div className="w-full px-0.5 mt-0.5"><FitText text={shortDate(fd.booking_to)} color={col.text} maxPx={11}/></div>
      </button>
    );
  }

  // FULL-DAY BLOCK fills whole tile too
  if(bF){
    return (
      <button onClick={onOpen} className="aspect-square rounded flex flex-col items-center justify-center overflow-hidden px-0.5 relative" style={{
        background: bF.expired?"repeating-linear-gradient(45deg,#6b0a0a,#6b0a0a 4px,#8a1a1a 4px,#8a1a1a 8px)":"repeating-linear-gradient(45deg,#fecaca,#fecaca 4px,#fee2e2 4px,#fee2e2 8px)",
        border: bF.expired?"1.5px solid #6b0a0a":"1.5px solid #b91c1c",
        color: bF.expired?"#ffffff":"#7f1d1d", ...dimStyle
      }}>
        {ovl(bF.gender)&&<><span style={{position:"absolute",inset:0,border:`1.5px solid ${ovl(bF.gender)}`,borderRadius:"4px",pointerEvents:"none"}}/><span style={{position:"absolute",inset:"1.5px",border:"1px solid #ffffff",borderRadius:"2px",pointerEvents:"none"}}/></>}
        <span className="text-[10px] font-extrabold leading-none">{cell.display_label}</span>
        <div className="w-full px-0.5 mt-0.5"><FitText text={shortDate(bF.block_to||"")||"BLK"} color={bF.expired?"#fecaca":"#7f1d1d"} maxPx={11}/></div>
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
        background: blk.expired?"repeating-linear-gradient(45deg,#6b0a0a,#6b0a0a 3px,#8a1a1a 3px,#8a1a1a 6px)":"repeating-linear-gradient(45deg,#fecaca,#fecaca 3px,#fee2e2 3px,#fee2e2 6px)",
        color: blk.expired?"#ffffff":"#7f1d1d",
        outline: blk.expired?"1.5px solid #6b0a0a":undefined,
        outlineOffset: "-2px",
      };
    }
    if(occCol) return {background:occCol.bg,color:occCol.text,boxShadow:occCol.ring?`inset 0 0 0 2px ${occCol.border}`:undefined};
    if(held) return {background:"#fffbeb",color:"#b45309",boxShadow:"inset 0 0 0 1.5px #f59e0b"}; // soft-hold on THIS half only
    return (!vacant?{background:"rgba(0,0,0,0.08)",color:"#475569"}:{color:"#cbd5e1"});
  };
  const halfText=(occ:Occupant|null, blk:BlockInfo|null, held:any, defaultDot:string)=>{
    if(occ) return <div className="w-full px-0.5"><FitText text={shortDate(occ.booking_to)} maxPx={9}/></div>;
    if(blk) return <div className="w-full px-0.5"><FitText text={shortDate(blk.block_to||"")||"BLK"} color={blk.expired?"#fecaca":"#7f1d1d"} maxPx={9}/></div>;
    if(held) return <div className="w-full px-0.5"><FitText text={held.student_id} color="#b45309" maxPx={9}/></div>;
    return defaultDot;
  };

  return (
    <div className="aspect-square rounded overflow-hidden flex flex-col" style={{
      border: bothHeld?"1.5px dashed #f59e0b":(vacant?"1.5px solid rgba(0,0,0,0.5)":"1px solid #cbd5e1"),
      background: bothHeld?"#fffbeb":(vacant?"rgba(0,0,0,0.06)":"#fff"),
      ...dimStyle
    }}>
      <button onClick={onOpen} className="flex-1 flex items-center justify-center text-[7px] font-bold leading-none relative" style={halfStyle(mCol,bM,heldM)}>
        {(ovl(m?.gender)||ovl(bM?.gender))&&<><span style={{position:"absolute",inset:0,border:`1.5px solid ${ovl(m?.gender)||ovl(bM?.gender)}`,pointerEvents:"none"}}/><span style={{position:"absolute",inset:"1.5px",border:"1px solid #ffffff",pointerEvents:"none"}}/></>}
        {halfText(m,bM,heldM,(shiftView==="ALL"||shiftView==="MORNING")?"·":"") }
      </button>
      <button onClick={onOpen} className="text-[9px] font-extrabold text-lma-slate-700 leading-none py-0.5">{cell.display_label}</button>
      <button onClick={onOpen} className="flex-1 flex items-center justify-center text-[7px] font-bold leading-none relative" style={halfStyle(eCol,bE,heldE)}>
        {(ovl(e?.gender)||ovl(bE?.gender))&&<><span style={{position:"absolute",inset:0,border:`1.5px solid ${ovl(e?.gender)||ovl(bE?.gender)}`,pointerEvents:"none"}}/><span style={{position:"absolute",inset:"1.5px",border:"1px solid #ffffff",pointerEvents:"none"}}/></>}
        {halfText(e,bE,heldE,(shiftView==="ALL"||shiftView==="EVENING")?"·":"") }
      </button>
    </div>
  );
}
// ── SIDE PANEL ───────────────────────────────────────────────────
  function SidePanel({ title, items, emoji, onReAllot, onTap, colorFilter }:{ title:string; items:SidePanelItem[]; emoji:string; onReAllot?:(it:SidePanelItem)=>void; onTap?:(it:SidePanelItem)=>void; colorFilter?:string }){
  const [open,setOpen]=useState((items?.length||0)<=6);   // collapsed by default when long (>6)
  if(!items||items.length===0) return null;
  // Same meanings as the seat tiles: a coloured edge says the state, the row stays readable.
  const tone=(it:SidePanelItem)=>{
    if(it.color==="EXPIRED")                       return { edge:"#6b0a0a", tint:"#fbeaea", fg:"#6b0a0a", word:"Expired" };
    if(it.color==="EXPIRING" && (it as any).urgent) return { edge:"#dc2626", tint:"#fdecec", fg:"#b91c1c", word:"Expiring soon" };
    if(it.color==="EXPIRING")                      return { edge:"#fca5a5", tint:"#fff1f2", fg:"#b91c1c", word:"Expiring" };
    if(it.has_dues)                                return { edge:"#f59e0b", tint:"#fffbeb", fg:"#92400e", word:"Dues" };
    return                                                { edge:"#16a34a", tint:"#f0fdf4", fg:"#15803d", word:"Active" };
  };
  return (
    <section className="mt-2 overflow-hidden rounded-lma border border-lma-line bg-lma-surface">
      <button type="button" onClick={()=>setOpen(o=>!o)} aria-expanded={open}
        className="lma-noscale flex w-full items-center gap-2 px-3.5 py-3 text-left active:bg-lma-bg">
        <span aria-hidden="true" className="text-[15px]">{emoji}</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-lma-ink">{title}</span>
        <span className="rounded-full bg-lma-bg px-2 py-0.5 font-lma-mono text-[12px] font-semibold text-lma-ink-2">{items.length}</span>
        <IconChevron size={16} className={cx("shrink-0 text-lma-ink-3 transition", open?"rotate-90":"")}/>
      </button>
      {open&&(
        <div className="border-t border-lma-line">
          {items.map(it=>{
            const L=tone(it);
            const itMatch = !colorFilter ? true : (colorFilter==="DUES" ? (!!it.has_dues||it.fees_due_balance>0) : ((it.color==="EXPIRING"&&(it as any).urgent)?"EXPIRING_PRIMARY":(it.color||"OK"))===colorFilter);
            return (
              <div key={it.receipt_no} className="flex items-stretch border-b border-lma-line last:border-b-0" style={{opacity:itMatch?1:0.32, background:L.tint}}>
                <span aria-hidden="true" className="w-1.5 shrink-0" style={{background:L.edge}}/>
                <button type="button" onClick={()=>onTap&&onTap(it)} className="lma-noscale flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left active:brightness-95">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-lma-ink">{it.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-lma-ink-2">
                      <span className="font-lma-mono">{it.student_id}</span>
                      <span aria-hidden="true">·</span><span>{it.shift_name||it.shift}</span>
                      {it.booking_to&&<><span aria-hidden="true">·</span><span style={{color:L.fg}} className="font-semibold">{L.word==="Expired"?"expired":"till"} {fmtDMY(it.booking_to)}</span></>}
                      {it.temporary_seat&&<><span aria-hidden="true">·</span><span className="font-semibold">was seat {it.temporary_seat}</span></>}
                    </span>
                  </span>
                  {it.fees_due_balance>0&&<span className="shrink-0 rounded-md px-1.5 py-0.5 font-lma-mono text-[11px] font-bold" style={{color:"#92400e",background:"#fde68a"}}>₹{it.fees_due_balance}</span>}
                </button>
                {onReAllot&&(
                  <button type="button" onClick={()=>onReAllot(it)} className="lma-glass-btn my-2 mr-2 shrink-0 rounded-[10px] px-3 text-[12px] font-semibold text-white">
                    {it.temporary_seat?"Restore":"Re-allot"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
// ── DETAIL SHEET (occupied seat tap) ─────────────────────────────
// #26: on-demand copy row for a board occupant. Board occupancy doesn't carry
// receipt_text/registration_text, so fetch the receipt by receipt_no when a copy
// button is tapped. Group copy only for NEW receipts that have registration_text.
function CollectDueInline({ receiptNo, balance, post, showToast, onChanged, onEvent, startOpen, onCancel }:{ startOpen?:boolean; onCancel?:()=>void; receiptNo:string; balance:number; post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void; onChanged:()=>void; onEvent?:(text:string)=>void }){
  const { init }=useLMA();
  const modes=(init?.paymentTags||[]).filter(t=>t.active).map(t=>t.tag_name);
  const [open,setOpen]=useState(!!startOpen);
  const [amt,setAmt]=useState(String(balance||""));
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [mode,setMode]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const submit=async()=>{
    const n=Number(amt);
    if(!n||n<=0){ setErr("Enter a valid amount"); return; }
    if(!mode){ setErr("Select a payment mode"); return; }
    setBusy(true); setErr("");
    const r=await post("logFeePayment",{ receipt_no:receiptNo, payment_mode:mode, amount_received:n, notes:"", receipt_date:date });
    setBusy(false);
    if(r&&r.ok!==false){ if(r.whatsapp_text&&onEvent) onEvent(String(r.whatsapp_text)); else showToast("Due collected"); setOpen(false); onChanged(); } else setErr((r&&r.error)||"Could not collect due");
  };
  if(!open) return <button type="button" onClick={()=>setOpen(true)} className="h-12 w-full rounded-[14px] bg-[#fef3c7] text-[14px] font-bold text-[#92400e] ring-1 ring-inset ring-[#f5d88a]">Collect due · ₹{balance}</button>;
  return (
    <div className="space-y-3 rounded-[16px] border border-[#f5d88a] bg-[#fffbeb] p-3.5">
      <div className="flex items-baseline justify-between"><span className="text-[14px] font-semibold text-[#92400e]">Collect due</span><span className="font-lma-mono text-[13px] font-semibold text-[#92400e]">owed ₹{balance}</span></div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" inputMode="decimal" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="Amount ₹" aria-label="Amount" className={cx(inputCls,"font-lma-mono")}/>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} aria-label="Date" className={inputCls}/>
      </div>
      <div><div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Paid by</div><TagChips value={mode} onChange={setMode} label="Paid by" size="sm"/></div>
      {mode&&<TagBankNote tag={mode} right/>}
      {err&&<div role="alert" className="text-[12.5px] font-semibold text-lma-out">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy} onClick={()=>{ setErr(""); if(onCancel) onCancel(); else setOpen(false); }}>Cancel</Button>
        <Button className="whitespace-nowrap px-3" loading={busy} loadingText="Saving…" onClick={submit}>Collect ₹{Number(amt)||0}</Button>
      </div>
    </div>
  );
}

function RefundInline({ receiptNo, post, showToast, onChanged, onEvent }:{ receiptNo:string; post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void; onChanged:()=>void; onEvent?:(text:string)=>void }){
  const { init }=useLMA();
  const modes=(init?.paymentTags||[]).filter(t=>t.active).map(t=>t.tag_name);
  const [open,setOpen]=useState(false);
  const [amt,setAmt]=useState("");
  const [mode,setMode]=useState("");
  const [reason,setReason]=useState("");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const submit=async()=>{
    const n=Number(amt);
    if(!n||n<=0){ setErr("Enter a valid amount"); return; }
    if(!mode){ setErr("Select a refund mode"); return; }
    setBusy(true); setErr("");
    const r=await post("issueRefund",{ original_receipt_no:receiptNo, amount:n, refund_mode:mode, refund_reason:reason, linked_to_cancellation:false, refund_date:date });  
    setBusy(false);
    if(r&&r.ok!==false){ if(r.whatsapp_text&&onEvent) onEvent(String(r.whatsapp_text)); else showToast("Refund issued"); setOpen(false); onChanged(); } else setErr((r&&r.error)||"Could not issue refund");
  };
  if(!open) return <button type="button" onClick={()=>setOpen(true)} className={ROW_CLS}><RowIcon>{Ic.refund}</RowIcon><span className="flex-1">Issue refund</span><IconChevron size={16} className="text-lma-ink-3"/></button>;
  return (
    <div className="space-y-3 bg-lma-bg px-3.5 py-3.5">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-lma-ink"><RowIcon>{Ic.refund}</RowIcon>Issue refund</div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" inputMode="decimal" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="Amount ₹" aria-label="Refund amount" className={cx(inputCls,"font-lma-mono")}/>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} aria-label="Refund date" className={inputCls}/>
      </div>
      <div><div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Refund paid by</div><TagChips value={mode} onChange={setMode} label="Refund paid by" size="sm"/></div>
      {mode&&<TagBankNote tag={mode} right/>}
      <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason (optional)" className={inputCls}/>
      {err&&<div role="alert" className="text-[12.5px] font-semibold text-lma-out">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy} onClick={()=>{setOpen(false);setErr("");}}>Cancel</Button>
        <Button variant="danger" className="whitespace-nowrap px-3" loading={busy} loadingText="Refunding…" onClick={submit}>Refund</Button>
      </div>
    </div>
  );
}

function MoneyTrailInline({ receiptNo }:{ receiptNo:string }){
  const [open,setOpen]=useState(false);
  const [t,setT]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const load=async()=>{
    if(open){ setOpen(false); return; }
    setOpen(true);
    if(t) return;
    setBusy(true); setErr("");
    try{
      const r=await fetch(`${API}?action=getReceiptMoneyTrail&receipt_no=${encodeURIComponent(receiptNo)}`).then(x=>x.json());
      if(r&&r.ok) setT(r); else setErr((r&&r.error)||"Could not load money trail");
    }catch{ setErr("Could not load money trail"); }
    setBusy(false);
  };
  return (
    <div>
      <button type="button" onClick={load} aria-expanded={open} className={ROW_CLS}>
        <RowIcon>{Ic.trail}</RowIcon><span className="flex-1">Money trail</span>
        <IconChevron size={16} className={cx("text-lma-ink-3 transition",open?"rotate-90":"")}/>
      </button>
      {open&&(
        <div className="border-t border-lma-line bg-lma-bg px-3.5 py-3 text-[12.5px]">
          {busy&&<div className="text-lma-slate-400">Loading…</div>}
          {err&&<div className="font-bold text-lma-danger">{err}</div>}
          {t&&!busy&&!err&&(
            <div className="space-y-1.5">
              <div>
                <div className="font-bold text-lma-slate-500 mb-0.5">Paid at receipt</div>
                {(t.initial_payments&&t.initial_payments.length)?t.initial_payments.filter((p:any)=>p.mode||p.amount).map((p:any,i:number)=>(<div key={i} className="flex justify-between"><span className="text-lma-slate-500">{p.date?fmtDMY(p.date):"—"} · {p.mode||""}</span><span className="font-bold">₹{p.amount||0}</span></div>)):<div className="text-lma-slate-400">None</div>}
              </div>
              <div className="h-px bg-lma-slate-200"/>
              <div>
                <div className="font-bold text-lma-slate-500 mb-0.5">Due payments</div>
                {(t.dues_payments&&t.dues_payments.length)?t.dues_payments.map((d:any,i:number)=>(<div key={i} className="flex justify-between"><span className="text-lma-slate-500">{d.received_on?fmtDMYT(d.received_on):"—"} · {d.mode||""}</span><span className="font-bold">₹{d.amount||0}</span></div>)):<div className="text-lma-slate-400">None</div>}
              </div>
              <div className="h-px bg-lma-slate-200"/>
              <div>
                <div className="font-bold text-lma-slate-500 mb-0.5">Refunds</div>
                {(t.refunds&&t.refunds.length)?t.refunds.map((r:any,i:number)=>(<div key={i} className="flex justify-between"><span className="text-lma-slate-500">{r.refund_date?fmtDMYT(r.refund_date):"—"} · {r.mode||""}</span><span className="font-bold text-lma-danger">₹{r.amount||0}</span></div>)):<div className="text-lma-slate-400">None</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailCopyRow({ occupant, lib, branch, showToast }:{ occupant:Occupant; lib:string; branch:string; showToast:(m:string,t?:"success"|"error")=>void }){
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2"><RowIcon><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg></RowIcon></span>
      <ContactCopyButton name={occupant.name} library={branch||lib} studentId={occupant.student_id} phones={occupant.phones} onCopied={showToast} wrapperClassName="w-full" label="Copy contact" className={ROW_CLS+" pl-[62px]"}/>
    </div>
  );
}

// ── SEAT SHEET ROWS: one look for every item in a booking's "More" drawer ──
const ROW_CLS="lma-noscale flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2 text-left text-[14px] font-medium text-lma-ink active:bg-lma-bg disabled:opacity-50";
function RowIcon({ children, tone }:{ children:React.ReactNode; tone?:"out"|"warn" }){
  return <span aria-hidden="true" className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-[10px]",
    tone==="out"?"bg-lma-out-soft text-lma-out":tone==="warn"?"bg-lma-warn-soft text-lma-warn-2":"bg-lma-bg text-lma-ink-2")}>{children}</span>;
}
const Ic={
  stop:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5h5v5h-5z"/></svg>,
  cross:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>,
  pause:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M9 6.5v11M15 6.5v11"/></svg>,
  float:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 12c2-3 4-3 6 0s4 3 6 0 4-3 4-3"/></svg>,
  trail:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19h16"/><path d="M6 15l4-4 3 3 5-6"/></svg>,
  refund:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 9.5h9A5 5 0 0 1 18.5 15v.5"/><path d="M8 5.5 4 9.5l4 4"/></svg>,
  clock:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>,
};

// ── LANE WRAPPER (a labeled section inside the unified seat card) ──
function Lane({ emoji, label, tone, children }:{ emoji:string; label:string; tone:string; children:React.ReactNode }){
  return (
    <div>
      <div className={`mb-2 flex items-center gap-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] ${tone}`}>
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
function DetailSheet({ cell, panel, onClose, scope, lib, branch, post, showToast, onChanged, onReAllot, onShare,  onBlock, onEdit, onViewReceipt, onViewStudent, onRenew, onAddBooking }:{ cell:BoardCell; panel?:boolean; onClose:()=>void; router:any; scope:string; lib:string; branch:string; post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void; onChanged:()=>void; onReAllot:(o:Occupant)=>void; onShare:(text:string,label:string,phones?:{number:string;tag:string}[])=>void; onBlock:(seatLabel:string,shift:string)=>void; onEdit:(seatLabel:string,blk:BlockInfo)=>void; onViewReceipt:(rno:string)=>void; onViewStudent:(sid:string,cross?:string)=>void; onRenew:(rno:string,seat:string,shift:string)=>void; onAddBooking:(seat:string,shift:string)=>void }){
  const [busy,setBusy]=useState(false);
  const [confirmVacate,setConfirmVacate]=useState<Occupant|null>(null);
  const [confirmCancel,setConfirmCancel]=useState<Occupant|null>(null);
  const [chooseMode,setChooseMode]=useState<""|"ADD"|"BLOCK">(""); // fully-vacant: ask shift before booking/blocking
  const [laneUI,setLaneUI]=useState<{rno:string;sec:string}>({rno:"",sec:""});
  const tglLane=(rno:string,sec:string)=>setLaneUI(p=>(p.rno===rno&&p.sec===sec)?{rno:"",sec:""}:{rno,sec});
  const L = branch||lib;
  const { init, confirm: ask }=useLMA();
  const libName=((init?.libraries||[]).find(l=>l.library_code===lib)?.display_name)||lib;

  const goBook=(shift?:string)=>{ onAddBooking(cell.display_label, shift||""); };

  const doVacate=async(o:Occupant)=>{
    setBusy(true);
    const r=await post("tempVacateSeat",{receipt_no:o.receipt_no});
    setBusy(false);
    if(r&&r.vacated){ showToast(`${o.student_id} parked (seat ${r.original_seat} held)`); if(r.whatsapp_text) onShare(r.whatsapp_text,"Seat temporarily vacated",o.phones); onChanged(); }
    else showToast(r&&r.error?r.error:"Temp-vacate failed","error");
  };
  // A5/C4: cancel handled by shared CancelRefundSheet (full refund-capable flow)
  const removeBlock=async(blk:BlockInfo)=>{
    if(busy) return;
    if(!(await ask({ title:"Remove this block?", body:"The seat becomes available to book again.", confirmLabel:"Remove block", danger:true }))) return;
    setBusy(true);
    const r=await post("removeSeatBlock",{ block_id:blk.block_id });
    setBusy(false);
    if(r&&r.ok!==false){ showToast("Removed"); onChanged(); } else showToast((r&&r.error)||"Failed","error");
  };

  const remind=(o:Occupant):string=>buildRenewReminder(o.name, libName, fmtDMY(o.booking_to), o.color==="EXPIRED");
  const followUpPay=(o:Occupant):string=>buildRenewFollowUpPay(o.name, libName, fmtDMY(o.booking_to), o.color==="EXPIRED");
  const followUpAsk=(o:Occupant):string=>buildRenewFollowUpAsk(o.name, libName, fmtDMY(o.booking_to), o.color==="EXPIRED");   
  const duesReminder=(o:Occupant):string=>buildDuesReminder(o.name, libName, o.fees_due_balance);
  const doNotRenew=async(o:Occupant)=>{
    if(busy) return;
    if(!(await ask({ title:`Do not renew ${o.receipt_no}?`, body:`${o.name} will stop appearing in renewal lists.`, confirmLabel:"Do not renew", danger:true }))) return;
    setBusy(true);
    const r=await post("markReceiptDoNotRenew",{receipt_no:o.receipt_no});
    setBusy(false);
    if(r&&r.ok!==false){ showToast("Marked: do not renew"); onChanged(); } else showToast((r&&r.error)||"Failed","error");
  };

  // ── lane data ──
  const bi=cell.block_info||{morning:null,evening:null,fullday:null};
  const th=cell.temp_held||{morning:null,evening:null,fullday:null};
  const fdOcc=cell.fullday, fdBlk=bi.fullday;
  const mOcc=cell.morning,  mBlk=bi.morning;
  const eOcc=cell.evening,  eBlk=bi.evening;

  // ── BOOKED lane: details + actions ──
  const BookingPanel=(o:Occupant)=>{
    const cross = !!(o.is_cross_library && o.is_cross_library!=="NO");
    const st = o.color;
    const sColor = st==="EXPIRED"?"#6b0a0a":st==="EXPIRING"?"#be123c":"#0e9f6e";
    const sWord = st==="EXPIRED"?"Expired":st==="EXPIRING"?"Expiring":"Active";
    const mono = "'JetBrains Mono',ui-monospace,monospace";
    const dLeft = daysFromToday(o.booking_to);
    const fetchCopy = async (kind:"student"|"group"):Promise<string> => {
      const scope=branch||lib;
      const params=new URLSearchParams({action:"getReceiptLog",q:o.receipt_no,search_type:"RECEIPT_NO",limit:"5"});
      if(scope) params.set("library",scope);
      const r=await fetch(`${API}?${params}`).then(x=>x.json()).catch(()=>null);
      const rec=(r&&r.receipts&&r.receipts.length)?(r.receipts.find((x:any)=>String(x.receipt_no).toUpperCase()===String(o.receipt_no).toUpperCase())||r.receipts[0]):null;
      const t=rec?(kind==="student"?rec.receipt_text:rec.registration_text):"";
      if(!t) showToast(kind==="student"?"No receipt text":"No group text (renewal?)","error");
      return t||"";
    };
    return (
      <div className="rounded-[18px] border border-lma-line bg-lma-surface p-3.5 shadow-lma-card">
        <div>
          <span className="inline-block max-w-full -ml-1 whitespace-normal break-words rounded-lg px-2 py-0.5 text-[17px] font-bold leading-snug text-lma-ink" style={{ background:o.gender?(normGender(o.gender)==="F"?"#fbe4ef":"#d3e4ff"):"transparent" }}>{o.name}</span>
        </div>
        {/* who and which receipt — both open their window */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>onViewStudent(o.student_id, o.is_cross_library)} aria-label={`Open student ${o.student_id}`}
            className={`lma-noscale flex min-h-[48px] min-w-0 items-center rounded-[12px] px-3 text-left ring-1 ring-inset active:brightness-95 ${cross?"bg-[#f5f0ff] ring-[#e4d9fb]":"bg-lma-bg ring-lma-line"}`}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-lma-ink-3"><span className="truncate">Student</span><svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M8 16 16 8M9 8h7v7"/></svg></span>
              <span className={`flex items-center gap-1 truncate font-lma-mono text-[13.5px] font-semibold ${cross?"text-[#7c3aed]":"text-lma-ink"}`}>{cross&&<svg aria-hidden="true" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="shrink-0"><path d="M8 12l4-4M7.5 7H6a4 4 0 000 8h1.5M12.5 13H14a4 4 0 000-8h-1.5"/></svg>}<span className="truncate">{cross?`${o.student_id}-${o.is_cross_library}`:o.student_id}</span></span>
            </span>
          </button>
          <button type="button" onClick={()=>onViewReceipt(o.receipt_no)} aria-label={`Open receipt ${o.receipt_no}`}
            className="lma-noscale flex min-h-[48px] min-w-0 items-center gap-1.5 rounded-[12px] bg-lma-bg pl-3 pr-2 text-left ring-1 ring-inset ring-lma-line active:brightness-95">
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-lma-ink-3"><span className="truncate">Receipt</span><svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M8 16 16 8M9 8h7v7"/></svg></span>
              <span className="block truncate font-lma-mono text-[13.5px] font-semibold text-lma-ink">{o.receipt_no}</span>
            </span>
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[12.5px] font-semibold flex-wrap" style={{ color:sColor }}>
          {st==="EXPIRED"
            ? <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.2L2.4 16.4h15.2L10 3.2z"/><path d="M10 8.2v3.4"/><circle cx="10" cy="13.8" r=".5" fill="currentColor"/></svg>
            : st==="EXPIRING"
            ? <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="6.4"/><path d="M10 6.6V10l2.4 1.6"/></svg>
            : <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l3.4 3.4L16 6"/></svg>}
          <span>{sWord}</span>{st==="EXPIRING"&&dLeft!=null&&dLeft>=0&&<><span style={{ opacity:.45, fontWeight:500 }}>·</span><span style={{ fontFamily:mono, fontWeight:700 }}>{dLeft}d</span></>}
          <span style={{ opacity:.45, fontWeight:500 }}>·</span>
          <span>{st==="EXPIRED"?"":"till "}<span style={{ fontFamily:mono, fontWeight:700 }}>{fmtDMY(o.booking_to)}</span></span>
        </div>
        {o.fees_due_balance>0&&<div className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-lg text-[12px] font-extrabold" style={{ background:"#fcecca", color:"#b45309", boxShadow:"inset 0 0 0 1px rgba(180,83,9,.18)", fontFamily:mono }}>₹{o.fees_due_balance} due</div>}
        {o.remark&&<div className="text-[11px] mt-1.5 italic" style={{ color:"#646882" }}>📝 {o.remark}</div>}
        {/* in the order they are used: renew · collect dues · whatsapp · re-allot · more */}
        <div className={`mt-3 grid gap-2 ${o.fees_due_balance>0?"grid-cols-2":"grid-cols-1"}`}>
          <button onClick={()=>onRenew(o.receipt_no, cell.display_label, o.shift)} className="lma-glass-btn h-12 rounded-[14px] text-white text-[15px] font-bold flex items-center justify-center gap-1.5 active:brightness-95"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 11V9.5A3.5 3.5 0 0 1 8.5 6H18l-3-3"/><path d="M19 13v1.5a3.5 3.5 0 0 1-3.5 3.5H6l3 3"/></svg>Renew</button>
          {o.fees_due_balance>0&&<button disabled={busy} onClick={()=>tglLane(o.receipt_no,"collect")} className="h-12 rounded-[14px] text-white text-[15px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_8px_18px_-8px_rgb(180_83_9/0.6)]" style={{ background:"linear-gradient(180deg,#f5a524 0%,#d97706 60%,#b45309 100%)" }}>Collect ₹{o.fees_due_balance}</button>}
        </div>
        <div className="mt-2 grid grid-cols-[1.3fr_1fr_1fr] gap-2">
          <WhatsAppButton phones={o.phones} label="WhatsApp" chat className="h-12 w-full whitespace-nowrap rounded-[14px] flex items-center justify-center text-[13px] font-semibold bg-[#e3f6ec] text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8] disabled:opacity-40" variants={[...(o.fees_due_balance>0&&o.dues_status==="PENDING"?[{label:"Dues reminder",text:duesReminder(o)}]:[]),...((o.color==="EXPIRING"||o.color==="EXPIRED")?[{label:"Renewal reminder",text:remind(o)}]:[]),...(o.color==="EXPIRED"?[{label:"Follow-up · deposit fees",text:followUpPay(o)},{label:"Follow-up · confirm continuing",text:followUpAsk(o)}]:[]),...(o.receipt_no?[{label:"📋 Student copy",text:"",getText:()=>fetchCopy("student")}]:[]),...(o.receipt_type!=="RENEWAL"?[{label:"📢 Group copy",text:"",getText:()=>fetchCopy("group"),pick:true}]:[])]}/>
          <button disabled={busy} onClick={()=>onReAllot(o)} className="h-12 w-full rounded-[14px] flex items-center justify-center text-[13px] font-semibold bg-lma-brand-soft text-lma-brand ring-1 ring-inset ring-[#dcdffb] disabled:opacity-50">{o.temporary_seat?"Restore":"Re-allot"}</button>
          <button onClick={()=>tglLane(o.receipt_no,"more")} aria-expanded={laneUI.rno===o.receipt_no&&laneUI.sec==="more"} className={`h-12 w-full rounded-[14px] flex items-center justify-center gap-1 text-[13px] font-semibold ring-1 ring-inset ${laneUI.rno===o.receipt_no&&laneUI.sec==="more"?"bg-lma-ink text-white ring-lma-ink":"bg-lma-bg text-lma-ink-2 ring-lma-line"}`}>More<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" style={{transform:laneUI.rno===o.receipt_no&&laneUI.sec==="more"?"rotate(180deg)":"none",transition:"transform .15s"}}><path d="M6 9l6 6 6-6"/></svg></button>
        </div>
        {laneUI.rno===o.receipt_no&&laneUI.sec==="collect"&&o.fees_due_balance>0&&<div className="mt-3"><CollectDueInline startOpen onCancel={()=>tglLane(o.receipt_no,"collect")} receiptNo={o.receipt_no} balance={o.fees_due_balance} post={post} showToast={showToast} onChanged={onChanged} onEvent={(t)=>onShare(t,"Due collected",o.phones)}/></div>}
        {laneUI.rno===o.receipt_no&&laneUI.sec==="more"&&<div className="mt-3 divide-y divide-lma-line overflow-hidden rounded-[16px] border border-lma-line bg-lma-surface">
          {o.color==="EXPIRED"
            ? <button disabled={busy} onClick={()=>doNotRenew(o)} className={ROW_CLS}><RowIcon>{Ic.stop}</RowIcon><span className="flex-1">Do not renew</span><span className="text-[12px] text-lma-ink-3">close the seat</span></button>
            : <button disabled={busy} onClick={()=>setConfirmCancel(o)} className={ROW_CLS}><RowIcon tone="out">{Ic.cross}</RowIcon><span className="flex-1 text-lma-out">Cancel booking</span><span className="text-[12px] text-lma-ink-3">with refund</span></button>}
          {o.temporary_seat
            ? <div className={ROW_CLS}><RowIcon tone="warn">{Ic.float}</RowIcon><span className="flex-1 text-lma-warn-2">Floating · was seat {o.temporary_seat}</span></div>
            : <button disabled={busy} onClick={()=>setConfirmVacate(o)} className={ROW_CLS}><RowIcon>{Ic.pause}</RowIcon><span className="flex-1">Temp-vacate</span><span className="text-[12px] text-lma-ink-3">park, seat held</span></button>}
          <MoneyTrailInline receiptNo={o.receipt_no}/>
          <RefundInline receiptNo={o.receipt_no} post={post} showToast={showToast} onChanged={onChanged} onEvent={(t)=>onShare(t,"Refund issued",o.phones)}/>
          <DetailCopyRow occupant={o} lib={lib} branch={branch} showToast={showToast}/>
          <button onClick={()=>loadHist(o.shift)} className={ROW_CLS}><RowIcon>{Ic.clock}</RowIcon><span className="flex-1">Past 5 on this seat</span><span className="text-[12px] text-lma-ink-3">{histBusy===shKey(o.shift)?"loading…":shKey(o.shift)}</span></button>
          {histBlock(o.shift)&&<div className="px-3.5 py-2">{histBlock(o.shift)}</div>}
        </div>}
      </div>
    );
  };

  // ── B3: seat history (last 5 past bookings, per time plan) ──
  const [hist,setHist]=useState<{key:string;items:any[]}|null>(null);
  const [histBusy,setHistBusy]=useState("");
  const shKey=(s:string)=>{ const u=(s||"").toUpperCase(); return (u==="FULLDAY"||u==="FD")?"FULL DAY":u; };
  const loadHist=async(shiftRaw:string)=>{
    const k=shKey(shiftRaw);
    if(hist&&hist.key===k){ setHist(null); return; }
    setHistBusy(k);
    try{
      const p=new URLSearchParams({action:"getSeatHistory",library_code:lib,seat_no:cell.display_label,shift:k});
      if(branch) p.set("branch_code",branch);
      const r=await fetch(`${API}?${p}`).then(x=>x.json());
      if(r&&r.ok) setHist({key:k,items:r.items||[]});
      else showToast((r&&r.error)||"Could not load seat history","error");
    }catch{ showToast("Network error","error"); }
    setHistBusy("");
  };
  const histBlock=(kRaw:string)=>{ const k=shKey(kRaw); if(!hist||hist.key!==k) return null; return (
    <div className="mt-1.5 bg-lma-slate-50 rounded-xl p-2.5 border border-lma-slate-200">
      <div className="text-[10px] font-extrabold text-lma-slate-400 mb-1">PAST BOOKINGS · {k}</div>
      {hist.items.length===0?<div className="text-[11px] text-lma-slate-400">No past bookings on this seat for {k}.</div>:
        hist.items.map((h:any)=>(
          <div key={h.receipt_no} className="flex items-center gap-1.5 text-[11px] py-0.5">
            <button onClick={()=>onViewReceipt(h.receipt_no)} className="font-bold text-lma-primary underline decoration-dotted shrink-0">{h.receipt_no}</button>
            <span className="font-semibold text-lma-slate-700 truncate">{h.name}</span>
            <span className="text-lma-slate-400 ml-auto shrink-0">{h.booking_from} → {h.booking_to}</span>
            {h.status==="CANCELLED"&&<span className="text-[9px] font-bold text-lma-danger shrink-0">CXL</span>}
          </div>
        ))}
    </div>
  ); };

  // ── BLOCKED lane: same architecture as a booking ──
const BlockPanel=(blk:BlockInfo)=>{
    const exp=blk.expired;
    const bc = exp?"#6b0a0a":"#4c5270";
    const bg = exp?"#fbf4f4":"#f7f8fc";
    const bd = exp?"#efdada":"#dfe2ee";
    const mono2 = "'JetBrains Mono',ui-monospace,monospace";
    return (
    <div className="rounded-[18px] p-3.5 border" style={{ background:bg, borderColor:bd }}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color:bc }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="9" width="11" height="7.5" rx="1.6"/><path d="M6.8 9V6.5a3.2 3.2 0 016.4 0V9"/></svg>
        <span>{exp?"Block ended":"Blocked"}</span>
        {blk.shift&&blk.shift!=="ALL"&&<><span style={{ opacity:.45, fontWeight:500 }}>·</span><span>{blk.shift}</span></>}
      </div>
      <div className="text-[11.5px] mt-1.5" style={{ color:"#646882" }}><span className="font-bold">Reason: </span>{blk.reason||"—"}</div>
      {(blk.block_from||blk.block_to)&&<div className="text-[11.5px] mt-0.5" style={{ color:"#646882" }}><span className="font-bold">Dates: </span><span style={{ fontFamily:mono2 }}>{blk.block_from||"…"} → {blk.block_to||"…"}</span></div>}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button disabled={busy} onClick={()=>onEdit(cell.display_label,blk)} className="h-11 rounded-[12px] text-[13px] font-semibold flex items-center justify-center disabled:opacity-50" style={{ background:"#fff", color:bc, boxShadow:"inset 0 0 0 1.5px "+bd }}>Edit</button>
        <button disabled={busy} onClick={()=>removeBlock(blk)} className="h-11 rounded-[12px] text-[13px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50" style={{ background:"#fff", color:bc, boxShadow:"inset 0 0 0 1.5px "+bd }}><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="9" width="11" height="7.5" rx="1.6"/><path d="M6.8 9V6.5a3.2 3.2 0 015.9-1.4"/></svg>Unblock</button>
      </div>
    </div>
    );
  };

  // ── VACANT lane: add booking / block seat ──
  const VacantPanel=(shift:"MORNING"|"EVENING"|"FULL DAY"|undefined, held:TempHeldInfo|null)=>{
    const vac = { background:"#fbfbfe", borderColor:"#d7d9e6" };
    if(chooseMode && !shift){
      const isAdd=chooseMode==="ADD";
      const pick=(s:"MORNING"|"EVENING"|"FULL DAY")=>{ if(isAdd){ goBook(s); } else { setChooseMode(""); onBlock(cell.display_label,s); } };
      return (
        <div className="rounded-[18px] border border-dashed border-[#cfd3e6] bg-lma-surface p-3.5">
          <div className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{isAdd?"Book which shift?":"Block which shift?"}</div>
          <div className="grid grid-cols-3 gap-2">
            {(["MORNING","EVENING","FULL DAY"] as const).map(s=>(
              <button key={s} onClick={()=>pick(s)} className={`h-11 rounded-[12px] font-semibold text-[13px] ${isAdd?"lma-glass-btn text-white":"bg-lma-bg text-lma-ink-2 ring-1 ring-inset ring-lma-line"}`}>{s==="FULL DAY"?"Full Day":s.charAt(0)+s.slice(1).toLowerCase()}</button>
            ))}
          </div>
          <button onClick={()=>setChooseMode("")} className="mt-2 h-10 w-full rounded-[12px] text-[13px] font-semibold text-lma-ink-3">Back</button>
        </div>
      );
    }
    const shLbl = shift?(shift==="FULL DAY"?"Full Day":shift.charAt(0)+shift.slice(1).toLowerCase()):"";
    return (
      <div className="rounded-[18px] border border-dashed border-[#cfd3e6] bg-lma-surface p-3.5">
        {held&&<p className="text-[11px] font-semibold mb-2" style={{ color:"#b45309" }}>⚠ Held by <b>{held.name||held.student_id}</b> (temp-vacate). Use another seat unless you mean to reassign it.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>{ if(shift) goBook(shift); else setChooseMode("ADD"); }} className="lma-glass-btn h-12 whitespace-nowrap rounded-[14px] px-2 text-white font-bold text-[14px] flex items-center justify-center gap-1.5 active:brightness-95" aria-label={shift?`Book ${shLbl}`:"Book"}><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M10 4.5v11M4.5 10h11"/></svg>Book</button>
          <button onClick={()=>{ if(shift) onBlock(cell.display_label,shift); else setChooseMode("BLOCK"); }} className="h-12 rounded-[14px] font-semibold text-[14px] flex items-center justify-center gap-1.5 bg-lma-bg text-lma-ink-2 ring-1 ring-inset ring-lma-line"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="9" width="11" height="7.5" rx="1.6"/><path d="M6.8 9V6.5a3.2 3.2 0 016.4 0V9"/></svg>Block</button>
        </div>
        {shift
          ? <><button onClick={()=>loadHist(shift)} className="w-full mt-2 py-1.5 rounded-lg font-bold text-[11px]" style={{ background:"#fff", color:"#9a9eb6", boxShadow:"inset 0 0 0 1px #e7e9f3" }}>{histBusy===shift?"…":"🕘 Past bookings here"}</button>{histBlock(shift)}</>
          : <><div className="flex gap-1.5 mt-2">{(["MORNING","EVENING","FULL DAY"] as const).map(s=>(<button key={s} onClick={()=>loadHist(s)} className="flex-1 py-1.5 rounded-lg font-bold text-[10px]" style={{ background:"#fff", color:"#9a9eb6", boxShadow:"inset 0 0 0 1px #e7e9f3" }}>{histBusy===s?"…":`🕘 ${s==="FULL DAY"?"Full Day":s.charAt(0)+s.slice(1).toLowerCase()}`}</button>))}</div>{hist&&histBlock(hist.key)}</>}
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
      <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
      <div role="dialog" aria-modal="true" aria-label={`Seat ${cell.display_label} · ${summary}`} className="lma-sheet-up relative w-full max-w-[560px] max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lma-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-lma-float" onClick={e=>e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#dfe1ee]"/>
        {/* header: just the library — the seat number and each half's state are in the column and lanes below */}
        <div className="mb-3 flex items-center justify-between gap-3">
          {(()=>{
            const libRow=(init?.libraries||[]).find(l=>l.library_code===lib);
            const brRow:any=branch?(init?.branches||[]).find((b:any)=>b.branch_code===branch):null;
            const c=(brRow&&brRow.color)||libRow?.color||"#4f46e5";
            const e=(brRow&&brRow.emoji)||libRow?.emoji||"📚";
            return (
              <span className="inline-flex h-10 items-center gap-2 rounded-full pl-3 pr-4 text-[15px] font-bold tracking-[0.01em]"
                style={{ background:c+"1a", color:c, boxShadow:`inset 0 0 0 1px ${c}33` }}>
                <span aria-hidden="true" className="text-[16px] leading-none">{e}</span><span>{branch||lib}</span>
              </span>
            );
          })()}
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div className="flex items-stretch gap-3">
          <SeatToken cell={cell}/>
          <div className="min-w-0 flex-1">{body}</div>
        </div>

        {confirmVacate&&(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" onClick={()=>setConfirmVacate(null)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="lma-sheet-up relative w-full max-w-xs rounded-[20px] bg-lma-surface p-5 shadow-lma-float" onClick={e=>e.stopPropagation()}>
              <h4 className="mb-1 text-[16px] font-bold text-lma-ink">Temp-Vacate seat {cell.display_label}?</h4>
              <p className="text-[12px] text-lma-slate-500 mb-4">{confirmVacate.student_id} · {confirmVacate.name} will be parked. Seat {cell.display_label} is freed but held for them until you re-allot.</p>
              <div className="flex gap-2">
                <button onClick={()=>setConfirmVacate(null)} className="h-11 flex-1 rounded-[12px] bg-lma-bg text-[14px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">No</button>
                <button disabled={busy} onClick={()=>{const o=confirmVacate;setConfirmVacate(null);doVacate(o);}} className="h-11 flex-1 rounded-[12px] bg-[#d97706] text-[14px] font-semibold text-white disabled:opacity-50">Park</button>
              </div>
            </div>
          </div>
        )}
        {confirmCancel&&<CancelRefundSheet target={{receipt_no:confirmCancel.receipt_no,name:confirmCancel.name,student_id:confirmCancel.student_id,seat_label:cell.display_label,fees_due_balance:confirmCancel.fees_due_balance}} presentation="modal" post={post} showToast={showToast} onClose={()=>setConfirmCancel(null)} onDone={(r)=>{ const ph=confirmCancel?.phones; setConfirmCancel(null); if(r.whatsapp_text) onShare(r.whatsapp_text,"Booking cancelled",ph); onChanged(); }}/>}
      </div>
    </div>
  );
}

// ── B1: VACANT-SEATS TEXT LIST (board surface) — shared vacancy computer ──
function VacancyListDialog({ board, libCode, scopeCode, onClose }:{ board:BoardResp; libCode:string; scopeCode:string; onClose:()=>void }){
  const { init, showToast }=useLMA();
  const ORDER:VacPlan[]=["MORNING","EVENING","FULL DAY"];
  const [sel,setSel]=useState<VacPlan[]>([]);      // nothing pre-selected — you pick what you need
  const [side,setSide]=useState(false);
  const toggle=(p:VacPlan)=>setSel(c=>c.includes(p)?c.filter(x=>x!==p):[...c,p]);
  const plans=ORDER.filter(p=>sel.includes(p));
  const libName=((init?.libraries)||[]).find((l:any)=>l.library_code===libCode)?.display_name||"";
  const libLabel=libName?`${libName} (${scopeCode})`:scopeCode;
  const any=plans.length>0||side;
  const text=any?buildVacancyText(libLabel,fmtDMY(new Date()),board,plans,side):"";
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40"/>
      <div className="relative w-full max-w-sm bg-white rounded-2xl p-4 lma-slide-up max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <h3 className="text-base font-extrabold text-lma-slate-900 leading-tight mb-0.5">🪑 Vacant seats</h3>
        <p className="text-[11px] font-bold text-lma-slate-500 mb-2.5">{libLabel}</p>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {ORDER.map(p=>(
            <button key={p} onClick={()=>toggle(p)} style={{borderRadius:10}} className={`px-3 h-9 text-[11px] font-extrabold ${sel.includes(p)?"bg-lma-primary text-white":"bg-lma-slate-100 text-lma-slate-600"}`}>{p}</button>
          ))}
          <button onClick={()=>setSide(v=>!v)} style={{borderRadius:10}} className={`px-3 h-9 text-[11px] font-extrabold ${side?"bg-lma-primary text-white":"bg-lma-slate-100 text-lma-slate-600"}`}>SIDE PANEL</button>
        </div>
        {!any
          ? <div className="text-[12px] font-bold text-lma-slate-500 bg-lma-slate-50 rounded-xl p-3 mb-3 text-center">Tap a time plan above to build the list.</div>
          : <pre className="text-[11px] font-medium text-lma-slate-800 bg-lma-slate-50 rounded-xl p-3 mb-3 whitespace-pre-wrap break-words">{text}</pre>}
        <div className="flex gap-2">
          <button disabled={!any} onClick={()=>{ navigator.clipboard.writeText(text); showToast("Copied"); }} style={{borderRadius:12}} className="flex-1 h-10 bg-lma-primary/10 text-lma-primary font-bold text-sm disabled:opacity-40">Copy</button>
          <button disabled={!any} onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank")} style={{borderRadius:12}} className="flex-1 h-10 bg-lma-accent text-white font-bold text-sm disabled:opacity-40">WhatsApp</button>
          <button onClick={onClose} style={{borderRadius:12}} className="px-4 h-10 bg-lma-slate-900 text-white font-bold text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── A5: full cancel experience on the board — replicates Renewals CancelSheet / ReceiptModal CancelPanel
// (3rd documented copy; consolidation slated for C4). markReceiptCancelled remains the single status path;
// markReceiptCancelledWithRefund wraps it + issueRefund internally (10_Renewals / 08_Refunds).
// ── VACANCY EXPORT (O6): live seat chart 1:1 at normal scale, no names/ID ──
function VacancyExport({ board, label, shiftView, genderM, genderF }:{ board:BoardResp; label:string; shiftView:ShiftView; genderM:boolean; genderF:boolean }){
  return (
    <div id="board-vacancy-export" style={{position:"fixed",left:"-99999px",top:0,background:"#fff",padding:"20px",width:"fit-content"}}>
      <div style={{textAlign:"center",marginBottom:"14px"}}>
        <div style={{fontSize:"22px",fontWeight:900,color:"#0f172a",lineHeight:1.1}}>{label}</div>
        <div style={{fontSize:"12px",fontWeight:600,color:"#475569",marginTop:"4px"}}>{fmtDMY(new Date())} · {shiftView==="ALL"?"All shifts":shiftView}</div>
      </div>
      {board.sections.slice().sort((a,b)=>a.section_order-b.section_order).map(sec=>(
        <div key={sec.section_name} style={{marginBottom:"14px"}}>
          {board.sections.length>1&&<div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:"5px"}}>{sec.section_name}</div>}
          <div style={{display:"grid",gridTemplateColumns:`repeat(${sec.cols}, 58px)`,gridAutoRows:"64px",gap:"7px"}}>
            {Array.from({length:sec.rows*sec.cols}).map((_,idx)=>{
              const r=Math.floor(idx/sec.cols)+1,c=(idx%sec.cols)+1;
              const cell=sec.seats.find(s=>s.row_in_section===r&&s.col_in_section===c);
              if(!cell||cell.cell_type==="DEAD") return <div key={idx} style={{width:"58px",height:"64px"}}/>;
              const bi=cell.block_info||{morning:null,evening:null,fullday:null};
              const gline=(g?:string)=>{const n=normGender(g||"");if(genderM&&n==="M")return "#2563eb";if(genderF&&n==="F")return "#db2777";return null;};
              const zone=(o:any,blk:any,h:string)=>{
                if(o){const col=occLook(o);const gb=gline(o.gender);return <div style={{height:h,background:col.bg,color:col.text,border:gb?`2px solid ${gb}`:`1px solid ${col.border}`,boxShadow:col.ring?`inset 0 0 0 2px ${col.border}`:undefined,borderRadius:"4px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",boxSizing:"border-box",overflow:"hidden"}}><div style={{fontSize:"9px",fontWeight:700,lineHeight:"10px"}}>{shortDate(o.booking_to)}</div></div>;}
                if(blk){const gb=gline(blk.gender);return <div style={{height:h,background:blk.expired?"#6b0a0a":"repeating-linear-gradient(45deg,#fecaca,#fecaca 3px,#fee2e2 3px,#fee2e2 6px)",border:gb?`2px solid ${gb}`:"1px solid #b91c1c",borderRadius:"4px",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"}}><div style={{fontSize:"8px",fontWeight:800,color:blk.expired?"#fff":"#7f1d1d"}}>BLK</div></div>;}
                return <div style={{height:h,background:"#ffffff",border:"1px dashed #cbd5e1",borderRadius:"4px",boxSizing:"border-box"}}/>;
              };
              const full=cell.fullday||bi.fullday;
              // Mirror the on-screen SeatTile: number INSIDE the tile at top, coloured field fills the rest.
              const tile=(cell:any,bi:any,full:any)=>{
                // Mirrors LIVE SeatTile. Number 11px bold, dates 9px bold — same in full-day & split.
                // Blocks treated exactly like bookings (full or half); show block_to end date, else "BLK".
                if(full){
                  const o=cell.fullday, blk=bi.fullday;
                  const col=o?occLook(o):null; const gb=o?gline(o.gender):null;
                  const bg=o&&col?col.bg:blk?(blk.expired?"repeating-linear-gradient(45deg,#6b0a0a,#6b0a0a 2px,#8a1a1a 2px,#8a1a1a 4px)":"repeating-linear-gradient(45deg,#fecaca,#fecaca 2px,#fee2e2 2px,#fee2e2 4px)"):"#ffffff";
                  const txt=o&&col?col.text:blk?(blk.expired?"#fecaca":"#7f1d1d"):"#0f172a";
                  const bd=o&&col?(gb?`2px solid ${gb}`:`1px solid ${col.border}`):blk?"1px solid #b91c1c":"1px dashed #cbd5e1";
                  const label=o?shortDate(o.booking_to):blk?(shortDate(blk.block_to||"")||"BLK"):"";
                  const numCol=(o&&col&&col.text==="#ffffff")?"#ffffff":"#0f172a";
                  return <div style={{width:"100%",height:"100%",background:bg,border:bd,borderRadius:"6px",boxSizing:"border-box",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",overflow:"hidden",padding:"2px"}}>
                    <span style={{display:"block",fontSize:"11px",fontWeight:800,color:numCol,lineHeight:"1.1"}}>{cell.display_label}</span>
                    {label&&<span style={{display:"block",fontSize:"9px",fontWeight:700,color:txt,lineHeight:"1.1",marginTop:"2px"}}>{label}</span>}
                  </div>;
                }
                // SPLIT — three EQUAL strips (all flex:1): morning date / seat number / evening date.
                const anyBooked=!!(cell.morning||cell.evening||bi.morning||bi.evening);
                const halfSty=(o:any,blk:any):any=>{
                  if(o){const c=occLook(o);return {background:c.bg,color:c.text};}
                  if(blk){return {background:blk.expired?"#6b0a0a":"#fecaca",color:blk.expired?"#fecaca":"#7f1d1d"};}
                  return anyBooked?{background:"rgba(0,0,0,0.06)",color:"#94a3b8"}:{background:"#ffffff",color:"#cbd5e1"};
                };
                const halfTxt=(o:any,blk:any)=> o?shortDate(o.booking_to):blk?(shortDate(blk.block_to||"")||"BLK"):"·";
                const mS=halfSty(cell.morning,bi.morning), eS=halfSty(cell.evening,bi.evening);
                // THREE FIXED-HEIGHT strips (NOT grid 1fr — html2canvas collapses 1fr, breaking centering).
                // Each strip has an explicit pixel height + flex centering, giving a real box to center text in.
                // Each strip: fixed height + symmetric vertical padding + flex-center. The padding guarantees
                // text stays off both edges even if html2canvas mis-computes flex; centering does the rest.
                return <table style={{width:"100%",height:"100%",borderCollapse:"collapse",tableLayout:"fixed",border:anyBooked?"1px solid #cbd5e1":"1px dashed #cbd5e1",borderRadius:"6px",overflow:"hidden",background:"#ffffff"}}>
<tbody>
<tr><td style={{height:"20px",padding:0,textAlign:"center",verticalAlign:"middle",fontSize:"9px",fontWeight:700,...mS}}>{halfTxt(cell.morning,bi.morning)}</td></tr>
<tr><td style={{height:"20px",padding:0,textAlign:"center",verticalAlign:"middle",fontSize:"11px",fontWeight:800,color:"#0f172a",background:"#ffffff",borderTop:"1px solid #e5e7eb",borderBottom:"1px solid #e5e7eb"}}>{cell.display_label}</td></tr>
<tr><td style={{height:"20px",padding:0,textAlign:"center",verticalAlign:"middle",fontSize:"9px",fontWeight:700,...eS}}>{halfTxt(cell.evening,bi.evening)}</td></tr>
</tbody>
</table>;
              };
              return <div key={idx} style={{width:"58px",height:"64px"}}>{tile(cell,bi,full)}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── DETAILED EXPORT LAYOUT (off-screen, captured by html2canvas) ──
function DetailedExport({ board, label, shiftView, genderM, genderF }:{ board:BoardResp; label:string; shiftView:ShiftView; genderM:boolean; genderF:boolean }){
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
    const ovl=(g?:string)=>{ const n=normGender(g||""); if(genderM&&n==="M") return "#2563eb"; if(genderF&&n==="F") return "#db2777"; return null; };
    const b=cell.blocked||{morning:false,evening:false,fullday:false};
    const bi=cell.block_info||{morning:null,evening:null,fullday:null};
    const vacantTile = !fd && !m && !e && !b.morning && !b.evening && !b.fullday;
    const th = cell.temp_held;
    const heldFD = th ? th.fullday : null;
    const heldM  = th ? (th.morning || th.fullday) : null;
    const heldE  = th ? (th.evening || th.fullday) : null;
    const heldHolder = heldFD || heldM || heldE;
    const wholeHeld = (!!heldFD || (!!heldM && !!heldE)) && vacantTile;
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
    <div style={{fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.2,flexShrink:0,marginBottom:"3px"}}>{fmtDMY(o.booking_to)}</div>
  </>
);

    // block detail rows (mirrors a booking tile: tag+id top, reason middle, dates bottom)
    const blockRows=(blk:BlockInfo)=>{
      const dates=(blk.block_from||blk.block_to)?`${blk.block_from||"…"} → ${blk.block_to||"…"}`:"";
      const exp=blk.expired;
      return (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:"10px",fontWeight:900,lineHeight:1.2,gap:"4px",flexShrink:0,color: exp?"#ffffff":"#b91c1c"}}>
            <span style={{whiteSpace:"nowrap"}}>{exp?"BLOCK ENDED":"BLOCKED"}</span>
            {blk.block_id&&<span style={{whiteSpace:"nowrap",fontWeight:700,fontSize:"8px",opacity:0.85}}>{blk.block_id}</span>}
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800,textAlign:"center",lineHeight:1.2,wordBreak:"break-word",overflow:"hidden",color: exp?"#ffffff":"#7f1d1d"}}>{blk.reason||"—"}</div>
          {dates&&<div style={{fontSize:"9px",fontWeight:800,textAlign:"center",lineHeight:1.2,flexShrink:0,color: exp?"#ffffff":"#b91c1c"}}>{dates}</div>}
        </>
      );
    };

    // a half-zone: occupant data, blocked/hold stripe, or empty
    const halfZone=(o:Occupant|null, blk:BlockInfo|null, held?:any)=>{
      if(o){
        const col=exLook(o);
        return <div style={{position:"relative",height:"100%",width:"100%",background:col.bg,color:col.text,borderRadius:"4px",padding:"1px 7px 9px 7px",display:"flex",flexDirection:"column",boxSizing:"border-box",overflow:"hidden",boxShadow:col.ring?`inset 0 0 0 3px ${EXPORT_GOLD}`:undefined}}>{ovl(o.gender)&&<><div style={{position:"absolute",inset:0,border:`3px solid ${ovl(o.gender)}`,borderRadius:"4px",pointerEvents:"none"}}/><div style={{position:"absolute",inset:"3px",border:"1px solid #ffffff",borderRadius:"2px",pointerEvents:"none"}}/></>}{dataRows(o)}</div>;
      }
      if(blk){
        return (
          <div style={{position:"relative",height:"100%",width:"100%",background: blk.expired?"#6b0a0a":"repeating-linear-gradient(45deg,#fecaca,#fecaca 6px,#fee2e2 6px,#fee2e2 12px)",borderRadius:"4px",padding:"5px 7px",display:"flex",flexDirection:"column",boxSizing:"border-box",overflow:"hidden",border: blk.expired?"2px solid #450a0a":"1px solid #f87171"}}>
            {ovl(blk.gender)&&<><div style={{position:"absolute",inset:0,border:`3px solid ${ovl(blk.gender)}`,borderRadius:"4px",pointerEvents:"none"}}/><div style={{position:"absolute",inset:"3px",border:"1px solid #ffffff",borderRadius:"2px",pointerEvents:"none"}}/></>}
            {blockRows(blk)}
          </div>
        );
      }
      if(held){
        return <div style={{height:"100%",width:"100%",background:"#fffbeb",color:"#b45309",border:"2px dashed #f59e0b",borderRadius:"4px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:900,boxSizing:"border-box",padding:"2px 4px",overflow:"hidden",textAlign:"center"}}>{held.student_id}</div>;
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
        <div style={{position:"relative",border:col.ring?`3px solid ${EXPORT_GOLD}`:"1.5px solid #cbd5e1",borderRadius:"8px",overflow:"hidden",height:"100%",display:"flex",flexDirection:"column",background:col.bg,color:col.text,boxSizing:"border-box",padding:"5px 7px"}}>{ovl(fd.gender)&&<><div style={{position:"absolute",inset:0,border:`3px solid ${ovl(fd.gender)}`,borderRadius:"8px",pointerEvents:"none"}}/><div style={{position:"absolute",inset:"3px",border:"1px solid #ffffff",borderRadius:"6px",pointerEvents:"none"}}/></>}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",fontWeight:900,lineHeight:1.2,gap:"4px",flexShrink:0}}>
            <span style={{whiteSpace:"nowrap"}}>{fd.student_id}</span>
            <span style={{whiteSpace:"nowrap"}}>{fd.receipt_no}</span>
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",fontWeight:800,textAlign:"center",lineHeight:1.25,wordBreak:"break-word",overflow:"hidden"}}>{fd.name}</div>
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontWeight:900,fontSize:"24px",color:"#0f172a",lineHeight:1}}>{cell.display_label}</span>
            {notesText && <span style={{fontSize:"8px",fontWeight:700,color:"#475569",lineHeight:1,marginTop:"1px"}}>{notesText}</span>}
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.2}}>{fmtDMY(fd.booking_to)}</div>
          {dueAmt(fd)}
        </div>
      );
    }

    // FULL-DAY BLOCK fills whole tile (with full detail)
    if(bi.fullday){
      const blk=bi.fullday;
      const dates=(blk.block_from||blk.block_to)?`${blk.block_from||"…"} → ${blk.block_to||"…"}`:"";
      const exp=blk.expired;
      return (
        <div style={{border: exp?"2px solid #450a0a":"1.5px solid #b91c1c",borderRadius:"8px",overflow:"hidden",height:"100%",display:"flex",flexDirection:"column",background: exp?"#6b0a0a":"repeating-linear-gradient(45deg,#fecaca,#fecaca 6px,#fee2e2 6px,#fee2e2 12px)",color: exp?"#ffffff":"#b91c1c",boxSizing:"border-box",padding:"5px 7px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:"11px",fontWeight:900,gap:"4px",flexShrink:0}}>
            <span style={{whiteSpace:"nowrap"}}>{exp?"BLOCK ENDED":"BLOCKED"}</span>
            {blk.block_id&&<span style={{whiteSpace:"nowrap",fontSize:"8px",fontWeight:700,opacity:0.85}}>{blk.block_id}</span>}
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.25,wordBreak:"break-word",overflow:"hidden",color: exp?"#ffffff":"#7f1d1d"}}>{blk.reason||"—"}</div>
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontWeight:900,fontSize:"24px",color: exp?"#ffffff":"#0f172a",lineHeight:1}}>{cell.display_label}</span>
            {notesText&&<span style={{fontSize:"8px",fontWeight:700,color: exp?"#ffd5d9":"#475569",lineHeight:1,marginTop:"1px"}}>{notesText}</span>}
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:800,textAlign:"center",lineHeight:1.2,color: exp?"#ffffff":"#b91c1c"}}>{dates}</div>
        </div>
      );
    }

    // MORNING (upper) + EVENING (lower), number band in middle — grid for deterministic html2canvas rendering
    const wrapperBorder = wholeHeld ? HELD_BORDER : (vacantTile ? VACANT_BORDER : "1.5px solid #cbd5e1");
    const wrapperBg = wholeHeld ? "#fffbeb" : (vacantTile ? VACANT_FILL : "#fff");
    return (
      <div style={{border:wrapperBorder,borderRadius:"8px",overflow:"hidden",height:"100%",display:"grid",gridTemplateRows:"1fr 34px 1fr",rowGap:"6px",background:wrapperBg,boxSizing:"border-box",padding:"4px"}}>
        <div style={{overflow:"hidden",minWidth:0,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {halfZone(m, bi.morning, heldM)}
        </div>
        {numberBand}
        <div style={{overflow:"hidden",minWidth:0,minHeight:0}}>{halfZone(e, bi.evening, heldE)}</div>
      </div>
    );
  }

  const hasPanels = board.unassigned.length>0 || board.floating.length>0 || board.otherShift.length>0;

  return (
    <div id="board-detailed-export" style={{position:"fixed",left:"-99999px",top:0,background:"#fff",padding:"24px",width:"fit-content"}}>
      <div style={{textAlign:"center",marginBottom:"28px"}}>
        <div style={{fontSize:"54px",fontWeight:900,color:"#0f172a",letterSpacing:"1px",lineHeight:1.1}}>{label}</div>
        <div style={{fontSize:"22px",fontWeight:600,color:"#475569",marginTop:"8px",lineHeight:1.2}}>{fmtDMY(new Date())} · {shiftView==="ALL"?"All shifts":shiftView}</div>
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
                  const gb=(genderM&&normGender(it.gender||"")==="M")?"#2563eb":(genderF&&normGender(it.gender||"")==="F")?"#db2777":null;
                  return (
                  <div key={it.receipt_no} style={{position:"relative",borderRadius:"6px",padding:"8px 10px",background:L.bg,boxShadow:L.ring?`inset 0 0 0 2px ${EXPORT_GOLD}`:undefined}}>{gb&&<><div style={{position:"absolute",inset:0,border:`2px solid ${gb}`,borderRadius:"6px",pointerEvents:"none"}}/><div style={{position:"absolute",inset:"2px",border:"1px solid #ffffff",borderRadius:"4px",pointerEvents:"none"}}/></>}
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
  ctx:{receipt_no:string;name:string;student_id:string;shift:string;original?:string;phones?:{number:string;tag:string}[]};
  lib:string; branch:string;
  post:(a:string,p:any)=>Promise<any>;
  onClose:()=>void; showToast:(m:string,t?:"success"|"error")=>void; onDone:()=>void; onShare:(text:string,label:string,phones?:{number:string;tag:string}[])=>void;
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
    if(r&&r.reallotted){ showToast(`${ctx.student_id} → seat ${r.seat_no}`); if(r.whatsapp_text) onShare(r.whatsapp_text,"Seat changed",ctx.phones); onDone(); }
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

function BlockForm({ seat, suggestedShift, blockId, initReason, initFrom, initTo, initGender, lib, branch, post, onClose, onSaved, showToast }:{ seat:string; suggestedShift:string; blockId?:string; initReason?:string; initFrom?:string; initTo?:string; initGender?:string; lib:string; branch:string; post:(a:string,p:any)=>Promise<any>; onClose:()=>void; onSaved:()=>void; showToast:(m:string,t?:"success"|"error")=>void }){
  const isEdit=!!blockId;
  const [shift,setShift]=useState(suggestedShift||"FULL DAY");
  const [reason,setReason]=useState(initReason||"");
  const [from,setFrom]=useState(toIsoInput(initFrom||""));
  const [to,setTo]=useState(toIsoInput(initTo||""));
  const [gender,setGender]=useState((initGender||"").toUpperCase());
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy) return;
    setBusy(true);
    const r=isEdit
      ? await post("updateSeatBlock",{ block_id:blockId, shift_blocked:shift, reason, block_from:from, block_to:to, gender })
      : await post("addSeatBlock",{ library_code:lib, branch_code:branch, seat_display_label:seat, shift_blocked:shift, reason, block_from:from, block_to:to, gender });
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
        <Lbl>Gender (optional)</Lbl>
        <div className="grid grid-cols-3 gap-1.5">
          {[["","Any"],["M","Male"],["F","Female"]].map(([v,lab])=>(
            <button key={v} onClick={()=>setGender(v)} className={`py-2 rounded-lg text-[11px] font-bold border ${gender===v?"bg-lma-primary text-white border-lma-primary":"bg-lma-slate-50 text-lma-slate-700 border-lma-slate-200"}`}>{lab}</button>
          ))}
        </div>
        <Lbl>Reason (optional)</Lbl>
        <Txt value={reason} onChange={e=>setReason(e.target.value)} placeholder="Repair, reserved, etc."/>
        <div className="grid grid-cols-2 gap-2">
          <div><Lbl>From (info)</Lbl><Txt type="date" value={from} onChange={e=>setFrom(e.target.value)}/>{from && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(from)}</span>}</div>
          <div><Lbl>To (info)</Lbl><Txt type="date" value={to} onChange={e=>setTo(e.target.value)}/>{to && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(to)}</span>}</div>
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
  const { confirm: ask }=useLMA();
  const [busy,setBusy]=useState(false);
  const remove=async()=>{
    if(busy) return;
    if(!(await ask({ title:"Remove this block?", body:"The seat becomes available to book again.", confirmLabel:"Remove block", danger:true }))) return;
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