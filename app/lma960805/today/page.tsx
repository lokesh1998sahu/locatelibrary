"use client";

// LMA — Today. The seat chart is the front door; this is the money view behind
// the bolt button: what came in (for any period), what needs chasing, how full
// the library is, and how full it is. Every figure opens the Ledger.
//
// It merges the old Home and Dashboard screens, so there is one place for the
// numbers instead of two that had to agree.

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLMA, useScopeChips } from "../_components/LMAProvider";
import OccupancyCard from "../_components/OccupancyCard";
import PeriodPicker from "../_components/PeriodPicker";
import { periodOf, isPreset, dmyOf, isoOf, localFromIso, ledgerHref, type Period, type LedgerDim, type LedgerSrc } from "../_lib/period";
import { Screen, Card, ScopeChips, Skeleton, SectionTitle, IconButton, Empty, BASE, cx } from "../_ui/kit";
import { IconRefresh, IconLock, IconRepeat, IconWallet, IconChevron, IconChart } from "../_ui/icons";
import { inr } from "../_ui/format";

const API = "/api/lma960805";

interface BreakRow { key: string; gross: number; refund: number; net: number }
interface DailyPt { date: string; gross: number; refund: number; net: number }
interface Dash {
  ok: boolean;
  range: { from: string; to: string; from_ymd: number; to_ymd: number };
  scope: string;
  headline: { net: number; gross_in: number; refund_out: number; outstanding_dues: number; active_students: number };
  counts: { receipts: number; dues_payments: number; misc_entries: number; refunds: number };
  by_source: { RECEIPTS: number; DUES: number; MISC: number; REFUNDS: number };
  by_library: BreakRow[]; by_fees_mode: BreakRow[]; by_tag: BreakRow[];
  daily: DailyPt[];
}

const _MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDMY = (iso: string) => { const p = String(iso).slice(0, 10).split("-"); return p.length === 3 ? `${+p[2]}-${_MON[+p[1] - 1]}-${p[0]}` : iso; };
const fmtDM = (iso: string) => { const p = String(iso).slice(0, 10).split("-"); return p.length === 3 ? `${+p[2]}-${_MON[+p[1] - 1]}` : iso; };
const short = (n: number) => { const a = Math.abs(n); if (a >= 100000) return (n / 100000).toFixed(a >= 1000000 ? 0 : 1) + "L"; if (a >= 1000) return (n / 1000).toFixed(a >= 10000 ? 0 : 1) + "k"; return String(Math.round(n)); };
const greeting = () => { const h = new Date().getHours(); if (h < 12) return "Good morning"; if (h < 17) return "Good afternoon"; return "Good evening"; };

// Coming back from the Ledger puts you back on the same chip and period.
const RETURN_KEY = "lma.dashboard.return";
type Saved = { scope: string; preset: string; from: string; to: string };
function readSaved(): Saved | null {
  if (typeof window === "undefined") return null;
  try { const s = window.sessionStorage.getItem(RETURN_KEY); return s ? JSON.parse(s) as Saved : null; } catch { return null; }
}
function periodFromSaved(s: Saved | null): Period | null {
  if (!s) return null;
  if (isPreset(s.preset)) return periodOf(s.preset);
  const f = localFromIso(s.from), t = localFromIso(s.to);
  return f && t ? { preset: "custom", from: f, to: t } : null;
}

export default function TodayPage() {
  const router = useRouter();
  const { lock } = useLMA();
  const [saved] = useState<Saved | null>(() => readSaved());
  const [scope, setScope] = useState(saved?.scope ?? "");
  const [period, setPeriod] = useState<Period>(() => periodFromSaved(saved) ?? periodOf("today"));
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(false);
  const [badges, setBadges] = useState<{ renewals: number; dues: number } | null>(null);
  const [occKey, setOccKey] = useState(1);
  const alertsFor = useRef<string | null>(null);

  useEffect(() => { try { window.sessionStorage.removeItem(RETURN_KEY); } catch { /* storage blocked */ } }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ action: "getDashboard", from: dmyOf(period.from), to: dmyOf(period.to) });
    if (scope) p.set("library", scope);
    try {
      const r: Dash = await fetch(`${API}?${p}`).then(x => x.json());
      setData(r && r.ok ? r : null);
    } catch { setData(null); }
    setLoading(false);
  }, [period, scope]);
  useEffect(() => { load(); }, [load]);

  // Expired and dues counts don't depend on the period, so they reload per chip.
  const loadAlerts = useCallback(async () => {
    alertsFor.current = scope || "ALL";
    const sp = (a: string) => { const p = new URLSearchParams({ action: a }); if (scope) p.set("library", scope); return p.toString(); };
    try {
      const [ren, dues] = await Promise.all([
        fetch(`${API}?${sp("getRenewalsQueue")}`).then(r => r.json()).catch(() => null),
        fetch(`${API}?${sp("getPendingDues")}`).then(r => r.json()).catch(() => null),
      ]);
      setBadges({ renewals: ren?.expired?.length || 0, dues: dues?.pending?.length || dues?.total || 0 });
    } catch { setBadges({ renewals: 0, dues: 0 }); }
  }, [scope]);
  useEffect(() => { if (alertsFor.current !== (scope || "ALL")) loadAlerts(); }, [scope, loadAlerts]);

  const chips = useScopeChips();
  const isToday = period.preset === "today";

  const openLedger = (o: { dim?: LedgerDim; key?: string; src?: LedgerSrc; period?: Period }) => {
    const dim = o.dim || "all";
    try { window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ scope, preset: period.preset, from: isoOf(period.from), to: isoOf(period.to) })); } catch { /* storage blocked */ }
    router.push(ledgerHref({ dim, key: o.key, src: o.src, period: o.period || period, lib: dim === "library" ? "" : scope }));
  };
  const openDay = (iso: string) => { const d = localFromIso(iso); if (d) openLedger({ period: { preset: "custom", from: d, to: d } }); };

  return (
    <Screen>
      <header className="flex items-start justify-between pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-lma-ink-3">{greeting()}</p>
          <h1 className="mt-0.5 text-[24px] font-bold tracking-[-0.02em] text-lma-ink">Today</h1>
        </div>
        <div className="flex items-center">
          <IconButton label="Refresh" onClick={() => { load(); loadAlerts(); setOccKey(k => k + 1); }}>
            <IconRefresh size={19} className={loading ? "animate-spin" : ""} />
          </IconButton>
          <IconButton label="Lock the app" onClick={lock} className="-mr-2"><IconLock size={20} /></IconButton>
        </div>
      </header>

      <ScopeChips chips={chips} value={scope} onChange={setScope} />
      <PeriodPicker value={period} onChange={setPeriod} />

      {/* what came in */}
      <button type="button" onClick={() => openLedger({})}
        className="lma-glass-dark w-full rounded-[22px] p-5 text-left text-white active:brightness-95">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white/75">
            {isToday ? "Collected today" : "Collected"}{scope ? ` · ${scope}` : ""}
          </span>
          <span className="text-[12px] font-semibold text-white/75">All entries ›</span>
        </div>
        {data ? (
          <>
            <div className="mt-1 font-lma-mono text-[34px] font-medium leading-none tracking-[-0.02em]">{inr(data.headline.net)}</div>
            <div className="mt-1.5 text-[11.5px] text-white/75">
              {isToday ? "" : `${data.range.from} → ${data.range.to} · `}
              In {inr(data.headline.gross_in)} · Refunds {inr(data.headline.refund_out)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label={isToday ? "Receipts today" : "Receipts"} value={String(data.counts.receipts)} />
              <Stat label="Dues outstanding" value={inr(data.headline.outstanding_dues)} />
            </div>
          </>
        ) : loading ? (
          <div className="mt-2">
            <Skeleton className="h-9 w-44 bg-white/20" />
            <div className="mt-4 grid grid-cols-2 gap-3"><Skeleton className="h-10 bg-white/15" /><Skeleton className="h-10 bg-white/15" /></div>
          </div>
        ) : (
          <p className="mt-2 text-[14px] text-white/85">Couldn’t load the numbers. Tap ↻ above.</p>
        )}
      </button>

      {/* what needs chasing */}
      {badges && (badges.renewals > 0 || badges.dues > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {badges.renewals > 0 && (
            <AlertLink href={BASE + "/renewals"} icon={<IconRepeat size={19} />} tone="out"
              title={`${badges.renewals} expired`} sub="to renew or close" />
          )}
          {badges.dues > 0 && (
            <AlertLink href={BASE + "/dues"} icon={<IconWallet size={19} />} tone="warn"
              title={`${badges.dues} with dues`} sub="to collect" />
          )}
        </div>
      )}

      {data && (
        <div className={loading ? "opacity-50 transition" : "transition"}>
          {/* counts — each opens that kind of entry */}
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <Count n={data.counts.receipts} label="receipts" onClick={() => openLedger({ src: "RECEIPTS" })} />
            <Count n={data.counts.dues_payments} label="dues" onClick={() => openLedger({ src: "DUES" })} />
            <Count n={data.counts.misc_entries} label="misc" onClick={() => openLedger({ src: "MISC" })} />
            <Count n={data.counts.refunds} label="refunds" onClick={() => openLedger({ src: "REFUNDS" })} />
          </div>

          <SectionTitle action={<button type="button" onClick={() => openLedger({})} className="text-[12.5px] font-semibold text-lma-brand">All entries</button>}>
            Day by day
          </SectionTitle>
          <Card><DailyChart daily={data.daily} onDay={openDay} /></Card>

          {data.by_library.length > 0 && (
            <>
              <SectionTitle>By library</SectionTitle>
              <Card pad={false} className="overflow-hidden">
                {data.by_library.map((r, i) => (
                  <BreakRowView key={r.key} row={r} last={i === data.by_library.length - 1}
                    color={chips.find(c => c.code === r.key)?.color} onClick={() => openLedger({ dim: "library", key: r.key })} />
                ))}
              </Card>
            </>
          )}

          {data.by_fees_mode.length > 0 && (
            <>
              <SectionTitle>By bank</SectionTitle>
              <Card pad={false} className="overflow-hidden">
                {data.by_fees_mode.map((r, i) => (
                  <BreakRowView key={r.key} row={r} last={i === data.by_fees_mode.length - 1}
                    onClick={() => openLedger({ dim: "bank", key: r.key })} />
                ))}
              </Card>
            </>
          )}

          {data.by_tag.length > 0 && (
            <>
              <SectionTitle>By payment tag</SectionTitle>
              <Card pad={false} className="overflow-hidden">
                {data.by_tag.map((r, i) => (
                  <BreakRowView key={r.key} row={r} last={i === data.by_tag.length - 1}
                    onClick={() => openLedger({ dim: "tag", key: r.key })} />
                ))}
              </Card>
            </>
          )}

          <SectionTitle>Where it came from</SectionTitle>
          <Card className="space-y-2.5">
            {([["Receipts", data.by_source.RECEIPTS, "RECEIPTS"], ["Dues", data.by_source.DUES, "DUES"],
               ["Misc", data.by_source.MISC, "MISC"], ["Refunds", data.by_source.REFUNDS, "REFUNDS"]] as [string, number, LedgerSrc][]).map(([label, value, src]) => {
              const max = Math.max(data.by_source.RECEIPTS, data.by_source.DUES, data.by_source.MISC, data.by_source.REFUNDS, 1);
              const out = src === "REFUNDS";
              return (
                <button key={src} type="button" onClick={() => openLedger({ src })} className="lma-noscale flex w-full items-center gap-3 text-left active:opacity-70">
                  <span className="w-16 shrink-0 text-[12.5px] font-semibold text-lma-ink-2">{label}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-lma-line">
                    <span className={cx("block h-full rounded-full", out ? "bg-lma-out" : "bg-lma-brand")}
                      style={{ width: `${Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100))}%` }} />
                  </span>
                  <span className={cx("w-16 shrink-0 text-right font-lma-mono text-[13px]", out ? "text-lma-out" : "text-lma-ink")}>
                    {out && value > 0 ? "−" : ""}{short(value)}
                  </span>
                </button>
              );
            })}
          </Card>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Card className="py-3">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-lma-ink-3">Active students</div>
              <div className="mt-1 font-lma-mono text-[19px] text-lma-ink">{data.headline.active_students}</div>
            </Card>
            <Card className="py-3">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-lma-ink-3">Refunds out</div>
              <div className="mt-1 font-lma-mono text-[19px] text-lma-out">{inr(data.headline.refund_out)}</div>
            </Card>
          </div>
        </div>
      )}

      {!data && !loading && (
        <Card className="mt-3"><Empty icon={<IconChart size={22} />} title="No numbers for this period"
          body="Pick another period or library, or tap ↻ to try again." /></Card>
      )}

      <SectionTitle>How full</SectionTitle>
      <OccupancyCard scope={scope} reloadKey={occKey} />

    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-white/10 px-3 py-2.5">
      <div className="text-[11.5px] font-semibold text-white/70">{label}</div>
      <div className="mt-0.5 font-lma-mono text-[17px] font-medium">{value}</div>
    </div>
  );
}

function Count({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="lma-noscale rounded-[12px] bg-lma-surface px-1 py-2 text-center shadow-lma-card ring-1 ring-inset ring-lma-line active:bg-lma-bg">
      <span className="block font-lma-mono text-[15px] font-semibold text-lma-ink">{n}</span>
      <span className="block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-lma-ink-3">{label}</span>
    </button>
  );
}

function BreakRowView({ row, onClick, last, color }: { row: BreakRow; onClick: () => void; last?: boolean; color?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cx("lma-noscale flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-lma-bg", !last && "border-b border-lma-line")}>
      {color && <span aria-hidden="true" className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium text-lma-ink">{row.key === "—" ? "— not set" : row.key}</span>
        {row.refund > 0 && <span className="mt-0.5 block text-[11.5px] text-lma-ink-3">in {inr(row.gross)} · refunds {inr(row.refund)}</span>}
      </span>
      <span className="shrink-0 font-lma-mono text-[14.5px] text-lma-ink">{inr(row.net)}</span>
      <IconChevron size={16} className="shrink-0 text-lma-ink-3" />
    </button>
  );
}

function AlertLink({ href, icon, title, sub, tone }: { href: string; icon: React.ReactNode; title: string; sub: string; tone: "out" | "warn" }) {
  return (
    <Link href={href}
      className={cx("flex min-h-[56px] items-center gap-2.5 rounded-lma px-3.5 py-3", tone === "out" ? "bg-lma-out-soft text-lma-out" : "bg-lma-warn-soft text-lma-warn-2")}>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold">{title}</span>
        <span className="block truncate text-[11.5px] opacity-80">{sub}</span>
      </span>
      <IconChevron size={16} />
    </Link>
  );
}

// ── day-by-day bars; each column opens that day in the Ledger ──
function DailyChart({ daily, onDay }: { daily: DailyPt[]; onDay: (iso: string) => void }) {
  if (!daily || daily.length === 0) return <p className="py-6 text-center text-[13px] text-lma-ink-3">Nothing collected in this period.</p>;
  const max = Math.max(...daily.map(d => Math.max(d.net, d.gross)), 1);
  const barW = 100 / daily.length;
  const peak = daily.reduce((a, b) => (b.net > a.net ? b : a), daily[0]);
  return (
    <div>
      <svg viewBox="0 0 100 46" preserveAspectRatio="none" className="h-32 w-full">
        {[0.25, 0.5, 0.75].map(g => <line key={g} x1="0" x2="100" y1={40 - 40 * g} y2={40 - 40 * g} stroke="#eceef6" strokeWidth="0.4" />)}
        {daily.map((d, i) => {
          const h = Math.max((d.net / max) * 40, d.net > 0 ? 0.6 : 0);
          return <rect key={i} x={i * barW + barW * 0.15} y={40 - h} width={barW * 0.7} height={h} rx="0.4"
            fill={d.net === peak.net ? "#4f46e5" : "#a5b4fc"}><title>{fmtDMY(d.date)}: {inr(d.net)}</title></rect>;
        })}
        <line x1="0" x2="100" y1="40" y2="40" stroke="#e4e6ef" strokeWidth="0.5" />
        {daily.map((d, i) => (
          <rect key={"hit" + i} x={i * barW} y={0} width={barW} height={46} fill="transparent" className="cursor-pointer" onClick={() => onDay(d.date)}>
            <title>{fmtDMY(d.date)}: {inr(d.net)}</title>
          </rect>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10.5px] font-medium text-lma-ink-3">
        <span>{fmtDM(daily[0].date)}</span>
        <span className="text-lma-ink-2">Best {fmtDM(peak.date)} · {inr(peak.net)}</span>
        <span>{fmtDM(daily[daily.length - 1].date)}</span>
      </div>
    </div>
  );
}
