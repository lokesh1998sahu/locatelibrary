"use client";

// MF 2.0 — Add expense.
// Three taps for the common case: amount, category, save. Everything else
// (date, world, split payment, who is owed) is pre-set and one tap away.
//
// Two safeguards run before the save button ever lights up:
//   • checkConflicts — warns if this date falls inside a period you have
//     already reconciled, because saving there silently breaks a passed Check.
//   • findPossibleDuplicate — warns if the same money, day and account is
//     already recorded, which is the commonest real-world mistake.
//
// The database's own guard rail is the final judge: this screen never decides
// whether an entry balances.

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";

type Leg = { account_id: number; amount: number };

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function prettyDate(iso: string): { label: string; ago: number } {
  const d = new Date(iso + "T00:00:00");
  const t = new Date(todayIso() + "T00:00:00");
  const ago = Math.round((t.getTime() - d.getTime()) / 86400000);
  const label =
    ago === 0 ? "Today" :
    ago === 1 ? "Yesterday" :
    d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return { label, ago };
}

export default function AddExpense() {
  const { init, post, showToast, refreshInit } = useMF();
  const router = useRouter();

  const [amountStr, setAmountStr] = useState("");
  const [dateIso, setDateIso] = useState(todayIso);
  const [world, setWorld] = useState<"PERSONAL" | "LIBRARY">("PERSONAL");
  const [sel, setSel] = useState<{ library_code: string; branch_code: string | null }[]>([]);
  const [splitMode, setSplitMode] = useState<"EQUAL" | "MANUAL">("EQUAL");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [owedPersonId, setOwedPersonId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number>(0);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [conflicts, setConflicts] = useState<{ name: string; checked_through: string }[]>([]);
  const [dupe, setDupe] = useState<{ id: number; description: string } | null>(null);

  const total = Number(amountStr || 0);
  const paid = useMemo(() => legs.reduce((s, l) => s + l.amount, 0), [legs]);
  const shortBy = Math.round((total - paid) * 100) / 100;

  const accounts   = init?.accounts.filter(a => a.is_set_up || !a.is_liability) ?? [];
  const categories = (init?.categories ?? []).filter(c => c.kind === "EXPENSE");
  const people     = init?.people ?? [];
  // One option per operating unit: a branch where the library has branches, the
  // library itself where it does not. initData's left join already returns
  // exactly that shape — one row per library-branch pair.
  const places = useMemo(() => (init?.libraries ?? []).map(l => ({
    key: l.library_code + "|" + (l.branch_code ?? ""),
    library_code: l.library_code,
    branch_code: l.branch_code,
    label: l.branch_code ? `${l.label} · ${l.branch_label ?? l.branch_code}` : l.label,
  })), [init]);

  const { label: dateLabel, ago } = prettyDate(dateIso);

  // Equal division must still add up exactly: the last part absorbs the paisa
  // the others lost to rounding, so the split can never miss the total.
  const splitRows = useMemo(() => {
    if (!sel.length) return [];
    const keyOf = (x: { library_code: string; branch_code: string | null }) =>
      x.library_code + "|" + (x.branch_code ?? "");
    if (splitMode === "MANUAL") {
      return sel.map(x => ({ ...x, key: keyOf(x), amount: Math.round(Number(manual[keyOf(x)] || 0) * 100) / 100 }));
    }
    const each = Math.floor((total / sel.length) * 100) / 100;
    const used = Math.round(each * sel.length * 100) / 100;
    return sel.map((x, i) => ({
      ...x, key: keyOf(x),
      amount: i === sel.length - 1 ? Math.round((total - used + each) * 100) / 100 : each,
    }));
  }, [sel, splitMode, manual, total]);

  const splitSum = Math.round(splitRows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
  const splitOk = sel.length === 0 || Math.abs(splitSum - total) < 0.005;
  const primaryAccount = legs[0]?.account_id ?? null;

  // Editing reuses this whole form rather than a second one, so the two can
  // never disagree about what an expense is.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("edit") || 0);
    if (!id) return;
    setEditId(id);
    setLoadingEdit(true);
    (async () => {
      const j = await post("getEntry", { entry_id: id });
      setLoadingEdit(false);
      if (!j) return;
      setDateIso(String(j.entry.entry_date).slice(0, 10));
      setWorld(j.entry.world === "LIBRARY" ? "LIBRARY" : "PERSONAL");
      setNote(j.entry.description ?? "");
      setAmountStr(String(j.entry.total));
      if (j.split?.length) {
        setCategoryId(Number(j.split[0].category_id));
        const places = j.split.filter((x: any) => x.library_code)
          .map((x: any) => ({ library_code: x.library_code, branch_code: x.branch_code ?? null }));
        if (places.length) {
          setSel(places);
          if (places.length > 1) {
            setSplitMode("MANUAL");
            const m: Record<string, string> = {};
            j.split.forEach((x: any) => {
              if (x.library_code) m[x.library_code + "|" + (x.branch_code ?? "")] = String(x.amount);
            });
            setManual(m);
          }
        }
      }
      if (j.legs?.length) setLegs(j.legs.map((l: any) => ({ account_id: Number(l.account_id), amount: Number(l.amount) })));
      if (j.owed) setOwedPersonId(Number(j.owed.person_id));
    })();
  }, [post]);

  // Warn about writing into a reconciled period, or repeating an entry.
  useEffect(() => {
    if (!legs.length) { setConflicts([]); return; }
    let dead = false;
    (async () => {
      const j = await post("checkConflicts", { entry_date: dateIso, account_ids: legs.map(l => l.account_id) });
      if (!dead && j) setConflicts(j.conflicts ?? []);
    })();
    return () => { dead = true; };
  }, [dateIso, legs, post]);

  useEffect(() => {
    if (!primaryAccount || total <= 0) { setDupe(null); return; }
    let dead = false;
    const t = setTimeout(async () => {
      const j = await post("findPossibleDuplicate", { entry_date: dateIso, amount: paid || total, account_id: primaryAccount });
      if (!dead && j) setDupe(j.duplicate ?? null);
    }, 400);
    return () => { dead = true; clearTimeout(t); };
  }, [dateIso, primaryAccount, total, paid, post]);

  const tapKey = useCallback((k: string) => {
    setAmountStr(s => {
      if (k === "<") return s.slice(0, -1);
      if (k === "." && s.includes(".")) return s;
      if (s.replace(".", "").length >= 9) return s;
      const next = s + k;
      return next.replace(/^0(?=\d)/, "");
    });
  }, []);

  // A single account is the normal case: keep its leg in step with the amount.
  const chooseAccount = (id: number) => {
    setLegs(prev => (prev.length === 1 && prev[0].account_id === id) ? [] : [{ account_id: id, amount: total }]);
  };
  useEffect(() => {
    if (loadingEdit) return;
    setLegs(prev => prev.length === 1 ? [{ ...prev[0], amount: total }] : prev);
  }, [total, loadingEdit]);

  const canSave = total > 0 && !!categoryId && (paid > 0 || !!owedPersonId) &&
                  (Math.abs(shortBy) < 0.005 || !!owedPersonId) &&
                  (world === "PERSONAL" || (sel.length > 0 && splitOk)) && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const j = await post("addExpense", {
      entry_id: editId || undefined,
      entry_date: dateIso,
      world,
      description: note.trim() || null,
      split: world === "LIBRARY"
        ? splitRows.map(r => ({
            category_id: categoryId, amount: r.amount,
            library_code: r.library_code, branch_code: r.branch_code,
          }))
        : [{ category_id: categoryId, amount: total, library_code: null, branch_code: null }],
      legs: legs.filter(l => l.amount > 0),
      owed: owedPersonId && shortBy > 0 ? { person_id: owedPersonId, amount: shortBy } : null,
    });
    setSaving(false);
    if (j) {
      showToast((editId ? "Updated " : "Saved ") + money(total));
      await refreshInit();
      router.push("/mf17052606");
    }
  };

  const balAfter = (() => {
    if (!primaryAccount || !init) return null;
    const a = init.accounts.find(x => x.id === primaryAccount);
    if (!a || a.balance == null) return null;
    return { name: a.bank_name, before: a.balance, after: a.balance - (legs[0]?.amount ?? 0) };
  })();

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{editId ? "Edit expense" : "Add expense"}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <label className="mf-tap mf-card" style={{ padding: "8px 12px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 8,
          background: ago > 0 ? "var(--mf-owe-bg)" : "var(--mf-surface)", color: ago > 0 ? "var(--mf-owe)" : "var(--mf-ink)" }}>
          <span>{dateLabel}{ago > 1 ? ` · ${ago} days ago` : ""}</span>
          <input type="date" value={dateIso} max={todayIso()}
            onChange={e => e.target.value && setDateIso(e.target.value)}
            style={{ width: 18, border: "none", background: "none", padding: 0, color: "inherit", fontFamily: "inherit" }} />
        </label>

        {(["PERSONAL", "LIBRARY"] as const).map(w => (
          <button key={w} onClick={() => { setWorld(w); if (w === "PERSONAL") { setSel([]); setManual({}); } }}
            className="mf-tap mf-card"
            style={{ padding: "8px 14px", fontSize: 13, border: "none",
              background: world === w ? "var(--mf-have)" : "var(--mf-surface)",
              color: world === w ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
              boxShadow: world === w ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>
            {w === "PERSONAL" ? "Personal" : "Library"}
          </button>
        ))}
      </div>

      {world === "LIBRARY" && places.length > 0 && (
        <>
          <Chips label={sel.length > 1 ? `Split across ${sel.length}` : "Which library"}>
            {places.map(pl => {
              const on = sel.some(x => x.library_code === pl.library_code && x.branch_code === pl.branch_code);
              return (
                <Chip key={pl.key} on={on} onClick={() => setSel(prev => on
                  ? prev.filter(x => !(x.library_code === pl.library_code && x.branch_code === pl.branch_code))
                  : [...prev, { library_code: pl.library_code, branch_code: pl.branch_code }])}>
                  {pl.label}
                </Chip>
              );
            })}
          </Chips>

          {sel.length > 1 && (
            <div className="mf-card" style={{ padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {(["EQUAL", "MANUAL"] as const).map(m => (
                  <Chip key={m} on={splitMode === m} onClick={() => setSplitMode(m)}>
                    {m === "EQUAL" ? "Equal" : "Manual"}
                  </Chip>
                ))}
              </div>
              {splitRows.map(r => {
                const pl = places.find(x => x.key === r.key);
                return (
                  <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--mf-ink-2)", minWidth: 0,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {pl?.label ?? r.library_code}
                    </span>
                    {splitMode === "MANUAL" ? (
                      <input
                        value={manual[r.key] ?? ""} inputMode="decimal" placeholder="0"
                        onChange={e => setManual(m => ({ ...m, [r.key]: e.target.value.replace(/[^0-9.]/g, "") }))}
                        style={{ width: 96, padding: "7px 10px", fontSize: 14, textAlign: "right",
                          fontFamily: "var(--mf-mono)", color: "var(--mf-ink)",
                          border: "1px solid var(--mf-line)", borderRadius: 8, background: "var(--mf-surface)" }}
                      />
                    ) : (
                      <span className="mf-num" style={{ fontSize: 13.5 }}>{money(r.amount)}</span>
                    )}
                  </div>
                );
              })}
              {!splitOk && (
                <div style={{ fontSize: 12, color: "var(--mf-owe)", marginTop: 8 }}>
                  The parts come to {money(splitSum)} — {money(Math.abs(total - splitSum))}{" "}
                  {splitSum > total ? "too much" : "short"} of {money(total)}.
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="mf-card" style={{ padding: "18px 16px", textAlign: "center", marginBottom: 12 }}>
        <div className="mf-num" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-.02em" }}>
          ₹{amountStr || "0"}
        </div>
      </div>

      <Chips label="What for">
        {categories.map(c => (
          <Chip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>
        ))}
        {categories.length === 0 && <Muted>No expense categories yet — add them in the Table Editor.</Muted>}
      </Chips>

      <Chips label="Paid from">
        {accounts.map(a => (
          <Chip key={a.id} on={primaryAccount === a.id} onClick={() => chooseAccount(a.id)}>
            {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
          </Chip>
        ))}
      </Chips>

      {total > 0 && shortBy > 0.005 && (
        <Chips label={`Who's owed ${money(shortBy)}`}>
          {people.map(p => (
            <Chip key={p.id} on={owedPersonId === p.id} onClick={() => setOwedPersonId(owedPersonId === p.id ? null : p.id)}>
              {p.name}
            </Chip>
          ))}
          {people.length === 0 && <Muted>No people yet — add them in the Table Editor.</Muted>}
        </Chips>
      )}

      {conflicts.length > 0 && (
        <Warn>
          <b>Already checked through {conflicts[0].checked_through}</b>
          <div style={{ marginTop: 3 }}>
            Saving on this date changes a balance you confirmed for {conflicts.map(c => c.name).join(", ")}.
            Record it today instead, or redo that check.
          </div>
          <button onClick={() => setDateIso(todayIso())} className="mf-tap"
            style={{ marginTop: 8, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12.5,
              background: "var(--mf-owe)", color: "var(--mf-owe-bg)" }}>
            Use today
          </button>
        </Warn>
      )}

      {dupe && (
        <Warn>
          <b>Looks like a repeat</b>
          <div style={{ marginTop: 3 }}>
            The same amount is already recorded on this date{dupe.description ? ` — ${dupe.description}` : ""}. Save anyway if it really happened twice.
          </div>
        </Warn>
      )}

      {balAfter && (
        <div className="mf-card" style={{ padding: "11px 14px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12.5, color: "var(--mf-ink-2)" }}>{balAfter.name} after this</span>
          <span className="mf-num" style={{ fontSize: 13.5 }}>
            {money(balAfter.before)} <span style={{ color: "var(--mf-ink-3)" }}>→</span> {money(balAfter.after)}
          </span>
        </div>
      )}

      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
        className="mf-card" style={{ width: "100%", padding: "11px 14px", fontSize: 14, marginBottom: 12,
          color: "var(--mf-ink)", fontFamily: "inherit" }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <Key onClick={() => tapKey("1")}>1</Key>
        <Key onClick={() => tapKey("2")}>2</Key>
        <Key onClick={() => tapKey("3")}>3</Key>
        <Key onClick={() => tapKey("<")}>&#9003;</Key>

        <Key onClick={() => tapKey("4")}>4</Key>
        <Key onClick={() => tapKey("5")}>5</Key>
        <Key onClick={() => tapKey("6")}>6</Key>
        <button
          onClick={save}
          disabled={!canSave}
          className="mf-tap"
          style={{
            gridColumn: 4, gridRow: "2 / span 3", border: "none", borderRadius: "var(--mf-radius)",
            background: canSave ? "var(--mf-have)" : "var(--mf-line)",
            color: canSave ? "var(--mf-have-bg)" : "var(--mf-ink-3)",
            fontSize: 14, fontWeight: 600, cursor: canSave ? "pointer" : "default",
          }}
        >
          {saving ? "Saving…" : editId ? "Update" : "Save"}
        </button>

        <Key onClick={() => tapKey("7")}>7</Key>
        <Key onClick={() => tapKey("8")}>8</Key>
        <Key onClick={() => tapKey("9")}>9</Key>

        <Key onClick={() => tapKey(".")}>.</Key>
        <Key onClick={() => tapKey("0")} wide>0</Key>
      </div>
    </div>
  );
}

function Key({ children, onClick, wide }: { children: React.ReactNode; onClick: () => void; wide?: boolean }) {
  return (
    <button onClick={onClick} className="mf-tap mf-card"
      style={{ gridColumn: wide ? "span 2" : undefined, padding: "13px 0", border: "none",
        fontSize: 17, fontFamily: "var(--mf-mono)", color: "var(--mf-ink)" }}>
      {children}
    </button>
  );
}

function Chips({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)", margin: "0 0 7px 2px" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mf-tap"
      style={{ border: "none", borderRadius: 999, padding: "7px 13px", fontSize: 13,
        background: on ? "var(--mf-have)" : "var(--mf-surface)",
        color: on ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>
      {children}
    </button>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12.5, color: "var(--mf-ink-3)" }}>{children}</span>;
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--mf-owe-bg)", color: "var(--mf-owe)", borderRadius: "var(--mf-radius)",
      padding: "11px 13px", fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
      {children}
    </div>
  );
}