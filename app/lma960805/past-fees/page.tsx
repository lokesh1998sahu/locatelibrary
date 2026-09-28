"use client";

// LMA — Past library fees: fee income for months before LMA was fully used.
// One entry per library/branch per month, holding:
//   • date-wise lines   (date + amount + tag and/or bank) — count on their date
//   • month-total lines (amount + tag and/or bank, no date) — whole-month periods only
//   • an unknown remainder (total only) — whole-month periods only, never in any bank
// Any tag can go with any bank. Lines with a bank also appear on that bank's MF
// passbook (month totals on the month's last day). Deleting needs a reason and
// can be undone.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import { TopBar, Card, Chip, Sheet, Button, Empty, Skeleton, Field, TextInput, SectionTitle, ScopeChips, BASE, cx } from "../_ui/kit";
import { IconCalendar, IconPlus } from "../_ui/icons";
import { inr } from "../_ui/format";

const API = "/api/lma960805";
type Line = { kind: "DATE" | "MONTH"; line_date?: string | null; amount: number; tag: string; bank: string };
type Entry = { id: number; library: string; branch: string; month: string; remainder: number; note: string; deleted: boolean;
  deleted_reason: string; created_at: string; updated_at: string; lines: Line[]; known: number; total: number };
type Bank = { bank_code: string; bank_name: string; owner_name: string; active: boolean; opening_date: string | null };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym: string) => (MON[Number(ym.slice(5, 7)) - 1] || ym) + " " + ym.slice(0, 4);
const lastDay = (ym: string) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return ym + "-" + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0"); };
const r2 = (n: number) => Math.round(n * 100) / 100;
const unitOf = (e: { library: string; branch: string }) => e.branch || e.library;

export default function PastFees() {
  const { showToast } = useLMA();
  const chips = useScopeChips();
  const [scope, setScope] = useState("");
  const [data, setData] = useState<{ ready: boolean; this_month: string; entries: Entry[]; banks: Bank[] } | null>(null);
  const [edit, setEdit] = useState<Entry | "new" | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}?action=getPastFees`).then(x => x.json());
      setData({ ready: r.ready !== false, this_month: r.this_month || "", entries: r.entries || [], banks: r.banks || [] });
    } catch { showToast("Couldn't load past fees", "error"); setData(d => d ?? { ready: true, this_month: "", entries: [], banks: [] }); }
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const inScope = (e: Entry) => !scope || unitOf(e) === scope || e.library === scope;
  const active = (data?.entries || []).filter(e => !e.deleted && inScope(e));
  const deleted = (data?.entries || []).filter(e => e.deleted && inScope(e));
  const total = active.reduce((a, e) => a + e.total, 0);

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-28">
      <TopBar back={BASE + "/today"} title="Past fees" sub="Fee income from months before LMA"
        right={data?.ready ? <Button variant="secondary" className="h-10 px-3 text-[14px]" onClick={() => setEdit("new")}><IconPlus size={17} /> Add</Button> : undefined} />

      {data && !data.ready ? (
        <Card className="mt-2"><p className="text-[13.5px] leading-relaxed text-lma-ink-2">Past fees isn’t set up yet. Run <b className="font-lma-mono">past-library-fees-setup.sql</b> once in Supabase, then reopen this screen.</p></Card>
      ) : (
        <>
          <ScopeChips chips={chips} value={scope} onChange={setScope} />
          {data === null ? (
            <div className="mt-3 space-y-2">{[0, 1, 2].map(i => <Card key={i}><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3 w-56" /></Card>)}</div>
          ) : active.length === 0 ? (
            <Card className="mt-3">
              <Empty icon={<IconCalendar size={22} />} title="No past months yet"
                body="Add fee totals for months before LMA — per tag and bank if you know them, or just a total."
                action={<Button onClick={() => setEdit("new")}>Add a month</Button>} />
            </Card>
          ) : (
            <>
              <p className="mb-2 mt-3 px-1 text-[12.5px] text-lma-ink-3">{active.length} {active.length === 1 ? "month" : "months"} · {inr(total)} in all</p>
              <div className="space-y-2">
                {active.map(e => {
                  const dw = e.lines.filter(l => l.kind === "DATE").reduce((a, l) => a + l.amount, 0);
                  const mt = e.lines.filter(l => l.kind === "MONTH").reduce((a, l) => a + l.amount, 0);
                  return (
                    <button key={e.id} type="button" onClick={() => setEdit(e)}
                      className="lma-noscale flex w-full overflow-hidden rounded-[18px] border border-lma-line bg-lma-surface text-left shadow-lma-card active:bg-lma-bg">
                      <span aria-hidden="true" className="w-1.5 shrink-0 bg-[#7c3aed]" />
                      <span className="min-w-0 flex-1 px-3.5 py-3">
                        <span className="flex items-baseline gap-2">
                          <span className="text-[15px] font-semibold text-lma-ink">{monthName(e.month)}</span>
                          <span className="text-[12.5px] font-semibold text-lma-ink-3">{unitOf(e)}</span>
                          <span className="ml-auto font-lma-mono text-[15px] font-semibold text-lma-ink">{inr(e.total)}</span>
                        </span>
                        <span className="mt-1 block truncate text-[12px] text-lma-ink-3">
                          {[dw ? `${inr(dw)} date-wise` : "", mt ? `${inr(mt)} month totals` : "", e.remainder ? `${inr(e.remainder)} unknown` : ""].filter(Boolean).join(" · ")}
                        </span>
                        {e.note && <span className="mt-0.5 block truncate text-[12px] text-lma-ink-3">{e.note}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {deleted.length > 0 && (
            <>
              <button type="button" onClick={() => setShowDeleted(v => !v)} aria-expanded={showDeleted}
                className="mt-5 flex w-full items-center justify-between px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">
                <span>Deleted · {deleted.length}</span><span className="normal-case tracking-normal">{showDeleted ? "Hide" : "Show"}</span>
              </button>
              {showDeleted && (
                <div className="mt-2 space-y-2">
                  {deleted.map(e => <DeletedRow key={e.id} e={e} onDone={load} />)}
                </div>
              )}
            </>
          )}
        </>
      )}

      <Sheet open={edit !== null} onClose={() => setEdit(null)}
        title={edit === "new" ? "Past month" : edit ? `${monthName(edit.month)} · ${unitOf(edit)}` : ""}>
        {edit !== null && data && (
          <PastForm key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} banks={data.banks} thisMonth={data.this_month}
            defaultUnit={scope}
            onDone={async () => { setEdit(null); await load(); }}
            onOpenExisting={id => { const e = data.entries.find(x => x.id === id); if (e) setEdit(e); }} />
        )}
      </Sheet>
    </div>
  );
}

function DeletedRow({ e, onDone }: { e: Entry; onDone: () => Promise<void> }) {
  const { post, showToast } = useLMA();
  const [busy, setBusy] = useState(false);
  return (
    <Card className="py-3 opacity-80">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-lma-ink">{monthName(e.month)} · {unitOf(e)} · <span className="font-lma-mono">{inr(e.total)}</span></span>
          <span className="block truncate text-[12px] text-lma-ink-3">Deleted: {e.deleted_reason || "no reason"}</span>
        </span>
        <Button variant="secondary" className="h-10 px-3 text-[13px]" loading={busy} onClick={async () => {
          setBusy(true); const j = await post("restorePastFee", { id: e.id }); setBusy(false);
          if (j) { showToast("Restored"); await onDone(); }
        }}>Restore</Button>
      </div>
    </Card>
  );
}

// ── one month: known lines + unknown remainder ──
function PastForm({ row, banks, thisMonth, defaultUnit, onDone, onOpenExisting }: {
  row: Entry | null; banks: Bank[]; thisMonth: string; defaultUnit: string;
  onDone: () => Promise<void>; onOpenExisting: (id: number) => void;
}) {
  const { init, post, showToast, confirm } = useLMA();
  // one option per operating unit: a branch where the library has branches, else the library
  const units = useMemo(() => {
    const out: { code: string; library: string; branch: string }[] = [];
    for (const l of (init?.libraries || []).filter((x: any) => x.active)) {
      const brs = (init?.branches || []).filter((b: any) => b.active && b.library_code === l.library_code);
      if (l.has_branches && brs.length) brs.forEach((b: any) => out.push({ code: b.branch_code, library: l.library_code, branch: b.branch_code }));
      else out.push({ code: l.library_code, library: l.library_code, branch: "" });
    }
    return out;
  }, [init]);
  const tags = (init?.paymentTags || []) as { tag_name: string; active: boolean }[];
  const [unit, setUnit] = useState<string>(row ? unitOf(row) : (units.some(u => u.code === defaultUnit) ? defaultUnit : ""));
  const [month, setMonth] = useState<string>(row?.month ?? "");
  const [lines, setLines] = useState<Line[]>(row ? row.lines.map(l => ({ ...l, tag: l.tag || "", bank: l.bank || "" })) : []);
  const [remStr, setRemStr] = useState(row && row.remainder ? String(row.remainder) : "");
  const [note, setNote] = useState(row?.note ?? "");
  const [info, setInfo] = useState<{ lma_total: number; existing_id: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [delReason, setDelReason] = useState<string | null>(null);

  const u = units.find(x => x.code === unit);
  useEffect(() => {
    setInfo(null);
    if (!u || !/^\d{4}-\d{2}$/.test(month)) return;
    let live = true;
    fetch(`${API}?action=pastFeesMonthInfo&library=${encodeURIComponent(u.library)}&branch=${encodeURIComponent(u.branch)}&month=${month}`)
      .then(x => x.json()).then(r => { if (live && r && r.ok !== false) setInfo({ lma_total: Number(r.lma_total || 0), existing_id: r.existing_id ?? null }); })
      .catch(() => {});
    return () => { live = false; };
  }, [u?.code, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const remainder = Number(remStr || 0);
  const known = r2(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const total = r2(known + remainder);
  const clash = !!info?.existing_id && info.existing_id !== row?.id;
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const lineDate = (l: Line) => (l.kind === "DATE" ? l.line_date || "" : lastDay(month));
  // a bank line dated on/after that bank's MF opening date changes its MF balance
  const balanceHits = Array.from(new Set(lines.filter(l => l.bank && month).map(l => {
    const b = banks.find(x => x.bank_code === l.bank);
    return b?.opening_date && lineDate(l) >= b.opening_date ? l.bank : "";
  }).filter(Boolean)));

  const blocker = !u ? "Pick the library" : !/^\d{4}-\d{2}$/.test(month) ? "Pick the month"
    : (thisMonth && month > thisMonth) ? "That month hasn't happened yet"
    : clash ? "This month already has an entry"
    : lines.some(l => !(Number(l.amount) > 0)) ? "Every line needs an amount"
    : lines.some(l => !l.tag && !l.bank) ? "Every line needs a tag or a bank"
    : lines.some(l => l.kind === "DATE" && !(l.line_date && l.line_date.slice(0, 7) === month)) ? `Date-wise dates must be in ${monthName(month)}`
    : remainder < 0 ? "The unknown amount can't be negative"
    : total <= 0 ? "Add at least one amount" : "";

  const save = async () => {
    if (blocker || !u) return;
    setBusy(true);
    const j = await post("savePastFee", {
      id: row?.id, library: u.library, branch: u.branch, month, remainder, note: note.trim(),
      lines: lines.map(l => ({ kind: l.kind, line_date: l.kind === "DATE" ? l.line_date : null, amount: Number(l.amount), tag: l.tag, bank: l.bank })),
    });
    setBusy(false);
    if (j) { showToast(`${monthName(month)} · ${u.code} saved (${inr(total)})`); await onDone(); }
  };
  const remove = async () => {
    if (!row || !delReason?.trim()) return;
    const ok = await confirm({ title: `Delete ${monthName(row.month)} · ${unitOf(row)}?`, body: `${inr(row.total)} leaves every total. You can restore it from the Deleted list.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    setBusy(true);
    const j = await post("deletePastFee", { id: row.id, reason: delReason.trim() });
    setBusy(false);
    if (j) { showToast("Deleted"); await onDone(); }
  };

  return (
    <div className="pb-2">
      <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">Library</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {units.map(x => <Chip key={x.code} on={unit === x.code} onClick={() => setUnit(x.code)}>{x.code}</Chip>)}
      </div>
      <Field label="Month">
        <input type="month" value={month} max={thisMonth || undefined} onChange={e => setMonth(e.target.value)}
          className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] text-lma-ink outline-none focus:border-lma-brand" />
      </Field>

      {info && (
        clash ? (
          <div className="mb-3 rounded-[14px] bg-[#fef3c7] px-3.5 py-2.5 text-[12.5px] text-[#92400e]">
            {monthName(month)} · {u?.code} already has an entry.{" "}
            <button type="button" onClick={() => onOpenExisting(info.existing_id!)} className="font-semibold underline">Open it</button>
          </div>
        ) : (
          <p className="mb-3 rounded-[14px] bg-lma-surface px-3.5 py-2.5 text-[12.5px] leading-relaxed text-lma-ink-3 ring-1 ring-inset ring-lma-line">
            {info.lma_total > 0
              ? <>LMA already has <b className="font-lma-mono text-lma-ink-2">{inr(info.lma_total)}</b> for {u?.code} in {monthName(month)}. Add only what’s missing.</>
              : <>LMA has nothing for {u?.code} in {monthName(month)}.</>}
          </p>
        )
      )}

      <SectionTitle>Known amounts</SectionTitle>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <Card key={i} className="py-3">
            <div className="flex items-center gap-2">
              <div role="radiogroup" aria-label="Kind" className="flex rounded-full bg-lma-bg p-0.5">
                {(["DATE", "MONTH"] as const).map(k => (
                  <button key={k} type="button" role="radio" aria-checked={l.kind === k}
                    onClick={() => setLine(i, { kind: k, line_date: k === "DATE" ? (l.line_date || (month ? month + "-01" : "")) : null })}
                    className={cx("h-8 rounded-full px-3 text-[12.5px] font-semibold", l.kind === k ? "bg-lma-surface text-lma-ink shadow-lma-card" : "text-lma-ink-3")}>
                    {k === "DATE" ? "Date-wise" : "Month total"}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              <button type="button" onClick={() => setLines(ls => ls.filter((_, k) => k !== i))} aria-label="Remove line"
                className="grid h-9 w-9 place-items-center rounded-full text-lma-ink-3 active:bg-lma-bg">✕</button>
            </div>
            <div className="mt-2 flex gap-2">
              {l.kind === "DATE" && (
                <input type="date" value={l.line_date || ""} min={month ? month + "-01" : undefined} max={month ? lastDay(month) : undefined}
                  onChange={e => setLine(i, { line_date: e.target.value })} aria-label="Date"
                  className="h-11 min-w-0 flex-1 rounded-[12px] border border-lma-line bg-lma-surface px-3 text-[14px] outline-none focus:border-lma-brand" />
              )}
              <input value={l.amount ? String(l.amount) : ""} inputMode="decimal" placeholder="Amount" aria-label="Amount"
                onChange={e => setLine(i, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })}
                className={cx("h-11 rounded-[12px] border border-lma-line bg-lma-surface px-3 text-right font-lma-mono text-[14px] outline-none focus:border-lma-brand", l.kind === "DATE" ? "w-32" : "flex-1")} />
            </div>
            <div className="mt-2 px-0.5 text-[11.5px] font-semibold text-lma-ink-3">Tag (optional)</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {tags.map(t => (
                <Chip key={t.tag_name} on={l.tag === t.tag_name} onClick={() => setLine(i, { tag: l.tag === t.tag_name ? "" : t.tag_name })}>
                  {t.tag_name}{!t.active && <span className="ml-1 text-[11px] opacity-70">· off</span>}
                </Chip>
              ))}
            </div>
            <div className="mt-2 px-0.5 text-[11.5px] font-semibold text-lma-ink-3">Bank (optional)</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {banks.map(b => (
                <Chip key={b.bank_code} on={l.bank === b.bank_code} onClick={() => setLine(i, { bank: l.bank === b.bank_code ? "" : b.bank_code })}>
                  {b.bank_code}{!b.active && <span className="ml-1 text-[11px] opacity-70">· off</span>}
                </Chip>
              ))}
            </div>
            {!l.tag && !l.bank && <p className="mt-1.5 px-0.5 text-[11.5px] font-semibold text-lma-out">Pick a tag, a bank, or both.</p>}
          </Card>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" className="h-10 px-3 text-[13.5px]" onClick={() => setLines(ls => [...ls, { kind: "DATE", line_date: month ? month + "-01" : "", amount: 0, tag: "", bank: "" }])}>+ Date-wise</Button>
        <Button variant="secondary" className="h-10 px-3 text-[13.5px]" onClick={() => setLines(ls => [...ls, { kind: "MONTH", amount: 0, tag: "", bank: "" }])}>+ Month total</Button>
      </div>

      <div className="mt-4">
        <Field label="Unknown split (optional)" hint="Money you know came in that month, but not by which tag or bank. Counts in totals only.">
          <input value={remStr} inputMode="decimal" placeholder="0" onChange={e => setRemStr(e.target.value.replace(/[^0-9.]/g, ""))}
            className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-right font-lma-mono text-[15px] outline-none focus:border-lma-brand" />
        </Field>
        <Field label="Note (optional)"><TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. from the old register" /></Field>
      </div>

      <Card className="mb-3">
        <div className="flex items-baseline justify-between"><span className="text-[13px] text-lma-ink-3">Total for the month</span><span className="font-lma-mono text-[20px] font-semibold text-lma-ink">{inr(total)}</span></div>
        <div className="mt-0.5 text-[12px] text-lma-ink-3">{inr(known)} known · {inr(remainder)} unknown</div>
        {balanceHits.length > 0 && (
          <p className="mt-2 rounded-[10px] bg-[#fef3c7] px-3 py-2 text-[12px] text-[#92400e]">
            This will change the MF balance of {balanceHits.join(", ")}: the date is on or after {balanceHits.length === 1 ? "that bank's" : "those banks'"} opening date in MF.
          </p>
        )}
        <p className="mt-2 text-[11.5px] leading-relaxed text-lma-ink-3">Date-wise amounts count on their date. Month totals and the unknown split count only when a report covers the whole month.</p>
      </Card>

      <Button size="lg" full disabled={!!blocker || busy} loading={busy} loadingText="Saving…" onClick={save}>{blocker || (row ? "Save changes" : `Save ${inr(total)}`)}</Button>

      {row && (
        <div className="mt-4 border-t border-lma-line pt-4">
          {delReason === null ? (
            <Button variant="ghost" full onClick={() => setDelReason("")}>Delete this month</Button>
          ) : (
            <>
              <Field label="Why delete it?"><TextInput value={delReason} onChange={e => setDelReason(e.target.value)} placeholder="e.g. entered twice" autoFocus /></Field>
              <Button variant="danger" full disabled={!delReason.trim() || busy} onClick={remove}>Delete {inr(row.total)}</Button>
            </>
          )}
          <p className="mt-2 text-center text-[11.5px] text-lma-ink-3">Added {row.created_at}{row.updated_at !== row.created_at ? ` · last changed ${row.updated_at}` : ""}</p>
        </div>
      )}
    </div>
  );
}
