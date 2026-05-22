"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API = "/api/lma";
const PASSWORD = process.env.NEXT_PUBLIC_LMA_PASSWORD!;

interface Library { library_code:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch  { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface InitData{ ok:boolean; libraries:Library[]; branches:Branch[]; }
interface Occupant {
  receipt_no:string; student_id:string; name:string; shift:string; shift_name:string;
  booking_to:string; fees_due_balance:number; dues_status:string; is_cross_library:string;
  color:"OK"|"EXPIRING"|"DUES"|"EXPIRED";
}
interface BoardCell {
  row_in_section:number; col_in_section:number; seat_no:number; display_label:string; notes:string; cell_type:string;
  morning:Occupant|null; evening:Occupant|null; fullday:Occupant|null;
  blocked:{ morning:boolean; evening:boolean; fullday:boolean };
}
interface SidePanelItem {
  receipt_no:string; student_id:string; name:string; shift:string; shift_name:string;
  booking_to:string; fees_due_balance:number; dues_status:string; seat_label:string; temporary_seat:string;
}
interface BoardResp {
  ok:boolean; library_code:string; branch_code:string;
  sections:{ section_name:string; section_order:number; rows:number; cols:number; seats:BoardCell[] }[];
  floating:SidePanelItem[]; unassigned:SidePanelItem[]; otherShift:SidePanelItem[];
  counts:{ floating:number; unassigned:number; other:number };
}
type ShiftView = "ALL"|"MORNING"|"EVENING"|"FULL DAY";

const COLOR: Record<string,{bg:string;text:string;border:string;label:string}> = {
  OK:       { bg:"#dcfce7", text:"#15803d", border:"#86efac", label:"OK" },
  EXPIRING: { bg:"#fee2e2", text:"#b91c1c", border:"#fca5a5", label:"Expiring" },
  DUES:     { bg:"#fef3c7", text:"#b45309", border:"#fcd34d", label:"Dues" },
  EXPIRED:  { bg:"#7f1d1d", text:"#ffffff", border:"#991b1b", label:"Expired" },
};

export default function BoardPage(){
  const router = useRouter();
  const [unlocked,setUnlocked]=useState(false);
  const [pwInput,setPwInput]=useState(""); const [pwErr,setPwErr]=useState("");
  const [init,setInit]=useState<InitData|null>(null);
  const [scope,setScope]=useState<string>("");           // library or branch code
  const [board,setBoard]=useState<BoardResp|null>(null);
  const [loading,setLoading]=useState(false);
  const [shiftView,setShiftView]=useState<ShiftView>("ALL");
  const [detail,setDetail]=useState<{cell:BoardCell}|null>(null);
  const [vacantTap,setVacantTap]=useState<{label:string}|null>(null);
  const [exporting,setExporting]=useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{ if(typeof window!=="undefined"&&sessionStorage.getItem("lma_ok")==="1")setUnlocked(true); },[]);
  const tryUnlock=()=>{ if(pwInput&&pwInput===PASSWORD){sessionStorage.setItem("lma_ok","1");setUnlocked(true);setPwErr("");}else setPwErr("Incorrect password."); };

  useEffect(()=>{ if(!unlocked)return; fetch(`${API}?action=getInitData`).then(r=>r.json()).then((r:InitData)=>{ if(r.ok){ setInit(r);
    // default scope = first library (or its first branch)
    const first=r.libraries.find(l=>l.active);
    if(first){ if(first.has_branches){ const b=r.branches.find(x=>x.library_code===first.library_code&&x.active); setScope(b?b.branch_code:first.library_code);} else setScope(first.library_code);} } }); },[unlocked]);

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
      const canvas=await h2c(node,{ backgroundColor:"#ffffff", scale:2, logging:false, useCORS:true, width:node.scrollWidth, height:node.scrollHeight, windowWidth:node.scrollWidth, windowHeight:node.scrollHeight });
      const link=document.createElement("a");
      link.download=`${resolved.label.replace(/[^a-z0-9]/gi,"_")}_${new Date().toISOString().slice(0,10)}.png`;
      link.href=canvas.toDataURL("image/png");
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }catch(e){
      console.error("PNG export error:",e);
      alert("Export failed: "+(e instanceof Error?e.message:String(e)));
    }finally{ setExporting(false); setShowExport(false); }
  };

  if(!unlocked){
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-7 lma-slide-up">
          <div className="text-center mb-5"><div className="text-4xl mb-2">🪑</div><h1 className="text-xl font-extrabold text-lma-slate-900">Seat Chart</h1></div>
          <input type="password" autoFocus value={pwInput} onChange={e=>{setPwInput(e.target.value);setPwErr("");}} onKeyDown={e=>{if(e.key==="Enter")tryUnlock();}} placeholder="Password" className="w-full px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[15px] font-medium"/>
          {pwErr&&<p className="text-sm text-lma-danger mt-2 font-medium">{pwErr}</p>}
          <button onClick={tryUnlock} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-[15px] shadow-md">Unlock</button>
        </div>
      </div>
    );
  }

  // chip list (libraries + branches, no "All")
  const chips:{code:string;label:string;emoji:string;color?:string}[]=[];
  if(init){ init.libraries.filter(l=>l.active).forEach(l=>{
    if(l.has_branches){ init.branches.filter(b=>b.library_code===l.library_code&&b.active).forEach(b=>chips.push({code:b.branch_code,label:b.branch_code,emoji:b.emoji||l.emoji,color:b.color||l.color})); }
    else chips.push({code:l.library_code,label:l.library_code,emoji:l.emoji,color:l.color});
  }); }

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Seat Chart</h1><p className="text-[11px] text-lma-slate-500 font-medium">{resolved.label}</p></div>
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
      <div className="flex gap-2 mb-3 flex-wrap text-[10px] text-lma-slate-500">
        {Object.entries(COLOR).map(([k,v])=>(<span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{background:v.bg,border:`1px solid ${v.border}`}}></span>{v.label}</span>))}
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block bg-lma-slate-100 border border-lma-slate-200"></span>Vacant</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block bg-lma-slate-500"></span>Dead</span>
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
                <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${sec.cols}, minmax(34px, 1fr))`}}>
                  {Array.from({length:sec.rows*sec.cols}).map((_,idx)=>{
                    const r=Math.floor(idx/sec.cols)+1,c=(idx%sec.cols)+1;
                    const cell=sec.seats.find(s=>s.row_in_section===r&&s.col_in_section===c);
                    if(!cell) return <div key={idx} className="aspect-square"/>;
                    return <SeatTile key={idx} cell={cell} shiftView={shiftView} onTapOccupied={()=>setDetail({cell})} onTapVacant={()=>setVacantTap({label:cell.display_label})}/>;
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* side panels */}
          <SidePanel title="Unassigned (booked, no seat)" items={board.unassigned} emoji="📋"/>
          <SidePanel title="Floating (temp-vacated)" items={board.floating} emoji="🌀"/>
          <SidePanel title="Other shift (no fixed seat)" items={board.otherShift} emoji="🔄"/>
        </div>
      )}

      {/* occupied detail popup */}
      {detail&&<DetailSheet cell={detail.cell} onClose={()=>setDetail(null)} router={router} scope={scope}/>}

      {/* vacant tap popup */}
      {vacantTap&&(
        <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={()=>setVacantTap(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
            <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
            <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Seat {vacantTap.label}</h3>
            <p className="text-sm text-lma-slate-500 mb-4">This seat is vacant.</p>
            <div className="flex gap-2">
              <button onClick={()=>setVacantTap(null)} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Close</button>
              <button onClick={()=>router.push("/lma/admissions")} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">Book This Seat</button>
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

// ── SEAT TILE ────────────────────────────────────────────────────
function SeatTile({ cell, shiftView, onTapOccupied, onTapVacant }:{ cell:BoardCell; shiftView:ShiftView; onTapOccupied:()=>void; onTapVacant:()=>void }){
  if(cell.cell_type==="DEAD") return <div className="aspect-square rounded bg-lma-slate-500"/>;

  // which occupants are visible given the shift view
  const showM = (shiftView==="ALL"||shiftView==="MORNING")&&!cell.fullday;
  const showE = (shiftView==="ALL"||shiftView==="EVENING")&&!cell.fullday;
  const showF = (shiftView==="ALL"||shiftView==="FULL DAY");

  const fd = showF?cell.fullday:null;
  const m = showM?cell.morning:null;
  const e = showE?cell.evening:null;

  const anyOccupied = !!(fd||m||e);
  const onClick = anyOccupied?onTapOccupied:onTapVacant;

  // full-day fills whole tile
  if(fd){
    const col=COLOR[fd.color]||COLOR.OK;
    return (
      <button onClick={onClick} className="aspect-square rounded flex flex-col items-center justify-center overflow-hidden border px-0.5" style={{background:col.bg,color:col.text,borderColor:col.border}}>
        <span className="text-[10px] font-extrabold leading-none">{cell.display_label}</span>
        <span className="text-[6px] font-bold leading-none mt-0.5 truncate w-full text-center">{shortDate(fd.booking_to)}</span>
      </button>
    );
  }

  // split tile: upper morning, lower evening
  const mCol = m?(COLOR[m.color]||COLOR.OK):null;
  const eCol = e?(COLOR[e.color]||COLOR.OK):null;
  const vacant = !m&&!e;

  return (
    <button onClick={onClick} className="aspect-square rounded overflow-hidden border flex flex-col" style={{borderColor:vacant?"#e2e8f0":"#cbd5e1",background:vacant?"#f8fafc":"#fff"}}>
      <div className="flex-1 flex items-center justify-center text-[7px] font-bold leading-none" style={mCol?{background:mCol.bg,color:mCol.text}:{color:"#cbd5e1"}}>
        {m?<span className="truncate px-0.5">{shortDate(m.booking_to)}</span>:(shiftView==="ALL"||shiftView==="MORNING")?"·":""}
      </div>
      <div className="text-[9px] font-extrabold text-lma-slate-700 leading-none">{cell.display_label}</div>
      <div className="flex-1 flex items-center justify-center text-[7px] font-bold leading-none" style={eCol?{background:eCol.bg,color:eCol.text}:{color:"#cbd5e1"}}>
        {e?<span className="truncate px-0.5">{shortDate(e.booking_to)}</span>:(shiftView==="ALL"||shiftView==="EVENING")?"·":""}
      </div>
    </button>
  );
}

// ── SIDE PANEL ───────────────────────────────────────────────────
function SidePanel({ title, items, emoji }:{ title:string; items:SidePanelItem[]; emoji:string }){
  if(!items||items.length===0) return null;
  return (
    <div className="mt-3 bg-lma-slate-50 rounded-xl p-3">
      <div className="text-[11px] font-bold text-lma-slate-600 mb-2">{emoji} {title} · {items.length}</div>
      <div className="space-y-1.5">
        {items.map(it=>(
          <div key={it.receipt_no} className="bg-white rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-[11px]">
            <span className="font-bold text-lma-slate-900">{it.student_id}</span>
            <span className="text-lma-slate-700 truncate flex-1">{it.name}</span>
            <span className="text-lma-slate-400">{it.shift_name||it.shift}</span>
            {it.temporary_seat&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1 rounded">was {it.temporary_seat}</span>}
            {it.booking_to&&<span className="text-lma-slate-500">{it.booking_to}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DETAIL SHEET (occupied seat tap) ─────────────────────────────
function DetailSheet({ cell, onClose, router, scope }:{ cell:BoardCell; onClose:()=>void; router:any; scope:string }){
  const occupants:Occupant[]=[];
  if(cell.fullday) occupants.push(cell.fullday);
  if(cell.morning) occupants.push(cell.morning);
  if(cell.evening) occupants.push(cell.evening);

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        <h3 className="text-base font-extrabold text-lma-slate-900 mb-3">Seat {cell.display_label}</h3>
        <div className="space-y-3">
          {occupants.map(o=>{
            const col=COLOR[o.color]||COLOR.OK;
            return (
              <div key={o.receipt_no} className="border border-lma-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:col.bg,color:col.text}}>{o.shift_name||o.shift}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:col.bg,color:col.text}}>{col.label}</span>
                  {o.is_cross_library&&o.is_cross_library!=="NO"&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded ml-auto">CROSS · {o.is_cross_library}</span>}
                </div>
                <div className="text-sm font-extrabold text-lma-slate-900">{o.student_id} · {o.name}</div>
                <div className="text-[11px] text-lma-slate-500 mt-0.5">Receipt {o.receipt_no} · until {o.booking_to}</div>
                {o.fees_due_balance>0&&<div className="text-[11px] font-bold text-lma-danger mt-0.5">Dues: ₹{o.fees_due_balance} ({o.dues_status})</div>}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button onClick={()=>router.push("/lma/admissions")} className="py-2 rounded-lg bg-lma-primary/10 text-lma-primary font-bold text-xs">Renew</button>
                  <button onClick={()=>router.push("/lma/renewals")} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Cancel</button>
                  <button onClick={()=>alert("Temp-vacate: coming in next update")} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Temp-Vacate</button>
                  <button onClick={()=>alert("Re-allot: coming in next update")} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Re-Allot</button>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Close</button>
      </div>
    </div>
  );
}

// ── DETAILED EXPORT LAYOUT (off-screen, captured by html2canvas) ──
function DetailedExport({ board, label, shiftView }:{ board:BoardResp; label:string; shiftView:ShiftView }){
  const EXPORT_COLOR: Record<string,{bg:string;text:string;border:string}> = {
    OK:       { bg:"#dcfce7", text:"#15803d", border:"#86efac" },
    EXPIRING: { bg:"#fee2e2", text:"#b91c1c", border:"#fca5a5" },
    DUES:     { bg:"#fef3c7", text:"#b45309", border:"#fcd34d" },
    EXPIRED:  { bg:"#7f1d1d", text:"#ffffff", border:"#991b1b" },
  };

  function richCell(cell:BoardCell){
    if(cell.cell_type==="DEAD") return <div style={{background:"#64748b",borderRadius:"8px",width:"100%",height:"100%"}}/>;
    const fd=cell.fullday, m=cell.morning, e=cell.evening;
    const b=cell.blocked||{morning:false,evening:false,fullday:false};

    // one occupant's data block (used in a half, or full-day upper area)
    const dataRows=(o:Occupant)=>(
      <>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",fontWeight:900,lineHeight:1.2,gap:"4px",flexShrink:0}}>
          <span style={{whiteSpace:"nowrap"}}>{o.student_id}</span>
          <span style={{whiteSpace:"nowrap"}}>{o.receipt_no}</span>
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:800,textAlign:"center",lineHeight:1.25,wordBreak:"break-word",overflow:"hidden"}}>{o.name}</div>
        <div style={{fontSize:"12px",fontWeight:900,textAlign:"center",lineHeight:1.2,minHeight:"15px",flexShrink:0}}>{o.fees_due_balance>0?`₹${o.fees_due_balance}`:""}</div>
        <div style={{fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.2,flexShrink:0}}>{o.booking_to}</div>
      </>
    );

    // a half-zone: occupant data, blocked stripe, or empty
    const halfZone=(o:Occupant|null,isBlocked:boolean)=>{
      if(o){
        const col=EXPORT_COLOR[o.color]||EXPORT_COLOR.OK;
        return <div style={{height:"100%",width:"100%",background:col.bg,color:col.text,borderRadius:"4px",padding:"5px 7px",display:"flex",flexDirection:"column",boxSizing:"border-box",overflow:"hidden"}}>{dataRows(o)}</div>;
      }
      if(isBlocked){
        return <div style={{height:"100%",width:"100%",background:"repeating-linear-gradient(45deg,#fecaca,#fecaca 6px,#fee2e2 6px,#fee2e2 12px)",borderRadius:"4px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:800,color:"#b91c1c"}}>BLOCKED</div>;
      }
      return <div style={{height:"100%",width:"100%"}}/>;
    };

    // notes badge (optional) — small line under seat number
    const notesText = (cell.notes && String(cell.notes).trim()) ? String(cell.notes).trim() : "";

    // number band (middle) — fixed, solid white, with optional notes
    const numberBand=(
      <div style={{flexShrink:0,minHeight:"30px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#fff",padding:"2px 0"}}>
        <span style={{fontWeight:900,fontSize:"24px",color:"#0f172a",lineHeight:1}}>{cell.display_label}</span>
        {notesText && <span style={{fontSize:"8px",fontWeight:700,color:"#94a3b8",lineHeight:1,marginTop:"1px",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{notesText}</span>}
      </div>
    );

    // FULL DAY
    if(fd){
      const col=EXPORT_COLOR[fd.color]||EXPORT_COLOR.OK;
      return (
        <div style={{border:"1.5px solid #cbd5e1",borderRadius:"8px",overflow:"hidden",height:"100%",display:"flex",flexDirection:"column",background:col.bg,color:col.text,boxSizing:"border-box",padding:"5px 7px"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",fontWeight:900,lineHeight:1.2,gap:"4px",flexShrink:0}}>
            <span style={{whiteSpace:"nowrap"}}>{fd.student_id}</span>
            <span style={{whiteSpace:"nowrap"}}>{fd.receipt_no}</span>
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",fontWeight:800,textAlign:"center",lineHeight:1.25,wordBreak:"break-word",overflow:"hidden"}}>{fd.name}</div>
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontWeight:900,fontSize:"24px",color:"#0f172a",lineHeight:1}}>{cell.display_label}</span>
            {notesText && <span style={{fontSize:"8px",fontWeight:700,color:"#475569",lineHeight:1,marginTop:"1px"}}>{notesText}</span>}
          </div>
          <div style={{fontSize:"12px",fontWeight:900,textAlign:"center",lineHeight:1.2,minHeight:"15px",flexShrink:0}}>{fd.fees_due_balance>0?`₹${fd.fees_due_balance}`:""}</div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.2}}>{fd.booking_to}</div>
        </div>
      );
    }

    // MORNING (upper) + EVENING (lower), number band in middle
    return (
      <div style={{border:"1.5px solid #cbd5e1",borderRadius:"8px",overflow:"hidden",height:"100%",display:"flex",flexDirection:"column",background:"#fff",boxSizing:"border-box",padding:"3px"}}>
        <div style={{flex:"1 1 0",minHeight:0,overflow:"hidden"}}>{halfZone(m,!!b.morning)}</div>
        {numberBand}
        <div style={{flex:"1 1 0",minHeight:0,overflow:"hidden"}}>{halfZone(e,!!b.evening)}</div>
      </div>
    );
  }

  return (
    <div id="board-detailed-export" style={{position:"fixed",left:"-99999px",top:0,background:"#fff",padding:"24px",width:"fit-content"}}>
      <div style={{textAlign:"center",marginBottom:"16px"}}>
        <div style={{fontSize:"24px",fontWeight:800,color:"#0f172a"}}>{label}</div>
        <div style={{fontSize:"12px",color:"#64748b"}}>{new Date().toLocaleDateString()} · {shiftView==="ALL"?"All shifts":shiftView}</div>
      </div>
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
      {/* side panels */}
      {[["Unassigned",board.unassigned],["Floating",board.floating],["Other shift",board.otherShift]].map(([t,items]:any)=> items.length>0&&(
        <div key={t} style={{marginTop:"12px",background:"#f8fafc",borderRadius:"8px",padding:"10px"}}>
          <div style={{fontSize:"12px",fontWeight:700,color:"#475569",marginBottom:"6px"}}>{t} · {items.length}</div>
          {items.map((it:SidePanelItem)=>(
            <div key={it.receipt_no} style={{fontSize:"11px",color:"#334155",padding:"2px 0"}}>
              <b>{it.student_id}</b> {it.name} · {it.shift_name||it.shift} {it.booking_to?`· ${it.booking_to}`:""} {it.temporary_seat?`· was seat ${it.temporary_seat}`:""}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}