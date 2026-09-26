"use client";
// B6 — ENQUIRY CODE (owner surface, a tab beside the Seat chart).
// Generate one-time codes per library/branch, share link + code as TWO separate
// WhatsApp messages, track ISSUED → SUBMITTED → USED (side exit VOID).
// Consumed by BookingFlow NEW admission. Same requests as before; new look.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { parsePhone10 } from "../_lib/phone";
import { Screen, Card, Button, Chip, ScopeChips, Skeleton, Empty, IconButton, inputCls, cx } from "../_ui/kit";
import { IconTicket, IconRefresh, IconAlert } from "../_ui/icons";

const API = "/api/lma960805";
const PUBLIC_PATH = "/jn-x7k2q";
const FILTERS = ["ALL","ISSUED","SUBMITTED","USED","VOID"] as const;
type Filt = typeof FILTERS[number];
const FILTER_LABEL: Record<Filt,string> = { ALL:"All", ISSUED:"Issued", SUBMITTED:"Submitted", USED:"Used", VOID:"Void" };

export default function EnquiryCodePage(){
  const { init, post, showToast, refreshInit, loading:initLoading } = useLMA();
  const chips = useScopeChips({ includeAll:false });
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [listLoaded,setListLoaded]=useState(false);   // true once the list has arrived
  const [genOpen,setGenOpen]=useState(false);         // the create form opens on tap, once libraries are loaded
  const [listError,setListError]=useState(false);
  const [scope,setScope]=useState("");
  const [fresh,setFresh]=useState<{pretty:string;scope:string;remark:string;mobile:string}|null>(null);
  const [filter,setFilter]=useState<Filt>("ALL");
  const [busy,setBusy]=useState(false);
  const [confirmVoid,setConfirmVoid]=useState<any>(null);
  const [mobile,setMobile]=useState("");   // required — normalised by the shared parser
  const [remark,setRemark]=useState("");
  const [confirmGen,setConfirmGen]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true); setListError(false);
    try{
      const r=await fetch(`${API}?action=intakeList`).then(x=>x.json());
      if(r&&r.ok){ setItems(r.items||[]); setListLoaded(true); }
      else { setListError(true); showToast((r&&r.error)||"Could not load codes","error"); }
    }catch{ setListError(true); showToast("Network error","error"); }
    setLoading(false);
  },[showToast]);

  useEffect(()=>{ load(); },[load]);   // the created codes load by themselves

  const scopes = useMemo(()=>{
    const out:{value:string;label:string;library:string;branch:string}[]=[];
    ((init?.libraries)||[]).filter((l:any)=>l.active).forEach((l:any)=>{
      if(l.has_branches) ((init?.branches)||[]).filter((b:any)=>b.active&&b.library_code===l.library_code).forEach((b:any)=>out.push({value:b.branch_code,label:b.branch_code,library:l.library_code,branch:b.branch_code}));
      else out.push({value:l.library_code,label:l.library_code,library:l.library_code,branch:""});
    });
    return out;
  },[init]);

  const counts=useMemo(()=>({
    ALL:items.length,
    ISSUED:items.filter(i=>i.status==="ISSUED").length,
    SUBMITTED:items.filter(i=>i.status==="SUBMITTED").length,
    USED:items.filter(i=>i.status==="USED").length,
    VOID:items.filter(i=>i.status==="VOID").length,
  }),[items]);

  // Link and code go as TWO messages: the student taps the link in one and
  // long-press-copies the bare code from the other — nothing to select by hand.
  const linkUrl=()=>(typeof window!=="undefined"?window.location.origin:"")+PUBLIC_PATH;
  const wa=(t:string,to?:string)=>window.open(to?`https://wa.me/91${to}?text=${encodeURIComponent(t)}`:`https://wa.me/?text=${encodeURIComponent(t)}`,"_blank");
  const cp=(t:string,l:string)=>{ navigator.clipboard.writeText(t); showToast(`${l} copied`); };

  const mobOk=/^[6-9]\d{9}$/.test(mobile);
  const generate=async()=>{
    const s=scopes.find(x=>x.value===scope);
    if(!s){ showToast("Pick a library/branch first","error"); return; }
    if(!mobOk){ showToast("Enter a valid 10-digit mobile number","error"); return; }
    setConfirmGen(false); setBusy(true);
    const r=await post("intakeGenerateCode",{ library:s.library, branch:s.branch, mobile, remark:remark.trim() });
    setBusy(false);
    if(r&&r.ok){ setFresh({pretty:r.pretty,scope:s.label,remark:remark.trim(),mobile}); setMobile(""); setRemark(""); showToast("Code generated"); if(listLoaded) load(); }
  };
  const doVoid=async(it:any)=>{
    setConfirmVoid(null);
    const r=await post("intakeVoid",{ code:it.code });
    if(r&&r.ok){ showToast(`${it.code} voided`); if(listLoaded) load(); }
  };

  const shown=items.filter(i=>filter==="ALL"||i.status===filter);
  const meta=(s:string)=>s==="SUBMITTED"?{chip:"bg-lma-in-soft text-lma-in",bar:"#0f7a5a",label:"Submitted",hint:"Ready — enter this code in a new admission"}
    :s==="ISSUED"?{chip:"bg-lma-bg text-lma-ink-2 ring-1 ring-inset ring-lma-line",bar:"#cbd5e1",label:"Issued",hint:"Waiting for the student to fill the form"}
    :s==="USED"?{chip:"bg-lma-brand-soft text-lma-brand",bar:"#4f46e5",label:"Used",hint:""}
    :{chip:"bg-lma-out-soft text-lma-out",bar:"#b42318",label:"Void",hint:""};
  const genBlocker = !scope ? "Pick a library above" : !mobOk ? "Enter the mobile number" : "";

  // Share: the two sends are numbered because the order matters; copies below.
  const Share=({ code, mob, onVoid }:{ code:string; mob?:string; onVoid?:()=>void })=>(
    <>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={()=>wa(linkUrl(),mob)} className="h-11 rounded-[12px] bg-[#16a34a] text-[13.5px] font-semibold text-white active:brightness-95">1 · Send link</button>
        <button onClick={()=>wa(code,mob)} className="h-11 rounded-[12px] bg-[#16a34a] text-[13.5px] font-semibold text-white active:brightness-95">2 · Send code</button>
        <button onClick={()=>cp(linkUrl(),"Link")} className="h-10 rounded-[12px] bg-lma-brand-soft text-[13px] font-semibold text-lma-brand">Copy link</button>
        <button onClick={()=>cp(code,"Code")} className="h-10 rounded-[12px] bg-lma-brand-soft text-[13px] font-semibold text-lma-brand">Copy code</button>
      </div>
      {onVoid&&<button onClick={onVoid} className="mt-2 h-10 w-full rounded-[12px] bg-lma-surface text-[13px] font-semibold text-lma-out ring-1 ring-inset ring-lma-line">Void code</button>}
    </>
  );

  return (
    <Screen>
      <header className="flex items-start gap-2 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Enquiry codes</h1>
          <p className="mt-0.5 text-[12.5px] text-lma-ink-3">
            {listLoaded&&counts.SUBMITTED>0
              ? <span className="font-semibold text-lma-in">{counts.SUBMITTED} ready to admit</span>
              : "Share a code · student fills details · you admit"}
          </p>
        </div>
        {listLoaded&&<IconButton label="Refresh codes" onClick={load} className="-mr-2"><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>}
      </header>

      {/* ── create a code ── */}
      {!genOpen ? (
        <button type="button" onClick={()=>setGenOpen(true)}
          className="lma-noscale mb-3 flex w-full items-center gap-4 rounded-[18px] border border-lma-line bg-lma-surface p-4 text-left shadow-lma-card active:bg-lma-bg">
          <span aria-hidden="true" className="lma-glass-btn grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white"><IconTicket size={22}/></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold text-lma-ink">Create a code</span>
            <span className="mt-0.5 block text-[12.5px] text-lma-ink-3">One code per student · they fill their own details</span>
          </span>
        </button>
      ) : !init && initLoading ? (
        <Card className="mb-3">
          <Skeleton className="h-3 w-24"/>
          <div className="mt-3 flex gap-2">{["w-14","w-16","w-12","w-16"].map((w,i)=><Skeleton key={i} className={`h-10 rounded-full ${w}`}/>)}</div>
          <Skeleton className="mt-3 h-12 rounded-[14px]"/><Skeleton className="mt-2 h-12 rounded-[14px]"/><Skeleton className="mt-3 h-14 rounded-[14px]"/>
        </Card>
      ) : !init ? (
        <Card className="mb-3"><Empty icon={<IconAlert size={22}/>} title="Couldn’t load libraries"
          action={<Button loading={initLoading} loadingText="Retrying…" onClick={()=>refreshInit()}>Retry</Button>}/></Card>
      ) : (
        <Card className="mb-3">
          <div className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">New code for</div>
          <ScopeChips chips={chips.filter(c=>scopes.some(s=>s.value===c.code))} value={scope} onChange={v=>{ setScope(v); setFresh(null); }}/>
          <input value={mobile} onChange={e=>setMobile(parsePhone10(e.target.value))} inputMode="numeric" aria-label="Student mobile number"
            placeholder="Student’s mobile (required)" aria-invalid={!!mobile&&!mobOk}
            className={cx(inputCls, mobile?"font-lma-mono":"", mobile&&!mobOk?"border-lma-out bg-lma-out-soft":"")}/>
          {mobile&&!mobOk&&<p role="alert" className="mt-1.5 px-1 text-[12px] font-semibold text-lma-out">Needs 10 digits starting 6–9. Any format works: +91, 0091, spaces or dashes.</p>}
          <input value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Remark — who is this for? (optional)" aria-label="Remark"
            className={cx(inputCls, "mt-2")}/>
          <Button size="lg" full className="mt-3" disabled={!!genBlocker||busy} loading={busy} loadingText="Creating…" onClick={()=>setConfirmGen(true)}>
            {genBlocker || `Create code for ${scope}`}
          </Button>
          {fresh&&(
            <div className="mt-4 rounded-[16px] bg-lma-bg p-3.5 ring-1 ring-inset ring-lma-line">
              <div className="text-center">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">New code · {fresh.scope}</div>
                <div className="mt-1 select-all font-lma-mono text-[26px] font-semibold tracking-[0.08em] text-lma-ink">{fresh.pretty}</div>
                <div className="mt-1 text-[12.5px] text-lma-ink-2"><span className="font-lma-mono">{fresh.mobile}</span>{fresh.remark?` · ${fresh.remark}`:""}</div>
              </div>
              <div className="mt-3"><Share code={fresh.pretty} mob={fresh.mobile}/></div>
            </div>
          )}
        </Card>
      )}

      {/* ── created codes ── */}
      {!listLoaded ? (
        listError ? (
          <Card><Empty icon={<IconAlert size={22}/>} title="Couldn’t load codes"
            action={<Button loading={loading} loadingText="Retrying…" onClick={load}>Retry</Button>}/></Card>
        ) : (
          <div className="space-y-2" aria-label="Loading codes">{[0,1,2].map(i=><Card key={i}><Skeleton className="h-4 w-40"/><Skeleton className="mt-2 h-3 w-56"/><Skeleton className="mt-3 h-11"/></Card>)}</div>
        )
      ) : (
        <>
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {FILTERS.map(f=>(
              <Chip key={f} on={filter===f} onClick={()=>setFilter(f)}>
                {FILTER_LABEL[f]} <span className={cx("ml-1 font-lma-mono text-[12px]", filter===f?"text-white/80":"text-lma-ink-3")}>{counts[f]}</span>
              </Chip>
            ))}
          </div>
          {shown.length===0
            ? <Card><Empty icon={<IconTicket size={22}/>} title={loading?"Loading…":filter==="ALL"?"No codes yet":`Nothing ${FILTER_LABEL[filter].toLowerCase()}`}
                body={!loading&&filter==="ALL"?"Create one above and send it to the student.":undefined}/></Card>
            : <div className="space-y-2 pb-6">
                {shown.map(it=>{ const m=meta(it.status); const live=it.status==="ISSUED"||it.status==="SUBMITTED"; return (
                  <div key={it.code} className="flex overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
                    <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background:m.bar }}/>
                    <div className="min-w-0 flex-1 p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="select-all font-lma-mono text-[16px] font-semibold tracking-wide text-lma-ink">{it.code}</span>
                        <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-bold", m.chip)}>{m.label}</span>
                        <span className="ml-auto shrink-0 text-[12px] font-semibold text-lma-ink-3">{it.branch||it.library}</span>
                      </div>
                      {(it.mobile||it.remark)&&<div className="mt-1.5 text-[13px] font-semibold leading-snug text-lma-ink">
                        {it.mobile&&<span className="font-lma-mono">{it.mobile}</span>}{it.mobile&&it.remark?" · ":""}{it.remark}
                      </div>}
                      {m.hint&&<div className="mt-1 text-[12px] leading-snug text-lma-ink-3">{m.hint}</div>}
                      <div className="mt-1 text-[11.5px] text-lma-ink-3">
                        Issued {it.issued_on}
                        {it.used_receipt?<> · <span className="font-semibold text-lma-ink-2">{it.used_receipt}</span></>:null}
                        {it.used_by_library&&it.used_by_library!==(it.branch||it.library)?<> · used at {it.used_by_library}</>:null}
                      </div>
                      {live&&<div className="mt-3"><Share code={it.code} mob={it.mobile} onVoid={()=>setConfirmVoid(it)}/></div>}
                    </div>
                  </div>
                ); })}
              </div>}
        </>
      )}

      {/* confirm: create */}
      {confirmGen&&(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" onClick={()=>setConfirmGen(false)}>
          <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.45)]"/>
          <div role="dialog" aria-modal="true" aria-label="Create a new enquiry code" className="lma-sheet-up relative w-full max-w-xs rounded-[20px] bg-lma-surface p-5 shadow-lma-float" onClick={e=>e.stopPropagation()}>
            <h4 className="mb-2 text-[16px] font-bold text-lma-ink">Create a new enquiry code?</h4>
            <div className="mb-3 space-y-1.5 rounded-[12px] bg-lma-bg p-3 text-[13px]">
              <div className="flex gap-2"><span className="w-16 shrink-0 text-lma-ink-3">For</span><span className="font-semibold text-lma-ink">{scope}</span></div>
              <div className="flex gap-2"><span className="w-16 shrink-0 text-lma-ink-3">Mobile</span><span className="font-lma-mono font-semibold text-lma-ink">{mobile}</span></div>
              <div className="flex gap-2"><span className="w-16 shrink-0 text-lma-ink-3">Remark</span><span className={remark.trim()?"font-semibold text-lma-ink":"italic text-lma-ink-3"}>{remark.trim()||"none"}</span></div>
            </div>
            <p className="mb-4 text-[12px] leading-snug text-lma-ink-3">The code works once. Share it with one student only.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={()=>setConfirmGen(false)}>Cancel</Button>
              <Button loading={busy} loadingText="Creating…" onClick={generate}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* confirm: void */}
      {confirmVoid&&(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" onClick={()=>setConfirmVoid(null)}>
          <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.45)]"/>
          <div role="dialog" aria-modal="true" aria-label="Void this code" className="lma-sheet-up relative w-full max-w-xs rounded-[20px] bg-lma-surface p-5 shadow-lma-float" onClick={e=>e.stopPropagation()}>
            <h4 className="mb-1 text-[16px] font-bold text-lma-ink">Void {confirmVoid.code}?</h4>
            <p className="mb-4 text-[13px] leading-snug text-lma-ink-3">The student won’t be able to use it any more. This can’t be undone.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={()=>setConfirmVoid(null)}>Keep</Button>
              <Button variant="danger" onClick={()=>doVoid(confirmVoid)}>Void code</Button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
