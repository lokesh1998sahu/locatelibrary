"use client";

import WhatsAppButton from "../_components/WhatsAppButton";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useLMA } from "../_components/LMAProvider";
import { fmtDMY, toIsoInput, inDateRange } from "../_lib/dates";
import { parsePhone10 } from "../_lib/phone";
import StudentModal from "../_components/StudentModal";
import CodePill from "../_components/CodePill";
import SearchBar from "../_components/SearchBar";
import DateRangeFilter from "../_components/DateRangeFilter";
import Pager from "../_components/Pager";

const API = "/api/lma960805";
const PAGE_SIZE = 20;

// ── TYPES ─────────────────────────────────────────────────────────
interface PhoneEntry { number:string; tag:string; }
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
  const { init, showToast, post } = useLMA();
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
  const [confirm, setConfirm] = useState<{ msg:string; onYes:()=>void } | null>(null);

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
  const refreshAll = useCallback(async () => {
    await load();
    const c:CountsResp = await fetch(`${API}?action=getStudentCounts`).then(r => r.json());
    if (c.ok) setCounts(c);
  }, [load]);

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
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      {/* Header */}
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma960805" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Students</h1>
          {counts && <p className="text-[11px] text-lma-slate-500 font-medium">{counts.total} total · {counts.active} on app · {counts.past} past</p>}
        </div>
        <button onClick={()=>setModal({ kind:"add" })} className="px-3 py-2 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white text-xs font-bold shadow-md active:scale-95">+ Add</button>
      </header>

      {/* On-app/Past segmented control */}
      <div className="bg-white rounded-2xl p-1 flex gap-1 mb-2 shadow-sm">
        {(["ANY","FALSE","TRUE"] as PastFilter[]).map(f => (
          <button key={f} onClick={()=>setPastFilter(f)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${pastFilter===f?"bg-lma-slate-900 text-white":"text-lma-slate-500 hover:text-lma-slate-800"}`}>
            {f==="ANY"?"All":f==="FALSE"?"On App":"Past"}
          </button>
        ))}
      </div>

      {/* Library + Branch chip row (LOCKED RULE: branches appear alongside parent libraries) */}
      {init && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1">
          <Chip active={libFilter===""} onClick={()=>setLibFilter("")}>All Libraries <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${libFilter===""?"bg-white/25 text-white":"bg-lma-slate-100 text-lma-slate-500"}`}>{base.length}</span></Chip>
          {init.libraries.map(lib => (
            <span key={lib.library_code} className="contents">
              <Chip
                active={libFilter===lib.library_code}
                onClick={()=>setLibFilter(libFilter===lib.library_code?"":lib.library_code)}
                color={lib.color}
              >
                {lib.emoji} {lib.library_code} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${libFilter===lib.library_code?"bg-white/25 text-white":"bg-lma-slate-100 text-lma-slate-500"}`}>{studentCounts[lib.library_code]||0}</span>
              </Chip>
              {lib.has_branches && init.branches
                .filter(b => b.library_code === lib.library_code && b.active)
                .map(br => (
                  <Chip
                    key={br.branch_code}
                    active={libFilter===br.branch_code}
                    onClick={()=>setLibFilter(libFilter===br.branch_code?"":br.branch_code)}
                    color={br.color || lib.color}
                  >
                    {br.emoji || "·"} {br.branch_code} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${libFilter===br.branch_code?"bg-white/25 text-white":"bg-lma-slate-100 text-lma-slate-500"}`}>{studentCounts[br.branch_code]||0}</span>
                  </Chip>
                ))
              }
            </span>
          ))}
        </div>
      )}

      {/* Search + date range */}
      <SearchBar value={draft} onChange={setDraft} onSearch={()=>setSearch(draft)} searching={loading}/>
      <DateRangeFilter from={dFrom} to={dTo} onChange={(f,t)=>{setDFrom(f);setDTo(t);setPage(1);}} className="mt-2 mb-3"/>

      {/* List */}
      {loading && students.length === 0 ? (
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-lma-slate-500 py-8">
          {students.length === 0 ? "No students yet." : "No matches found."}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {shown.map(s => (
              <StudentCard
                key={`${s.library}-${s.student_id}`}
                student={s}
                librariesMap={init?.libraries || []}
                onTap={()=>setOpenStu({ id:s.student_id, library:s.library })}
              />
            ))}
          </div>
          <Pager page={page} totalPages={totalPages} onPage={setPage}/>
        </>
      )}

      {/* MODAL */}
      {modal && (
        <BottomSheet onClose={()=>setModal(null)}>
          {modal.kind === "add" && init && (
            <StudentForm
              libraries={init.libraries}
              branches={init.branches}
              onCancel={()=>setModal(null)}
              onSubmit={async (p)=>{
                const r = await post("addStudent", p);
                if (r) { setModal(null); showToast(`${r.student_id} added`); refreshAll(); }
              }}
            />
          )}
        </BottomSheet>
      )}

      {/* Shared student view/edit modal (universal) */}
      {openStu && (
        <StudentModal
          studentId={openStu.id}
          library={openStu.library}
          onClose={()=>setOpenStu(null)}
          onSaved={()=>refreshAll()}
          onDelete={()=>{
            const id=openStu.id, lib=openStu.library;
            setOpenStu(null);
            setConfirm({
              msg: `Delete ${id}? This cannot be undone.`,
              onYes: async () => { const r = await post("deleteStudent", { student_id:id, library:lib }); if (r) { showToast("Student deleted"); refreshAll(); } }
            });
          }}
        />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <BottomSheet onClose={()=>setConfirm(null)}>
          <p className="text-[15px] font-semibold text-lma-slate-800 leading-relaxed text-center mb-5">{confirm.msg}</p>
          <div className="flex gap-2.5">
            <button onClick={()=>setConfirm(null)} className="flex-1 py-3.5 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
            <button onClick={()=>{ confirm.onYes(); setConfirm(null); }} className="flex-1 py-3.5 rounded-xl bg-lma-danger text-white font-bold">Delete</button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────

function Chip({ active, onClick, color, children }:{ active:boolean; onClick:()=>void; color?:string; children:React.ReactNode }) {
  const style = active && color ? { background: color, color: "#fff" } : undefined;
  return (
    <button
      onClick={onClick}
      style={style}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${active && !color ? "bg-lma-slate-900 text-white" : active ? "" : "bg-white text-lma-slate-600 hover:bg-lma-slate-100"} shadow-sm`}
    >
      {children}
    </button>
  );
}

function StudentCard({ student, librariesMap, onTap }:{ student:Student; librariesMap:Library[]; onTap:()=>void }) {
  const lib = librariesMap.find(l => l.library_code === student.library);
  const primaryPhone = student.phones[0];
  return (
    <div className="flex items-stretch gap-1 bg-white rounded-2xl shadow-sm hover:shadow-md transition">
      <button onClick={onTap} className="flex-1 min-w-0 text-left p-3 active:scale-[0.99]">
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 font-extrabold" style={lib?.color ? { background: lib.color+"22", color: lib.color } : { background:"#e2e8f0" }}>
            {lib?.emoji || "📚"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-extrabold text-lma-slate-900">{student.student_id}</span>
              {student.is_past && <span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded">PAST</span>}
              <span className="text-[10px] font-bold text-lma-slate-400 ml-auto"><CodePill code={student.branch||student.library}/></span>
            </div>
            <div className="text-sm font-semibold text-lma-slate-800 truncate">{student.name}</div>
            {primaryPhone && (
              <div className="text-[11px] text-lma-slate-500 font-mono mt-0.5">📱 {primaryPhone.number}{primaryPhone.tag && primaryPhone.tag !== "SELF" ? ` (${primaryPhone.tag})` : ""}</div>
            )}
          </div>
        </div>
      </button>
      <div className="flex items-center pr-2 shrink-0"><WhatsAppButton phones={student.phones} className="px-2.5 py-2 rounded-lg bg-lma-accent/10 text-lma-accent font-bold text-xs disabled:opacity-40"/></div>
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
      <select value={f.library} onChange={e=>setF({...f, library:e.target.value, branch:""})} disabled={isEdit} required className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium mb-3">
        {libraries.filter(l=>l.active).map(l => <option key={l.library_code} value={l.library_code}>{l.emoji} {l.library_code} — {l.display_name}</option>)}
      </select>

      {hasBranches && (
        <>
          <Label>Branch *</Label>
          <select value={f.branch} onChange={e=>setF({...f, branch:e.target.value})} required className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium mb-3">
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
            }} placeholder={i===0?"Primary phone":`Phone ${i+1}`} className="flex-1 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
            <input value={ph.tag} onChange={e=>{
              const next = [...f.phones]; next[i] = { ...next[i], tag: e.target.value.toUpperCase() }; setF({...f, phones: next});
            }} placeholder="TAG" className="w-24 px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium uppercase"/>
          </div>
        ))}
        <p className="text-[10px] text-lma-slate-500">Tag examples: SELF (default, leave blank), FATHER, MOTHER, GUARDIAN</p>
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
          <Input type="date" value={toIsoInput(f.date_of_birth)} onChange={e=>setF({...f, date_of_birth:e.target.value})}/>{f.date_of_birth && <span className="block text-[10px] font-bold text-lma-slate-500 mt-1">{fmtDMY(f.date_of_birth)}</span>}
        </div>
      </div>

      {!isEdit ? (
        <label className="flex items-center gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={f.is_past} onChange={e=>setF({...f, is_past:e.target.checked})} className="w-4 h-4 accent-lma-primary"/>
          <span className="text-sm font-semibold text-lma-slate-700">Past student (pre-app era)</span>
        </label>
      ) : (
        <div className="mt-4 flex items-center gap-2 text-xs text-lma-slate-500">
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        {children}
      </div>
    </div>
  );
}

function FormTitle({ children }:{ children:React.ReactNode }) {
  return <h3 className="text-base font-extrabold text-lma-slate-900 mb-4">{children}</h3>;
}
function Label({ children }:{ children:React.ReactNode }) {
  return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium mb-3"/>;
}
function FormActions({ onCancel, submitLabel="Save" }:{ onCancel:()=>void; submitLabel?:string }) {
  return (
    <div className="flex gap-2.5 mt-5">
      <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
      <button type="submit" className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">{submitLabel}</button>
    </div>
  );
}