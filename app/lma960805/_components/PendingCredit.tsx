"use client";

// LMA — "⏳ ₹X received but not yet credited" (Dashboard and the Ledger).
// Money already received whose bank credit date is after today. Tapping the
// line shows where it is on its way to: grouped by bank, with the tags inside,
// each with the day it should land. "Open in Ledger" shows that bank's
// upcoming credits.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, BASE, cx } from "../_ui/kit";
import { inr } from "../_ui/format";

export type PendingRow = { tag: string; bank: string; amount: number; lands: string };   // lands = YYYY-MM-DD

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return y ? `${d}-${MON[m - 1]}` : "—"; };
const dmyLink = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}-${m}-${y}`; };

export default function PendingCredit({ rows, today, scope, className }: {
  rows: PendingRow[];
  today: string;            // YYYY-MM-DD
  scope?: string;           // library/branch shown on the screen, carried into the Ledger link
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const last = rows.reduce((a, r) => (r.lands > a ? r.lands : a), "");

  // bank → its tags (a tag may land on more than one day)
  const banks = useMemo(() => {
    const m = new Map<string, { bank: string; amount: number; first: string; last: string; tags: PendingRow[] }>();
    for (const r of rows) {
      const k = r.bank || "";
      const b = m.get(k) || { bank: k, amount: 0, first: r.lands, last: r.lands, tags: [] };
      b.amount += r.amount;
      if (r.lands < b.first) b.first = r.lands;
      if (r.lands > b.last) b.last = r.lands;
      const t = b.tags.find(x => x.tag === r.tag && x.lands === r.lands);
      if (t) t.amount += r.amount; else b.tags.push({ ...r });
      m.set(k, b);
    }
    return Array.from(m.values())
      .map(b => ({ ...b, tags: b.tags.sort((a, c) => (a.lands.localeCompare(c.lands)) || (c.amount - a.amount)) }))
      .sort((a, c) => (a.first.localeCompare(c.first)) || (c.amount - a.amount));
  }, [rows]);

  if (!rows.length || total <= 0) return null;

  const openBank = (bank: string, upto: string) => {
    const q = new URLSearchParams({ dim: "bank", key: bank, from: dmyLink(today), to: dmyLink(upto), p: "custom", basis: "credit" });
    if (scope) q.set("lib", scope);
    setOpen(false);
    router.push(`${BASE}/dashboard/ledger?${q.toString()}`);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={cx("lma-noscale mt-3 flex w-full items-center gap-2 rounded-[12px] bg-white/15 px-3 py-2 text-left text-[12px] font-semibold text-white active:bg-white/25", className)}>
        <span className="min-w-0 flex-1">⏳ {inr(total)} received but not yet credited · lands by {dm(last)}</span>
        <span aria-hidden="true" className="shrink-0 text-[14px] opacity-80">›</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Not yet credited">
        <p className="mb-3 px-1 text-[13px] leading-relaxed text-lma-ink-3">
          {inr(total)} is already received but reaches the bank after today — by {dm(last)} at the latest.
          Around Sundays and holidays a bank may credit a day later.
        </p>
        <div className="space-y-2 pb-2">
          {banks.map(b => (
            <div key={b.bank || "none"} className="overflow-hidden rounded-[16px] border border-lma-line bg-lma-surface">
              <div className="flex items-center gap-3 px-3.5 py-3">
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-[15px] font-semibold", b.bank ? "text-lma-ink" : "text-lma-out")}>{b.bank || "No bank set"}</span>
                  <span className="block text-[12px] text-lma-ink-3">
                    lands {b.first === b.last ? dm(b.first) : `${dm(b.first)} – ${dm(b.last)}`}
                  </span>
                </span>
                <span className="font-lma-mono text-[16px] font-semibold text-lma-in">{inr(b.amount)}</span>
              </div>
              <div className="border-t border-lma-line bg-lma-bg/60 px-3.5 py-2">
                {b.tags.map((t, i) => (
                  <div key={t.tag + t.lands + i} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
                    <span className="min-w-0 truncate text-lma-ink-2">{t.tag || "no tag"} <span className="text-lma-ink-3">· lands {dm(t.lands)}</span></span>
                    <span className="shrink-0 font-lma-mono text-lma-ink-2">{inr(t.amount)}</span>
                  </div>
                ))}
              </div>
              {b.bank && (
                <button type="button" onClick={() => openBank(b.bank, b.last)}
                  className="lma-noscale w-full border-t border-lma-line px-3.5 py-2.5 text-left text-[13px] font-semibold text-lma-brand active:bg-lma-bg">
                  Open in Ledger ›
                </button>
              )}
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
