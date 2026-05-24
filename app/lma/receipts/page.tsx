"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";

const API = "/api/lma";
const PASSWORD = process.env.NEXT_PUBLIC_LMA_PASSWORD!;

interface Library { library_code:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch  { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface Shift   { shift_key:string; shift_name:string; shift_time:string; active:boolean; }
interface PaymentTag { tag_name:string; fees_mode:string; active:boolean; }
interface InitData{ ok:boolean; libraries:Library[]; branches:Branch[]; shifts:Shift[]; paymentTags:PaymentTag[]; }
interface PhoneEntry { number:string; tag:string; }
interface Receipt {
  receipt_no:string; student_id:string; library:string; branch:string; name:string; phones:PhoneEntry[];
  seat_no:string; shift:string; shift_name:string; shift_time:string;
  booking_from:string; booking_to:string; receipt_date:string; fee:number;
  pay_mode_1:string; pay_amount_1:number; pay_mode_2:string; pay_amount_2:number; pay_mode_3:string; pay_amount_3:number;
  fees_due:number; fees_due_balance:number; type:string; is_cross_library:string;
  status:string; dues_status:string; renewed_from:string;
  receipt_text:string; registration_text:string;
}
interface EditEvent { letter:string; edited_at:string; remark:string; changed_fields:string; before:string; after:string; }

type Toast = { msg:string; type:"success"|"error" } | null;
type SearchType = "NAME"|"PHONE"|"STUDENT_ID"|"RECEIPT_NO";

function autoDetect(q:string): SearchType {
  const t=q.trim();
  if(!t) return "NAME";
  const s=t.replace(/[\s\-\.\(\)\+]/g,"");
  if(/^R\d+/i.test(t)) return "RECEIPT_NO";
  if(/^F\d+/i.test(t)) return "STUDENT_ID";
  if(/^\d{3,}$/.test(s)) return "PHONE";
  return "NAME";
}
function lifecycleBadge(r:Receipt):{label:string;cls:string}{
  const st=(r.status||"").toUpperCase();
  if(st==="RENEWED")       return {label:"Renewed",      cls:"bg-lma-slate-200 text-lma-slate-600"};
  if(st==="CANCELLED")     return {label:"Cancelled",    cls:"bg-lma-danger/15 text-lma-danger"};
  if(st==="DO_NOT_RENEW")  return {label:"Do Not Renew", cls:"bg-lma-warn/15 text-lma-warn"};
  // live → compute from booking_to
  const days=daysFromToday(r.booking_to);
  if(days===null) return {label:"Current", cls:"bg-lma-accent/15 text-lma-accent"};
  if(days<0)      return {label:"Expired", cls:"bg-lma-danger/15 text-lma-danger"};
  if(days<=5)     return {label:"Expiring",cls:"bg-lma-warn/15 text-lma-warn"};
  return {label:"Current", cls:"bg-lma-accent/15 text-lma-accent"};
}
function daysFromToday(dmy:string):number|null{
  if(!dmy) return null;
  const p=dmy.split("-"); if(p.length!==3) return null;
  const d=new Date(Number(p[2]),Number(p[1])-1,Number(p[0]));
  const today=new Date(); today.setHours(0,0,0,0);
  return Math.round((d.getTime()-today.getTime())/86400000);
}

export default function ReceiptsPage(){
  const [unlocked,setUnlocked]=useState(false);
  const [pwInput,setPwInput]=useState(""); const [pwErr,setPwErr]=useState("");
  const [init,setInit]=useState<InitData|null>(null);
  const [toast,setToast]=useState<Toast>(null);

  const [scope,setScope]=useState("");          // library/branch filter, "" = all
  const [search,setSearch]=useState("");
  const [receipts,setReceipts]=useState<Receipt[]>([]);
  const [page,setPage]=useState(1);
  const [totalPages,setTotalPages]=useState(1);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [view,setView]=useState<Receipt|null>(null);
  const [edit,setEdit]=useState<Receipt|null>(null);
  const [history,setHistory]=useState<{receipt_no:string;edits:EditEvent[]}|null>(null);
  const debounceRef=useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(()=>{ if(typeof window!=="undefined"&&sessionStorage.getItem("lma_ok")==="1")setUnlocked(true); },[]);
  const tryUnlock=()=>{ if(pwInput&&pwInput===PASSWORD){sessionStorage.setItem("lma_ok","1");setUnlocked(true);setPwErr("");}else setPwErr("Incorrect password."); };
  const showToast=useCallback((msg:string,type:"success"|"error"="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3000); },[]);

  const post=useCallback(async(action:string,payload:any)=>{ try{ const res=await fetch(API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,payload})}).then(r=>r.json()); if(!res.ok){showToast(res.error||"Operation failed","error");return null;} return res; }catch(e){ showToast(e instanceof Error?e.message:String(e),"error"); return null; } },[showToast]);

  useEffect(()=>{ if(unlocked) fetch(`${API}?action=getInitData`).then(r=>r.json()).then((r:InitData)=>{if(r.ok)setInit(r);}); },[unlocked]);

  const load=useCallback(async(pg:number,replace:boolean)=>{
    setLoading(true);
    const q=search.trim();
    const params=new URLSearchParams({action:"getReceiptLog",page:String(pg),limit:"20"});
    if(scope) params.set("library",scope);
    if(q){ params.set("q",q); params.set("search_type",autoDetect(q)); }
    const r=await fetch(`${API}?${params}`).then(r=>r.json());
    setLoading(false);
    if(r.receipts){
      setReceipts(prev=>replace?r.receipts:[...prev,...r.receipts]);
      setTotalPages(r.totalPages||1); setTotal(r.total||0); setPage(pg);
    }
  },[scope,search]);

  // reload on scope change / search (debounced)
  useEffect(()=>{
    if(!unlocked) return;
    if(debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current=setTimeout(()=>load(1,true),300);
  },[scope,search,unlocked,load]);

  const openHistory=async(r:Receipt)=>{
    const res=await fetch(`${API}?action=getReceiptEditHistory&receipt_no=${encodeURIComponent(r.receipt_no)}`).then(x=>x.json());
    setHistory({receipt_no:r.receipt_no,edits:res.edits||[]});
  };

  if(!unlocked){
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-7 lma-slide-up">
          <div className="text-center mb-5"><div className="text-4xl mb-2">🧾</div><h1 className="text-xl font-extrabold text-lma-slate-900">Receipts</h1></div>
          <input type="password" autoFocus value={pwInput} onChange={e=>{setPwInput(e.target.value);setPwErr("");}} onKeyDown={e=>{if(e.key==="Enter")tryUnlock();}} placeholder="Password" className="w-full px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[15px] font-medium"/>
          {pwErr&&<p className="text-sm text-lma-danger mt-2 font-medium">{pwErr}</p>}
          <button onClick={tryUnlock} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-[15px] shadow-md">Unlock</button>
        </div>
      </div>
    );
  }

  // chips (libraries + branches + an "All")
  const chips:{code:string;label:string;color?:string}[]=[{code:"",label:"All"}];
  if(init){ init.libraries.filter(l=>l.active).forEach(l=>{
    if(l.has_branches){ init.branches.filter(b=>b.library_code===l.library_code&&b.active).forEach(b=>chips.push({code:b.branch_code,label:b.branch_code,color:b.color||l.color})); }
    else chips.push({code:l.library_code,label:l.library_code,color:l.color});
  }); }

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Receipts</h1><p className="text-[11px] text-lma-slate-500 font-medium">{total} total</p></div>
        <button onClick={()=>load(1,true)} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {/* scope chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.label}</button>
        ))}
      </div>

      {/* search */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, F-ID, R-no…" className="w-full px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-white focus:border-lma-primary outline-none text-sm font-medium mb-3 shadow-sm"/>

      {/* list */}
      {loading&&receipts.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):receipts.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">No receipts found.</div>
      ):(
        <div className="space-y-2">
          {receipts.map(r=>{
            const badge=lifecycleBadge(r);
            return (
              <button key={r.receipt_no} onClick={()=>setView(r)} className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-extrabold text-lma-slate-900">{r.receipt_no}</span>
                  <span className="text-[10px] font-bold text-lma-slate-400">{r.student_id}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="text-sm font-semibold text-lma-slate-800 truncate">{r.name}</div>
                <div className="text-[11px] text-lma-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                  <span>{r.library}{r.branch?`/${r.branch}`:""}</span>
                  <span>· Seat {r.seat_no||"—"}</span>
                  <span>· {r.shift_name||r.shift}</span>
                  <span>· till {r.booking_to}</span>
                  {r.fees_due_balance>0&&<span className="font-bold text-lma-danger">· Due ₹{r.fees_due_balance}</span>}
                </div>
              </button>
            );
          })}
          {page<totalPages&&(
            <button onClick={()=>load(page+1,false)} disabled={loading} className="w-full py-2.5 rounded-xl border-[1.5px] border-dashed border-lma-primary/40 text-lma-primary font-bold text-sm disabled:opacity-50">{loading?"Loading…":"Load more"}</button>
          )}
        </div>
      )}

      {/* VIEW sheet */}
      {view&&(
        <Sheet onClose={()=>setView(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">{view.receipt_no}</h3>
          <p className="text-xs text-lma-slate-500 mb-3">{view.student_id} · {view.name}</p>
          <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-56 overflow-y-auto">{view.receipt_text}</pre>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button onClick={()=>{ navigator.clipboard.writeText(view.receipt_text); showToast("Copied"); }} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Copy</button>
            <button onClick={()=>{ setEdit(view); setView(null); }} className="py-2.5 rounded-xl bg-lma-primary/10 text-lma-primary font-bold text-xs">Edit</button>
            <button onClick={()=>{ openHistory(view); }} className="py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">History</button>
          </div>
        </Sheet>
      )}

      {/* EDIT sheet */}
      {edit&&init&&(
        <Sheet onClose={()=>setEdit(null)}>
          <EditForm receipt={edit} init={init} onCancel={()=>setEdit(null)} onSave={async(payload)=>{
            const res=await post("updateReceipt",payload);
            if(res){ setEdit(null); showToast("Receipt updated"); load(1,true); }
          }}/>
        </Sheet>
      )}

      {/* HISTORY sheet */}
      {history&&(
        <Sheet onClose={()=>setHistory(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-3">Edit history · {history.receipt_no}</h3>
          {history.edits.length===0?(
            <p className="text-sm text-lma-slate-500">No edits recorded yet.</p>
          ):(
            <div className="space-y-2">
              {history.edits.map(ev=>(
                <div key={ev.letter} className="border border-lma-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-extrabold text-lma-slate-900">Edit {ev.letter}</span>
                    <span className="text-[10px] text-lma-slate-400 ml-auto">{ev.edited_at}</span>
                  </div>
                  <div className="text-[11px] text-lma-slate-600">Changed: <span className="font-semibold">{ev.changed_fields||"—"}</span></div>
                  {ev.remark&&<div className="text-[11px] text-lma-slate-500 mt-0.5">Note: {ev.remark}</div>}
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}

      {toast&&(
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-lg z-[9999] lma-slide-up ${toast.type==="success"?"bg-lma-accent":"bg-lma-danger"}`}>
          {toast.type==="success"?"✓ ":"✕ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ── EDIT FORM ────────────────────────────────────────────────────
function EditForm({ receipt, init, onCancel, onSave }:{ receipt:Receipt; init:InitData; onCancel:()=>void; onSave:(p:any)=>void }){
  const [name,setName]=useState(receipt.name);
  const [seat,setSeat]=useState(receipt.seat_no);
  const [shift,setShift]=useState(receipt.shift);
  const [bookingFrom,setBookingFrom]=useState(receipt.booking_from);
  const [bookingTo,setBookingTo]=useState(receipt.booking_to);
  const [fee,setFee]=useState(String(receipt.fee));
  const [pays,setPays]=useState([
    {mode:receipt.pay_mode_1,amount:receipt.pay_amount_1?String(receipt.pay_amount_1):""},
    {mode:receipt.pay_mode_2,amount:receipt.pay_amount_2?String(receipt.pay_amount_2):""},
    {mode:receipt.pay_mode_3,amount:receipt.pay_amount_3?String(receipt.pay_amount_3):""},
  ].filter(p=>p.mode));
  const [feesDue,setFeesDue]=useState(String(receipt.fees_due));
  const [remark,setRemark]=useState("");

  const activeShifts=init.shifts.filter(s=>s.active);
  const setPay=(i:number,f:"mode"|"amount",v:string)=>{const n=[...pays];n[i]={...n[i],[f]:v};setPays(n);};

  const save=()=>{
    const validPays=pays.filter(p=>p.mode&&p.amount).map(p=>({mode:p.mode,amount:Number(p.amount)}));
    const shiftObj=activeShifts.find(s=>s.shift_key.toUpperCase()===shift.toUpperCase());
    onSave({
      receipt_no:receipt.receipt_no,
      name, seat_no:seat, shift,
      shift_name:shiftObj?.shift_name||receipt.shift_name, shift_time:shiftObj?.shift_time||receipt.shift_time,
      booking_from:bookingFrom, booking_to:bookingTo,
      fee:Number(fee), pay_modes:validPays,
      fees_due:Number(feesDue),
      editor_remark:remark,
    });
  };

  return (
    <div>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Edit {receipt.receipt_no}</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">Every edit is logged in history.</p>
      <L>Name</L><I value={name} onChange={e=>setName(e.target.value)}/>
      <div className="grid grid-cols-2 gap-3">
        <div><L>Seat</L><I value={seat} onChange={e=>setSeat(e.target.value)} placeholder="blank = unassigned"/></div>
        <div><L>Shift</L>
          <select value={shift} onChange={e=>setShift(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
            {activeShifts.map(s=><option key={s.shift_key} value={s.shift_key}>{s.shift_name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><L>From</L><I value={bookingFrom} onChange={e=>setBookingFrom(e.target.value)} placeholder="DD-M-YYYY"/></div>
        <div><L>To</L><I value={bookingTo} onChange={e=>setBookingTo(e.target.value)} placeholder="DD-M-YYYY"/></div>
      </div>
      <L>Fee (₹)</L><I type="number" value={fee} onChange={e=>setFee(e.target.value)}/>
      <L>Payments</L>
      {pays.map((p,i)=>(
        <div key={i} className="flex gap-2 mb-2">
          <select value={p.mode} onChange={e=>setPay(i,"mode",e.target.value)} className="flex-1 px-2.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
            <option value="">Mode…</option>
            {init.paymentTags.filter(t=>t.active).map(t=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
          </select>
          <input type="number" value={p.amount} onChange={e=>setPay(i,"amount",e.target.value)} placeholder="₹" className="w-24 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
        </div>
      ))}
      {pays.length<3&&<button onClick={()=>setPays([...pays,{mode:"",amount:""}])} className="text-xs font-bold text-lma-primary">+ Add payment</button>}
      <L>Fees Due (₹)</L><I type="number" value={feesDue} onChange={e=>setFeesDue(e.target.value)}/>
      <L>Edit note (optional)</L><I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="why this edit"/>
      <div className="flex gap-2.5 mt-4">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        <button onClick={save} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">Save</button>
      </div>
    </div>
  );
}

function Sheet({ onClose, children }:{ onClose:()=>void; children:React.ReactNode }){
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        {children}
      </div>
    </div>
  );
}
function L({ children }:{ children:React.ReactNode }){ return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1 mt-2">{children}</label>; }
function I(props:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium"/>; }