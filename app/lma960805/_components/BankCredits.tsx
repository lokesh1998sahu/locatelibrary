"use client";

// LMA — Bank credits (Dashboard): the fee money that should reach each bank,
// by the DAY it lands — today, tomorrow, and the next 7 days — whatever period
// is picked above. It isn't a bank balance: LMA only sees fee money, so it says
// what to expect on the statement. Today's credits show how much is already
// ticked off against the statement.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, Segmented, BASE, cx } from "../_ui/kit";
import { inr } from "../_ui/format";

type Tag = { tag: string; amount: number; lands: string; refund: boolean };
type Bank = { bank: string; total: number; ticked: number; tags: Tag[] };
type Day = { total: number; banks: Bank[] };
export type BankCreditsData = {
  today: string; tomorrow: string; later_to: string; ticks_ready: boolean;
  TODAY: Day; TOMORROW: Day; LATER: Day;
};
type Key = "TODAY" | "TOMORROW" | "LATER";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dt = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const wdt = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const linkDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}-${m}-${y}`; };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function BankCredits({ data, scope }: { data: BankCreditsData; scope?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<Key | null>(null);
  const laterFrom = addDays(data.tomorrow, 1);
  const tiles: { k: Key; label: string; sub: string }[] = [
    { k: "TODAY", label: "Today", sub: todaySub(data) },
    { k: "TOMORROW", label: "Tomorrow", sub: wdt(data.tomorrow) },
    { k: "LATER", label: "Next 7 days", sub: `to ${dt(data.later_to)}` },
  ];
  const nothing = !data.TODAY.banks.length && !data.TOMORROW.banks.length && !data.LATER.banks.length;
  const range = (k: Key): [string, string] => (k === "TODAY" ? [data.today, data.today] : k === "TOMORROW" ? [data.tomorrow, data.tomorrow] : [laterFrom, data.later_to]);

  const openLedger = (bank: string, k: Key) => {
    const [f, t] = range(k);
    const q = new URLSearchParams({ dim: "bank", key: bank, from: linkDate(f), to: linkDate(t), p: "custom", basis: "credit" });
    if (scope) q.set("lib", scope);
    setOpen(null);
    router.push(`${BASE}/dashboard/ledger?${q.toString()}`);
  };

  return (
    <section aria-label="Bank credits" className="mt-4 rounded-[20px] border border-lma-line bg-lma-surface p-4 shadow-lma-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold text-lma-ink"><span aria-hidden="true">🏦</span> Bank credits</h2>
        <span className="text-[11.5px] font-semibold text-lma-ink-3">by the day it lands</span>
      </div>
      {nothing ? (
        <p className="mt-2 text-[13px] text-lma-ink-3">Nothing on its way to your banks this week.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {tiles.map(t => {
            const d = data[t.k];
            const empty = !d.banks.length;
            return (
              <button key={t.k} type="button" onClick={() => setOpen(t.k)} disabled={empty}
                className={cx("lma-noscale flex min-h-[84px] flex-col rounded-[14px] px-3 py-2.5 text-left ring-1 ring-inset transition",
                  empty ? "bg-lma-bg/60 ring-lma-line" : "bg-lma-bg ring-lma-line active:bg-lma-line/60")}>
                <span className="whitespace-nowrap text-[12px] font-semibold text-lma-ink-3">{t.label}</span>
                <span className={cx("mt-1 font-lma-mono text-[16.5px] font-semibold leading-tight", empty ? "text-lma-ink-3" : d.total < 0 ? "text-lma-out" : "text-lma-ink")}>
                  {empty ? "—" : inr(d.total)}
                </span>
                <span className={cx("mt-auto pt-1 text-[11px] leading-snug", t.k === "TODAY" && todayDone(data) ? "font-semibold text-lma-in" : "text-lma-ink-3")}>{t.sub}</span>
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title="Bank credits">
        {open && (
          <div className="pb-2">
            <Segmented className="mb-3" value={open} onChange={k => setOpen(k as Key)}
              options={[{ v: "TODAY", label: "Today" }, { v: "TOMORROW", label: "Tomorrow" }, { v: "LATER", label: "Next 7 days" }]} />
            <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-lma-ink-3">
              {open === "TODAY" ? `Fee money that should show on today’s statements (${wdt(data.today)}).`
                : open === "TOMORROW" ? `Fee money that should reach the bank on ${wdt(data.tomorrow)}.`
                : `Fee money landing ${dt(laterFrom)} – ${dt(data.later_to)}.`}
              {" "}Only fee money — not a bank balance.
            </p>
            {data[open].banks.length === 0 ? (
              <p className="rounded-[16px] border border-lma-line bg-lma-surface px-4 py-8 text-center text-[13.5px] text-lma-ink-3">Nothing lands {open === "TODAY" ? "today" : open === "TOMORROW" ? "tomorrow" : "in these days"}.</p>
            ) : (
              <div className="space-y-2">
                {data[open].banks.map(b => {
                  const pct = b.total > 0 ? Math.max(0, Math.min(100, Math.round((b.ticked / b.total) * 100))) : 0;
                  return (
                    <div key={b.bank} className="overflow-hidden rounded-[16px] border border-lma-line bg-lma-surface">
                      <div className="px-3.5 pt-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[15px] font-semibold text-lma-ink">{b.bank}</span>
                          <span className={cx("font-lma-mono text-[16px] font-semibold", b.total < 0 ? "text-lma-out" : "text-lma-in")}>{inr(b.total)}</span>
                        </div>
                        {open === "TODAY" && data.ticks_ready && b.total > 0 && (
                          <div className="mt-2">
                            <div className="h-1.5 overflow-hidden rounded-full bg-lma-line"><div className="h-full rounded-full bg-lma-in" style={{ width: pct + "%" }} /></div>
                            <div className={cx("mt-1 text-[11.5px] font-semibold", pct >= 100 ? "text-lma-in" : "text-lma-ink-3")}>
                              {pct >= 100 ? "✓ All ticked on the statement" : b.ticked > 0 ? `✓ ${inr(b.ticked)} of ${inr(b.total)} ticked` : "Not ticked on the statement yet"}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 border-t border-lma-line bg-lma-bg/60 px-3.5 py-2">
                        {b.tags.map((t, i) => (
                          <div key={t.tag + t.lands + t.refund + i} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
                            <span className="min-w-0 truncate text-lma-ink-2">
                              {t.refund ? "Refund" : (t.tag || "no tag")}
                              {open === "LATER" && <span className="text-lma-ink-3"> · {wdt(t.lands)}</span>}
                            </span>
                            <span className={cx("shrink-0 font-lma-mono", t.amount < 0 ? "text-lma-out" : "text-lma-ink-2")}>{inr(t.amount)}</span>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => openLedger(b.bank, open)}
                        className="lma-noscale w-full border-t border-lma-line px-3.5 py-2.5 text-left text-[13px] font-semibold text-lma-brand active:bg-lma-bg">
                        {open === "TODAY" ? "Open in Ledger to tick ›" : "Open in Ledger ›"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-lma-ink-3">
              Days follow each tag’s settlement days. Around Sundays and holidays a bank may credit a day later.
            </p>
          </div>
        )}
      </Sheet>
    </section>
  );
}

function todayDone(d: BankCreditsData): boolean {
  const t = d.TODAY;
  return d.ticks_ready && t.total > 0 && t.banks.every(b => b.total <= 0 || b.ticked >= b.total - 0.005);
}
function todaySub(d: BankCreditsData): string {
  const t = d.TODAY;
  if (!t.banks.length) return "nothing due";
  if (!d.ticks_ready || t.total <= 0) return `${t.banks.length} bank${t.banks.length === 1 ? "" : "s"}`;
  if (todayDone(d)) return "✓ all ticked";
  const ticked = t.banks.reduce((a, b) => a + Math.max(0, b.ticked), 0);
  return ticked > 0 ? `✓ ${inr(ticked)} ticked` : "not ticked yet";
}
