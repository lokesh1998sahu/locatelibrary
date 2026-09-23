"use client";

// ── LEDGER — every money entry behind a Dashboard figure ─────────────
// Finance view only: amounts, dates, tags, banks, who paid. No seat / shift /
// renewal details. Opened from any Dashboard figure, Home "Collected" or the
// Home "Ledger" card. Data comes from getMoneyLedger, which reads the SAME
// money lines as getDashboard — so the totals always equal the tapped figure.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLMA, useScopeChips } from "../../_components/LMAProvider";
import CodePill from "../../_components/CodePill";
import ReceiptModal, { MoneyTrail } from "../../_components/ReceiptModal";
import SearchBar from "../../_components/SearchBar";
import Pager from "../../_components/Pager";
import PeriodPicker from "../../_components/PeriodPicker";
import { periodOf, isPreset, dmyOf, isoOf, type Period, type LedgerDim, type LedgerSrc } from "../../_lib/period";
import { parseAnyDate, fmtDMY } from "../../_lib/dates";

const API = "/api/lma960805";
const GROUPS_PER_PAGE = 15;

type Basis = "pay"|"credit";
interface Line {
  src:LedgerSrc; dir:"IN"|"OUT"; amt:number; day:string|null; sday:string|null;
  lib:string; tag:string; bank:string; ref:string; rno:string; sid:string; name:string;
  rtype:string; part:number; parts:number; cat:string; note:string; xlib:boolean; sno:number;
}
interface BreakRow { key:string; gross:number; refund:number; net:number; }
interface BankMeta { bank_name:string; owner_name:string; acct_type:string; tags:{tag:string;days:number}[]; }
interface TagMeta  { bank:string; days:number|null; bank_name:string; owner_name:string; }
interface Ledger {
  ok:boolean; error?:string;
  range:{ from:string; to:string }; scope:string; dim:LedgerDim; key:string; basis:Basis; today:string|null;
  meta:BankMeta|TagMeta|null; switcher:BreakRow[];
  totals:{ gross:number; refund:number; net:number; entries:number; receipts:number };
  lines:Line[];
}
interface Group { k:string; items:Line[]; inn:number; out:number; net:number; payFrom:string; payTo:string; }

const SRC_ORDER:LedgerSrc[]=["RECEIPTS","DUES","MISC","REFUNDS"];
const SRC_LABEL:Record<LedgerSrc,string>={RECEIPTS:"Receipt",DUES:"Dues",MISC:"Misc",REFUNDS:"Refund"};
const SRC_PLURAL:Record<LedgerSrc,string>={RECEIPTS:"Receipts",DUES:"Dues",MISC:"Misc",REFUNDS:"Refunds"};
const SRC_TONE:Record<LedgerSrc,string>={RECEIPTS:"bg-lma-primary/10 text-lma-primary",DUES:"bg-lma-accent/15 text-lma-accent",MISC:"bg-lma-warn/15 text-lma-warn",REFUNDS:"bg-lma-danger/15 text-lma-danger"};
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
  const { init, showToast }=useLMA();
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
  useEffect(()=>{ setPage(1); },[dim,key,period,scope,basis,src,sub,unOnly,search]);

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

  const shown=useMemo(()=>{
    let a=afterSrc;
    if(sub) a=a.filter(l=>((subDim==="tag"?l.tag:l.bank)||"—")===sub);
    if(unOnly) a=a.filter(l=>!l.tag||!l.bank);
    const q=search.trim().toUpperCase();
    if(q) a=a.filter(l=>[l.ref,l.rno,l.sid,l.name,l.cat,l.note.toUpperCase(),l.tag,l.bank].some(v=>!!v&&v.includes(q)));
    return a;
  },[afterSrc,sub,unOnly,search,subDim]);
  const filtered=!!(src||sub||unOnly||search.trim());

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
  const isOpen=(k:string)=>openMap[k]??(basis==="pay");
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

  const chipCls=(on:boolean)=>`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${on?"bg-lma-slate-900 text-white":"bg-white text-lma-slate-600"}`;

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4 pb-10">
      <header className="flex items-center gap-3 mb-3">
        <button onClick={back} aria-label="Back" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900 truncate">{dimInfo.icon} {title}</h1>
          <p className="text-[11px] text-lma-slate-500 font-medium truncate">{subtitle}</p>
        </div>
        <button onClick={()=>load()} disabled={loading||!ready} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {!ready ? <div className="text-center text-sm text-lma-slate-500 py-12">Loading…</div> : (<>
        {/* what to look at: everything, one bank, one tag, one library */}
        <div className="grid grid-cols-4 gap-1 bg-white rounded-xl p-1 shadow-sm mb-2">
          {DIMS.map(d=>(
            <button key={d.k} onClick={()=>pickDim(d.k)} className={`py-1.5 rounded-lg text-[11px] font-extrabold whitespace-nowrap ${dim===d.k?"bg-lma-slate-900 text-white":"text-lma-slate-600"}`}>{d.icon} {d.label}</button>
          ))}
        </div>

        {/* switch bank / tag / library without going back */}
        {dim!=="all"&&switchRows.length>0&&(
          <div className="flex gap-1.5 mb-2 overflow-x-auto -mx-4 px-4 pb-1">
            {switchRows.map(r=>(
              <button key={r.key} onClick={()=>setKey(r.key)} className={chipCls(activeKey===r.key)}>{keyLabel(r.key)} <span className="opacity-70">{short(r.net)}</span></button>
            ))}
          </div>
        )}
        {bankTags.length>0&&(
          <p className="text-[10px] font-medium text-lma-slate-500 mb-2">Tags routed here: {bankTags.map(t=>`${t.tag} (T+${t.days})`).join(", ")}</p>
        )}

        {/* library / branch filter (the library view uses the switcher above instead) */}
        {dim!=="library"&&(
          <div className="flex gap-1.5 mb-2 overflow-x-auto -mx-4 px-4 pb-1">
            {chips.map(c=>(
              <button key={c.code||"all"} onClick={()=>setScope(c.code)} style={scope===c.code&&c.color?{background:c.color,color:"#fff"}:undefined} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${scope===c.code&&!c.color?"bg-lma-slate-900 text-white":scope===c.code?"":"bg-white text-lma-slate-600"}`}>{c.emoji} {c.label}</button>
            ))}
          </div>
        )}

        <PeriodPicker value={period} onChange={setPeriod}/>

        {/* which date decides the day */}
        <div className="grid grid-cols-2 gap-1 bg-white rounded-xl p-1 shadow-sm mb-1">
          <button onClick={()=>setBasis("pay")} className={`py-1.5 rounded-lg text-[11px] font-extrabold ${basis==="pay"?"bg-lma-primary text-white":"text-lma-slate-600"}`}>By payment date</button>
          <button onClick={()=>setBasis("credit")} className={`py-1.5 rounded-lg text-[11px] font-extrabold ${basis==="credit"?"bg-lma-primary text-white":"text-lma-slate-600"}`}>By bank credit date</button>
        </div>
        <p className="text-[10px] text-lma-slate-500 mb-3">{basis==="pay"
          ?"Matches the Dashboard. Each day shows the money received that day."
          :"Each day is what should show as a credit in the bank statement: payment date + the tag's settlement days. Around Sundays and holidays the bank may credit a day later. Tap a day to see its entries."}</p>

        {err&&(
          <div className="bg-lma-danger/10 text-lma-danger rounded-xl px-3 py-2 mb-3 text-[12px] font-bold flex items-center justify-between gap-2">
            <span>{err}</span><button onClick={()=>load()} className="shrink-0 underline">Retry</button>
          </div>
        )}

        {!fresh&&loading&&<div className="text-center text-sm text-lma-slate-500 py-12">Loading…</div>}

        {fresh&&(
          <div className={loading?"opacity-50 pointer-events-none transition":"transition"}>
            {/* totals */}
            <div className="bg-gradient-to-br from-lma-primary to-lma-primary-2 rounded-2xl p-4 text-white shadow-md mb-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold opacity-80">{filtered?"Net (filtered)":"Net"}{basis==="credit"?" · by credit date":""}</span>
                <span className="text-[11px] font-bold opacity-80">{plural(tot.entries,"entry","entries")}{tot.receipts?` · ${plural(tot.receipts,"receipt","receipts")}`:""}</span>
              </div>
              <div className="text-3xl font-extrabold mt-0.5">{inrSigned(tot.net)}</div>
              <div className="text-[11px] opacity-80 mt-1">In {inr(tot.gross)} · Out {inr(tot.refund)}</div>
              {transit&&<div className="mt-2 text-[11px] font-bold bg-white/15 rounded-lg px-2 py-1">⏳ {inr(transit.amt)} received but not yet credited · lands by {dm(transit.last)}</div>}
            </div>

            {unassigned.length>0&&activeKey!=="—"&&(
              <button onClick={()=>setUnOnly(v=>!v)} className={`w-full text-left rounded-xl px-3 py-2 mb-2 text-[11px] font-bold ${unOnly?"bg-lma-danger text-white":"bg-lma-danger/10 text-lma-danger"}`}>
                ⚠ {plural(unassigned.length,"entry has","entries have")} no tag or bank ({inrSigned(unassignedSum)}). {unOnly?"Showing only these · tap to show all":"Tap to review and fix"}
              </button>
            )}

            {/* type chips */}
            <div className="flex gap-1.5 mb-2 overflow-x-auto -mx-4 px-4 pb-1">
              <button onClick={()=>setSrc("")} className={chipCls(!src)}>All <span className="opacity-70">{lines.length}</span></button>
              {SRC_ORDER.filter(s=>(typeCounts[s]||0)>0||src===s).map(s=>(
                <button key={s} onClick={()=>setSrc(src===s?"":s)} className={chipCls(src===s)}>{SRC_PLURAL[s]} <span className="opacity-70">{typeCounts[s]||0}</span></button>
              ))}
            </div>

            {/* bank view → by tag · other views → by bank */}
            {(subRows.length>1||!!sub)&&(
              <div className="flex gap-1.5 mb-2 overflow-x-auto -mx-4 px-4 pb-1 items-center">
                <span className="shrink-0 text-[10px] font-bold text-lma-slate-400">{subDim==="tag"?"Tags":"Banks"}</span>
                <button onClick={()=>setSub("")} className={chipCls(!sub)}>All</button>
                {subRows.map(r=>(
                  <button key={r.key} onClick={()=>setSub(sub===r.key?"":r.key)} className={chipCls(sub===r.key)}>{keyLabel(r.key)} <span className="opacity-70">{short(r.net)}</span></button>
                ))}
              </div>
            )}

            <SearchBar value={draft} onChange={v=>{ setDraft(v); if(!v) setSearch(""); }} onSearch={()=>setSearch(draft)} placeholder="Name, R-no, F-ID, reference or note…" hint=""/>

            {/* export / share the current (filtered) list */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button onClick={exportCsv} disabled={!shown.length} className="h-9 rounded-[10px] bg-white shadow-sm text-[11px] font-bold text-lma-slate-700 disabled:opacity-40">⬇ CSV</button>
              <button onClick={copySummary} disabled={!shown.length} className="h-9 rounded-[10px] bg-lma-primary/10 text-lma-primary text-[11px] font-bold disabled:opacity-40">Copy summary</button>
              <button onClick={shareWA} disabled={!shown.length} className="h-9 rounded-[10px] bg-lma-accent text-white text-[11px] font-bold disabled:opacity-40">WhatsApp</button>
            </div>

            {groups.length===0?(
              <div className="text-center text-sm text-lma-slate-500 py-10">{filtered?"No entries match these filters.":"No money entries in this period. Try a longer period or another library."}</div>
            ):(
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-lma-slate-500">{plural(groups.length,"day","days")} · {basis==="credit"?"by bank credit date":"by payment date"}</span>
                  <button onClick={()=>setAll(!allOpen)} className="text-[11px] font-bold text-lma-primary">{allOpen?"Collapse all":"Expand all"}</button>
                </div>
                <div className="space-y-2">
                  {pageGroups.map(g=>{
                    const open=isOpen(g.k);
                    const pending=basis==="credit"&&!!today&&!!g.k&&g.k>today;
                    return (
                      <div key={g.k||"none"} className="bg-white rounded-xl shadow-sm overflow-hidden">
                        <button onClick={()=>setOpenMap(m=>({...m,[g.k]:!open}))} className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-lma-slate-50">
                          <span className="text-lma-slate-400 text-[11px] w-3 shrink-0">{open?"▾":"▸"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-extrabold text-lma-slate-800">{basis==="credit"?"Credit · ":""}{g.k?dayHead(g.k):"No date"}</div>
                            <div className="text-[10px] text-lma-slate-500">
                              {plural(g.items.length,"entry","entries")}
                              {basis==="credit"&&g.payFrom?` · paid ${g.payFrom===g.payTo?dm(g.payFrom):`${dm(g.payFrom)} to ${dm(g.payTo)}`}`:""}
                              {g.out>0?` · in ${inr(g.inn)} · out ${inr(g.out)}`:""}
                              {pending?" · not yet credited":""}
                            </div>
                          </div>
                          <div className={`shrink-0 text-[13px] font-extrabold tabular-nums ${g.net<0?"text-lma-danger":"text-lma-slate-900"}`}>{inrSigned(g.net)}</div>
                        </button>
                        {open&&(
                          <div className="border-t border-lma-slate-100 divide-y divide-lma-slate-100">
                            {g.items.map((l,i)=><EntryRow key={`${l.src}-${l.ref}-${l.part}-${i}`} l={l} basis={basis} today={today} onOpen={()=>setDetail(l)}/>)}
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

      {detail&&<EntrySheet l={detail} today={today} onClose={()=>setDetail(null)} onOpenReceipt={setRcptNo}/>}
      {rcptNo&&<ReceiptModal receiptNo={rcptNo} onClose={()=>setRcptNo(null)} onSaved={()=>{ setDetail(null); load(); }}/>}
    </div>
  );
}

// ── one money entry ──
function EntryRow({ l, basis, today, onOpen }:{ l:Line; basis:Basis; today:string|null; onOpen:()=>void }){
  const title=l.src==="MISC"?(l.cat||"Misc income"):(l.name||l.sid||l.ref);
  const later=!!l.sday&&!!today&&l.sday>today;
  return (
    <button onClick={onOpen} className="w-full text-left px-3 py-2.5 flex items-start gap-2 active:bg-lma-slate-50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded ${SRC_TONE[l.src]}`}>{SRC_LABEL[l.src]}</span>
          <span className="text-[12px] font-bold text-lma-slate-900 truncate">{title}</span>
        </div>
        <div className="text-[10px] text-lma-slate-500 mt-1 flex items-center gap-x-1.5 gap-y-1 flex-wrap">
          <CodePill code={l.lib}/>
          <span className={!l.tag||!l.bank?"font-bold text-lma-danger":"font-bold text-lma-slate-600"}>{l.tag||"no tag"} → {l.bank||"no bank"}</span>
          {l.src==="RECEIPTS"&&<span>{l.ref}</span>}
          {l.src==="DUES"&&<span>{l.ref}{l.rno?` · for ${l.rno}`:""}</span>}
          {l.src==="REFUNDS"&&<span>{l.ref}{l.rno?` · of ${l.rno}`:""}</span>}
          {l.sid&&l.name&&<span>{l.sid}</span>}
          {l.parts>1&&<span>part {l.part} of {l.parts}</span>}
          {l.rtype&&<span>{l.rtype}</span>}
          {l.xlib&&<span className="font-bold">X-LIB</span>}
          {basis==="pay"&&l.dir==="IN"&&!!l.sday&&l.sday!==l.day&&<span className={later?"font-bold text-lma-warn":""}>{later?"credits":"credited"} {dm(l.sday)}</span>}
          {basis==="credit"&&<span>paid {dm(l.day)}</span>}
          {l.src==="MISC"&&l.note&&<span className="truncate max-w-full">{l.note}</span>}
        </div>
      </div>
      <div className={`shrink-0 text-[13px] font-extrabold tabular-nums ${l.dir==="OUT"?"text-lma-danger":"text-lma-slate-900"}`}>{l.dir==="OUT"?"−":"+"}{inr(l.amt)}</div>
    </button>
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
    <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-t-2xl p-4 pb-6 max-h-[85vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${SRC_TONE[l.src]}`}>{SRC_LABEL[l.src]}{l.dir==="OUT"?" · money out":" · money in"}</span>
            <div className={`text-2xl font-extrabold mt-1 ${l.dir==="OUT"?"text-lma-danger":"text-lma-slate-900"}`}>{l.dir==="OUT"?"−":"+"}{inr(l.amt)}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-full bg-lma-slate-100 text-lma-slate-600 font-bold">✕</button>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          {rows.map(([k,v])=>(
            <div key={k} className="contents">
              <span className="text-lma-slate-500">{k}</span>
              <span className="text-right font-bold text-lma-slate-800 break-words">{v}</span>
            </div>
          ))}
        </div>
        {l.rno?(
          <>
            <MoneyTrail key={l.rno} receiptNo={l.rno} autoOpen/>
            <button onClick={()=>onOpenReceipt(l.rno)} className="w-full mt-3 h-10 rounded-xl bg-lma-slate-900 text-white text-[12px] font-bold">Open receipt {l.rno} to correct</button>
            <p className="text-[10px] text-lma-slate-400 mt-1.5 text-center">Use this only to fix a wrong tag, bank, amount or date.</p>
          </>
        ):(
          <p className="text-[11px] text-lma-slate-500 mt-3">Misc entries are corrected on the Misc Income page.</p>
        )}
      </div>
    </div>
  );
}