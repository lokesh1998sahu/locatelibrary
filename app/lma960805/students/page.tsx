"use client";

import WhatsAppButton from "../_components/WhatsAppButton";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { fmtDMY, toIsoInput, inDateRange } from "../_lib/dates";
import { parsePhone10 } from "../_lib/phone";
import StudentModal from "../_components/StudentModal";
import SearchBar from "../_components/SearchBar";
import DateRangeFilter from "../_components/DateRangeFilter";
import Pager from "../_components/Pager";
import { Screen, Card, Segmented, ScopeChips, Button, Skeleton, Empty, IconButton, cx } from "../_ui/kit";
import { IconRefresh, IconUsers, IconPlus } from "../_ui/icons";

const API = "/api/lma960805";
const PAGE_SIZE = 20;

// ── TYPES ─────────────────────────────────────────────────────────
interface PhoneEntry { number:string; tag:string; }
interface SeatNow { receipt_no:string; seat_no:string; temporary_seat:string; shift:string; shift_name:string; booking_to:string; days_left:number|null; at:string }
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDM = (ymd:string) => { const p = ymd.split("-"); return p.length===3 ? `${+p[2]}-${MON[+p[1]-1]}` : ymd; };
const seatKey = (s:{student_id:string;library:string;branch:string}) => `${s.student_id.toUpperCase().split("-")[0]}|${(s.branch||s.library).toUpperCase()}`;
interface Student   {
  s_no?:number; student_id:string; library:string; branch:string; name:string;
  phones:PhoneEntry[]; added_on:string;
  address:string; preparing_for:string; aadhaar_last4:string; date_of_birth:string;
  is_past:boolean;
}
interface Library   { library_code:string; library_name?:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch    { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface CountsResp{ ok:boolean; total:number; active:number; past:number; byLibrary:Record<string,{total:number; active:number; past:number}>; }

type PastFilter  = "ANY"|"FALSE"|"TRUE";

// ── AUTO-DETECT SEARCH TYPE ───────────────────────────────────────
function autoDetectSearchType(q:string): "NAME"|"PHONE"|"STUDENT_ID" {
  const trimmed = q.trim();
  if (!trimmed) return "NAME";
  const phoneStripped = trimmed.replace(/[\s\-\.\(\)\+]/g, "");
  if (/^\d{3,}$/.test(phoneStripped)) return "PHONE";
  if (/^F\d+/i.test(trimmed)) return "STUDENT_ID";
  return "NAME";
}

// ── PAGE ──────────────────────────────────────────────────────────
export default function LmaStudentsPage() {
  const { init, showToast, post, confirm: ask } = useLMA();
  const chips = useScopeChips();
  const [counts, setCounts] = useState<CountsResp|null>(null);
  const [students, setStudents] = useState<Student[]>([]);   // ALL students for current library scope
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [pastFilter, setPastFilter] = useState<PastFilter>("ANY");
  const [libFilter, setLibFilter]   = useState<string>("");      // "" = all (server scope)
  const [draft, setDraft]           = useState("");
  const [search, setSearch]         = useState("");
  const [dFrom, setDFrom] = useState(""); const [dTo, setDTo] = useState("");

  // Modal
  const [modal, setModal] = useState<{ kind:"add" } | null>(null);
  const [openStu, setOpenStu] = useState<{ id:string; library:string } | null>(null);

  // ── Load counts (global, for header summary) ──
  useEffect(() => {
    fetch(`${API}?action=getStudentCounts`).then(r => r.json()).then((r:CountsResp) => { if (r.ok) setCounts(r); });
  }, []);

  // ── Load ALL students for the scope (library = server; past/search/date = client) ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action:"getAllStudents", all:"1", is_past:"ANY" });
      // B4: load all scopes; filter client-side
      const res = await fetch(`${API}?${params}`).then(r => r.json());
      if (!res.ok) { showToast(res.error || "Load failed", "error"); return; }
      setStudents(res.students || []); setPage(1);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [pastFilter, search, dFrom, dTo, libFilter]);

  // After save/delete: refetch + refresh counts
  // where each student sits now — one small request, keyed "<id>|<home library/branch>"
  const [seats, setSeats] = useState<Record<string, SeatNow[]>>({});
  const loadSeats = useCallback(async () => {
    try { const r = await fetch(`${API}?action=getStudentCurrentSeats`).then(x => x.json()); if (r && r.ok) setSeats(r.seats || {}); } catch { /* cards just show no seat line */ }
  }, []);
  useEffect(() => { loadSeats(); }, [loadSeats]);

  const refreshAll = useCallback(async () => {
    await load();
    loadSeats();
    const c:CountsResp = await fetch(`${API}?action=getStudentCounts`).then(r => r.json());
    if (c.ok) setCounts(c);
  }, [load, loadSeats]);

  // client search (PHONE searches within phones[])
  const matchesStudent = useCallback((s:Student, q:string):boolean => {
    const t = q.trim(); if (!t) return true;
    const typ = autoDetectSearchType(t); const Q = t.toUpperCase();
    if (typ === "STUDENT_ID") return String(s.student_id||"").toUpperCase().includes(Q);
    if (typ === "PHONE") { const d = parsePhone10(t); return (s.phones||[]).some(p => parsePhone10(String(p.number||"")).includes(d)); }
    return String(s.name||"").toUpperCase().includes(Q);
  }, []);

  const base = useMemo(() => students.filter(s => {
    if (pastFilter === "TRUE"  && !s.is_past) return false;
    if (pastFilter === "FALSE" &&  s.is_past) return false;
    return matchesStudent(s, search) && inDateRange(s.added_on, dFrom, dTo);
  }), [students, pastFilter, search, dFrom, dTo, matchesStudent]);

  const studentCounts = useMemo(()=>{ const m:Record<string,number>={}; base.forEach(s=>{ if(s.library) m[s.library]=(m[s.library]||0)+1; if(s.branch && s.branch!==s.library) m[s.branch]=(m[s.branch]||0)+1; }); return m; }, [base]);
  const filtered = useMemo(()=> libFilter ? base.filter(s=>s.library===libFilter || s.branch===libFilter) : base, [base, libFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  return (
    <Screen>
      <header className="flex items-start gap-2 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Students</h1>
          <p className="mt-0.5 text-[12.5px] text-lma-ink-3">{counts?`${counts.total} total · ${counts.active} on app · ${counts.past} past`:"Everyone registered, by library"}</p>
        </div>
        <IconButton label="Refresh" onClick={refreshAll} className="-mr-2"><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>
      </header>

      <Button size="lg" full className="mb-3" onClick={()=>setModal({ kind:"add" })}><IconPlus size={18}/> Add student</Button>

      <Segmented className="mb-3" value={pastFilter} onChange={v=>setPastFilter(v as PastFilter)}
        options={[{v:"ANY",label:"All"},{v:"FALSE",label:"On app"},{v:"TRUE",label:"Past"}]}/>

      {init&&<ScopeChips chips={chips} value={libFilter} onChange={setLibFilter} counts={{ "":base.length, ...studentCounts }}/>}

      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      <DateRangeFilter from={dFrom} to={dTo} onChange={(f,t)=>{setDFrom(f);setDTo(t);setPage(1);}} className="mb-3"/>

      {loading && students.length === 0 ? (
        <div className="space-y-2">{[0,1,2,3].map(i=><Card key={i}><Skeleton className="h-4 w-40"/><Skeleton className="mt-2 h-3 w-28"/></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card><Empty icon={<IconUsers size={22}/>} title={students.length === 0 ? "No students yet" : "No matches found"}
          body={students.length === 0 ? "Add one here, or they are added automatically when you book a new admission." : undefined}/></Card>
      ) : (
        <>
          <div className="space-y-2">
            {shown.map(s => (
              <StudentCard key={`${s.library}-${s.student_id}`} student={s} librariesMap={init?.libraries || []} now={seats[seatKey(s)] || []}
                onTap={()=>setOpenStu({ id:s.student_id, library:s.library })}/>
            ))}
          </div>
          <Pager page={page} totalPages={totalPages} onPage={setPage}/>
        </>
      )}

      {modal && (
        <BottomSheet onClose={()=>setModal(null)}>
          {modal.kind === "add" && init && (
            <StudentForm libraries={init.libraries} branches={init.branches} onCancel={()=>setModal(null)}
              onSubmit={async (p)=>{
                const r = await post("addStudent", p);
                if (r) { setModal(null); showToast(`${r.student_id} added`); refreshAll(); }
              }}/>
          )}
        </BottomSheet>
      )}

      {openStu && (
        <StudentModal studentId={openStu.id} library={openStu.library} onClose={()=>setOpenStu(null)} onSaved={()=>refreshAll()}
          onDelete={async ()=>{
            const id=openStu.id, lib=openStu.library;
            setOpenStu(null);
            if(!(await ask({ title:`Delete ${id}?`, body:"This removes the student record and can’t be undone.", confirmLabel:"Delete student", danger:true }))) return;
            const r = await post("deleteStudent", { student_id:id, library:lib });
            if (r) { showToast("Student deleted"); refreshAll(); }
          }}/>
      )}
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────


function StudentCard({ student, librariesMap, onTap, now }:{ student:Student; librariesMap:Library[]; onTap:()=>void; now:SeatNow[] }) {
  const lib = librariesMap.find(l => l.library_code === student.library);
  const primaryPhone = student.phones[0];
  return (
    <div className="flex overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
      <button type="button" onClick={onTap} className="lma-noscale flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left active:bg-lma-bg">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-[18px]"
          style={lib?.color ? { background: lib.color+"1f", color: lib.color } : { background:"#eef0f6" }}>{lib?.emoji || "📚"}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-semibold leading-snug text-lma-ink">{student.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-lma-ink-3">
            <span className="font-lma-mono font-semibold text-lma-ink-2">{student.student_id}</span>
            <span aria-hidden="true">·</span><span className="font-semibold">{student.branch||student.library}</span>
            {primaryPhone&&<><span aria-hidden="true">·</span><span className="font-lma-mono">{primaryPhone.number}{primaryPhone.tag && primaryPhone.tag !== "SELF" ? ` (${primaryPhone.tag})` : ""}</span></>}
          </span>
          {now.length>0&&(()=>{ const b=now[0]; const d=b.days_left;
            const tone=d===null?"text-lma-ink-2":d<0?"text-lma-out":d<=3?"text-lma-warn-2":"text-lma-in";
            const when=d===null?"":d<0?`expired ${-d}d ago`:d===0?"ends today":`till ${fmtDM(b.booking_to)}`;
            const home=(student.branch||student.library).toUpperCase();
            return (
              <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px]">
                <span className="rounded-md bg-lma-brand-soft px-1.5 py-px font-semibold text-lma-brand">{b.temporary_seat?`Floating · was ${b.temporary_seat}`:b.seat_no?`Seat ${b.seat_no}`:"No seat"}</span>
                <span className="text-lma-ink-2">{b.shift_name||b.shift}</span>
                {when&&<span className={`font-semibold ${tone}`}>{when}</span>}
                {b.at&&b.at!==home&&<span className="font-semibold text-[#7c3aed]">at {b.at}</span>}
                {now.length>1&&<span className="text-lma-ink-3">+{now.length-1} more</span>}
              </span>
            ); })()}
        </span>
        {student.is_past && <span className="shrink-0 rounded-md bg-lma-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-lma-warn-2">Past</span>}
      </button>
      <div className="flex shrink-0 items-center pr-3">
        <WhatsAppButton phones={student.phones} chat label="WhatsApp" className="h-9 rounded-full bg-[#e3f6ec] px-3 text-[12.5px] font-semibold text-[#0b7a52] ring-1 ring-inset ring-[#c6ecd8] disabled:opacity-40"/>
      </div>
    </div>
  );
}

function StudentForm({ libraries, branches, initial, onCancel, onSubmit }:{ libraries:Library[]; branches:Branch[]; initial?:Student; onCancel:()=>void; onSubmit:(p:any)=>void }) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    student_id: initial?.student_id || "",
    library: initial?.library || libraries[0]?.library_code || "",
    branch: initial?.branch || "",
    name: initial?.name || "",
    phones: initial?.phones && initial.phones.length > 0
      ? [...initial.phones, ...Array(4 - initial.phones.length).fill({ number:"", tag:"" })].slice(0,4)
      : [{ number:"", tag:"" },{ number:"", tag:"" },{ number:"", tag:"" },{ number:"", tag:"" }],
    address: initial?.address || "",
    preparing_for: initial?.preparing_for || "",
    aadhaar_last4: initial?.aadhaar_last4 || "",
    date_of_birth: initial?.date_of_birth || "",
    is_past: initial?.is_past || false,
  });

  const selectedLib = libraries.find(l => l.library_code === f.library);
  const hasBranches = selectedLib?.has_branches || false;
  const availableBranches = branches.filter(b => b.library_code === f.library && b.active);

  return (
    <form onSubmit={e=>{
      e.preventDefault();
      onSubmit({
        student_id: f.student_id || undefined, // empty = auto-generate
        library: f.library,
        branch: hasBranches ? f.branch : "",
        has_branches: hasBranches,
        name: f.name,
        phones: f.phones.filter(p => p.number),
        address: f.address,
        preparing_for: f.preparing_for,
        aadhaar_last4: f.aadhaar_last4,
        date_of_birth: f.date_of_birth,
        ...(isEdit ? {} : { is_past: f.is_past }),
      });
    }}>
      <FormTitle>{isEdit?`Edit Student`:"Add Student"}</FormTitle>

      <Label>Library *</Label>
      <select value={f.library} onChange={e=>setF({...f, library:e.target.value, branch:""})} disabled={isEdit} required className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand mb-3">
        {libraries.filter(l=>l.active).map(l => <option key={l.library_code} value={l.library_code}>{l.emoji} {l.library_code} — {l.display_name}</option>)}
      </select>

      {hasBranches && (
        <>
          <Label>Branch *</Label>
          <select value={f.branch} onChange={e=>setF({...f, branch:e.target.value})} required className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand mb-3">
            <option value="">Select branch…</option>
            {availableBranches.map(b => <option key={b.branch_code} value={b.branch_code}>{b.branch_code} — {b.branch_display}</option>)}
          </select>
        </>
      )}

      {!isEdit && (
        <>
          <Label>Student ID (leave blank to auto-generate)</Label>
          <Input value={f.student_id} onChange={e=>setF({...f, student_id:e.target.value.toUpperCase()})} placeholder="F316 (or blank for next available)"/>
        </>
      )}

      <Label>Name *</Label>
      <Input value={f.name} onChange={e=>setF({...f, name:e.target.value})} required/>

      <Label>Phones</Label>
      <div className="space-y-2 mb-3">
        {f.phones.map((ph, i) => (
          <div key={i} className="flex gap-2">
            <input type="tel" inputMode="numeric" value={ph.number} onChange={e=>{
              const next = [...f.phones]; next[i] = { ...next[i], number: parsePhone10(e.target.value) }; setF({...f, phones: next});
            }} placeholder={i===0?"Primary phone":`Phone ${i+1}`} className="flex-1 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"/>
            <input value={ph.tag} onChange={e=>{
              const next = [...f.phones]; next[i] = { ...next[i], tag: e.target.value.toUpperCase() }; setF({...f, phones: next});
            }} placeholder="TAG" className="w-24 h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand uppercase"/>
          </div>
        ))}
        <p className="text-[10px] text-lma-ink-3">Tag examples: SELF (default, leave blank), FATHER, MOTHER, GUARDIAN</p>
      </div>

      <Label>Address</Label>
      <Input value={f.address} onChange={e=>setF({...f, address:e.target.value})}/>
      <Label>Preparing For</Label>
      <Input value={f.preparing_for} onChange={e=>setF({...f, preparing_for:e.target.value})} placeholder="NEET, JEE, UPSC..."/>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <Label>Aadhaar (last 4)</Label>
          <Input value={f.aadhaar_last4} onChange={e=>setF({...f, aadhaar_last4:e.target.value.replace(/\D/g,"").slice(0,4)})} placeholder="1234" maxLength={4}/>
        </div>
        <div>
          <Label>Date of Birth</Label>
          <Input type="date" value={toIsoInput(f.date_of_birth)} onChange={e=>setF({...f, date_of_birth:e.target.value})}/>{f.date_of_birth && <span className="block text-[10px] font-bold text-lma-ink-3 mt-1">{fmtDMY(f.date_of_birth)}</span>}
        </div>
      </div>

      {!isEdit ? (
        <label className="flex items-center gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={f.is_past} onChange={e=>setF({...f, is_past:e.target.checked})} className="w-4 h-4 accent-lma-primary"/>
          <span className="text-sm font-semibold text-lma-ink-2">Past student (pre-app era)</span>
        </label>
      ) : (
        <div className="mt-4 flex items-center gap-2 text-xs text-lma-ink-3">
          <span className={`text-[10px] font-bold px-2 py-1 rounded ${initial!.is_past?"bg-lma-warn/10 text-lma-warn":"bg-lma-accent/10 text-lma-accent"}`}>
            {initial!.is_past ? "PAST STUDENT" : "ON APP"}
          </span>
          <span>This flag is set once and cannot be changed.</span>
        </div>
      )}

      <FormActions onCancel={onCancel} submitLabel={isEdit?"Save":"Add"}/>
    </form>
  );
}

function BottomSheet({ onClose, children }:{ onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
      <div role="dialog" aria-modal="true" className="lma-sheet-up relative w-full max-w-[560px] max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lma-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-lma-float" onClick={e=>e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#dfe1ee]"/>
        {children}
      </div>
    </div>
  );
}

function FormTitle({ children }:{ children:React.ReactNode }) {
  return <h3 className="mb-3 text-[18px] font-bold tracking-[-0.01em] text-lma-ink">{children}</h3>;
}
function Label({ children }:{ children:React.ReactNode }) {
  return <label className="mb-1.5 mt-3 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none placeholder:text-lma-ink-3 focus:border-lma-brand"/>;
}
function FormActions({ onCancel, submitLabel="Save" }:{ onCancel:()=>void; submitLabel?:string }) {
  return (
    <div className="flex gap-2.5 mt-5">
      <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-[14px] bg-lma-surface text-[15px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Cancel</button>
      <button type="submit" className="lma-glass-btn h-12 flex-1 rounded-[14px] text-[15px] font-bold text-white">{submitLabel}</button>
    </div>
  );
}