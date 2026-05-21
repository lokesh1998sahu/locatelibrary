"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import SeatLayoutEditor from "../_components/SeatLayoutEditor";

const API = "/api/lma";
const PASSWORD = process.env.NEXT_PUBLIC_LMA_PASSWORD!;

// ── TYPES ─────────────────────────────────────────────────────────
interface Library    { library_code:string; library_name:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch     { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface Shift      { shift_key:string; shift_name:string; shift_time:string; active:boolean; }
interface PaymentTag { tag_name:string; fees_mode:string; active:boolean; created_at:string; }
interface LibSettings { library:string; last_student_id:number; last_receipt_no:number; cutoff_student_id:number; cutoff_receipt_no:number; renewal_alert_days:number; }
interface InitData   { ok:boolean; libraries:Library[]; branches:Branch[]; fees:Record<string,Record<string,number>>; shifts:Shift[]; paymentTags:PaymentTag[]; activeTags:string[]; settings:Record<string,LibSettings>; }

type Toast = { msg:string; type:"success"|"error" } | null;
// ✅ Fixed — add "seatlayouts"
type Section = "libraries"|"branches"|"shifts"|"tags"|"fees"|"counters"|"seatlayouts";

// ── PAGE ──────────────────────────────────────────────────────────
export default function LmaSettingsPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr] = useState("");

  const [data, setData] = useState<InitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [open, setOpen] = useState<Section | null>(null);
  const [modal, setModal] = useState<{ kind:string; payload?:any } | null>(null);
  const [confirm, setConfirm] = useState<{ msg:string; onYes:()=>void } | null>(null);

  // ── Auth ──
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("lma_ok") === "1") setUnlocked(true);
  }, []);
  const tryUnlock = () => {
    if (pwInput && pwInput === PASSWORD) {
      sessionStorage.setItem("lma_ok","1"); setUnlocked(true); setPwErr("");
    } else setPwErr("Incorrect password.");
  };

  // ── Toast ──
  const showToast = useCallback((msg:string, type:"success"|"error"="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Data fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}?action=getInitData`).then(r => r.json());
      if (res.ok) setData(res);
      else showToast(res.error || "Failed to load data", "error");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { if (unlocked) fetchData(); }, [unlocked, fetchData]);

  // ── Generic POST wrapper ──
  const post = useCallback(async (action:string, payload:any) => {
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
  }, [showToast]);

  // ── PASSWORD GATE ──
  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-7 lma-slide-up">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">⚙️</div>
            <h1 className="text-xl font-extrabold text-lma-slate-900">Settings</h1>
            <p className="text-sm text-lma-slate-500 mt-1">LMA Admin</p>
          </div>
          <input
            type="password" autoFocus value={pwInput}
            onChange={e=>{setPwInput(e.target.value); setPwErr("");}}
            onKeyDown={e=>{if(e.key==="Enter") tryUnlock();}}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[15px] font-medium"
          />
          {pwErr && <p className="text-sm text-lma-danger mt-2 font-medium">{pwErr}</p>}
          <button onClick={tryUnlock} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-[15px] shadow-md">Unlock</button>
        </div>
      </div>
    );
  }

  // ── MAIN ──
  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-4">
      {/* Header */}
      <header className="flex items-center gap-3 mb-4">
        <Link href="/lma" className="text-xl text-lma-slate-600 hover:text-lma-slate-900">←</Link>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-lma-slate-900">Settings</h1>
          <p className="text-[11px] text-lma-slate-500 font-medium">Reference data & admin</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 hover:bg-lma-slate-200 disabled:opacity-50">{loading?"...":"↻"}</button>
      </header>

      {!data ? (
        <div className="text-center text-sm text-lma-slate-500 py-8">Loading…</div>
      ) : (
        <>
          {/* Libraries */}
          <Accordion title="Libraries" emoji="🏛️" count={data.libraries.length} isOpen={open==="libraries"} onToggle={()=>setOpen(open==="libraries"?null:"libraries")}>
            <div className="space-y-2">
              {data.libraries.map(lib => (
                <ItemRow
                  key={lib.library_code}
                  emoji={lib.emoji}
                  color={lib.color}
                  title={`${lib.library_code} — ${lib.display_name}`}
                  subtitle={`${lib.has_branches ? "Has branches · " : ""}${lib.active ? "Active" : "Inactive"}`}
                  active={lib.active}
                  onEdit={()=>setModal({ kind:"library-edit", payload: lib })}
                  onToggle={async ()=>{
                    const r = await post("toggleLibrary", { library_code: lib.library_code });
                    if (r) {
                      if (r.dependency_count > 0 && !r.active) {
                        showToast(`Deactivated. ${r.dependency_count} dependent records exist.`, "success");
                      } else showToast(r.active ? "Activated" : "Deactivated");
                      fetchData();
                    }
                  }}
                />
              ))}
            </div>
            <AddButton label="Add Library" onClick={()=>setModal({ kind:"library-add" })}/>
          </Accordion>

          {/* Branches */}
          <Accordion title="Branches" emoji="🌿" count={data.branches.length} isOpen={open==="branches"} onToggle={()=>setOpen(open==="branches"?null:"branches")}>
            <div className="space-y-2">
              {data.branches.map(br => (
                <ItemRow
                  key={br.branch_code}
                  emoji={br.emoji || "🌿"}
                  color={br.color}
                  title={`${br.branch_code} — ${br.branch_display}`}
                  subtitle={`Under ${br.library_code} · ${br.active ? "Active" : "Inactive"}`}
                  active={br.active}
                  onEdit={()=>setModal({ kind:"branch-edit", payload: br })}
                  onToggle={async ()=>{
                    const r = await post("toggleBranch", { branch_code: br.branch_code });
                    if (r) { showToast(r.active ? "Activated" : "Deactivated"); fetchData(); }
                  }}
                />
              ))}
            </div>
            <AddButton label="Add Branch" onClick={()=>setModal({ kind:"branch-add" })}/>
          </Accordion>

          {/* Shifts */}
          <Accordion title="Shifts" emoji="🕓" count={data.shifts.length} isOpen={open==="shifts"} onToggle={()=>setOpen(open==="shifts"?null:"shifts")}>
            <div className="space-y-2">
              {data.shifts.map(sh => (
                <ItemRow
                  key={sh.shift_key}
                  emoji="🕓"
                  title={`${sh.shift_key} — ${sh.shift_name}`}
                  subtitle={`${sh.shift_time} · ${sh.active ? "Active" : "Inactive"}`}
                  active={sh.active}
                  onEdit={()=>setModal({ kind:"shift-edit", payload: sh })}
                  onToggle={async ()=>{
                    const r = await post("toggleShift", { shift_key: sh.shift_key });
                    if (r) { showToast(r.active ? "Activated" : "Deactivated"); fetchData(); }
                  }}
                />
              ))}
            </div>
            <AddButton label="Add Shift" onClick={()=>setModal({ kind:"shift-add" })}/>
          </Accordion>

          {/* Payment Tags */}
          <Accordion title="Payment Tags" emoji="💳" count={data.paymentTags.length} isOpen={open==="tags"} onToggle={()=>setOpen(open==="tags"?null:"tags")}>
            <div className="space-y-2">
              {data.paymentTags.map(t => (
                <ItemRow
                  key={t.tag_name}
                  emoji="💳"
                  title={t.tag_name}
                  subtitle={`→ ${t.fees_mode || "(no bank set)"} · ${t.active ? "Active" : "Inactive"}`}
                  active={t.active}
                  onEdit={()=>setModal({ kind:"tag-edit", payload: t })}
                  onToggle={async ()=>{
                    const r = await post("togglePaymentTag", { tag_name: t.tag_name });
                    if (r) { showToast(r.active ? "Activated" : "Deactivated"); fetchData(); }
                  }}
                />
              ))}
            </div>
            <AddButton label="Add Payment Tag" onClick={()=>setModal({ kind:"tag-add" })}/>
          </Accordion>

          {/* Fees Matrix */}
          <Accordion title="Fees Matrix" emoji="💰" count={Object.keys(data.fees).length} isOpen={open==="fees"} onToggle={()=>setOpen(open==="fees"?null:"fees")}>
            <FeesMatrix data={data} onCellTap={(fee_key, shift_key, current)=>setModal({ kind:"fee-edit", payload:{ fee_key, shift_key, fee_amount: current } })}/>
          </Accordion>

          {/* Counters */}
          <Accordion title="Counters & Renewal Days" emoji="🔢" count={Object.keys(data.settings).length} isOpen={open==="counters"} onToggle={()=>setOpen(open==="counters"?null:"counters")}>
            <div className="space-y-2">
              {Object.values(data.settings).map(s => (
                <button
                  key={s.library}
                  onClick={()=>setModal({ kind:"counters-edit", payload: s })}
                  className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-sm font-bold text-lma-slate-900">{s.library}</div>
                    <div className="text-[10px] font-bold text-lma-warn bg-lma-warn/10 px-2 py-0.5 rounded">alert {s.renewal_alert_days}d</div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <Counter label="Last Student" value={s.last_student_id}/>
                    <Counter label="Last Receipt" value={s.last_receipt_no}/>
                    <Counter label="Cutoff Student" value={s.cutoff_student_id} mini/>
                    <Counter label="Cutoff Receipt" value={s.cutoff_receipt_no} mini/>
                  </div>
                </button>
              ))}
            </div>
          </Accordion>
          {/* Seat Layouts */}
          <Accordion
            title="Seat Layouts"
            emoji="🪑"
            count={data.libraries.filter(l => !l.has_branches).length + data.branches.length}
            isOpen={open==="seatlayouts"}
            onToggle={()=>setOpen(open==="seatlayouts"?null:"seatlayouts")}
          >
            <SeatLayoutEditor
              libraries={data.libraries}
              branches={data.branches}
              onToast={showToast}
            />
          </Accordion>
        </>
      )}

      {/* ── MODAL ── */}
      {modal && (
        <BottomSheet onClose={()=>setModal(null)}>
          {modal.kind==="library-add" && <LibraryForm onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("addLibrary", p);
            if (r) { setModal(null); showToast("Library added"); fetchData(); }
          }}/>}
          {modal.kind==="library-edit" && <LibraryForm initial={modal.payload} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("updateLibrary", { ...p, library_code: modal.payload.library_code });
            if (r) { setModal(null); showToast(r.orphan_count > 0 ? `Updated. ${r.orphan_count} rows now orphan-branched.` : "Updated"); fetchData(); }
          }}/>}
          {modal.kind==="branch-add" && <BranchForm libraries={data?.libraries||[]} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("addBranch", p);
            if (r) { setModal(null); showToast("Branch added"); fetchData(); }
          }}/>}
          {modal.kind==="branch-edit" && <BranchForm libraries={data?.libraries||[]} initial={modal.payload} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("updateBranch", { ...p, branch_code: modal.payload.branch_code });
            if (r) { setModal(null); showToast("Updated"); fetchData(); }
          }}/>}
          {modal.kind==="shift-add" && <ShiftForm onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("addShift", p);
            if (r) { setModal(null); showToast("Shift added"); fetchData(); }
          }}/>}
          {modal.kind==="shift-edit" && <ShiftForm initial={modal.payload} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("updateShift", { ...p, shift_key: modal.payload.shift_key });
            if (r) { setModal(null); showToast("Updated"); fetchData(); }
          }}/>}
          {modal.kind==="tag-add" && <TagForm onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("addPaymentTag", p);
            if (r) { setModal(null); showToast("Tag added"); fetchData(); }
          }}/>}
          {modal.kind==="tag-edit" && <TagForm initial={modal.payload} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("updatePaymentTag", { ...p, tag_name: modal.payload.tag_name });
            if (r) { setModal(null); showToast("Updated"); fetchData(); }
          }}/>}
          {modal.kind==="fee-edit" && <FeeForm payload={modal.payload} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("updateFee", p);
            if (r) { setModal(null); showToast(r.action === "inserted" ? "Fee added" : "Fee updated"); fetchData(); }
          }}/>}
          {modal.kind==="counters-edit" && <CountersForm initial={modal.payload} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("updateSettings", p);
            if (r) { setModal(null); showToast("Settings updated"); fetchData(); }
          }}/>}
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
            <button onClick={()=>{ confirm.onYes(); setConfirm(null); }} className="flex-1 py-3.5 rounded-xl bg-lma-danger text-white font-bold">Confirm</button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────

function Accordion({ title, emoji, count, isOpen, onToggle, children }:{ title:string; emoji:string; count:number; isOpen:boolean; onToggle:()=>void; children:React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 hover:bg-lma-slate-50 transition active:bg-lma-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <span className="text-sm font-bold text-lma-slate-900">{title}</span>
          <span className="text-[10px] font-bold text-lma-slate-500 bg-lma-slate-100 px-1.5 py-0.5 rounded">{count}</span>
        </div>
        <span className={`text-lma-slate-400 transition-transform ${isOpen?"rotate-180":""}`}>▾</span>
      </button>
      {isOpen && <div className="p-3 pt-1 border-t border-lma-slate-100 lma-slide-up">{children}</div>}
    </section>
  );
}

function ItemRow({ emoji, color, title, subtitle, active, onEdit, onToggle }:{ emoji:string; color?:string; title:string; subtitle:string; active:boolean; onEdit:()=>void; onToggle:()=>void }) {
  return (
    <div className="flex items-center gap-2 bg-lma-slate-50 rounded-xl p-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0" style={color?{ background: color+"22", color: color }:{ background:"#e2e8f0" }}>{emoji}</div>
      <button onClick={onEdit} className="flex-1 text-left min-w-0">
        <div className="text-[13px] font-bold text-lma-slate-900 truncate">{title}</div>
        <div className="text-[11px] text-lma-slate-500 truncate">{subtitle}</div>
      </button>
      <button onClick={onToggle} className={`text-[10px] font-bold px-2 py-1 rounded ${active?"bg-lma-accent/15 text-lma-accent":"bg-lma-slate-200 text-lma-slate-500"}`}>{active?"ON":"OFF"}</button>
    </div>
  );
}

function AddButton({ label, onClick }:{ label:string; onClick:()=>void }) {
  return (
    <button onClick={onClick} className="w-full mt-3 py-2.5 rounded-xl border-[1.5px] border-dashed border-lma-primary/40 text-lma-primary font-bold text-sm hover:bg-lma-primary/5 active:scale-[0.99]">
      + {label}
    </button>
  );
}

function Counter({ label, value, mini }:{ label:string; value:number; mini?:boolean }) {
  return (
    <div className={`rounded-md ${mini?"bg-lma-slate-50":"bg-lma-slate-100"} p-1.5`}>
      <div className="text-[9px] text-lma-slate-500 font-semibold uppercase tracking-wide">{label}</div>
      <div className={`font-extrabold text-lma-slate-900 ${mini?"text-xs":"text-sm"}`}>{value}</div>
    </div>
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

function FeesMatrix({ data, onCellTap }:{ data:InitData; onCellTap:(fk:string,sk:string,current:number)=>void }) {
  // Distinct fee_keys across libraries + branches that have entries OR can have entries
  const feeKeys = useMemo(() => {
    const set = new Set<string>();
    data.libraries.forEach(l => { if (!l.has_branches) set.add(l.library_code); });
    data.branches.forEach(b => set.add(b.branch_code));
    Object.keys(data.fees).forEach(k => set.add(k));
    return Array.from(set).sort();
  }, [data]);
  const shifts = data.shifts.filter(s => s.active).map(s => s.shift_key);

  return (
    <div className="overflow-x-auto -mx-3 px-3">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left pb-2 font-bold text-lma-slate-500 sticky left-0 bg-white">Key</th>
            {shifts.map(sk => <th key={sk} className="px-1.5 pb-2 font-bold text-lma-slate-500 text-center">{sk.slice(0,4)}</th>)}
          </tr>
        </thead>
        <tbody>
          {feeKeys.map(fk => (
            <tr key={fk} className="border-t border-lma-slate-100">
              <td className="py-2 pr-2 font-bold text-lma-slate-800 sticky left-0 bg-white">{fk}</td>
              {shifts.map(sk => {
                const v = data.fees[fk]?.[sk] || 0;
                return (
                  <td key={sk} className="py-1.5 px-1 text-center">
                    <button onClick={()=>onCellTap(fk, sk, v)} className={`w-full py-2 rounded-lg text-[12px] font-bold hover:bg-lma-primary/10 active:scale-[0.97] ${v>0?"bg-lma-slate-50 text-lma-slate-800":"bg-lma-warn/10 text-lma-warn"}`}>
                      {v > 0 ? v : "—"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-lma-slate-400 mt-3 px-1">Tap any cell to edit. "—" means no fee set.</p>
    </div>
  );
}

// ── FORMS ────────────────────────────────────────────────────────

function FormTitle({ children }:{ children:React.ReactNode }) {
  return <h3 className="text-base font-extrabold text-lma-slate-900 mb-4">{children}</h3>;
}
function Label({ children }:{ children:React.ReactNode }) {
  return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium"/>;
}
function FormActions({ onCancel, submitLabel="Save" }:{ onCancel:()=>void; submitLabel?:string }) {
  return (
    <div className="flex gap-2.5 mt-5">
      <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
      <button type="submit" className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md">{submitLabel}</button>
    </div>
  );
}

function LibraryForm({ initial, onCancel, onSubmit }:{ initial?:Library; onCancel:()=>void; onSubmit:(p:any)=>void }) {
  const [f, setF] = useState({
    library_code: initial?.library_code || "",
    library_name: initial?.library_name || "",
    display_name: initial?.display_name || "",
    has_branches: initial?.has_branches || false,
    emoji: initial?.emoji || "📚",
    color: initial?.color || "#6366f1",
  });
  const isEdit = !!initial;
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit(f);}}>
      <FormTitle>{isEdit?"Edit Library":"Add Library"}</FormTitle>
      <Label>Code</Label>
      <Input value={f.library_code} onChange={e=>setF({...f, library_code:e.target.value.toUpperCase()})} placeholder="KAL, KL, SL, YAL..." disabled={isEdit} required/>
      <Label>Library Name</Label>
      <Input value={f.library_name} onChange={e=>setF({...f, library_name:e.target.value})} required/>
      <Label>Display Name</Label>
      <Input value={f.display_name} onChange={e=>setF({...f, display_name:e.target.value})} placeholder="Pretty version"/>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <Label>Emoji</Label>
          <Input value={f.emoji} onChange={e=>setF({...f, emoji:e.target.value})} maxLength={4}/>
        </div>
        <div>
          <Label>Color</Label>
          <input type="color" value={f.color} onChange={e=>setF({...f, color:e.target.value})} className="w-full h-[42px] rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 cursor-pointer"/>
        </div>
      </div>
      <label className="flex items-center gap-2 mt-4 cursor-pointer">
        <input type="checkbox" checked={f.has_branches} onChange={e=>setF({...f, has_branches:e.target.checked})} className="w-4 h-4 accent-lma-primary"/>
        <span className="text-sm font-semibold text-lma-slate-700">Has branches</span>
      </label>
      <FormActions onCancel={onCancel}/>
    </form>
  );
}

function BranchForm({ libraries, initial, onCancel, onSubmit }:{ libraries:Library[]; initial?:Branch; onCancel:()=>void; onSubmit:(p:any)=>void }) {
  const [f, setF] = useState({
    library_code: initial?.library_code || libraries[0]?.library_code || "",
    branch_code: initial?.branch_code || "",
    branch_display: initial?.branch_display || "",
    emoji: initial?.emoji || "🌿",
    color: initial?.color || "#6366f1",
  });
  const isEdit = !!initial;
  const branchable = libraries.filter(l => l.has_branches);
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit(f);}}>
      <FormTitle>{isEdit?"Edit Branch":"Add Branch"}</FormTitle>
      <Label>Parent Library</Label>
      <select value={f.library_code} onChange={e=>setF({...f, library_code:e.target.value})} disabled={isEdit} required className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium">
        {branchable.map(l => <option key={l.library_code} value={l.library_code}>{l.library_code} — {l.display_name}</option>)}
      </select>
      <Label>Branch Code</Label>
      <Input value={f.branch_code} onChange={e=>setF({...f, branch_code:e.target.value.toUpperCase()})} placeholder="YAL-3" disabled={isEdit} required/>
      <Label>Display Name</Label>
      <Input value={f.branch_display} onChange={e=>setF({...f, branch_display:e.target.value})} required/>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <Label>Emoji</Label>
          <Input value={f.emoji} onChange={e=>setF({...f, emoji:e.target.value})} maxLength={4}/>
        </div>
        <div>
          <Label>Color</Label>
          <input type="color" value={f.color} onChange={e=>setF({...f, color:e.target.value})} className="w-full h-[42px] rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 cursor-pointer"/>
        </div>
      </div>
      <FormActions onCancel={onCancel}/>
    </form>
  );
}

function ShiftForm({ initial, onCancel, onSubmit }:{ initial?:Shift; onCancel:()=>void; onSubmit:(p:any)=>void }) {
  const [f, setF] = useState({
    shift_key: initial?.shift_key || "",
    shift_name: initial?.shift_name || "",
    shift_time: initial?.shift_time || "",
  });
  const isEdit = !!initial;
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit(f);}}>
      <FormTitle>{isEdit?"Edit Shift":"Add Shift"}</FormTitle>
      <Label>Key</Label>
      <Input value={f.shift_key} onChange={e=>setF({...f, shift_key:e.target.value.toUpperCase()})} placeholder="MORNING, EVENING..." disabled={isEdit} required/>
      <Label>Name</Label>
      <Input value={f.shift_name} onChange={e=>setF({...f, shift_name:e.target.value})} required/>
      <Label>Time</Label>
      <Input value={f.shift_time} onChange={e=>setF({...f, shift_time:e.target.value})} placeholder="7AM to 2PM"/>
      <FormActions onCancel={onCancel}/>
    </form>
  );
}

function TagForm({ initial, onCancel, onSubmit }:{ initial?:PaymentTag; onCancel:()=>void; onSubmit:(p:any)=>void }) {
  const [f, setF] = useState({
    tag_name: initial?.tag_name || "",
    fees_mode: initial?.fees_mode || "",
  });
  const isEdit = !!initial;
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit(f);}}>
      <FormTitle>{isEdit?"Edit Payment Tag":"Add Payment Tag"}</FormTitle>
      <Label>Tag Name</Label>
      <Input value={f.tag_name} onChange={e=>setF({...f, tag_name:e.target.value.toUpperCase()})} placeholder="CASH, LSP, KDP-UPI..." disabled={isEdit} required/>
      <Label>Fees Mode (Bank)</Label>
      <Input value={f.fees_mode} onChange={e=>setF({...f, fees_mode:e.target.value})} placeholder="HDFC-KD, ICICI-LS, CASH..."/>
      <p className="text-[11px] text-lma-slate-500 mt-2">The bank/mode this tag's money goes into.</p>
      <FormActions onCancel={onCancel}/>
    </form>
  );
}

function FeeForm({ payload, onCancel, onSubmit }:{ payload:{ fee_key:string; shift_key:string; fee_amount:number }; onCancel:()=>void; onSubmit:(p:any)=>void }) {
  const [amount, setAmount] = useState(payload.fee_amount || 0);
  const isNew = !payload.fee_amount || payload.fee_amount === 0;
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit({ fee_key: payload.fee_key, shift_key: payload.shift_key, fee_amount: amount });}}>
      <FormTitle>{isNew ? "Add Fee" : "Edit Fee"}</FormTitle>
      <div className="bg-lma-slate-50 rounded-xl p-3 mb-4">
        <div className="text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide">Fee Key</div>
        <div className="text-base font-extrabold text-lma-slate-900">{payload.fee_key}</div>
        <div className="text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mt-2">Shift</div>
        <div className="text-base font-extrabold text-lma-slate-900">{payload.shift_key}</div>
      </div>
      <Label>Fee Amount (₹)</Label>
      <Input type="number" inputMode="numeric" value={amount} onChange={e=>setAmount(Number(e.target.value))} required autoFocus/>
      <FormActions onCancel={onCancel}/>
    </form>
  );
}

function CountersForm({ initial, onCancel, onSubmit }:{ initial:LibSettings; onCancel:()=>void; onSubmit:(p:any)=>void }) {
  const [f, setF] = useState({
    last_student_id: initial.last_student_id,
    last_receipt_no: initial.last_receipt_no,
    cutoff_student_id: initial.cutoff_student_id,
    cutoff_receipt_no: initial.cutoff_receipt_no,
    renewal_alert_days: initial.renewal_alert_days,
  });
  const cutoffsLocked = initial.cutoff_student_id > 0 || initial.cutoff_receipt_no > 0;
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit({ library: initial.library, ...f });}}>
      <FormTitle>Counters: {initial.library}</FormTitle>
      <div className="bg-lma-warn/10 border border-lma-warn/30 rounded-xl p-2.5 mb-4 text-[11px] text-lma-slate-700">
        ⚠ Counters can only be <b>raised</b>, not lowered. Cutoffs are set once; immutable after.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Last Student ID</Label>
          <Input type="number" value={f.last_student_id} onChange={e=>setF({...f, last_student_id:Number(e.target.value)})}/>
        </div>
        <div>
          <Label>Last Receipt No</Label>
          <Input type="number" value={f.last_receipt_no} onChange={e=>setF({...f, last_receipt_no:Number(e.target.value)})}/>
        </div>
        <div>
          <Label>Cutoff Student ID</Label>
          <Input type="number" value={f.cutoff_student_id} onChange={e=>setF({...f, cutoff_student_id:Number(e.target.value)})} disabled={cutoffsLocked}/>
        </div>
        <div>
          <Label>Cutoff Receipt No</Label>
          <Input type="number" value={f.cutoff_receipt_no} onChange={e=>setF({...f, cutoff_receipt_no:Number(e.target.value)})} disabled={cutoffsLocked}/>
        </div>
      </div>
      <Label>Renewal Alert Days</Label>
      <Input type="number" value={f.renewal_alert_days} onChange={e=>setF({...f, renewal_alert_days:Number(e.target.value)})} min={1} max={60}/>
      <p className="text-[11px] text-lma-slate-500 mt-1.5">Days before booking_to to flag a receipt as &quot;expiring soon&quot;.</p>
      <FormActions onCancel={onCancel}/>
    </form>
  );
}