"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useLMA } from "../layout";

const API = "/api/lma";
const PAGE_SIZE = 50;

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
interface AllResp   { ok:boolean; students:Student[]; total:number; page:number; totalPages:number; limit:number; }
interface SearchResp{ ok:boolean; results:Student[]; }
interface CountsResp{ ok:boolean; total:number; active:number; past:number; byLibrary:Record<string,{total:number; active:number; past:number}>; }

type Toast       = { msg:string; type:"success"|"error" } | null;
type PastFilter  = "ANY"|"FALSE"|"TRUE";
type SearchType  = "AUTO"|"NAME"|"PHONE"|"STUDENT_ID";

// ── AUTO-DETECT SEARCH TYPE ───────────────────────────────────────
function autoDetectSearchType(q:string): "NAME"|"PHONE"|"STUDENT_ID" {
  const trimmed = q.trim();
  if (!trimmed) return "NAME";
  // Strip phone-formatting characters
  const phoneStripped = trimmed.replace(/[\s\-\.\(\)\+]/g, "");
  // All-digits (after stripping) = phone
  if (/^\d{3,}$/.test(phoneStripped)) return "PHONE";
  // Starts with F + digits = student_id (your scheme: F316, F458, etc.)
  if (/^F\d+/i.test(trimmed)) return "STUDENT_ID";
  // Default: name
  return "NAME";
}

// ── PAGE ──────────────────────────────────────────────────────────
export default function LmaStudentsPage() {
  const { init } = useLMA();
  const [counts, setCounts] = useState<CountsResp|null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Filters
  const [pastFilter, setPastFilter] = useState<PastFilter>("ANY");
  const [libFilter, setLibFilter]   = useState<string>("");      // "" = all
  const [search, setSearch]         = useState("");

  // Modal
  const [modal, setModal] = useState<{ kind:"add"|"edit"|"view"; student?:Student } | null>(null);
  const [confirm, setConfirm] = useState<{ msg:string; onYes:()=>void } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Toast ──
  const showToast = useCallback((msg:string, type:"success"|"error"="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Generic POST wrapper ──
  const inflightRef = useRef<Set<string>>(new Set());
  const post = useCallback(async (action:string, payload:any) => {
    const _k=action+"|"+JSON.stringify(payload);
    if(inflightRef.current.has(_k)) return null;
    inflightRef.current.add(_k);
    try{
    try {
      const res = await fetch(API, {
        method:"POST",
        headers:{ "Content-Type":"text/plain;charset=utf-8" },
        body: JSON.stringify({ action, payload }),
      }).then(r => r.json());
      if (!res.ok) { showToast(res.error || "Operation failed", "error"); return null; }
      return res;
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
      return null;
    }
    } finally { inflightRef.current.delete(_k); }
  }, [showToast]);

  // ── Load counts (init comes from context) ──
  useEffect(() => {
    fetch(`${API}?action=getStudentCounts`).then(r => r.json()).then((r:CountsResp) => { if (r.ok) setCounts(r); });
  }, []);

  // ── Build & fetch student list ──
  const fetchPage = useCallback(async (pageNum:number, append:boolean) => {
    setLoading(true);
    try {
      const trimmed = search.trim();
      let url:string;
      if (trimmed.length >= 2) {
        const detected = autoDetectSearchType(trimmed);
        const params = new URLSearchParams({
          action: "searchStudents",
          q: trimmed,
          search_type: detected,
          is_past: pastFilter,
        });
        if (libFilter) params.set("library", libFilter);
        url = `${API}?${params.toString()}`;
      } else {
        const params = new URLSearchParams({
          action: "getAllStudents",
          is_past: pastFilter,
          page: String(pageNum),
          limit: String(PAGE_SIZE),
        });
        if (libFilter) params.set("library", libFilter);
        url = `${API}?${params.toString()}`;
      }

      const res = await fetch(url).then(r => r.json());
      if (!res.ok) { showToast(res.error || "Load failed", "error"); return; }

      // Normalize response shape: search uses .results, getAll uses .students
      const list:Student[] = res.results || res.students || [];
      if (append) setStudents(prev => [...prev, ...list]);
      else setStudents(list);

      // hasMore only meaningful for paginated browse
      if (res.totalPages) setHasMore(pageNum < res.totalPages);
      else setHasMore(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally { setLoading(false); }
  }, [search, pastFilter, libFilter, showToast]);

  // ── Refetch when filters change (debounced for search) ──
  useEffect(() => {
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = search.trim().length >= 2 ? 300 : 0;
    debounceRef.current = setTimeout(() => { fetchPage(1, false); }, delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, pastFilter, libFilter, fetchPage]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  };

  // After save/delete: refetch + refresh counts
  const refreshAll = useCallback(async () => {
    setPage(1);
    await fetchPage(1, false);
    const c:CountsResp = await fetch(`${API}?action=getStudentCounts`).then(r => r.json());
    if (c.ok) setCounts(c);
  }, [fetchPage]);

  const totalShown = students.length;
  const isSearching = search.trim().length >= 2;
  const detectedType = isSearching ? autoDetectSearchType(search) : null;

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      {/* Header */}
      <header className="flex items-center gap-3 mb-3">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
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
          <Chip active={libFilter===""} onClick={()=>setLibFilter("")}>All Libraries</Chip>
          {init.libraries.map(lib => (
            <span key={lib.library_code} className="contents">
              <Chip
                active={libFilter===lib.library_code}
                onClick={()=>setLibFilter(libFilter===lib.library_code?"":lib.library_code)}
                color={lib.color}
              >
                {lib.emoji} {lib.library_code}
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
                    {br.emoji || "·"} {br.branch_code}
                  </Chip>
                ))
              }
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <input
          type="text"
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Search name, phone, F-ID..."
          className="w-full px-4 py-3 pr-20 rounded-xl border-[1.5px] border-lma-slate-200 bg-white focus:border-lma-primary outline-none text-sm font-medium"
        />
        {detectedType && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-lma-primary bg-lma-primary/10 px-1.5 py-0.5 rounded">
            {detectedType}
          </span>
        )}
      </div>

      {/* List */}
      {loading && students.length === 0 ? (
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ) : students.length === 0 ? (
        <div className="text-center text-sm text-lma-slate-500 py-8">
          {isSearching ? "No matches found." : "No students yet."}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {students.map(s => (
              <StudentCard
                key={`${s.library}-${s.student_id}`}
                student={s}
                librariesMap={init?.libraries || []}
                onTap={()=>setModal({ kind:"view", student:s })}
              />
            ))}
          </div>

          {/* Load more (only when not searching) */}
          {!isSearching && hasMore && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full mt-3 py-3 rounded-xl bg-white border-[1.5px] border-lma-slate-200 text-lma-slate-700 font-bold text-sm shadow-sm hover:bg-lma-slate-50 disabled:opacity-50 active:scale-[0.99]"
            >
              {loading ? "Loading…" : `Load more (${totalShown} shown)`}
            </button>
          )}

          {!isSearching && !hasMore && totalShown > 0 && (
            <p className="text-center text-[11px] text-lma-slate-400 mt-3">All {totalShown} loaded</p>
          )}
        </>
      )}

      {/* MODAL */}
      {modal && (
        <BottomSheet onClose={()=>setModal(null)}>
          {modal.kind === "view" && modal.student && (
            <StudentDetail
              student={modal.student}
              librariesMap={init?.libraries || []}
              branchesMap={init?.branches || []}
              onEdit={()=>setModal({ kind:"edit", student: modal.student })}
              onDelete={()=>{
                setConfirm({
                  msg: `Delete ${modal.student!.student_id} — ${modal.student!.name}? This cannot be undone.`,
                  onYes: async () => {
                    const r = await post("deleteStudent", { student_id: modal.student!.student_id, library: modal.student!.library });
                    if (r) { setModal(null); showToast("Student deleted"); refreshAll(); }
                  }
                });
              }}
              onClose={()=>setModal(null)}
            />
          )}
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
          {modal.kind === "edit" && modal.student && init && (
            <StudentForm
              libraries={init.libraries}
              branches={init.branches}
              initial={modal.student}
              onCancel={()=>setModal(null)}
              onSubmit={async (p)=>{
                const r = await post("updateStudent", { ...p, student_id: modal.student!.student_id, library: modal.student!.library });
                if (r) { setModal(null); showToast("Updated"); refreshAll(); }
              }}
            />
          )}
        </BottomSheet>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-lg z-[9999] lma-slide-up ${toast.type==="success"?"bg-lma-accent":"bg-lma-danger"}`}>
          {toast.type==="success"?"✓ ":"✕ "}{toast.msg}
        </div>
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
    <button
      onClick={onTap}
      className="w-full text-left bg-white rounded-2xl p-3 shadow-sm hover:shadow-md transition active:scale-[0.99]"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 font-extrabold" style={lib?.color ? { background: lib.color+"22", color: lib.color } : { background:"#e2e8f0" }}>
          {lib?.emoji || "📚"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold text-lma-slate-900">{student.student_id}</span>
            {student.is_past && <span className="text-[9px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded">PAST</span>}
            <span className="text-[10px] font-bold text-lma-slate-400 ml-auto">{student.library}{student.branch?`/${student.branch}`:""}</span>
          </div>
          <div className="text-sm font-semibold text-lma-slate-800 truncate">{student.name}</div>
          {primaryPhone && (
            <div className="text-[11px] text-lma-slate-500 font-mono mt-0.5">📱 {primaryPhone.number}{primaryPhone.tag && primaryPhone.tag !== "SELF" ? ` (${primaryPhone.tag})` : ""}</div>
          )}
        </div>
      </div>
    </button>
  );
}

function StudentDetail({ student, librariesMap, branchesMap, onEdit, onDelete, onClose }:{ student:Student; librariesMap:Library[]; branchesMap:Branch[]; onEdit:()=>void; onDelete:()=>void; onClose:()=>void }) {
  const lib = librariesMap.find(l => l.library_code === student.library);
  const branch = branchesMap.find(b => b.branch_code === student.branch);
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-extrabold" style={lib?.color ? { background: lib.color+"22", color: lib.color } : { background:"#e2e8f0" }}>
          {lib?.emoji || "📚"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-extrabold text-lma-slate-900">{student.student_id}</h3>
            {student.is_past && <span className="text-[10px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded">PAST</span>}
          </div>
          <div className="text-sm font-semibold text-lma-slate-700">{student.name}</div>
          <div className="text-[11px] text-lma-slate-500">{lib?.display_name}{branch?` · ${branch.branch_display}`:""}</div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {student.phones.filter(p=>p.number).length > 0 && (
          <DetailRow label="Phones">
            <div className="space-y-0.5">
              {student.phones.filter(p=>p.number).map((p,i) => (
                <div key={i} className="text-sm text-lma-slate-800 font-mono">📱 {p.number}{p.tag && p.tag !== "SELF" ? <span className="ml-1.5 text-[10px] text-lma-slate-500 font-sans font-bold">({p.tag})</span> : null}</div>
              ))}
            </div>
          </DetailRow>
        )}
        {student.address && <DetailRow label="Address">{student.address}</DetailRow>}
        {student.preparing_for && <DetailRow label="Preparing For">{student.preparing_for}</DetailRow>}
        {student.aadhaar_last4 && <DetailRow label="Aadhaar (last 4)">●●●●-{student.aadhaar_last4}</DetailRow>}
        {student.date_of_birth && <DetailRow label="DOB">{student.date_of_birth}</DetailRow>}
        {student.added_on && <DetailRow label="Added">{student.added_on}</DetailRow>}
      </div>

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold text-sm">Close</button>
        <button onClick={onDelete} className="px-4 py-3 rounded-xl bg-lma-danger/10 text-lma-danger font-bold text-sm">Delete</button>
        <button onClick={onEdit} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-sm shadow-md">Edit</button>
      </div>
    </div>
  );
}

function DetailRow({ label, children }:{ label:string; children:React.ReactNode }) {
  return (
    <div className="bg-lma-slate-50 rounded-xl px-3 py-2">
      <div className="text-[10px] font-bold text-lma-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-lma-slate-800 font-medium mt-0.5">{children}</div>
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
              const next = [...f.phones]; next[i] = { ...next[i], number: e.target.value }; setF({...f, phones: next});
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
          <Input value={f.date_of_birth} onChange={e=>setF({...f, date_of_birth:e.target.value})} placeholder="DD-MM-YYYY"/>
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