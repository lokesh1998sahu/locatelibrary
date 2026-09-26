"use client";

// ── LEDGER — every money entry behind a Dashboard figure ─────────────
// Finance view only: amounts, dates, tags, banks, who paid. No seat / shift /
// renewal details. Opened from any Dashboard figure, Home "Collected" or the
// Home "Ledger" card. Data comes from getMoneyLedger, which reads the SAME
// money lines as getDashboard — so the totals always equal the tapped figure.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLMA, useScopeChips } from "../../_components/LMAProvider";
import ReceiptModal, { MoneyTrail } from "../../_components/ReceiptModal";
import SearchBar from "../../_components/SearchBar";
import Pager from "../../_components/Pager";
import PeriodPicker from "../../_components/PeriodPicker";
import { periodOf, isPreset, dmyOf, isoOf, type Period, type LedgerDim, type LedgerSrc } from "../../_lib/period";
import { parseAnyDate, fmtDMY } from "../../_lib/dates";
import { Screen, Card, Chip, ScopeChips, Segmented, Sheet, Button, Skeleton, Empty, IconButton, cx } from "../../_ui/kit";
import { IconBack, IconRefresh, IconDots, IconBook } from "../../_ui/icons";

const API = "/api/lma960805";
const GROUPS_PER_PAGE = 15;

type Basis = "pay"|"credit";
interface Line {
  src:LedgerSrc; dir:"IN"|"OUT"; amt:number; day:string|null; sday:string|null;
  lib:string; tag:string; bank:string; ref:string; rno:string; sid:string; name:string;
  rtype:string; part:number; parts:number; cat:string; note:string; xlib:boolean; sno:number;
  key?:string; tick?:Tick|null;   // reconciliation tick (bank view, credit dates)
}
interface Tick { amount:number; bank:string; credit_day:string; ticked_at?:string }
type TickState = "none"|"ok"|"changed";
interface BreakRow { key:string; gross:number; refund:number; net:number; }
interface BankMeta { bank_name:string; owner_name:string; acct_type:string; tags:{tag:string;days:number}[]; }
interface TagMeta  { bank:string; days:number|null; bank_name:string; owner_name:string; }
interface Ledger {
  ok:boolean; error?:string;
  range:{ from:string; to:string }; scope:string; dim:LedgerDim; key:string; basis:Basis; today:string|null;
  meta:BankMeta|TagMeta|null; switcher:BreakRow[];
  totals:{ gross:number; refund:number; net:number; entries:number; receipts:number };
  lines:Line[]; ticks_ready?:boolean;
}
interface Group { k:string; items:Line[]; inn:number; out:number; net:number; payFrom:string; payTo:string; }

const SRC_ORDER:LedgerSrc[]=["RECEIPTS","DUES","MISC","REFUNDS"];
const SRC_LABEL:Record<LedgerSrc,string>={RECEIPTS:"Receipt",DUES:"Dues",MISC:"Misc",REFUNDS:"Refund"};
const SRC_PLURAL:Record<LedgerSrc,string>={RECEIPTS:"Receipts",DUES:"Dues",MISC:"Misc",REFUNDS:"Refunds"};
const SRC_TONE:Record<LedgerSrc,string>={RECEIPTS:"bg-lma-brand-soft text-lma-brand",DUES:"bg-[#fef3c7] text-[#92400e]",MISC:"bg-lma-in-soft text-lma-in",REFUNDS:"bg-lma-out-soft text-lma-out"};
const DIMS:{k:LedgerDim;label:string;icon:string}[]=[
  {k:"all",label:"All",icon:"📒"},{k:"bank",label:"Bank",icon:"🏦"},{k:"tag",label:"Tag",icon:"🏷️"},{k:"library",label:"Library",icon:"🏛️"},
];

const _MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const _DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const inr=(n:number)=>"₹"+Math.round(n).toLocaleString("en-IN");
const inrSigned=(n:number)=>(n<0?"−":"")+inr(Math.abs(n));
const short=(n:number)=>{ const a=Math.abs(n); if(a>=100000)return (n/100000).toFixed(a>=1000000?0:1)+"L"; if(a>=1000)return (n/1000).toFixed(a>=10000?0:1)+"k"; return String(Math.round(n)); };
const dm=(iso:string|null)=>{ const d=parseAnyDate(iso); return d?`${d.getDate()}-${_MON[d.getMonth()]}`:"—"; };
const dmy=(iso:string|null)=>fmtDMY(iso)||"—";
const dayHead=(iso:string)=>{ const d=parseAnyDate(iso); return d?`${_DOW[d.getDay()]}, ${d.getDate()}-${_MON[d.getMonth()]}-${d.getFullYear()}`:"No date"; };
const keyLabel=(k:string)=>k&&k!=="—"?k:"Unassigned";
const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const groupKeyOf=(l:Line,basis:Basis)=>(basis==="credit"?l.sday:l.day)||"";

export default function LedgerPage(){
  const router=useRouter();
  const { init, showToast, post }=useLMA();
  const chips=useScopeChips();

  const [ready,setReady]=useState(false);
  const [dim,setDim]=useState<LedgerDim>("all");
  const [key,setKey]=useState("");
  const [period,setPeriod]=useState<Period>(()=>periodOf("month"));
  const [scope,setScope]=useState("");
  const [basis,setBasis]=useState<Basis>("pay");
  const [src,setSrc]=useState<LedgerSrc|"">("");
  const [sub,setSub]=useState("");
  const [unOnly,setUnOnly]=useState(false);
  const [tickOver,setTickOver]=useState<Record<string,Tick|null>>({});   // ticks changed on this screen since loading
  const [untickedOnly,setUntickedOnly]=useState(false);
  const [tickBusy,setTickBusy]=useState(false);
  const [draft,setDraft]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [openMap,setOpenMap]=useState<Record<string,boolean>>({});
  const [data,setData]=useState<Ledger|null>(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [detail,setDetail]=useState<Line|null>(null);
  const [rcptNo,setRcptNo]=useState<string|null>(null);
  const reqId=useRef(0);
  const adoptKey=useRef(false);   // server picked the key: take it without refetching

  // Read the link once. (window, not useSearchParams: needs no Suspense boundary.)
  useEffect(()=>{
    const q=new URLSearchParams(window.location.search);
    const d=q.get("dim"); if(d==="bank"||d==="tag"||d==="library") setDim(d);
    setKey((q.get("key")||"").toUpperCase());
    const p=q.get("p"), f=parseAnyDate(q.get("from")), t=parseAnyDate(q.get("to"));
    if(f&&t) setPeriod({ preset:isPreset(p)?p:"custom", from:f, to:t });
    else if(isPreset(p)) setPeriod(periodOf(p));
    setScope((q.get("lib")||"").toUpperCase());
    const s=q.get("src"); if(s==="RECEIPTS"||s==="DUES"||s==="MISC"||s==="REFUNDS") setSrc(s);
    if(q.get("basis")==="credit") setBasis("credit");
    setReady(true);
  },[]);

  const load=useCallback(async()=>{
    if(!ready) return;
    const my=++reqId.current;
    setLoading(true); setErr("");
    const p=new URLSearchParams({ action:"getMoneyLedger", dim, from:dmyOf(period.from), to:dmyOf(period.to), basis });
    if(dim!=="all"&&key) p.set("key",key);
    if(scope&&dim!=="library") p.set("library",scope);
    try{
      const r:Ledger=await fetch(`${API}?${p}`,{cache:"no-store"}).then(x=>x.json());
      if(my!==reqId.current) return;              // a newer request is already on its way
      if(r&&r.ok){
        setData(r);
        if(dim!=="all"&&!key&&r.key){ adoptKey.current=true; setKey(r.key); }   // keeps the same bank/tag/library when the period changes
      }
      else { setData(null); setErr((r&&r.error)||"Could not load the ledger."); }
    }catch{
      if(my!==reqId.current) return;
      setData(null); setErr("Network error. Check the connection and tap ↻.");
    }
    setLoading(false);
  },[ready,dim,key,period,scope,basis]);

  useEffect(()=>{ if(adoptKey.current){ adoptKey.current=false; return; } load(); },[load]);
  useEffect(()=>{ setSub(""); setUnOnly(false); setOpenMap({}); },[dim,key,basis]);
  useEffect(()=>{ setPage(1); },[dim,key,period,scope,basis,src,sub,unOnly,search,untickedOnly]);

  const fresh=!!data&&data.dim===dim;                       // data belongs to the current view
  const activeKey=dim==="all"?"":(fresh&&data?data.key:key);
  const lines=useMemo(()=>(fresh&&data?data.lines:[]),[fresh,data]);
  const today=data?.today??null;
  const subDim:"tag"|"bank"=dim==="bank"?"tag":"bank";      // bank view slices by tag; others by bank

  const typeCounts=useMemo(()=>{ const c:Partial<Record<LedgerSrc,number>>={}; lines.forEach(l=>{ c[l.src]=(c[l.src]||0)+1; }); return c; },[lines]);
  const afterSrc=useMemo(()=>(src?lines.filter(l=>l.src===src):lines),[lines,src]);
  const subRows=useMemo(()=>{
    const m=new Map<string,{key:string;net:number}>();
    afterSrc.forEach(l=>{ const k=(subDim==="tag"?l.tag:l.bank)||"—"; const r=m.get(k)||{key:k,net:0}; r.net+=l.dir==="OUT"?-l.amt:l.amt; m.set(k,r); });
    return Array.from(m.values()).sort((a,b)=>b.net-a.net);
  },[afterSrc,subDim]);
  const unassigned=useMemo(()=>lines.filter(l=>!l.tag||!l.bank),[lines]);
  const unassignedSum=useMemo(()=>unassigned.reduce((s,l)=>s+(l.dir==="OUT"?-l.amt:l.amt),0),[unassigned]);

  // ── reconciliation tick-off: bank view on credit dates only ──
  const tickMode=dim==="bank"&&basis==="credit"&&!!data?.ticks_ready;
  const tickOf=useCallback((l:Line):Tick|null=>{ const k=l.key||""; return k in tickOver ? tickOver[k] : (l.tick||null); },[tickOver]);
  const tickState=useCallback((l:Line):TickState=>{
    const t=tickOf(l); if(!t) return "none";
    return Math.abs(t.amount-l.amt)<0.005 && t.bank===l.bank && t.credit_day===(l.sday||"") ? "ok" : "changed";
  },[tickOf]);
  useEffect(()=>{ setTickOver({}); },[data]);
  const setTicks=async(ls:Line[], on:boolean)=>{
    const list=ls.filter(l=>l.key); if(!list.length||tickBusy) return;
    setTickBusy(true);
    const r=await post("tickMoneyLines",{ ticked:on, lines:list.map(l=>({ key:l.key, amount:l.amt, bank:l.bank, credit_day:l.sday||"" })) });
    setTickBusy(false);
    if(r){ setTickOver(o=>{ const n={...o}; list.forEach(l=>{ n[l.key!]=on?{ amount:l.amt, bank:l.bank, credit_day:l.sday||"" }:null; }); return n; }); }
  };

  const shown=useMemo(()=>{
    let a=afterSrc;
    if(sub) a=a.filter(l=>((subDim==="tag"?l.tag:l.bank)||"—")===sub);
    if(unOnly) a=a.filter(l=>!l.tag||!l.bank);
    if(tickMode&&untickedOnly) a=a.filter(l=>tickState(l)!=="ok");
    const q=search.trim().toUpperCase();
    if(q) a=a.filter(l=>[l.ref,l.rno,l.sid,l.name,l.cat,l.note.toUpperCase(),l.tag,l.bank].some(v=>!!v&&v.includes(q)));
    return a;
  },[afterSrc,sub,unOnly,search,subDim,tickMode,untickedOnly,tickState]);
  const filtered=!!(src||sub||unOnly||search.trim()||(tickMode&&untickedOnly));
  const recon=useMemo(()=>{
    if(!tickMode) return null;
    let expected=0, ticked=0, changed=0, open=0;
    for(const l of afterSrc){ const v=l.dir==="OUT"?-l.amt:l.amt; expected+=v; const st=tickState(l); if(st==="ok") ticked+=v; else { open++; if(st==="changed") changed++; } }
    return { expected, ticked, left:expected-ticked, changed, open };
  },[tickMode,afterSrc,tickState]);

  // Unfiltered: the server's totals (Dashboard arithmetic). Filtered: summed here.
  const tot=useMemo(()=>{
    if(fresh&&data&&!filtered) return data.totals;
    let g=0,r=0; const rs=new Set<string>();
    shown.forEach(l=>{ if(l.dir==="IN") g+=l.amt; else r+=l.amt; if(l.src==="RECEIPTS") rs.add(l.rno); });
    return { gross:Math.round(g), refund:Math.round(r), net:Math.round(g-r), entries:shown.length, receipts:rs.size };
  },[fresh,data,filtered,shown]);

  // Money received but not yet credited by the bank (credit date after today)
  const transit=useMemo(()=>{
    if(!today) return null;
    let amt=0,n=0,last="";
    shown.forEach(l=>{ if(l.dir==="IN"&&l.sday&&l.sday>today){ amt+=l.amt; n++; if(l.sday>last) last=l.sday; } });
    return n?{amt,n,last}:null;
  },[shown,today]);

  const groups=useMemo<Group[]>(()=>{
    const m=new Map<string,Line[]>();
    shown.forEach(l=>{ const k=groupKeyOf(l,basis); const a=m.get(k); if(a) a.push(l); else m.set(k,[l]); });
    const keys=Array.from(m.keys()).sort((a,b)=>a===b?0:!a?1:!b?-1:a<b?1:-1);   // newest first, undated last
    return keys.map(k=>{
      const items=(m.get(k)||[]).slice().sort((x,y)=>SRC_ORDER.indexOf(x.src)-SRC_ORDER.indexOf(y.src)||y.sno-x.sno);
      let inn=0,out=0; items.forEach(l=>{ if(l.dir==="IN") inn+=l.amt; else out+=l.amt; });
      const pays=items.map(l=>l.day||"").filter(Boolean).sort();
      return { k, items, inn, out, net:inn-out, payFrom:pays[0]||"", payTo:pays[pays.length-1]||"" };
    });
  },[shown,basis]);

  const totalPages=Math.max(1,Math.ceil(groups.length/GROUPS_PER_PAGE));
  const pageGroups=groups.slice((page-1)*GROUPS_PER_PAGE,page*GROUPS_PER_PAGE);
  // By payment date days start open; by credit date they start closed (like statement lines).
  const isOpen=(k:string)=>openMap[k]??(k===(groups[0]?.k));
  const allOpen=pageGroups.length>0&&pageGroups.every(g=>isOpen(g.k));
  const setAll=(v:boolean)=>setOpenMap(()=>{ const n:Record<string,boolean>={}; groups.forEach(g=>{ n[g.k]=v; }); return n; });

  const pickDim=(d:LedgerDim)=>{ if(d===dim) return; setDim(d); setKey(""); setSrc(""); setDraft(""); setSearch(""); };
  const back=()=>{ if(window.history.length>1) router.back(); else router.push("/lma960805/today"); };

  // ── header text ──
  const libName=(code:string)=>{
    const b=init?.branches.find(x=>x.branch_code===code); if(b) return b.branch_display||code;
    const l=init?.libraries.find(x=>x.library_code===code); return l?.display_name||code;
  };
  const dimInfo=DIMS.find(d=>d.k===dim)||DIMS[0];
  const meta=fresh&&data?data.meta:null;
  let title="Ledger", subtitle="All money in and out";
  if(dim!=="all"){
    title=keyLabel(activeKey);
    if(activeKey==="—") subtitle=dim==="bank"?"Entries with no bank / fees mode":dim==="tag"?"Entries with no payment tag":"Entries with no library";
    else if(dim==="bank"){ const m=meta as BankMeta|null; subtitle=[m?.bank_name,m?.owner_name,m?.acct_type].filter(Boolean).join(" · ")||"Bank / fees mode"; }
    else if(dim==="tag"){ const m=meta as TagMeta|null; subtitle=m&&m.bank?`Goes to ${m.bank}${m.bank_name?` (${m.bank_name})`:""}${m.days!==null?` · credits T+${m.days}`:""}`:"Payment tag"; }
    else subtitle=activeKey?libName(activeKey):"Library / branch";
  }
  const bankTags=dim==="bank"&&meta?(meta as BankMeta).tags||[]:[];
  const switcher=fresh&&data?data.switcher:[];
  const switchRows=activeKey&&!switcher.some(r=>r.key===activeKey)?[{key:activeKey,gross:0,refund:0,net:0},...switcher]:switcher;

  // ── export / share ──
  const viewName=dim==="all"?"All money":`${dimInfo.label} ${keyLabel(activeKey)}`;
  const buildSummary=()=>{
    const out:string[]=[];
    out.push(`📒 LMA Ledger — ${viewName}`);
    out.push(`${dmy(isoOf(period.from))} to ${dmy(isoOf(period.to))} · ${dim==="library"?"":(scope||"All libraries")+" · "}by ${basis==="credit"?"bank credit date":"payment date"}`);
    const f=[src?SRC_PLURAL[src]:"",sub?`${subDim==="tag"?"tag":"bank"} ${keyLabel(sub)}`:"",unOnly?"no tag/bank only":"",search.trim()?`search "${search.trim()}"`:""].filter(Boolean);
    if(f.length) out.push(`Filter: ${f.join(", ")}`);
    out.push(`IN ${inr(tot.gross)} · OUT ${inr(tot.refund)} · NET ${inrSigned(tot.net)}`);
    const split=SRC_ORDER.map(s=>{ const n=shown.filter(l=>l.src===s).length; return n?`${n} ${SRC_PLURAL[s].toLowerCase()}`:""; }).filter(Boolean).join(", ");
    out.push(`${plural(tot.entries,"entry","entries")}${split?` (${split})`:""}`);
    if(transit) out.push(`Not yet credited: ${inr(transit.amt)} (lands by ${dm(transit.last)})`);
    const days=groups.slice().reverse();                // oldest first, like a statement
    if(days.length){
      out.push(""); out.push(`Day-wise (${basis==="credit"?"credit date":"payment date"}):`);
      const cap=40;
      days.slice(0,cap).forEach(g=>out.push(`${g.k?dm(g.k):"No date"}  ${inrSigned(g.net)}  (${g.items.length})`));
      if(days.length>cap) out.push(`…and ${days.length-cap} more days`);
    }
    return out.join("\n");
  };
  const copySummary=async()=>{
    try{ await navigator.clipboard.writeText(buildSummary()); showToast("Summary copied"); }
    catch{ showToast("Couldn't copy on this device","error"); }
  };
  const shareWA=()=>{ window.open(`https://wa.me/?text=${encodeURIComponent(buildSummary())}`,"_blank"); };
  const exportCsv=()=>{
    const head=["Payment date","Bank credit date","Type","In/Out","Amount","Reference","Receipt no","Student ID","Name","Library","Payment tag","Bank","Receipt type","Split","Category","Note"];
    const txt=(v:string)=>{ const s=/^[=+\-@]/.test(v)?"'"+v:v; return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };  // guards spreadsheet formulas
    const rows=shown.slice().sort((a,b)=>groupKeyOf(a,basis).localeCompare(groupKeyOf(b,basis))||SRC_ORDER.indexOf(a.src)-SRC_ORDER.indexOf(b.src)||a.sno-b.sno)
      .map(l=>[txt(l.day||""),txt(l.sday||""),txt(SRC_LABEL[l.src]),txt(l.dir),String(l.dir==="OUT"?-l.amt:l.amt),txt(l.ref),txt(l.rno),txt(l.sid),txt(l.name),txt(l.lib),txt(l.tag),txt(l.bank),txt(l.rtype),txt(l.parts>1?`part ${l.part} of ${l.parts}`:""),txt(l.cat),txt(l.note)].join(","));
    const csv=[head.join(","),...rows].join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const tag=(dim==="all"?"all":`${dim}-${keyLabel(activeKey)}`).replace(/[^A-Za-z0-9-]+/g,"-");
    a.href=url; a.download=`LMA-ledger_${tag}_${isoOf(period.from)}_to_${isoOf(period.to)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    showToast(`CSV ready · ${plural(rows.length,"entry","entries")}`);
  };

  const [menuOpen,setMenuOpen]=useState(false);   // export & share

  return (
    <Screen>
      <header className="flex items-center gap-1 pb-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        <IconButton label="Back" onClick={back} className="-ml-2"><IconBack size={22}/></IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-bold tracking-[-0.01em] text-lma-ink">{dimInfo.icon} {title}</h1>
          <p className="truncate text-[12px] text-lma-ink-3">{subtitle}</p>
        </div>
        <IconButton label="Refresh" onClick={()=>load()}><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>
        <IconButton label="Export and share" onClick={()=>setMenuOpen(true)} className="-mr-2"><IconDots size={22}/></IconButton>
      </header>

      {!ready ? (
        <Card><Skeleton className="h-10"/><Skeleton className="mt-3 h-10"/><Skeleton className="mt-3 h-24"/></Card>
      ) : (<>
        {/* what to look at: everything, one bank, one tag, one library */}
        <Segmented className="mb-3" value={dim} onChange={v=>pickDim(v as LedgerDim)} options={DIMS.map(d=>({v:d.k,label:d.label}))}/>

        {/* switch bank / tag / library without going back */}
        {dim!=="all"&&switchRows.length>0&&(
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {switchRows.map(r=>(
              <Chip key={r.key} on={activeKey===r.key} onClick={()=>setKey(r.key)}>{keyLabel(r.key)} <span className={cx("ml-1 font-lma-mono text-[12px]",activeKey===r.key?"text-white/80":"text-lma-ink-3")}>{short(r.net)}</span></Chip>
            ))}
          </div>
        )}
        {bankTags.length>0&&(
          <p className="mb-2 px-1 text-[12px] text-lma-ink-3">Tags routed here: {bankTags.map(t=>`${t.tag} (T+${t.days})`).join(", ")}</p>
        )}

        {/* library / branch filter (the library view uses the switcher above instead) */}
        {dim!=="library"&&<ScopeChips chips={chips} value={scope} onChange={setScope}/>}

        <PeriodPicker value={period} onChange={setPeriod}/>

        {/* which date decides the day */}
        <Segmented className="mb-1.5" value={basis} onChange={v=>setBasis(v as Basis)} options={[{v:"pay",label:"Paid on"},{v:"credit",label:"Credited on"}]}/>
        <p className="mb-3 px-1 text-[12px] leading-relaxed text-lma-ink-3">{basis==="pay"
          ?"Each day shows the money received that day, the same as Today."
          :"Each day is what should appear as a credit on the bank statement: the payment date plus the tag’s settlement days. Around Sundays and holidays the bank may credit a day later."}</p>

        {err&&(
          <div role="alert" className="mb-3 flex items-center justify-between gap-2 rounded-[14px] bg-lma-out-soft px-3.5 py-2.5 text-[13px] font-semibold text-lma-out">
            <span>{err}</span><button type="button" onClick={()=>load()} className="shrink-0 underline">Retry</button>
          </div>
        )}

        {!fresh&&loading&&<Card><Skeleton className="h-8 w-40"/><Skeleton className="mt-3 h-4 w-56"/></Card>}

        {fresh&&(
          <div className={loading?"pointer-events-none opacity-50 transition":"transition"}>
            {/* totals */}
            <section className="lma-glass-dark mb-3 rounded-[22px] p-5 text-white">
              <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold text-white/75">
                <span>{filtered?"Net (filtered)":"Net"}{basis==="credit"?" · by credit date":""}</span>
                <span>{plural(tot.entries,"entry","entries")}{tot.receipts?` · ${plural(tot.receipts,"receipt","receipts")}`:""}</span>
              </div>
              <div className="mt-1 font-lma-mono text-[32px] font-medium leading-none tracking-[-0.02em]">{inrSigned(tot.net)}</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[14px] bg-white/10 px-3 py-2.5"><div className="text-[11.5px] font-semibold text-white/70">In</div><div className="mt-0.5 font-lma-mono text-[17px] font-medium">{inr(tot.gross)}</div></div>
                <div className="rounded-[14px] bg-white/10 px-3 py-2.5"><div className="text-[11.5px] font-semibold text-white/70">Out</div><div className="mt-0.5 font-lma-mono text-[17px] font-medium">{inr(tot.refund)}</div></div>
              </div>
              {transit&&<div className="mt-3 rounded-[12px] bg-white/15 px-3 py-2 text-[12px] font-semibold">⏳ {inr(transit.amt)} received but not yet credited · lands by {dm(transit.last)}</div>}
            </section>

            {dim==="bank"&&basis==="credit"&&data&&data.ticks_ready===false&&(
              <p className="mb-3 rounded-[14px] bg-lma-surface px-3.5 py-2.5 text-[12.5px] leading-relaxed text-lma-ink-3 ring-1 ring-inset ring-lma-line">
                Statement tick-off isn’t set up yet. Run <span className="font-lma-mono font-semibold text-lma-ink-2">money-ticks-setup.sql</span> once in Supabase to switch it on.
              </p>
            )}
            {recon&&(
              <div className="mb-3 rounded-[16px] bg-lma-surface p-3.5 shadow-lma-card ring-1 ring-inset ring-lma-line">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-[11px] font-semibold text-lma-ink-3">Expected in {keyLabel(activeKey)}</div><div className="mt-0.5 font-lma-mono text-[14.5px] font-semibold text-lma-ink">{inrSigned(recon.expected)}</div></div>
                  <div><div className="text-[11px] font-semibold text-lma-ink-3">Ticked</div><div className="mt-0.5 font-lma-mono text-[14.5px] font-semibold text-lma-in">{inrSigned(recon.ticked)}</div></div>
                  <div><div className="text-[11px] font-semibold text-lma-ink-3">Still to find</div><div className={cx("mt-0.5 font-lma-mono text-[14.5px] font-semibold", Math.abs(recon.left)<0.5?"text-lma-in":"text-lma-warn-2")}>{inrSigned(recon.left)}</div></div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Chip on={untickedOnly} onClick={()=>setUntickedOnly(v=>!v)}>Unticked only <span className={cx("ml-1 font-lma-mono text-[12px]",untickedOnly?"text-white/80":"text-lma-ink-3")}>{recon.open}</span></Chip>
                  {recon.changed>0&&<span className="text-[12px] font-semibold text-lma-warn-2">{plural(recon.changed,"entry","entries")} changed since ticked</span>}
                </div>
              </div>
            )}

            {unassigned.length>0&&activeKey!=="—"&&(
              <button type="button" onClick={()=>setUnOnly(v=>!v)}
                className={cx("lma-noscale mb-3 w-full rounded-[14px] px-3.5 py-2.5 text-left text-[13px] font-semibold", unOnly?"bg-lma-out text-white":"bg-lma-out-soft text-lma-out")}>
                ⚠ {plural(unassigned.length,"entry has","entries have")} no tag or bank ({inrSigned(unassignedSum)}). {unOnly?"Showing only these · tap to show all":"Tap to review and fix"}
              </button>
            )}

            {/* type chips */}
            <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              <Chip on={!src} onClick={()=>setSrc("")}>All <span className={cx("ml-1 font-lma-mono text-[12px]",!src?"text-white/80":"text-lma-ink-3")}>{lines.length}</span></Chip>
              {SRC_ORDER.filter(x=>(typeCounts[x]||0)>0||src===x).map(x=>(
                <Chip key={x} on={src===x} onClick={()=>setSrc(src===x?"":x)}>{SRC_PLURAL[x]} <span className={cx("ml-1 font-lma-mono text-[12px]",src===x?"text-white/80":"text-lma-ink-3")}>{typeCounts[x]||0}</span></Chip>
              ))}
            </div>

            {/* bank view → by tag · other views → by bank */}
            {(subRows.length>1||!!sub)&&(
              <div className="-mx-4 mb-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.06em] text-lma-ink-3">{subDim==="tag"?"Tags":"Banks"}</span>
                <Chip on={!sub} onClick={()=>setSub("")}>All</Chip>
                {subRows.map(r=>(
                  <Chip key={r.key} on={sub===r.key} onClick={()=>setSub(sub===r.key?"":r.key)}>{keyLabel(r.key)} <span className={cx("ml-1 font-lma-mono text-[12px]",sub===r.key?"text-white/80":"text-lma-ink-3")}>{short(r.net)}</span></Chip>
                ))}
              </div>
            )}

            <SearchBar value={draft} onChange={v=>{ setDraft(v); if(!v) setSearch(""); }} onSearch={()=>setSearch(draft)} placeholder="Name, R-no, F-ID, reference or note…" hint=""/>

            {groups.length===0?(
              <Card><Empty icon={<IconBook size={22}/>} title={filtered?"No entries match these filters":"No money entries in this period"}
                body={filtered?undefined:"Try a longer period or another library."}/></Card>
            ):(
              <>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[12px] font-semibold text-lma-ink-3">{plural(groups.length,"day","days")} · {basis==="credit"?"by bank credit date":"by payment date"}</span>
                  <button type="button" onClick={()=>setAll(!allOpen)} className="text-[12.5px] font-semibold text-lma-brand">{allOpen?"Collapse all":"Expand all"}</button>
                </div>
                <div className="space-y-2 pb-2">
                  {pageGroups.map(g=>{
                    const open=isOpen(g.k);
                    const pending=basis==="credit"&&!!today&&!!g.k&&g.k>today;
                    return (
                      <div key={g.k||"none"} className="overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
                        <div className="flex items-stretch">
                        <button type="button" onClick={()=>setOpenMap(m=>({...m,[g.k]:!open}))} aria-expanded={open}
                          className="lma-noscale flex min-w-0 flex-1 items-center gap-2.5 px-3.5 py-3 text-left active:bg-lma-bg">
                          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
                            className="shrink-0 text-lma-ink-3 transition" style={{transform:open?"rotate(90deg)":"none"}}><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-semibold text-lma-ink">{basis==="credit"?"Credit · ":""}{g.k?dayHead(g.k):"No date"}</div>
                            <div className="text-[11.5px] text-lma-ink-3">
                              {plural(g.items.length,"entry","entries")}
                              {basis==="credit"&&g.payFrom?` · paid ${g.payFrom===g.payTo?dm(g.payFrom):`${dm(g.payFrom)} to ${dm(g.payTo)}`}`:""}
                              {g.out>0?` · in ${inr(g.inn)} · out ${inr(g.out)}`:""}
                              {pending?" · not yet credited":""}
                              {tickMode?(()=>{ const n=g.items.filter(l=>tickState(l)==="ok").length; return <span className={n===g.items.length?"font-semibold text-lma-in":""}> · {n} of {g.items.length} ticked</span>; })():null}
                            </div>
                          </div>
                          <div className={cx("shrink-0 font-lma-mono text-[14.5px] font-semibold", g.net<0?"text-lma-out":"text-lma-ink")}>{inrSigned(g.net)}</div>
                        </button>
                        {tickMode&&(()=>{ const allOk=g.items.every(l=>tickState(l)==="ok"); return (
                          <button type="button" disabled={tickBusy} onClick={()=>setTicks(allOk?g.items:g.items.filter(l=>tickState(l)!=="ok"), !allOk)}
                            className={cx("lma-noscale shrink-0 border-l border-lma-line px-3 text-[12px] font-semibold disabled:opacity-50", allOk?"text-lma-ink-3":"text-lma-brand")}>
                            {allOk?"Untick day":"Tick day"}
                          </button>
                        ); })()}
                        </div>
                        {open&&(
                          <div className="divide-y divide-lma-line border-t border-lma-line">
                            {g.items.map((l,i)=><EntryRow key={`${l.src}-${l.ref}-${l.part}-${i}`} l={l} basis={basis} today={today} onOpen={()=>setDetail(l)}
                              {...(tickMode?{ ts:tickState(l), tk:tickOf(l), onTick:()=>setTicks([l], tickState(l)!=="ok"), busy:tickBusy }:{})}/>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Pager page={page} totalPages={totalPages} onPage={setPage}/>
              </>
            )}
          </div>
        )}
      </>)}

      <Sheet open={menuOpen} onClose={()=>setMenuOpen(false)} title="Export & share">
        <p className="mb-3 px-1 text-[12.5px] text-lma-ink-3">{shown.length?`The ${plural(shown.length,"entry","entries")} now showing, with the filters you picked.`:"Nothing to export with these filters."}</p>
        <div className="space-y-2 pb-2">
          <Button full variant="secondary" disabled={!shown.length} onClick={()=>{ setMenuOpen(false); exportCsv(); }}>Download CSV</Button>
          <Button full variant="secondary" disabled={!shown.length} onClick={()=>{ setMenuOpen(false); copySummary(); }}>Copy summary</Button>
          <button type="button" disabled={!shown.length} onClick={()=>{ setMenuOpen(false); shareWA(); }} className="h-12 w-full rounded-[14px] bg-[#16a34a] text-[15px] font-bold text-white disabled:opacity-40">Share on WhatsApp</button>
        </div>
      </Sheet>

      {detail&&<EntrySheet l={detail} today={today} onClose={()=>setDetail(null)} onOpenReceipt={setRcptNo}/>}
      {rcptNo&&<ReceiptModal receiptNo={rcptNo} onClose={()=>setRcptNo(null)} onSaved={()=>{ setDetail(null); load(); }}/>}
    </Screen>
  );
}

// ── one money entry ──
function EntryRow({ l, basis, today, onOpen, ts, tk, onTick, busy }:{ l:Line; basis:Basis; today:string|null; onOpen:()=>void; ts?:TickState; tk?:Tick|null; onTick?:()=>void; busy?:boolean }){
  const title=l.src==="MISC"?(l.cat||"Misc income"):(l.name||l.sid||l.ref);
  const later=!!l.sday&&!!today&&l.sday>today;
  const row=(
    <button type="button" onClick={onOpen} className="lma-noscale flex min-w-0 flex-1 items-start gap-2.5 px-3.5 py-3 text-left active:bg-lma-bg">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${SRC_TONE[l.src]}`}>{SRC_LABEL[l.src]}</span>
          <span className="truncate text-[14px] font-semibold text-lma-ink">{title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-lma-ink-3">
          <span className="font-semibold text-lma-ink-2">{l.lib}</span>
          <span className={!l.tag||!l.bank?"font-semibold text-lma-out":"font-semibold text-lma-ink-2"}>{l.tag||"no tag"} → {l.bank||"no bank"}</span>
          {l.src==="RECEIPTS"&&<span className="font-lma-mono">{l.ref}</span>}
          {l.src==="DUES"&&<span className="font-lma-mono">{l.ref}{l.rno?` · for ${l.rno}`:""}</span>}
          {l.src==="REFUNDS"&&<span className="font-lma-mono">{l.ref}{l.rno?` · of ${l.rno}`:""}</span>}
          {l.sid&&l.name&&<span className="font-lma-mono">{l.sid}</span>}
          {l.parts>1&&<span>part {l.part} of {l.parts}</span>}
          {l.rtype&&<span>{l.rtype}</span>}
          {l.xlib&&<span className="font-semibold text-[#7c3aed]">cross-library</span>}
          {basis==="pay"&&l.dir==="IN"&&!!l.sday&&l.sday!==l.day&&<span className={later?"font-semibold text-lma-warn-2":""}>{later?"credits":"credited"} {dm(l.sday)}</span>}
          {basis==="credit"&&<span>paid {dm(l.day)}</span>}
          {l.src==="MISC"&&l.note&&<span className="max-w-full truncate">{l.note}</span>}
        </div>
      </div>
      <div className={cx("shrink-0 font-lma-mono text-[14.5px] font-semibold", l.dir==="OUT"?"text-lma-out":"text-lma-in")}>{l.dir==="OUT"?"−":"+"}{inr(l.amt)}</div>
    </button>
  );
  if(!onTick) return row;
  return (
    <div className={cx(ts==="ok"&&"bg-lma-in-soft/40")}>
      <div className="flex items-stretch">
        <button type="button" role="checkbox" aria-checked={ts==="ok"} disabled={busy} onClick={onTick}
          aria-label={ts==="ok"?`Untick ${title}`:`Tick ${title} as seen on the statement`}
          className="lma-noscale grid w-12 shrink-0 place-items-center pl-2 disabled:opacity-50">
          <span className={cx("grid h-6 w-6 place-items-center rounded-[7px] ring-2 ring-inset",
            ts==="ok"?"bg-lma-in text-white ring-lma-in":ts==="changed"?"bg-[#fef3c7] text-[#92400e] ring-[#f59e0b]":"bg-lma-surface text-transparent ring-[#cbd2e1]")}>
            {ts==="changed"
              ? <span className="text-[13px] font-bold">!</span>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 9.5 17 19 7.5"/></svg>}
          </span>
        </button>
        {row}
      </div>
      {ts==="changed"&&tk&&(
        <div className="-mt-1.5 pb-2.5 pl-12 pr-3.5 text-[11.5px] font-semibold text-lma-warn-2">
          Changed since ticked — was {inr(tk.amount)} · {tk.bank||"no bank"} · {tk.credit_day?dm(tk.credit_day):"no date"}. Check and tick again.
        </div>
      )}
    </div>
  );
}

// ── entry details: money facts + the receipt's full money trail ──
function EntrySheet({ l, today, onClose, onOpenReceipt }:{ l:Line; today:string|null; onClose:()=>void; onOpenReceipt:(rno:string)=>void }){
  const later=l.dir==="IN"&&!!l.sday&&!!today&&l.sday>today;
  const rows:[string,string][]=[];
  rows.push([l.dir==="OUT"?"Refund date":"Payment date", dmy(l.day)]);
  if(l.dir==="IN") rows.push(["Bank credit date", dmy(l.sday)+(later?" · not yet credited":"")]);
  rows.push(["Payment tag", l.tag||"— blank"]);
  rows.push(["Bank / fees mode", l.bank||"— blank"]);
  rows.push(["Library", l.lib||"—"]);
  rows.push([l.src==="DUES"?"Payment ID":l.src==="REFUNDS"?"Refund ID":"Reference", l.ref||"—"]);
  if(l.rno&&l.rno!==l.ref) rows.push(["Receipt", l.rno]);
  if(l.name||l.sid) rows.push(["Paid by", [l.name,l.sid].filter(Boolean).join(" · ")]);
  if(l.parts>1) rows.push(["Split payment", `part ${l.part} of ${l.parts}`]);
  if(l.rtype) rows.push(["Receipt type", l.rtype]);
  if(l.cat) rows.push(["Category", l.cat]);
  if(l.note) rows.push([l.src==="REFUNDS"?"Reason":"Note", l.note]);
  if(l.xlib) rows.push(["Cross-library", "Yes"]);
  return (
    <div className="fixed inset-0 z-[9000] flex items-end justify-center" onClick={onClose}>
      <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
      <div role="dialog" aria-modal="true" aria-label="Money entry" className="lma-sheet-up relative max-h-[88dvh] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lma-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-lma-float" onClick={e=>e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#dfe1ee]"/>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${SRC_TONE[l.src]}`}>{SRC_LABEL[l.src]}{l.dir==="OUT"?" · money out":" · money in"}</span>
            <div className={cx("mt-1.5 font-lma-mono text-[28px] font-semibold leading-none", l.dir==="OUT"?"text-lma-out":"text-lma-in")}>{l.dir==="OUT"?"−":"+"}{inr(l.amt)}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div className="divide-y divide-lma-line overflow-hidden rounded-[16px] border border-lma-line bg-lma-surface">
          {rows.map(([k,v])=>(
            <div key={k} className="flex min-h-[44px] items-center gap-3 px-3.5 py-2">
              <span className="w-32 shrink-0 text-[12.5px] text-lma-ink-3">{k}</span>
              <span className="min-w-0 flex-1 break-words text-right text-[13.5px] font-semibold text-lma-ink">{v}</span>
            </div>
          ))}
        </div>
        {l.rno?(
          <>
            <div className="mt-3"><MoneyTrail key={l.rno} receiptNo={l.rno} autoOpen/></div>
            <button type="button" onClick={()=>onOpenReceipt(l.rno)} className="mt-3 h-12 w-full rounded-[14px] bg-lma-ink text-[14px] font-semibold text-white">Open receipt {l.rno} to correct</button>
            <p className="mt-1.5 text-center text-[11.5px] text-lma-ink-3">Use this only to fix a wrong tag, bank, amount or date.</p>
          </>
        ):(
          <p className="mt-3 px-1 text-[12.5px] text-lma-ink-3">Misc entries are corrected on the Misc income screen.</p>
        )}
      </div>
    </div>
  );
}