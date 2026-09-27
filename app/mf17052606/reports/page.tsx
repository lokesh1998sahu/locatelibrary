"use client";

// MF 2.0 — Reports.
// Library P&L reads income from LMA on its settlement date and expenses from
// MF 2.0 on theirs, both already attributed to a library and branch. Spending
// reads categories. Neither recomputes a balance — they are period sums, and
// nothing here can disagree with the passbook.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMF, money, groupsOf, labelsOf } from "../_components/MFProvider";
import { TopBar, Card, Chip, Segmented, Empty, Skeleton, SectionTitle, BASE, cx } from "../_ui/kit";
import { IconChart } from "../_ui/icons";
import { dateLong } from "../_ui/format";

type View = "PNL" | "SPEND";
type Period = "THIS_MONTH" | "LAST_MONTH" | "THIS_YEAR";

type PnlRow = { library_code: string; branch_code: string | null; income: number; expense: number; profit: number };
type Sub = { name: string | null; total: number; entries: number };
type Cat = { name: string; kind: string; total: number; entries: number; subs?: Sub[] };

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function range(p: Period): { from: string; to: string; label: string } {
  const now = new Date();
  if (p === "THIS_MONTH") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now),
      label: now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }
  if (p === "LAST_MONTH") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: iso(s), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      label: s.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }
  return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now), label: String(now.getFullYear()) };
}

export default function Reports() {
  const { post, init } = useMF();
  const [view, setView] = useState<View>("PNL");
  const [period, setPeriod] = useState<Period>("THIS_MONTH");
  const [world, setWorld] = useState<string>("ALL");          // "ALL" or a group code
  const [pnl, setPnl] = useState<{ rows: PnlRow[]; totals: { income: number; expense: number; profit: number } } | null>(null);
  const [spend, setSpend] = useState<{ expenses: Cat[]; income: Cat[]; spent: number; earned: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const r = useMemo(() => range(period), [period]);

  const load = useCallback(async () => {
    setBusy(true);
    if (view === "PNL") {
      const j = await post("reportPnl", { from: r.from, to: r.to });
      if (j) setPnl({ rows: j.rows ?? [], totals: j.totals });
    } else {
      const j = await post("reportSpending", { from: r.from, to: r.to, world });
      if (j) setSpend({ expenses: j.expenses ?? [], income: j.income ?? [], spent: j.spent, earned: j.earned });
    }
    setBusy(false);
  }, [view, r, world, post]);

  useEffect(() => { load(); }, [load]);

  const loading = busy && (view === "PNL" ? !pnl : !spend);

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar back={BASE} title="Reports" sub="Profit and where money goes" />

      <Segmented className="mb-3" value={view} onChange={setView}
        options={[{ v: "PNL", label: "Library P&L" }, { v: "SPEND", label: "Spending" }]} />

      <div className="-mx-4 mb-1.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip on={period === "THIS_MONTH"} onClick={() => setPeriod("THIS_MONTH")}>This month</Chip>
        <Chip on={period === "LAST_MONTH"} onClick={() => setPeriod("LAST_MONTH")}>Last month</Chip>
        <Chip on={period === "THIS_YEAR"} onClick={() => setPeriod("THIS_YEAR")}>This year</Chip>
      </div>
      <p className="mb-4 px-1 text-[12px] text-mf-ink-3">{r.label} · {dateLong(r.from)} to {dateLong(r.to)}</p>

      {loading ? (
        <>
          <Card className="mb-3"><Skeleton className="h-4 w-40" /><Skeleton className="mt-3 h-8 w-48" /></Card>
          <Card pad={false}>
            {[0, 1, 2].map(i => (
              <div key={i} className={cx("flex items-center gap-3 px-4 py-4", i < 2 && "border-b border-mf-line")}>
                <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-20" />
              </div>
            ))}
          </Card>
        </>
      ) : view === "PNL" ? (
        <>
          {pnl && (
            <Card className="mb-3">
              <div className="text-[12.5px] text-mf-ink-2">Profit across all libraries</div>
              <div className={cx("mt-1 font-mf-mono text-[28px] tracking-[-0.02em]", pnl.totals.profit < 0 ? "text-mf-out" : "text-mf-ink")}>
                {money(pnl.totals.profit)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Collected" value={pnl.totals.income} tone="in" />
                <Stat label="Spent" value={pnl.totals.expense} tone="out" />
              </div>
            </Card>
          )}

          {!pnl || pnl.rows.length === 0 ? (
            <Card><Empty icon={<IconChart size={22} />} title="Nothing in this period yet"
              body="Collections and expenses appear here as soon as they are recorded." /></Card>
          ) : (
            <Card pad={false} className="overflow-hidden">
              {pnl.rows.map((row, i) => (
                <div key={row.library_code + (row.branch_code ?? "")}
                  className={cx("px-4 py-3", i < pnl.rows.length - 1 && "border-b border-mf-line")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-medium text-mf-ink">
                      {row.library_code}{row.branch_code ? " · " + row.branch_code : ""}
                    </span>
                    <span className={cx("font-mf-mono text-[15px] font-semibold", row.profit < 0 ? "text-mf-out" : "text-mf-in")}>
                      {money(row.profit)}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-4 text-[12px] text-mf-ink-3">
                    <span>In <span className="font-mf-mono">{money(row.income)}</span></span>
                    <span>Out <span className="font-mf-mono">{money(row.expense)}</span></span>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <p className="mt-4 px-1 text-[12px] leading-relaxed text-mf-ink-3">
            Income counts on the day it reached the bank, not the day it was collected, so a month’s
            figure matches what actually landed. Expenses count on their own date. Nothing here can
            disagree with the passbook.
          </p>
        </>
      ) : (
        <>
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <Chip on={world === "ALL"} onClick={() => setWorld("ALL")}>Everything</Chip>
            {groupsOf(init).map(g => (
              <Chip key={g.code} on={world === g.code} onClick={() => setWorld(g.code)}>{g.name}</Chip>
            ))}
          </div>

          {spend && (
            <Card className="mb-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Spent" value={spend.spent} tone="out" big />
                <Stat label="Earned" value={spend.earned} tone="in" big />
              </div>
            </Card>
          )}

          {!spend || spend.expenses.length === 0 ? (
            <Card><Empty icon={<IconChart size={22} />} title="Nothing recorded in this period"
              body="Add an expense or some money in, and it shows up here by category." /></Card>
          ) : (
            <Bars title="Where it went" rows={spend.expenses} tone="out" subLabel={labelsOf(init).subhead} />
          )}
          {spend && spend.income.length > 0 && <Bars title="Where it came from" rows={spend.income} tone="in" subLabel={labelsOf(init).subhead} />}

          <p className="mt-4 px-1 text-[12px] leading-relaxed text-mf-ink-3">
            {labelsOf(init).head} totals for the period, biggest first. Tap one to see its {labelsOf(init).subhead.toLowerCase()}s.
            They are sums of what you recorded — no balance is recalculated here.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: number; tone: "in" | "out"; big?: boolean }) {
  return (
    <div className="rounded-[14px] bg-mf-bg px-3 py-2.5">
      <div className={cx("text-[11.5px] font-semibold", tone === "in" ? "text-mf-in" : "text-mf-out")}>{label}</div>
      <div className={cx("mt-0.5 font-mf-mono text-mf-ink", big ? "text-[21px]" : "text-[17px]")}>{money(value)}</div>
    </div>
  );
}

function Bars({ title, rows, tone, subLabel }: { title: string; rows: Cat[]; tone: "in" | "out"; subLabel: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const top = Math.max(...rows.map(r => Math.abs(r.total)), 1);
  const sum = rows.reduce((a, r) => a + Math.abs(r.total), 0) || 1;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Card className="space-y-3">
        {rows.map(r => {
          const share = Math.round((Math.abs(r.total) / sum) * 100);
          const key = r.name + r.kind;
          const subs = (r.subs || []).filter(x => x.total !== 0);
          const hasSubs = subs.some(x => x.name);          // only heads that actually use sub-heads open up
          const isOpen = open === key && hasSubs;
          return (
            <div key={key}>
              <Row asButton={hasSubs} onClick={() => setOpen(isOpen ? null : key)} expanded={isOpen}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-[14px] text-mf-ink">
                    {hasSubs && <span aria-hidden="true" className="text-mf-ink-3 transition" style={{ display: "inline-block", transform: isOpen ? "rotate(90deg)" : "none" }}>›</span>}
                    {r.name}
                  </span>
                  <span className="font-mf-mono text-[14px] text-mf-ink">{money(r.total)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mf-line">
                  <div className={cx("h-full rounded-full", tone === "in" ? "bg-mf-in" : "bg-mf-out")}
                    style={{ width: `${Math.max(2, Math.round((Math.abs(r.total) / top) * 100))}%` }} />
                </div>
                <div className="mt-1 text-[11.5px] text-mf-ink-3">
                  {share}% · {r.entries} {r.entries === 1 ? "entry" : "entries"}{hasSubs && !isOpen ? ` · tap for ${subLabel.toLowerCase()}s` : ""}
                </div>
              </Row>
              {isOpen && (
                <div className="mt-2 space-y-1.5 rounded-[12px] bg-mf-bg px-3 py-2.5">
                  {subs.map(x => (
                    <div key={x.name ?? "—"} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className={cx("truncate", x.name ? "text-mf-ink-2" : "italic text-mf-ink-3")}>{x.name ?? `No ${subLabel.toLowerCase()}`}</span>
                      <span className="shrink-0 font-mf-mono text-mf-ink-2">{money(x.total)} <span className="text-mf-ink-3">· {x.entries}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </>
  );
}

// A head with sub-heads is a button that opens them; one without is plain text (never looks switched off).
function Row({ asButton, onClick, expanded, children }: { asButton: boolean; onClick: () => void; expanded: boolean; children: ReactNode }) {
  return asButton
    ? <button type="button" onClick={onClick} aria-expanded={expanded} className="mf-noscale block w-full text-left">{children}</button>
    : <div>{children}</div>;
}
