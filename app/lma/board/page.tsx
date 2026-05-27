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
  color:"OK"|"EXPIRING"|"EXPIRED";
  has_dues?:boolean;
  temporary_seat?:string;
}
interface TempHeldInfo { receipt_no:string; student_id:string; name:string; }
interface BoardCell {
  row_in_section:number; col_in_section:number; seat_no:number; display_label:string; notes:string; cell_type:string;
  morning:Occupant|null; evening:Occupant|null; fullday:Occupant|null;
  blocked:{ morning:boolean; evening:boolean; fullday:boolean };
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
  OK:       { bg:"#dcfce7", text:"#15803d", border:"#86efac", label:"OK" },
  EXPIRING: { bg:"#fee2e2", text:"#b91c1c", border:"#fca5a5", label:"Expiring" },
  EXPIRED:  { bg:"#7f1d1d", text:"#ffffff", border:"#991b1b", label:"Expired" },
  DUES:     { bg:"#fde68a", text:"#92400e", border:"#f59e0b", label:"Dues" },
};
const GOLD = "#f59e0b";
// Resolve an occupant's tile look: expiry decides the FILL; dues shows as a
// gold FILL when the seat is OK, or a gold RING when Expiring/Expired (so the
// expiry is never hidden but dues is always visible).
function occLook(o:{color:"OK"|"EXPIRING"|"EXPIRED";has_dues?:boolean}){
  const base = COLOR[o.color] || COLOR.OK;
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
  const [unlocked,setUnlocked]=useState(false);
  const [pwInput,setPwInput]=useState(""); const [pwErr,setPwErr]=useState("");
  const [init,setInit]=useState<InitData|null>(null);
  const [scope,setScope]=useState<string>("");           // library or branch code
  const [board,setBoard]=useState<BoardResp|null>(null);
  const [loading,setLoading]=useState(false);
  const [shiftView,setShiftView]=useState<ShiftView>("ALL");
  const [detail,setDetail]=useState<{cell:BoardCell}|null>(null);
  const [vacantTap,setVacantTap]=useState<{label:string;heldBy?:string}|null>(null);
  // re-allot picker (from floating panel OR from DetailSheet "move"): receipt + context
  const [reAllot,setReAllot]=useState<{receipt_no:string;name:string;student_id:string;shift:string;original?:string}|null>(null);
  const [shareEvent,setShareEvent]=useState<{text:string;label:string}|null>(null);
  const [exporting,setExporting]=useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [toast,setToast]=useState<{msg:string;type:"success"|"error"}|null>(null);
  const showToast=(msg:string,type:"success"|"error"="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2600); };
  const inflightRef = useRef<Set<string>>(new Set());
  const post=useCallback(async(action:string,payload:any)=>{
    const _k=action+"|"+JSON.stringify(payload);
    if(inflightRef.current.has(_k)) return null;
    inflightRef.current.add(_k);
    try{
      const res=await fetch(API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,payload})});
      return await res.json();
    } finally { inflightRef.current.delete(_k); }
  },[]);

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
                    return <SeatTile key={idx} cell={cell} shiftView={shiftView} onTapOccupied={()=>setDetail({cell})} onTapVacant={(heldBy?:string)=>setVacantTap({label:cell.display_label,heldBy})}/>;
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* side panels */}
          <SidePanel title="Unassigned (booked, no seat)" items={board.unassigned} emoji="📋" onTap={(it)=>setDetail({cell:panelItemToCell(it)})}/>
          <SidePanel title="Floating (temp-vacated)" items={board.floating} emoji="🌀" onTap={(it)=>setDetail({cell:panelItemToCell(it)})} onReAllot={(it)=>setReAllot({receipt_no:it.receipt_no,name:it.name,student_id:it.student_id,shift:it.shift,original:it.temporary_seat})}/>
          <SidePanel title="Other shift (no fixed seat)" items={board.otherShift} emoji="🔄" onTap={(it)=>setDetail({cell:panelItemToCell(it)})}/>
        </div>
      )}

      {/* occupied detail popup */}
      {detail&&<DetailSheet
        cell={detail.cell}
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

      {/* vacant tap popup */}
      {vacantTap&&(
        <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={()=>setVacantTap(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 lma-slide-up" onClick={e=>e.stopPropagation()}>
            <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
            <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Seat {vacantTap.label}</h3>
            {vacantTap.heldBy
              ? <p className="text-sm text-lma-warn font-semibold mb-4">⚠ This seat was temp-vacated by <b>{vacantTap.heldBy}</b>. It is being held for them — book anyway only if you mean to give it to someone else.</p>
              : <p className="text-sm text-lma-slate-500 mb-4">This seat is vacant.</p>}
            <div className="flex gap-2">
              <button onClick={()=>setVacantTap(null)} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Close</button>
              <button onClick={()=>router.push("/lma/admissions")} className={`flex-1 py-3 rounded-xl text-white font-bold shadow-md ${vacantTap.heldBy?"bg-lma-warn":"bg-gradient-to-br from-lma-primary to-lma-primary-2"}`}>{vacantTap.heldBy?"Book Anyway":"Book This Seat"}</button>
            </div>
          </div>
        </div>
      )}
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

      {/* toast */}
      {toast&&<div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg ${toast.type==="success"?"bg-lma-accent":"bg-lma-danger"}`}>{toast.msg}</div>}

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
function SeatTile({ cell, shiftView, onTapOccupied, onTapVacant }:{ cell:BoardCell; shiftView:ShiftView; onTapOccupied:()=>void; onTapVacant:(heldBy?:string)=>void }){
  if(cell.cell_type==="DEAD") return <div className="aspect-square rounded" style={{background:"#e2e8f0",border:"1px solid #cbd5e1"}}/>;

  // which occupants are visible given the shift view
  const showM = (shiftView==="ALL"||shiftView==="MORNING")&&!cell.fullday;
  const showE = (shiftView==="ALL"||shiftView==="EVENING")&&!cell.fullday;
  const showF = (shiftView==="ALL"||shiftView==="FULL DAY");

  const fd = showF?cell.fullday:null;
  const m = showM?cell.morning:null;
  const e = showE?cell.evening:null;

  // soft-hold: a temp-vacated receipt that parked THIS seat (for a visible shift)
  const th = cell.temp_held;
  const heldHolder = th ? (th.fullday||th.morning||th.evening) : null;
  const heldLabel = heldHolder ? heldHolder.student_id : "";

  const anyOccupied = !!(fd||m||e);
  const onClick = anyOccupied?onTapOccupied:(()=>onTapVacant(heldLabel||undefined));

  // full-day fills whole tile
  if(fd){
    const col=occLook(fd);
    return (
      <button onClick={onClick} className="aspect-square rounded flex flex-col items-center justify-center overflow-hidden px-0.5" style={{background:col.bg,color:col.text,border:col.ring?`2px solid ${col.border}`:`1px solid ${col.border}`,boxShadow:col.ring?`inset 0 0 0 1px ${col.border}`:undefined}}>
        <span className="text-[10px] font-extrabold leading-none">{cell.display_label}</span>
        <span className="text-[6px] font-bold leading-none mt-0.5 truncate w-full text-center">{shortDate(fd.booking_to)}</span>
      </button>
    );
  }

  // split tile: upper morning, lower evening
  const mCol = m?occLook(m):null;
  const eCol = e?occLook(e):null;
  const vacant = !m&&!e;
  const softHeld = vacant && !!heldLabel;

  return (
    <button onClick={onClick} className="aspect-square rounded overflow-hidden flex flex-col" style={{
      border: softHeld?"1.5px dashed #f59e0b":"1px solid "+(vacant?"#e2e8f0":"#cbd5e1"),
      background: softHeld?"#fffbeb":(vacant?"#f8fafc":"#fff")
    }}>
      <div className="flex-1 flex items-center justify-center text-[7px] font-bold leading-none" style={mCol?{background:mCol.bg,color:mCol.text,boxShadow:mCol.ring?`inset 0 0 0 2px ${mCol.border}`:undefined}:{color:"#cbd5e1"}}>
        {m?<span className="truncate px-0.5">{shortDate(m.booking_to)}</span>:softHeld?<span className="truncate px-0.5 text-[6px] text-lma-warn font-extrabold">{heldLabel}</span>:(shiftView==="ALL"||shiftView==="MORNING")?"·":""}
      </div>
      <div className="text-[9px] font-extrabold text-lma-slate-700 leading-none">{cell.display_label}</div>
      <div className="flex-1 flex items-center justify-center text-[7px] font-bold leading-none" style={eCol?{background:eCol.bg,color:eCol.text,boxShadow:eCol.ring?`inset 0 0 0 2px ${eCol.border}`:undefined}:{color:"#cbd5e1"}}>
        {e?<span className="truncate px-0.5">{shortDate(e.booking_to)}</span>:(shiftView==="ALL"||shiftView==="EVENING")?"·":""}
      </div>
    </button>
  );
}

// ── SIDE PANEL ───────────────────────────────────────────────────
function SidePanel({ title, items, emoji, onReAllot, onTap }:{ title:string; items:SidePanelItem[]; emoji:string; onReAllot?:(it:SidePanelItem)=>void; onTap?:(it:SidePanelItem)=>void }){
  if(!items||items.length===0) return null;
  // Full-tile color scheme (matches seat tiles), with legible text per state.
  // Dues = gold FILL when otherwise OK; gold RING when expiring/expired.
  const look=(it:SidePanelItem)=>{
    const dueGold = it.has_dues;
    if(it.color==="EXPIRED")  return { bg:"#7f1d1d", fg:"#ffffff", sub:"rgba(255,255,255,0.75)", ring:dueGold?"#f59e0b":"" };
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
function DetailSheet({ cell, onClose, router, scope, lib, branch, post, showToast, onChanged, onReAllot, onShare }:{ cell:BoardCell; onClose:()=>void; router:any; scope:string; lib:string; branch:string; post:(a:string,p:any)=>Promise<any>; showToast:(m:string,t?:"success"|"error")=>void; onChanged:()=>void; onReAllot:(o:Occupant)=>void; onShare:(text:string,label:string)=>void }){
  const occupants:Occupant[]=[];
  if(cell.fullday) occupants.push(cell.fullday);
  if(cell.morning) occupants.push(cell.morning);
  if(cell.evening) occupants.push(cell.evening);

  const [busy,setBusy]=useState(false);
  const [confirmVacate,setConfirmVacate]=useState<Occupant|null>(null);

  const doVacate=async(o:Occupant)=>{
    setBusy(true);
    const r=await post("tempVacateSeat",{receipt_no:o.receipt_no});
    setBusy(false);
    if(r&&r.vacated){ showToast(`${o.student_id} parked (seat ${r.original_seat} held)`); if(r.whatsapp_text) onShare(r.whatsapp_text,"Seat temporarily vacated"); onChanged(); }
    else showToast(r&&r.error?r.error:"Temp-vacate failed","error");
  };

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
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:col.bg,color:col.text}}>{o.shift_name||o.shift}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:col.bg,color:col.text}}>{col.label}</span>
                  {o.has_dues&&<span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{background:COLOR.DUES.bg,color:COLOR.DUES.text}}>DUES</span>}
                  {o.is_cross_library&&o.is_cross_library!=="NO"&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded ml-auto">CROSS · {o.is_cross_library}</span>}
                </div>
                <div className="text-sm font-extrabold text-lma-slate-900">{o.student_id} · {o.name}</div>
                <div className="text-[11px] text-lma-slate-500 mt-0.5">Receipt {o.receipt_no} · until {o.booking_to}</div>
                {o.fees_due_balance>0&&<div className="text-[11px] font-bold text-lma-danger mt-0.5">Dues: ₹{o.fees_due_balance} ({o.dues_status})</div>}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button onClick={()=>router.push("/lma/admissions")} className="py-2 rounded-lg bg-lma-primary/10 text-lma-primary font-bold text-xs">Renew</button>
                  <button onClick={()=>router.push("/lma/renewals")} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Cancel</button>
                  {o.temporary_seat
                    ? <div className="py-2 rounded-lg bg-lma-warn/10 text-lma-warn font-bold text-xs text-center">Floating · was {o.temporary_seat}</div>
                    : <button disabled={busy} onClick={()=>setConfirmVacate(o)} className="py-2 rounded-lg bg-lma-warn/10 text-lma-warn font-bold text-xs disabled:opacity-50">Temp-Vacate</button>}
                  <button disabled={busy} onClick={()=>onReAllot(o)} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs disabled:opacity-50">{o.temporary_seat?"Re-Allot (restore)":"Re-Allot"}</button>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={onClose} className="w-full mt-4 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Close</button>

        {/* temp-vacate confirm */}
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
    EXPIRING: { bg:"#fee2e2", text:"#b91c1c", border:"#fca5a5" },
    EXPIRED:  { bg:"#7f1d1d", text:"#ffffff", border:"#991b1b" },
    DUES:     { bg:"#fde68a", text:"#92400e", border:"#f59e0b" },
  };
  const EXPORT_GOLD = "#f59e0b";
  // Export look: expiry = fill; dues = gold fill when OK, else gold ring.
  function exLook(o:Occupant){
    const base = EXPORT_COLOR[o.color] || EXPORT_COLOR.OK;
    if(o.has_dues && o.color==="OK") return { bg:EXPORT_COLOR.DUES.bg, text:EXPORT_COLOR.DUES.text, ring:false };
    if(o.has_dues) return { bg:base.bg, text:base.text, ring:true };
    return { bg:base.bg, text:base.text, ring:false };
  }
  // Gold, prominent due amount (always gold text on a chip so it stands out).
  const dueAmt=(o:Occupant)=> o.fees_due_balance>0
    ? <div style={{fontSize:"12px",fontWeight:900,textAlign:"center",lineHeight:1.2,minHeight:"15px",flexShrink:0,color:"#92400e",background:"#fde68a",borderRadius:"4px",margin:"1px 4px"}}>{`₹${o.fees_due_balance} DUE`}</div>
    : <div style={{minHeight:"15px",flexShrink:0}}/>;

  function richCell(cell:BoardCell){
    if(cell.cell_type==="DEAD") return <div style={{background:"#e2e8f0",border:"1px solid #cbd5e1",borderRadius:"8px",width:"100%",height:"100%"}}/>;
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
        {dueAmt(o)}
        <div style={{fontSize:"12px",fontWeight:800,textAlign:"center",lineHeight:1.2,flexShrink:0}}>{o.booking_to}</div>
      </>
    );

    // a half-zone: occupant data, blocked stripe, or empty
    const halfZone=(o:Occupant|null,isBlocked:boolean)=>{
      if(o){
        const col=exLook(o);
        return <div style={{height:"100%",width:"100%",background:col.bg,color:col.text,borderRadius:"4px",padding:"5px 7px",display:"flex",flexDirection:"column",boxSizing:"border-box",overflow:"hidden",boxShadow:col.ring?`inset 0 0 0 3px ${EXPORT_GOLD}`:undefined}}>{dataRows(o)}</div>;
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