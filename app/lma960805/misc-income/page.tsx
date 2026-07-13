"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useLMA, useScopeChips, type LMAInitData as InitData } from "../_components/LMAProvider";
import { fmtDMY, toIsoInput } from "../_lib/dates";
import CodePill from "../_components/CodePill";

const API = "/api/lma960805";

// MISC_INCOME headers (exact): s_no, timestamp, date, month, library, branch,
//                              amount, payment_tag, fees_mode, category, remark
interface MiscRow {
  s_no:number; timestamp:string; date:string; month:string;
  library:string; branch:string; amount:number;
  payment_tag:string; fees_mode:string; category:string; remark:string;
  status:string; delete_reason:string; deleted_on:string;
}


export default function MiscIncomePage(){
  const { init, showToast, post } = useLMA();

  const [scope,setScope]=useState("");
  const [rows,setRows]=useState<MiscRow[]>([]);
  const [sum,setSum]=useState(0);
  const [fromDate,setFromDate]=useState("");
  const [toDate,setToDate]=useState("");
  const [loading,setLoading]=useState(false);
  const [modal,setModal]=useState<{mode:"add"|"edit";row?:MiscRow}|null>(null);
  const [showDeleted,setShowDeleted]=useState(false);




  const load=useCallback(async()=>{
    setLoading(true);
    const p=new URLSearchParams(); p.set("all","1"); if(showDeleted) p.set("deleted","1");
    const r=await fetch(`${API}?action=getMiscIncome&${p}&page=1&limit=100`).then(r=>r.json());
    setLoading(false);
    // backend returns rows under r.income (per 07_MiscIncome.gs getMiscIncome)
    const raw:any[]=r.entries||[];
    const list:MiscRow[]=raw.map((x:any)=>({
      s_no:Number(x.s_no||0),
      timestamp:String(x.timestamp||""),
      date:String(x.date||""),
      month:String(x.month||""),
      library:String(x.library||""),
      branch:String(x.branch||""),
      amount:Number(x.amount||0),
      payment_tag:String(x.payment_tag||""),
      fees_mode:String(x.fees_mode||""),
      category:String(x.category||""),
      remark:String(x.remark||""),
      status:String(x.status||""),
      delete_reason:String(x.delete_reason||""),
      deleted_on:String(x.deleted_on||""),
    }));
    setRows(list);
    setSum(typeof r.sum==="number"?r.sum:list.reduce((s,d)=>s+d.amount,0));
  },[showDeleted]);

  useEffect(()=>{ load(); },[load]);


  const chips = useScopeChips();
  const base=rows.filter(r=>{ const iso=toIsoInput(r.date); if(fromDate&&iso<fromDate) return false; if(toDate&&iso>toDate) return false; return true; });
  const miscCounts:Record<string,number>={}; base.forEach(r=>{ const k=(r.branch||r.library); if(k) miscCounts[k]=(miscCounts[k]||0)+1; });
  const rowsF=scope?base.filter(r=>(r.branch||r.library)===scope):base;
  const sumF=rowsF.reduce((s,r)=>s+(Number(r.amount)||0),0);

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma960805" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Misc Income</h1><p className="text-[11px] text-lma-slate-500 font-medium">{rowsF.length} entries· ₹{sumF} total</p></div>
        <button onClick={load} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.emoji} {c.label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${scope===c.code?"bg-white/25 text-white":"bg-lma-slate-100 text-lma-slate-500"}`}>{c.code?(miscCounts[c.code]||0):base.length}</span></button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-1 flex gap-1 mb-3 shadow-sm">
        <button onClick={()=>{setShowDeleted(false);}} className={`flex-1 py-2 rounded-xl text-xs font-bold ${!showDeleted?"bg-lma-slate-900 text-white":"text-lma-slate-600"}`}>Active</button>
        <button onClick={()=>{setShowDeleted(true);}} className={`flex-1 py-2 rounded-xl text-xs font-bold ${showDeleted?"bg-lma-slate-900 text-white":"text-lma-slate-600"}`}>Deleted</button>
      </div>

      {!showDeleted&&<button onClick={()=>setModal({mode:"add"})} className="w-full mb-3 py-2.5 rounded-xl border-[1.5px] border-dashed border-lma-primary/40 text-lma-primary font-bold text-sm hover:bg-lma-primary/5 active:scale-[0.99]">+ Add Income Entry</button>}

      <div className="flex gap-2 mb-3 items-end">
        <div className="flex-1"><label className="block text-[10px] font-bold text-lma-slate-400 mb-0.5">From</label><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border-[1.5px] border-lma-slate-200 bg-white focus:border-lma-primary outline-none text-sm"/>{fromDate && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(fromDate)}</span>}</div>
        <div className="flex-1"><label className="block text-[10px] font-bold text-lma-slate-400 mb-0.5">To</label><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border-[1.5px] border-lma-slate-200 bg-white focus:border-lma-primary outline-none text-sm"/>{toDate && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(toDate)}</span>}</div>
        {(fromDate||toDate)&&<button onClick={()=>{setFromDate("");setToDate("");}} className="py-2 px-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">Clear</button>}
      </div>
      {loading&&rows.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):rowsF.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">No income entries yet.</div>
      ):(
        <div className="space-y-2">
          {rowsF.map((r,i)=>(showDeleted?(
            <div key={`${r.s_no}-${i}`} className="w-full text-left bg-lma-slate-50 border border-lma-slate-200 rounded-xl p-3 opacity-70">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-lma-slate-500 truncate flex-1 line-through">{r.category||"Income"}</span>
                <span className="text-sm font-extrabold text-lma-slate-400 line-through">+₹{r.amount}</span>
              </div>
              <div className="text-[11px] text-lma-slate-500 flex items-center gap-2 flex-wrap">
                <CodePill code={r.branch||r.library}/>
                <span>· {r.payment_tag}</span>
                <span>· {fmtDMY(r.date)}</span>
              </div>
              <div className="text-[11px] text-lma-danger font-semibold mt-1">Deleted{r.deleted_on?` on ${fmtDMY(r.deleted_on)}`:""}{r.delete_reason?` — ${r.delete_reason}`:""}</div>
              <button onClick={async()=>{ const res=await post("restoreMiscIncome",{s_no:r.s_no}); if(res){ showToast("Entry restored"); load(); } }} className="w-full mt-2 py-2 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs">↩ Restore</button>
            </div>
          ):(
            <button key={`${r.s_no}-${i}`} onClick={()=>setModal({mode:"edit",row:r})} className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-lma-slate-800 truncate flex-1">{r.category||"Income"}</span>
                <span className="text-sm font-extrabold text-lma-accent">+₹{r.amount}</span>
              </div>
              <div className="text-[11px] text-lma-slate-500 flex items-center gap-2 flex-wrap">
                <CodePill code={r.branch||r.library}/>
                <span>· {r.payment_tag}</span>
                <span>· {fmtDMY(r.date)}</span>
              </div>
              {r.remark&&<div className="text-[11px] text-lma-slate-400 mt-0.5">{r.remark}</div>}
            </button>
          )))}
        </div>
      )}

      {modal&&init&&(
        <Sheet onClose={()=>setModal(null)}>
          <MiscForm init={init} mode={modal.mode} row={modal.row}
            onCancel={()=>setModal(null)}
            onSave={async(payload)=>{
              const action=modal.mode==="add"?"addMiscIncome":"updateMiscIncome";
              const body=modal.mode==="edit"?{...payload,s_no:modal.row!.s_no}:payload;
              const r=await post(action,body);
              if(r){ setModal(null); showToast(modal.mode==="add"?"Income added":"Updated"); load(); }
            }}
            onDelete={modal.mode==="edit"?async(reason:string)=>{
              const r=await post("deleteMiscIncome",{s_no:modal.row!.s_no,reason});
              if(r){ setModal(null); showToast("Entry deleted"); load(); }
            }:undefined}
          />
        </Sheet>
      )}

    </div>
  );
}

function MiscForm({ init, mode, row, onCancel, onSave, onDelete }:{ init:InitData; mode:"add"|"edit"; row?:MiscRow; onCancel:()=>void; onSave:(p:any)=>void; onDelete?:(reason:string)=>void }){
  const branchedFirst:{code:string;label:string}[]=[];
  init.libraries.filter(l=>l.active).forEach(l=>{
    if(l.has_branches) init.branches.filter(b=>b.library_code===l.library_code&&b.active).forEach(b=>branchedFirst.push({code:b.branch_code,label:`${l.library_code} / ${b.branch_code}`}));
    else branchedFirst.push({code:l.library_code,label:l.display_name||l.library_code});
  });

  const today=(()=>{const d=new Date();return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`;})();
  // for edit: preselect the branch_code if present else library_code
  const [libSel,setLibSel]=useState(row?(row.branch||row.library):(branchedFirst[0]?.code||""));
  const [date,setDate]=useState(row?.date||today);
  const [category,setCategory]=useState(row?.category||"");
  const [amount,setAmount]=useState(row?String(row.amount):"");
  const [tag,setTag]=useState(row?.payment_tag||"");
  const [remark,setRemark]=useState(row?.remark||"");
  const [confirmDel,setConfirmDel]=useState(false);
  const [delReason,setDelReason]=useState("");  

  const save=()=>{
    if(!libSel||!category||!amount||!tag) return;
    const br=init.branches.find(b=>b.branch_code===libSel);
    const library=br?br.library_code:libSel;
    const branch=br?br.branch_code:"";
    // payload keys match MISC_INCOME columns the backend writes
    onSave({ library, branch, date, category, amount:Number(amount), payment_tag:tag, remark });
  };

  return (
    <div>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-4">{mode==="add"?"Add Income":"Edit Income"}</h3>
      <L>Library</L>
      <select value={libSel} onChange={e=>setLibSel(e.target.value)} disabled={mode==="edit"} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
        {branchedFirst.map(o=><option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
      <L>Category</L>
      <I value={category} onChange={e=>setCategory(e.target.value)} placeholder="Day pass, locker, xerox…"/>
      <div className="grid grid-cols-2 gap-3">
        <div><L>Amount (₹)</L><I type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
        <div><L>Date</L><I type="date" value={toIsoInput(date)} onChange={e=>setDate(e.target.value)}/>{date && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(date)}</span>}</div>
      </div>
      <L>Payment Tag</L>
      <select value={tag} onChange={e=>setTag(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
        <option value="">Select…</option>
        {init.paymentTags.filter(t=>t.active).map(t=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
      </select>
      <L>Remark (optional)</L>
      <I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="optional"/>
      <div className="flex gap-2.5 mt-4">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        <button onClick={save} disabled={!libSel||!category||!amount||!tag} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50">Save</button>
      </div>
      {onDelete&&(
        confirmDel?(
          <div className="mt-3">
            <L>Reason for deletion</L>
            <I value={delReason} onChange={e=>setDelReason(e.target.value)} placeholder="e.g. duplicate entry, wrong amount" autoFocus/>
            <div className="mt-2.5 flex gap-2.5">
              <button onClick={()=>{setConfirmDel(false);setDelReason("");}} className="flex-1 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Keep</button>
              <button onClick={()=>onDelete(delReason.trim())} disabled={!delReason.trim()} className="flex-1 py-2.5 rounded-xl bg-lma-danger text-white font-bold text-sm disabled:opacity-50">Confirm Delete</button>
            </div>
            <p className="text-[10px] text-lma-slate-400 mt-1.5 text-center">Entry is kept and can be restored later.</p>
          </div>
        ):(
          <button onClick={()=>setConfirmDel(true)} className="w-full mt-3 py-2.5 rounded-xl text-lma-danger font-bold text-sm">Delete this entry</button>
        )
      )}
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