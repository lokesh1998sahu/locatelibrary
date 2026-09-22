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
import { useMF, money } from "../_components/MFProvider";
import { TopBar, Card, Chip, ChipGroup, Segmented, Amount, Banner, Button, Field, TextInput, BASE, cx } from "../_ui/kit";
import { IconBackspace, IconCalendar } from "../_ui/icons";
import { typedAmount } from "../_ui/format";

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

  // Why Save is still off, in plain words. (The button itself follows canSave exactly.)
  const blocker =
    total <= 0 ? "Enter the amount" :
    !categoryId ? "Pick what it was for" :
    (paid <= 0 && !owedPersonId) ? "Pick the account it was paid from" :
    (Math.abs(shortBy) >= 0.005 && !owedPersonId) ? (shortBy > 0 ? `Pick who is owed ${money(shortBy)}` : "Paid is more than the amount") :
    (world === "LIBRARY" && sel.length === 0) ? "Pick the library" :
    (world === "LIBRARY" && !splitOk) ? "The library parts must add up to the amount" : "";

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-[calc(env(safe-area-inset-bottom)+128px)]">
      <TopBar back={BASE} title={editId ? "Edit expense" : "Add expense"} sub={loadingEdit ? "Loading the entry…" : undefined} />

      {/* Amount + keypad */}
      <Card className="mb-5 text-center">
        <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Amount</div>
        <div aria-live="polite"
          className={cx("mt-1 font-mf-mono text-[40px] font-medium leading-tight tracking-[-0.02em]", total > 0 ? "text-mf-ink" : "text-mf-ink-3")}>
          ₹{typedAmount(amountStr)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {KEYS.map(k => (
            <button key={k} type="button" onClick={() => tapKey(k)}
              aria-label={k === "<" ? "Delete last digit" : k === "." ? "Decimal point" : k}
              className="mf-btn grid h-12 place-items-center rounded-[12px] bg-mf-bg font-mf-mono text-[20px] font-medium text-mf-ink active:bg-mf-line">
              {k === "<" ? <IconBackspace size={22} /> : k}
            </button>
          ))}
        </div>
      </Card>

      {/* When */}
      <ChipGroup label="When" hint={ago > 1 ? <span className="font-medium text-mf-warn">{ago} days ago</span> : undefined}>
        <Chip on={ago === 0} onClick={() => setDateIso(todayIso())}>Today</Chip>
        <Chip on={ago === 1} onClick={() => setDateIso(shiftIso(todayIso(), -1))}>Yesterday</Chip>
        <label className={cx("mf-noscale relative inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] font-medium",
          ago > 1 ? "bg-mf-brand text-white" : "bg-mf-surface text-mf-ink-2 ring-1 ring-inset ring-mf-line")}>
          <IconCalendar size={16} />
          {ago > 1 ? dateLabel : "Other date"}
          <input type="date" value={dateIso} max={todayIso()} aria-label="Pick a date"
            onChange={e => e.target.value && setDateIso(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </ChipGroup>

      {/* Personal or library */}
      <div className="mb-5">
        <div className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">For</div>
        <Segmented value={world}
          onChange={w => { setWorld(w); if (w === "PERSONAL") { setSel([]); setManual({}); } }}
          options={[{ v: "PERSONAL", label: "Personal" }, { v: "LIBRARY", label: "Library" }]} />
      </div>

      {world === "LIBRARY" && places.length > 0 && (
        <>
          <ChipGroup label={sel.length > 1 ? `Split across ${sel.length}` : "Which library"}>
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
          </ChipGroup>

          {sel.length > 1 && (
            <Card className="mb-5">
              <Segmented className="mb-3" value={splitMode} onChange={setSplitMode}
                options={[{ v: "EQUAL", label: "Split equally" }, { v: "MANUAL", label: "Type amounts" }]} />
              {splitRows.map(r => {
                const pl = places.find(x => x.key === r.key);
                return (
                  <div key={r.key} className="flex min-h-[48px] items-center gap-3 border-b border-mf-line last:border-b-0">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-mf-ink-2">{pl?.label ?? r.library_code}</span>
                    {splitMode === "MANUAL" ? (
                      <input value={manual[r.key] ?? ""} inputMode="decimal" placeholder="0" aria-label={`Amount for ${pl?.label ?? r.library_code}`}
                        onChange={e => setManual(m => ({ ...m, [r.key]: e.target.value.replace(/[^0-9.]/g, "") }))}
                        className="h-10 w-28 rounded-[10px] border border-mf-line bg-mf-surface px-3 text-right font-mf-mono text-[16px] text-mf-ink outline-none focus:border-mf-brand focus:ring-2 focus:ring-mf-brand/20" />
                    ) : (
                      <Amount value={r.amount} className="text-[14.5px]" />
                    )}
                  </div>
                );
              })}
              {!splitOk && (
                <p className="mt-2 text-[12.5px] font-medium text-mf-out">
                  The parts come to {money(splitSum)}, which is {money(Math.abs(total - splitSum))} {splitSum > total ? "too much" : "short"} of {money(total)}.
                </p>
              )}
            </Card>
          )}
        </>
      )}

      {/* What for */}
      <ChipGroup label="What for" hint={categories.length === 0 ? "No expense categories yet. Add them in More → Set up." : undefined}>
        {categories.map(c => (
          <Chip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>
        ))}
      </ChipGroup>

      {/* Paid from */}
      <ChipGroup label="Paid from">
        {accounts.map(a => (
          <Chip key={a.id} on={primaryAccount === a.id} onClick={() => chooseAccount(a.id)}>
            {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
          </Chip>
        ))}
      </ChipGroup>

      {total > 0 && shortBy > 0.005 && (
        <ChipGroup label={`Who is owed ${money(shortBy)}`} hint={people.length === 0 ? "No people yet. Add them in More → Set up." : undefined}>
          {people.map(p => (
            <Chip key={p.id} on={owedPersonId === p.id} onClick={() => setOwedPersonId(owedPersonId === p.id ? null : p.id)}>
              {p.name}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {conflicts.length > 0 && (
        <Banner tone="warn" title={`Already checked through ${conflicts[0].checked_through}`}
          action={<Button size="md" variant="secondary" onClick={() => setDateIso(todayIso())}>Use today instead</Button>}>
          Saving on this date changes a balance you confirmed for {conflicts.map(c => c.name).join(", ")}.
          Record it today instead, or redo that check.
        </Banner>
      )}

      {dupe && (
        <Banner tone="warn" title="Looks like a repeat">
          The same amount is already recorded on this date{dupe.description ? ` (${dupe.description})` : ""}.
          Save anyway if it really happened twice.
        </Banner>
      )}

      {balAfter && (
        <Card className="mb-4 flex items-center justify-between gap-3 py-3">
          <span className="min-w-0 truncate text-[13px] text-mf-ink-2">{balAfter.name} after this</span>
          <span className="shrink-0 font-mf-mono text-[14px] text-mf-ink">
            {money(balAfter.before)} <span className="text-mf-ink-3">→</span> {money(balAfter.after)}
          </span>
        </Card>
      )}

      <Field label="Note (optional)">
        <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="What was it?" />
      </Field>

      {/* Save bar — always in reach, and says what is still missing */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-mf-line bg-mf-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-[560px]">
          {!canSave && blocker && <p className="mb-2 text-center text-[12.5px] font-medium text-mf-ink-3">{blocker}</p>}
          <Button size="lg" full onClick={save} disabled={!canSave} loading={saving} loadingText="Saving…">
            {editId ? "Update" : "Save"}{total > 0 ? ` ${money(total)}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "<"];

/** yyyy-mm-dd shifted by whole days (local calendar). */
function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
