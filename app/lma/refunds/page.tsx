"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

const API = "/api/lma";
const PASSWORD = process.env.NEXT_PUBLIC_LMA_PASSWORD!;

// REFUND_LOG headers (exact, 16): s_no, refund_id, original_receipt_no, student_id,
//   library, branch, name, phone, refund_mode, refund_fees_mode, amount, refund_date,
//   refund_reason, linked_to_cancellation, timestamp, refund_whatsapp_text
interface Library { library_code:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch  { library_code:string; branch_code:string; active:boolean; emoji?:string; color?:string; }
interface PaymentTag { tag_name:string; fees_mode:string; active:boolean; }
interface InitData{ ok:boolean; libraries:Library[]; branches:Branch[]; paymentTags:PaymentTag[]; }
interface Refund {
  s_no:number; refund_id:string; original_receipt_no:string; student_id:string;
  library:string; branch:string; name:string; phone:string;
  refund_mode:string; refund_fees_mode:string; amount:number; refund_date:string;
  refund_reason:string; linked_to_cancellation:boolean; timestamp:string; refund_whatsapp_text:string;
}

type Toast = { msg:string; type:"success"|"error" } | null;
type LinkFilter = "ANY"|"TRUE"|"FALSE";

export default function RefundsPage(){
  const [unlocked,setUnlocked]=useState(false);
  const [pwInput,setPwInput]=useState(""); const [pwErr,setPwErr]=useState("");
  const [init,setInit]=useState<InitData|null>(null);
  const [toast,setToast]=useState<Toast>(null);

  const [scope,setScope]=useState("");
  const [linkFilter,setLinkFilter]=useState<LinkFilter>("ANY");
  const [refunds,setRefunds]=useState<Refund[]>([]);
  const [sum,setSum]=useState(0);
  const [loading,setLoading]=useState(false);

  const [issuing,setIssuing]=useState(false);
  const [editFor,setEditFor]=useState<Refund|null>(null);
  const [viewFor,setViewFor]=useState<Refund|null>(null);
  const [resultText,setResultText]=useState<{title:string;text:string}|null>(null);

  useEffect(()=>{ if(typeof window!=="undefined"&&sessionStorage.getItem("lma_ok")==="1")setUnlocked(true); },[]);
  const tryUnlock=()=>{ if(pwInput&&pwInput===PASSWORD){sessionStorage.setItem("lma_ok","1");setUnlocked(true);setPwErr("");}else setPwErr("Incorrect password."); };
  const showToast=useCallback((msg:string,type:"success"|"error"="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3000); },[]);

  const inflightRef = useRef<Set<string>>(new Set());
  const post=useCallback(async(action:string,payload:any)=>{ const _k=action+"|"+JSON.stringify(payload); if(inflightRef.current.has(_k))return null; inflightRef.current.add(_k); try{ try{ const res=await fetch(API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,payload})}).then(r=>r.json()); if(!res.ok&&res.error){showToast(res.error,"error");return null;} return res; }catch(e){ showToast(e instanceof Error?e.message:String(e),"error"); return null; }  } finally { inflightRef.current.delete(_k); }},[showToast]);

  useEffect(()=>{ if(unlocked) fetch(`${API}?action=getInitData`).then(r=>r.json()).then((r:InitData)=>{if(r.ok)setInit(r);}); },[unlocked]);

  const load=useCallback(async()=>{
    setLoading(true);
    const p=new URLSearchParams();
    if(scope) p.set("library",scope);
    if(linkFilter!=="ANY") p.set("linked_to_cancellation",linkFilter);
    p.set("page","1"); p.set("limit","100");
    const r=await fetch(`${API}?action=getRefundLog&${p}`).then(r=>r.json());
    setLoading(false);
    // getRefundLog returns array under `refunds` + numeric `sum`
    const raw:any[]=r.refunds||[];
    const list:Refund[]=raw.map((x:any)=>({
      s_no:Number(x.s_no||0),
      refund_id:String(x.refund_id||""),
      original_receipt_no:String(x.original_receipt_no||""),
      student_id:String(x.student_id||""),
      library:String(x.library||""),
      branch:String(x.branch||""),
      name:String(x.name||""),
      phone:String(x.phone||""),
      refund_mode:String(x.refund_mode||""),
      refund_fees_mode:String(x.refund_fees_mode||""),
      amount:Number(x.amount||0),
      refund_date:String(x.refund_date||""),
      refund_reason:String(x.refund_reason||""),
      linked_to_cancellation:!!x.linked_to_cancellation,
      timestamp:String(x.timestamp||""),
      refund_whatsapp_text:String(x.refund_whatsapp_text||""),
    }));
    setRefunds(list);
    setSum(typeof r.sum==="number"?r.sum:list.reduce((s,d)=>s+d.amount,0));
  },[scope,linkFilter]);

  useEffect(()=>{ if(unlocked) load(); },[unlocked,scope,linkFilter,load]);

  if(!unlocked){
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-7 lma-slide-up">
          <div className="text-center mb-5"><div className="text-4xl mb-2">↩️</div><h1 className="text-xl font-extrabold text-lma-slate-900">Refunds</h1></div>
          <input type="password" autoFocus value={pwInput} onChange={e=>{setPwInput(e.target.value);setPwErr("");}} onKeyDown={e=>{if(e.key==="Enter")tryUnlock();}} placeholder="Password" className="w-full px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[15px] font-medium"/>
          {pwErr&&<p className="text-sm text-lma-danger mt-2 font-medium">{pwErr}</p>}
          <button onClick={tryUnlock} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-[15px] shadow-md">Unlock</button>
        </div>
      </div>
    );
  }

  const chips:{code:string;label:string;color?:string}[]=[{code:"",label:"All"}];
  if(init){ init.libraries.filter(l=>l.active).forEach(l=>{
    if(l.has_branches){ init.branches.filter(b=>b.library_code===l.library_code&&b.active).forEach(b=>chips.push({code:b.branch_code,label:b.branch_code,color:b.color||l.color})); }
    else chips.push({code:l.library_code,label:l.library_code,color:l.color});
  }); }

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1"><h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Refunds</h1><p className="text-[11px] text-lma-slate-500 font-medium">{refunds.length} refunds · ₹{sum} total</p></div>
        <button onClick={load} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
        {chips.map(c=>(
          <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"} shadow-sm`}>{c.label}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-1 flex gap-1 mb-3 shadow-sm">
        {(["ANY","TRUE","FALSE"] as LinkFilter[]).map(f=>(
          <button key={f} onClick={()=>setLinkFilter(f)} className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition ${linkFilter===f?"bg-lma-slate-900 text-white":"text-lma-slate-500"}`}>
            {f==="ANY"?"All":f==="TRUE"?"From Cancellation":"Standalone"}
          </button>
        ))}
      </div>

      <button onClick={()=>setIssuing(true)} className="w-full mb-3 py-2.5 rounded-xl border-[1.5px] border-dashed border-lma-primary/40 text-lma-primary font-bold text-sm hover:bg-lma-primary/5 active:scale-[0.99]">+ Issue Refund</button>

      {loading&&refunds.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ):refunds.length===0?(
        <div className="text-center text-sm text-lma-slate-500 py-8">No refunds found.</div>
      ):(
        <div className="space-y-2">
          {refunds.map(r=>(
            <div key={r.refund_id} className="bg-white rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-extrabold text-lma-slate-900">{r.refund_id}</span>
                {r.linked_to_cancellation
                  ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-lma-danger/10 text-lma-danger">CANCEL</span>
                  : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-lma-slate-100 text-lma-slate-500">STANDALONE</span>}
                <span className="text-sm font-extrabold text-lma-danger ml-auto">−₹{r.amount}</span>
              </div>
              <div className="text-sm font-semibold text-lma-slate-800 truncate">{r.name} <span className="text-[10px] font-bold text-lma-slate-400">{r.student_id}</span></div>
              <div className="text-[11px] text-lma-slate-500 mt-0.5">{r.library}{r.branch?`/${r.branch}`:""} · vs {r.original_receipt_no} · {r.refund_mode} · {r.refund_date}</div>
              {r.refund_reason&&<div className="text-[11px] text-lma-slate-400 mt-0.5">{r.refund_reason}</div>}
              <div className="grid grid-cols-3 gap-2 mt-2.5">
                <button onClick={()=>setViewFor(r)} className="py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 font-bold text-xs">View</button>
                <button onClick={()=>setEditFor(r)} className="py-2 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs">Edit</button>
                <button onClick={async()=>{ if(!confirm(`Delete refund ${r.refund_id}? This cannot be undone.`))return; const x=await post("deleteRefund",{refund_id:r.refund_id}); if(x){showToast("Refund deleted");load();} }} className="py-2 rounded-lg bg-lma-danger/10 text-lma-danger font-bold text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* issue refund */}
      {issuing&&init&&(
        <Sheet onClose={()=>setIssuing(false)}>
          <IssueForm init={init} onCancel={()=>setIssuing(false)} post={post}
            onDone={(text)=>{ setIssuing(false); if(text)setResultText({title:"Refund Confirmation",text}); showToast("Refund issued"); load(); }}/>
        </Sheet>
      )}

      {/* edit refund */}
      {editFor&&init&&(
        <Sheet onClose={()=>setEditFor(null)}>
          <EditForm init={init} refund={editFor} onCancel={()=>setEditFor(null)}
            onSave={async(payload)=>{ const r=await post("updateRefund",{...payload,refund_id:editFor.refund_id}); if(r){ setEditFor(null); showToast("Refund updated"); load(); } }}/>
        </Sheet>
      )}

      {/* view detail */}
      {viewFor&&(
        <Sheet onClose={()=>setViewFor(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">{viewFor.refund_id}</h3>
          <p className="text-[11px] text-lma-slate-500 mb-3">{viewFor.name} · {viewFor.student_id}</p>
          <Row k="Amount" v={`₹${viewFor.amount}`}/>
          <Row k="Mode" v={`${viewFor.refund_mode} (${viewFor.refund_fees_mode})`}/>
          <Row k="Against receipt" v={viewFor.original_receipt_no}/>
          <Row k="Library" v={`${viewFor.library}${viewFor.branch?`/${viewFor.branch}`:""}`}/>
          <Row k="Date" v={viewFor.refund_date}/>
          <Row k="Type" v={viewFor.linked_to_cancellation?"From cancellation":"Standalone"}/>
          {viewFor.refund_reason&&<Row k="Reason" v={viewFor.refund_reason}/>}
          {viewFor.refund_whatsapp_text&&(
            <button onClick={()=>{ setViewFor(null); setResultText({title:"Refund Confirmation",text:viewFor.refund_whatsapp_text}); }} className="w-full mt-3 py-2.5 rounded-xl bg-lma-accent/10 text-lma-accent font-bold text-sm">Show WhatsApp message</button>
          )}
          <button onClick={()=>setViewFor(null)} className="w-full mt-2 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Close</button>
        </Sheet>
      )}

      {/* whatsapp result */}
      {resultText&&(
        <Sheet onClose={()=>setResultText(null)}>
          <h3 className="text-base font-extrabold text-lma-slate-900 mb-3">{resultText.title}</h3>
          <pre className="text-[11px] text-lma-slate-700 whitespace-pre-wrap font-mono bg-lma-slate-50 rounded-lg p-3 max-h-60 overflow-y-auto">{resultText.text}</pre>
          <button onClick={()=>{navigator.clipboard.writeText(resultText.text);showToast("Copied");}} className="w-full mt-3 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">Copy message</button>
          <button onClick={()=>setResultText(null)} className="w-full mt-2 py-2.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Close</button>
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

// A receipt as returned by getReceiptLog (only fields we display/use)
interface PickReceipt {
  receipt_no:string; student_id:string; library:string; branch:string;
  name:string; phone:string; shift:string; shift_name:string;
  seat_no:string; booking_from:string; booking_to:string; status:string;
}

function autoDetectReceiptSearch(q:string):"NAME"|"PHONE"|"RECEIPT_NO"|"STUDENT_ID"{
  const t=q.trim();
  if(!t) return "NAME";
  const s=t.replace(/[\s\-\.\(\)\+]/g,"");
  if(/^R\d+/i.test(t)) return "RECEIPT_NO";
  if(/^F\d+/i.test(t)) return "STUDENT_ID";
  if(/^\d{3,}$/.test(s)) return "PHONE";
  return "NAME";
}

function IssueForm({ init, onCancel, post, onDone }:{ init:InitData; onCancel:()=>void; post:(a:string,p:any)=>Promise<any>; onDone:(text:string)=>void }){
  const today=(()=>{const d=new Date();return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`;})();

  // Stage 1: find & pick the receipt
  const [scope,setScope]=useState("");                 // library/branch code; "" = all
  const [search,setSearch]=useState("");
  const [results,setResults]=useState<PickReceipt[]>([]);
  const [searching,setSearching]=useState(false);
  const [picked,setPicked]=useState<PickReceipt|null>(null);
  const debounceRef=useRef<ReturnType<typeof setTimeout>|null>(null);

  // Stage 2: refund details
  const [amount,setAmount]=useState("");
  const [mode,setMode]=useState("");
  const [date,setDate]=useState(today);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);

  // library pill list: parent libs split into branch chips, standalone direct; plus "All"
  const chips:{code:string;label:string;color?:string}[]=[{code:"",label:"All"}];
  init.libraries.filter(l=>l.active).forEach(l=>{
    if(l.has_branches){ init.branches.filter(b=>b.library_code===l.library_code&&b.active).forEach(b=>chips.push({code:b.branch_code,label:b.branch_code,color:b.color||l.color})); }
    else chips.push({code:l.library_code,label:l.library_code,color:l.color});
  });

  // debounced receipt search (mirrors Admissions getReceiptLog usage)
  useEffect(()=>{
    if(picked) return; // stop searching once a receipt is chosen
    if(debounceRef.current) clearTimeout(debounceRef.current);
    const q=search.trim();
    if(q.length<2){ setResults([]); return; }
    debounceRef.current=setTimeout(async()=>{
      setSearching(true);
      const type=autoDetectReceiptSearch(q);
      const params=new URLSearchParams({action:"getReceiptLog",q,search_type:type,page:"1",limit:"30"});
      if(scope) params.set("library",scope);
      const r=await fetch(`${API}?${params}`).then(r=>r.json());
      setSearching(false);
      const raw:any[]=r.receipts||[];
      setResults(raw.map((x:any)=>({
        receipt_no:String(x.receipt_no||""),
        student_id:String(x.student_id||""),
        library:String(x.library||""),
        branch:String(x.branch||""),
        name:String(x.name||""),
        phone:String((x.phone||(x.phones&&x.phones[0]&&x.phones[0].number))||""),
        shift:String(x.shift||""),
        shift_name:String(x.shift_name||""),
        seat_no:String(x.seat_no||""),
        booking_from:String(x.booking_from||""),
        booking_to:String(x.booking_to||""),
        status:String(x.status||""),
      })));
    },300);
  },[search,scope,picked]);

  const submit=async()=>{
    if(!picked||!amount||!mode) return;
    setBusy(true);
    // issueRefund reads: original_receipt_no, refund_mode, amount, refund_date?, refund_reason?, linked_to_cancellation?
    const r=await post("issueRefund",{
      original_receipt_no:picked.receipt_no,
      refund_mode:mode,
      amount:Number(amount),
      refund_date:date,
      refund_reason:reason,
      linked_to_cancellation:false,
    });
    setBusy(false);
    if(r) onDone(String(r.refund_whatsapp_text||""));
  };

  return (
    <div>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Issue Refund</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">Standalone refund against an existing receipt. (Cancellation refunds are done from Renewals.)</p>

      {!picked?(
        <>
          {/* library pills */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-1 px-1 pb-1">
            {chips.map(c=>(
              <button key={c.code||"all"} onClick={()=>{setScope(c.code);setResults([]);}} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-lma-slate-100 text-lma-slate-600"}`}>{c.label}</button>
            ))}
          </div>

          {/* find receipt */}
          <L>Find Receipt</L>
          <I value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, R-no, F-ID…" autoFocus/>
          <p className="text-[11px] text-lma-slate-400 mt-1">Pick the receipt to refund — student name, phone & library are pulled from it.</p>

          {searching&&<div className="text-center text-sm text-lma-slate-500 py-3">Searching…</div>}
          <div className="space-y-2 mt-2">
            {results.map(rc=>(
              <button key={rc.receipt_no} onClick={()=>setPicked(rc)} className="w-full text-left bg-lma-slate-50 rounded-xl p-3 hover:bg-lma-slate-100 active:scale-[0.99] flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-extrabold text-lma-slate-900">{rc.receipt_no}</span>
                    <span className="text-[10px] font-bold text-lma-slate-400">{rc.student_id}</span>
                    {rc.status&&<span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded">{rc.status}</span>}
                    <span className="text-[10px] text-lma-slate-400 ml-auto">{rc.library}{rc.branch?`/${rc.branch}`:""}</span>
                  </div>
                  <div className="text-sm font-semibold text-lma-slate-800 truncate">{rc.name}</div>
                  <div className="text-[11px] text-lma-slate-500 mt-0.5">{rc.shift_name||rc.shift}{rc.seat_no?` · seat ${rc.seat_no}`:""}{rc.booking_to?` · till ${rc.booking_to}`:""}{rc.phone?` · 📱 ${rc.phone}`:""}</div>
                </div>
                <span className="text-lma-slate-400">›</span>
              </button>
            ))}
            {search.trim().length>=2&&!searching&&results.length===0&&<div className="text-center text-sm text-lma-slate-500 py-3">No receipts found.</div>}
          </div>

          <button onClick={onCancel} className="w-full mt-4 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        </>
      ):(
        <>
          {/* picked receipt banner */}
          <div className="bg-lma-slate-50 rounded-xl p-3 mb-1 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold text-lma-slate-900">{picked.receipt_no}</span>
                <span className="text-[10px] font-bold text-lma-slate-400">{picked.student_id}</span>
                <span className="text-[10px] text-lma-slate-400 ml-auto">{picked.library}{picked.branch?`/${picked.branch}`:""}</span>
              </div>
              <div className="text-sm font-semibold text-lma-slate-800 truncate">{picked.name}</div>
              <div className="text-[11px] text-lma-slate-500 mt-0.5">{picked.shift_name||picked.shift}{picked.seat_no?` · seat ${picked.seat_no}`:""}{picked.phone?` · 📱 ${picked.phone}`:""}</div>
            </div>
            <button onClick={()=>{setPicked(null);}} className="text-xs font-bold text-lma-primary shrink-0">Change</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><L>Amount (₹)</L><I type="number" value={amount} onChange={e=>setAmount(e.target.value)} autoFocus/></div>
            <div><L>Date</L><I value={date} onChange={e=>setDate(e.target.value)} placeholder="DD-M-YYYY"/></div>
          </div>
          <L>Refund Mode</L>
          <select value={mode} onChange={e=>setMode(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
            <option value="">Select…</option>
            {init.paymentTags.filter(t=>t.active).map(t=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
          </select>
          <L>Reason (optional)</L>
          <I value={reason} onChange={e=>setReason(e.target.value)} placeholder="why refunding"/>
          <div className="flex gap-2.5 mt-4">
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
            <button onClick={submit} disabled={busy||!amount||!mode} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50">{busy?"…":"Issue Refund"}</button>
          </div>
        </>
      )}
    </div>
  );
}

function EditForm({ init, refund, onCancel, onSave }:{ init:InitData; refund:Refund; onCancel:()=>void; onSave:(p:any)=>void }){
  const [amount,setAmount]=useState(String(refund.amount));
  const [mode,setMode]=useState(refund.refund_mode);
  const [date,setDate]=useState(refund.refund_date);
  const [reason,setReason]=useState(refund.refund_reason);

  const save=()=>{
    if(!amount||!mode) return;
    // updateRefund edits: refund_mode, amount, refund_date, refund_reason (matched by refund_id)
    onSave({ refund_mode:mode, amount:Number(amount), refund_date:date, refund_reason:reason });
  };

  return (
    <div>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">Edit {refund.refund_id}</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">{refund.name} · vs {refund.original_receipt_no}</p>
      <div className="grid grid-cols-2 gap-3">
        <div><L>Amount (₹)</L><I type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
        <div><L>Date</L><I value={date} onChange={e=>setDate(e.target.value)} placeholder="DD-M-YYYY"/></div>
      </div>
      <L>Refund Mode</L>
      <select value={mode} onChange={e=>setMode(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
        <option value="">Select…</option>
        {init.paymentTags.filter(t=>t.active).map(t=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
      </select>
      <L>Reason (optional)</L>
      <I value={reason} onChange={e=>setReason(e.target.value)} placeholder="why refunding"/>
      <div className="flex gap-2.5 mt-4">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        <button onClick={save} disabled={!amount||!mode} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50">Save</button>
      </div>
    </div>
  );
}

function Row({ k, v }:{ k:string; v:string }){
  return <div className="flex justify-between py-1.5 border-b border-lma-slate-100 text-[13px]"><span className="text-lma-slate-500 font-medium">{k}</span><span className="text-lma-slate-800 font-semibold text-right">{v}</span></div>;
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