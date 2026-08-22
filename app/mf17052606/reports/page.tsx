"use client";

// MF 2.0 — Reports.
// Library P&L reads income from LMA on its settlement date and expenses from
// MF 2.0 on theirs, both already attributed to a library and branch. Spending
// reads categories. Neither recomputes a balance — they are period sums, and
// nothing here can disagree with the passbook.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";

type View = "PNL" | "SPEND";
type Period = "THIS_MONTH" | "LAST_MONTH" | "THIS_YEAR";

type PnlRow = { library_code: string; branch_code: string | null; income: number; expense: number; profit: number };
type Cat = { name: string; kind: string; total: number; entries: number };

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
  const { post } = useMF();
  const [view, setView] = useState<View>("PNL");
  const [period, setPeriod] = useState<Period>("THIS_MONTH");
  const [world, setWorld] = useState<"ALL" | "PERSONAL" | "LIBRARY">("ALL");
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

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Reports</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <Seg on={view === "PNL"} onClick={() => setView("PNL")}>Library P&amp;L</Seg>
        <Seg on={view === "SPEND"} onClick={() => setView("SPEND")}>Spending</Seg>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <Chip on={period === "THIS_MONTH"} onClick={() => setPeriod("THIS_MONTH")}>This month</Chip>
        <Chip on={period === "LAST_MONTH"} onClick={() => setPeriod("LAST_MONTH")}>Last month</Chip>
        <Chip on={period === "THIS_YEAR"}  onClick={() => setPeriod("THIS_YEAR")}>This year</Chip>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginBottom: 12 }}>
        {r.label} · {r.from} to {r.to}
      </div>

      {busy && !pnl && !spend ? <Muted>Loading…</Muted> : view === "PNL" ? (
        <>
          {pnl && (
            <div className="mf-card" style={{ padding: "14px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, color: "var(--mf-ink-2)" }}>Profit across all libraries</div>
              <div className="mf-num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.02em", marginTop: 3,
                color: pnl.totals.profit < 0 ? "var(--mf-owe)" : "var(--mf-ink)" }}>
                {money(pnl.totals.profit)}
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
                <Small label="Collected" value={money(pnl.totals.income)} tone="have" />
                <Small label="Spent" value={money(pnl.totals.expense)} tone="owe" />
              </div>
            </div>
          )}

          {!pnl || pnl.rows.length === 0 ? (
            <Empty>Nothing in this period yet.</Empty>
          ) : (
            <div className="mf-card" style={{ padding: "0 14px" }}>
              {pnl.rows.map((row, i) => (
                <div key={row.library_code + (row.branch_code ?? "")}
                  style={{ padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--mf-line)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 14, color: "var(--mf-ink)" }}>
                      {row.library_code}{row.branch_code ? " · " + row.branch_code : ""}
                    </span>
                    <span className="mf-num" style={{ fontSize: 14, fontWeight: 600,
                      color: row.profit < 0 ? "var(--mf-owe)" : "var(--mf-have)" }}>
                      {money(row.profit)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                    <span style={{ fontSize: 11.5, color: "var(--mf-ink-3)" }}>
                      in <span className="mf-num">{money(row.income)}</span>
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--mf-ink-3)" }}>
                      out <span className="mf-num">{money(row.expense)}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", lineHeight: 1.6, marginTop: 12 }}>
            Income counts on the day it reached the bank, not the day it was collected — so a
            month's figure matches what actually landed.
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {(["ALL", "PERSONAL", "LIBRARY"] as const).map(w => (
              <Chip key={w} on={world === w} onClick={() => setWorld(w)}>
                {w === "ALL" ? "Everything" : w === "PERSONAL" ? "Personal" : "Library"}
              </Chip>
            ))}
          </div>

          {spend && (
            <div className="mf-card" style={{ padding: "14px 16px", marginBottom: 12, display: "flex", gap: 18 }}>
              <Small label="Spent" value={money(spend.spent)} tone="owe" big />
              <Small label="Earned" value={money(spend.earned)} tone="have" big />
            </div>
          )}

          {!spend || spend.expenses.length === 0 ? (
            <Empty>Nothing recorded in this period.</Empty>
          ) : (
            <Bars title="Where it went" rows={spend.expenses} tone="owe" />
          )}
          {spend && spend.income.length > 0 && <Bars title="Where it came from" rows={spend.income} tone="have" />}
        </>
      )}
    </div>
  );
}

function Bars({ title, rows, tone }: { title: string; rows: Cat[]; tone: "have" | "owe" }) {
  const max = Math.max(...rows.map(r => Math.abs(r.total)), 1);
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase",
        color: "var(--mf-ink-3)", margin: "16px 0 8px 2px" }}>{title}</div>
      <div className="mf-card" style={{ padding: "4px 14px 10px" }}>
        {rows.map((r, i) => (
          <div key={r.name} style={{ padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--mf-line)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13.5, color: "var(--mf-ink)" }}>{r.name}</span>
              <span className="mf-num" style={{ fontSize: 13.5 }}>{money(r.total)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 3, background: "var(--mf-line)", marginTop: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(2, (Math.abs(r.total) / max) * 100)}%`,
                background: tone === "owe" ? "var(--mf-owe)" : "var(--mf-have)", borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--mf-ink-3)", marginTop: 4 }}>
              {r.entries} {r.entries === 1 ? "entry" : "entries"}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Small({ label, value, tone, big }: { label: string; value: string; tone: "have" | "owe"; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: tone === "owe" ? "var(--mf-owe)" : "var(--mf-have)" }}>{label}</div>
      <div className="mf-num" style={{ fontSize: big ? 20 : 15, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mf-tap"
      style={{ flex: 1, border: "none", borderRadius: 999, padding: "8px 0", fontSize: 13,
        background: on ? "var(--mf-have)" : "var(--mf-surface)",
        color: on ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>{children}</button>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mf-tap"
      style={{ border: "none", borderRadius: 999, padding: "7px 13px", fontSize: 13,
        background: on ? "var(--mf-have)" : "var(--mf-surface)",
        color: on ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>{children}</button>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="mf-card" style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--mf-ink-2)" }}>{children}</div>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12.5, color: "var(--mf-ink-3)" }}>{children}</span>;
}