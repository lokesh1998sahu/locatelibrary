"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLMA } from "../_components/LMAProvider";
import { Screen, IconButton, Skeleton, Card } from "../_ui/kit";
import { IconRefresh } from "../_ui/icons";
import SeatLayoutEditor from "../_components/SeatLayoutEditor";

const API = "/api/lma960805";
const PASSWORD = "";  // gate disabled - this page already sits behind the LMAProvider login

// ── TYPES ─────────────────────────────────────────────────────────
interface Library    { library_code:string; library_name:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; address?:string; contact?:string; }
interface Branch     { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; address?:string; contact?:string; }
interface Shift      { shift_key:string; shift_name:string; shift_time:string; active:boolean; }
interface PaymentTag { tag_name:string; fees_mode:string; active:boolean; created_at:string; settlement_days?:number; }
interface FinAccount { bank_code:string; bank_name:string; owner_name:string; acct_type:string; }
interface LibSettings { library:string; last_student_id:number; last_receipt_no:number; cutoff_student_id:number; cutoff_receipt_no:number; renewal_alert_days:number; renewal_alert_days_primary:number; }
interface InitData   { ok:boolean; libraries:Library[]; branches:Branch[]; fees:Record<string,Record<string,number>>; shifts:Shift[]; paymentTags:PaymentTag[]; activeTags:string[]; settings:Record<string,LibSettings>; accounts?:FinAccount[]; }

type Toast = { msg:string; type:"success"|"error" } | null;
// ✅ Fixed — add "seatlayouts"
type Section = "libraries"|"branches"|"shifts"|"tags"|"fees"|"counters"|"seatlayouts";

// ── PAGE ──────────────────────────────────────────────────────────
export default function LmaSettingsPage() {
  const [unlocked, setUnlocked] = useState(true);  // no second gate; LMAProvider already authenticated
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
  // Only the provider's stable functions are used here. Depending on the whole
  // provider value (a new object on every render) made these callbacks change on
  // every render, which re-ran the loaders endlessly (the flickering seat layout).
  const { showToast: lmaToast, confirm: ask, refreshInit } = useLMA();
  const showToast = useCallback((msg:string, type:"success"|"error"="success") => { lmaToast(msg, type); }, [lmaToast]);
  const loadedOnce = useRef(false);

  // ── Data fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}?action=getInitData`).then(r => r.json());
      if (res.ok) {
        setData(res);
        // after a change, refresh the app-wide setup so other screens see it at once
        if (loadedOnce.current) refreshInit().catch(()=>{});
        loadedOnce.current = true;
      }
      else showToast(res.error || "Failed to load data", "error");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally { setLoading(false); }
  }, [showToast, refreshInit]);
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
        <div className="w-full max-w-sm bg-white rounded-[18px] shadow-lg p-7 lma-slide-up">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">⚙️</div>
            <h1 className="text-xl font-bold text-lma-ink">Settings</h1>
            <p className="text-sm text-lma-ink-3 mt-1">LMA Admin</p>
          </div>
          <input
            type="password" autoFocus value={pwInput}
            onChange={e=>{setPwInput(e.target.value); setPwErr("");}}
            onKeyDown={e=>{if(e.key==="Enter") tryUnlock();}}
            placeholder="Password"
            className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"
          />
          {pwErr && <p className="text-sm text-lma-danger mt-2 font-medium">{pwErr}</p>}
          <button onClick={tryUnlock} className="w-full mt-4 py-3 rounded-[14px] lma-glass-btn text-white font-bold text-[15px]">Unlock</button>
        </div>
      </div>
    );
  }

  // ── MAIN ──
  return (
    <Screen>
      <header className="flex items-start gap-2 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Settings</h1>
          <p className="mt-0.5 text-[12.5px] text-lma-ink-3">Libraries, shifts, tags, fees and seat layouts</p>
        </div>
        <IconButton label="Refresh" onClick={fetchData} className="-mr-2"><IconRefresh size={19} className={loading?"animate-spin":""}/></IconButton>
      </header>

      {!data ? (
        <div className="text-center text-sm text-lma-ink-3 py-8">Loading…</div>
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
                    if (lib.active && !(await ask({ title:`Switch off ${lib.library_code}?`, body:"It will be hidden across the app (new bookings, pickers and lists). You can switch it back on any time.", confirmLabel:"Switch off", danger:true }))) return;
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
                    if (br.active && !(await ask({ title:`Switch off ${br.branch_code}?`, body:"It will be hidden across the app (new bookings, pickers and lists). You can switch it back on any time.", confirmLabel:"Switch off", danger:true }))) return;
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
                    if (sh.active && !(await ask({ title:`Switch off ${sh.shift_key}?`, body:"It will be hidden across the app (new bookings, pickers and lists). You can switch it back on any time.", confirmLabel:"Switch off", danger:true }))) return;
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
                  subtitle={`→ ${t.fees_mode || "(no bank set)"} · settles T+${t.settlement_days ?? 0} · ${t.active ? "Active" : "Inactive"}`}
                  active={t.active}
                  onEdit={()=>setModal({ kind:"tag-edit", payload: t })}
                  onToggle={async ()=>{
                    if (t.active && !(await ask({ title:`Switch off ${t.tag_name}?`, body:"It will be hidden across the app (new bookings, pickers and lists). You can switch it back on any time.", confirmLabel:"Switch off", danger:true }))) return;
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
                  className="w-full text-left bg-white rounded-[14px] p-3 shadow-sm hover:shadow-md transition active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-sm font-bold text-lma-ink">{s.library}</div>
                    <div className="text-[10px] font-bold text-lma-warn bg-lma-warn/10 px-2 py-0.5 rounded">alert {s.renewal_alert_days}d · urgent {s.renewal_alert_days_primary}d</div>
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
          {modal.kind==="tag-add" && <TagForm accounts={data?.accounts} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
            const r = await post("addPaymentTag", p);
            if (r) { setModal(null); showToast("Tag added"); fetchData(); }
          }}/>}
          {modal.kind==="tag-edit" && <TagForm accounts={data?.accounts} initial={modal.payload} onCancel={()=>setModal(null)} onSubmit={async (p)=>{
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
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-[18px] text-white font-bold text-sm shadow-lg z-[9999] lma-slide-up ${toast.type==="success"?"bg-lma-accent":"bg-lma-danger"}`}>
          {toast.type==="success"?"✓ ":"✕ "}{toast.msg}
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <BottomSheet onClose={()=>setConfirm(null)}>
          <p className="text-[15px] font-semibold text-lma-ink leading-relaxed text-center mb-5">{confirm.msg}</p>
          <div className="flex gap-2.5">
            <button onClick={()=>setConfirm(null)} className="flex-1 py-3.5 rounded-[14px] bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line font-semibold">Cancel</button>
            <button onClick={()=>{ confirm.onYes(); setConfirm(null); }} className="flex-1 py-3.5 rounded-[14px] bg-lma-danger text-white font-bold">Confirm</button>
          </div>
        </BottomSheet>
      )}
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────

function Accordion({ title, emoji, count, isOpen, onToggle, children }:{ title:string; emoji:string; count:number; isOpen:boolean; onToggle:()=>void; children:React.ReactNode }) {
  return (
    <section className="mb-3 overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface shadow-lma-card">
      <button type="button" onClick={onToggle} aria-expanded={isOpen} className="lma-noscale flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-lma-bg">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-lma-brand-soft text-[19px]">{emoji}</span>
        <span className="min-w-0 flex-1 text-[15.5px] font-semibold text-lma-ink">{title}</span>
        <span className="rounded-full bg-lma-bg px-2 py-0.5 font-lma-mono text-[12px] font-semibold text-lma-ink-2">{count}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
          className="shrink-0 text-lma-ink-3 transition" style={{transform:isOpen?"rotate(90deg)":"none"}}><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>
      </button>
      {isOpen && <div className="border-t border-lma-line bg-lma-bg/60 p-3">{children}</div>}
    </section>
  );
}

function ItemRow({ emoji, color, title, subtitle, active, onEdit, onToggle }:{ emoji:string; color?:string; title:string; subtitle:string; active:boolean; onEdit:()=>void; onToggle:()=>void }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-lma-surface p-2.5 ring-1 ring-inset ring-lma-line">
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-[18px]" style={color?{ background: color+"22", color: color }:{ background:"#eef0f6" }}>{emoji}</span>
      <button type="button" onClick={onEdit} className="lma-noscale min-w-0 flex-1 text-left">
        <span className={`block truncate text-[14.5px] font-semibold ${active?"text-lma-ink":"text-lma-ink-3"}`}>{title}</span>
        <span className="block truncate text-[12px] text-lma-ink-3">{subtitle}</span>
      </button>
      <button type="button" role="switch" aria-checked={active} aria-label={active?`Switch off ${title}`:`Switch on ${title}`} onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${active?"bg-lma-in":"bg-[#cbd2e1]"}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${active?"left-[22px]":"left-0.5"}`}/>
      </button>
    </div>
  );
}

function AddButton({ label, onClick }:{ label:string; onClick:()=>void }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 h-12 w-full rounded-[14px] border-[1.5px] border-dashed border-[#c7cbf5] text-[14.5px] font-semibold text-lma-brand active:bg-lma-brand-soft">
      + {label}
    </button>
  );
}

function Counter({ label, value, mini }:{ label:string; value:number; mini?:boolean }) {
  return (
    <div className={`rounded-md ${mini?"bg-lma-bg":"bg-lma-bg"} p-1.5`}>
      <div className="text-[9px] text-lma-ink-3 font-semibold uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-lma-ink ${mini?"text-xs":"text-sm"}`}>{value}</div>
    </div>
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
            <th className="text-left pb-2 font-bold text-lma-ink-3 sticky left-0 bg-white">Key</th>
            {shifts.map(sk => <th key={sk} className="px-1.5 pb-2 font-bold text-lma-ink-3 text-center">{sk.slice(0,4)}</th>)}
          </tr>
        </thead>
        <tbody>
          {feeKeys.map(fk => (
            <tr key={fk} className="border-t border-lma-line">
              <td className="py-2 pr-2 font-bold text-lma-ink sticky left-0 bg-white">{fk}</td>
              {shifts.map(sk => {
                const v = data.fees[fk]?.[sk] || 0;
                return (
                  <td key={sk} className="py-1.5 px-1 text-center">
                    <button onClick={()=>onCellTap(fk, sk, v)} className={`w-full py-2 rounded-lg text-[12px] font-bold hover:bg-lma-brand-soft active:scale-[0.97] ${v>0?"bg-lma-bg text-lma-ink":"bg-lma-warn/10 text-lma-warn"}`}>
                      {v > 0 ? v : "—"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-lma-ink-3 mt-3 px-1">Tap any cell to edit. "—" means no fee set.</p>
    </div>
  );
}

// ── FORMS ────────────────────────────────────────────────────────

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
    <div className="mt-5 grid grid-cols-2 gap-2">
      <button type="button" onClick={onCancel} className="h-12 rounded-[14px] bg-lma-surface text-[15px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">Cancel</button>
      <button type="submit" className="lma-glass-btn h-12 rounded-[14px] text-[15px] font-bold text-white">{submitLabel}</button>
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
    address: initial?.address || "",
    contact: initial?.contact || "",
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
      <Label>Address</Label>
      <Input value={f.address} onChange={e=>setF({...f, address:e.target.value})} placeholder="Full address shown to students"/>
      <Label>Contact Number</Label>
      <Input value={f.contact} onChange={e=>setF({...f, contact:e.target.value})} placeholder="10-digit number" inputMode="numeric"/>
      <p className="text-[11px] text-lma-ink-3 mt-2">Shown on the public enquiry form. Branches inherit these unless they set their own.</p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <Label>Emoji</Label>
          <Input value={f.emoji} onChange={e=>setF({...f, emoji:e.target.value})} maxLength={4}/>
        </div>
        <div>
          <Label>Color</Label>
          <input type="color" value={f.color} onChange={e=>setF({...f, color:e.target.value})} className="w-full h-[42px] rounded-[14px] border-[1.5px] border-lma-line bg-lma-bg cursor-pointer"/>
        </div>
      </div>
      <label className="flex items-center gap-2 mt-4 cursor-pointer">
        <input type="checkbox" checked={f.has_branches} onChange={e=>setF({...f, has_branches:e.target.checked})} className="w-4 h-4 accent-lma-primary"/>
        <span className="text-sm font-semibold text-lma-ink-2">Has branches</span>
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
    address: initial?.address || "",
    contact: initial?.contact || "",
  });
  const isEdit = !!initial;
  const branchable = libraries.filter(l => l.has_branches);
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit(f);}}>
      <FormTitle>{isEdit?"Edit Branch":"Add Branch"}</FormTitle>
      <Label>Parent Library</Label>
      <select value={f.library_code} onChange={e=>setF({...f, library_code:e.target.value})} disabled={isEdit} required className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand">
        {branchable.map(l => <option key={l.library_code} value={l.library_code}>{l.library_code} — {l.display_name}</option>)}
      </select>
      <Label>Branch Code</Label>
      <Input value={f.branch_code} onChange={e=>setF({...f, branch_code:e.target.value.toUpperCase()})} placeholder="YAL-3" disabled={isEdit} required/>
      <Label>Display Name</Label>
      <Input value={f.branch_display} onChange={e=>setF({...f, branch_display:e.target.value})} required/>
      <Label>Address</Label>
      <Input value={f.address} onChange={e=>setF({...f, address:e.target.value})} placeholder="Leave blank to use the library's"/>
      <Label>Contact Number</Label>
      <Input value={f.contact} onChange={e=>setF({...f, contact:e.target.value})} placeholder="Leave blank to use the library's" inputMode="numeric"/>
      <p className="text-[11px] text-lma-ink-3 mt-2">Only fill what differs from the parent library — blank cells inherit.</p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <Label>Emoji</Label>
          <Input value={f.emoji} onChange={e=>setF({...f, emoji:e.target.value})} maxLength={4}/>
        </div>
        <div>
          <Label>Color</Label>
          <input type="color" value={f.color} onChange={e=>setF({...f, color:e.target.value})} className="w-full h-[42px] rounded-[14px] border-[1.5px] border-lma-line bg-lma-bg cursor-pointer"/>
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

function TagForm({ initial, accounts, onCancel, onSubmit }:{ initial?:PaymentTag; accounts?:FinAccount[]; onCancel:()=>void; onSubmit:(p:any)=>void }) {
  const [f, setF] = useState({
    tag_name: initial?.tag_name || "",
    fees_mode: initial?.fees_mode || "",
    settlement_days: initial?.settlement_days ?? 0,
  });
  const isEdit = !!initial;
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit(f);}}>
      <FormTitle>{isEdit?"Edit Payment Tag":"Add Payment Tag"}</FormTitle>
      <Label>Tag Name</Label>
      <Input value={f.tag_name} onChange={e=>setF({...f, tag_name:e.target.value.toUpperCase()})} placeholder="CASH, LSP, KDP-UPI..." disabled={isEdit} required/>
      <Label>Fees Mode (Bank)</Label>
      <select
        value={f.fees_mode}
        onChange={e=>setF({...f, fees_mode:e.target.value})}
        required
        className="w-full h-12 px-3.5 rounded-[14px] border border-lma-line bg-lma-surface text-[15px] font-medium text-lma-ink outline-none focus:border-lma-brand"
      >
        <option value="">Choose an account…</option>
        {!!f.fees_mode && !(accounts ?? []).some(a => a.bank_code === f.fees_mode) && (
          <option value={f.fees_mode}>{f.fees_mode} (no longer active)</option>
        )}
        {(accounts ?? []).map(a => (
          <option key={a.bank_code} value={a.bank_code}>
            {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""} — {a.bank_code}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-lma-ink-3 mt-2">The account this tag&apos;s money lands in. Add new accounts in My Financials &rarr; Accounts.</p>
      <div className="mt-3">
        <Label>Settlement Days</Label>
        <Input type="number" inputMode="numeric" min={0} max={90} value={f.settlement_days} onChange={e=>setF({...f, settlement_days:Number(e.target.value)})}/>
        <p className="text-[11px] text-lma-ink-3 mt-2">Days until the money actually lands in the bank. <b>0</b> = same day (cash/UPI). <b>1</b> = next day, and so on. Drives the settlement date used by My Financials reconciliation.</p>
      </div>
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
      <div className="bg-lma-bg rounded-[14px] p-3 mb-4">
        <div className="text-[11px] font-bold text-lma-ink-3 uppercase tracking-wide">Fee Key</div>
        <div className="text-base font-bold text-lma-ink">{payload.fee_key}</div>
        <div className="text-[11px] font-bold text-lma-ink-3 uppercase tracking-wide mt-2">Shift</div>
        <div className="text-base font-bold text-lma-ink">{payload.shift_key}</div>
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
    renewal_alert_days_primary: initial.renewal_alert_days_primary,
  });
  const cutoffsLocked = initial.cutoff_student_id > 0 || initial.cutoff_receipt_no > 0;
  return (
    <form onSubmit={e=>{e.preventDefault(); onSubmit({ library: initial.library, ...f });}}>
      <FormTitle>Counters: {initial.library}</FormTitle>
      <div className="bg-lma-warn/10 border border-lma-warn/30 rounded-[14px] p-2.5 mb-4 text-[11px] text-lma-ink-2">
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
       <div className="mt-6 mb-3 text-center text-base font-bold uppercase tracking-wide text-lma-ink-2">Expiring Thresholds</div>
    <div className="grid grid-cols-2 gap-3">
        <div><Label>Expiring soon (pink)</Label><Input type="number" value={f.renewal_alert_days} onChange={e=>setF({...f, renewal_alert_days:Number(e.target.value)})} min={1} max={60}/></div>
        <div><Label>Urgent (red)</Label><Input type="number" value={f.renewal_alert_days_primary} onChange={e=>setF({...f, renewal_alert_days_primary:Number(e.target.value)})} min={1} max={60}/></div>
      </div>
    <p className="text-[11px] text-lma-ink-3 mt-1.5">Seat goes pink within the expiring-soon window, then vivid red within the smaller urgent window. Urgent must be ≤ expiring-soon.</p>
      <FormActions onCancel={onCancel}/>
    </form>
  );
}