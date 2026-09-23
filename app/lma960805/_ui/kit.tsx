"use client";
// LMA — UI kit. Every screen is built from these parts, so the whole app looks
// and behaves the same. Pure UI: no data fetching, no app state (that is why it
// can never import LMAProvider — the provider imports this).
// Styling: Tailwind v4 utilities + the LMA colours in app/globals.css
// (bg-lma-brand, text-lma-ink, border-lma-line …). Mobile only.
//
// House rules baked in: every tappable thing is at least 44px, focus is always
// visible, text inputs use 16px (no iOS zoom), amounts use tabular digits.

import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { inr as money, typedAmount } from "./format";
import {
  IconBack, IconClose, IconHome, IconSeat, IconTicket, IconRupee, IconPlus, IconMore, IconBook,
  IconUsers, IconChart, IconRepeat, IconWallet, IconUndo, IconSettings, IconLock, IconChevron,
  IconBackspace, IconCalendar, IconBolt,
} from "./icons";

export const BASE = "/lma960805";
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
/** The look of anything "on" or primary: glassy black. */
export const ACTIVE = "lma-glass-btn text-white";

// ── Page frame ──────────────────────────────────────────────────────
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("mx-auto w-full max-w-[560px] px-4 pb-[calc(92px+env(safe-area-inset-bottom))]", className)}>{children}</main>;
}

/** Sticky page header: back, title (+ small line under it), optional actions on the right. */
export function TopBar({ title, sub, back, right }: {
  title: ReactNode; sub?: ReactNode; back?: string | (() => void); right?: ReactNode;
}) {
  return (
    <header className="lma-glass-light sticky top-0 z-30 -mx-4 mb-2 flex items-center gap-1 border-b border-transparent px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
      {back && (typeof back === "string"
        ? <IconButton label="Back" href={back} className="-ml-2"><IconBack /></IconButton>
        : <IconButton label="Back" onClick={back} className="-ml-2"><IconBack /></IconButton>)}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[19px] font-bold tracking-[-0.01em] text-lma-ink">{title}</h1>
        {sub && <p className="truncate text-[12px] font-medium text-lma-ink-3">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={cx("rounded-lma border border-lma-line bg-lma-surface shadow-lma-card", pad && "p-4", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex min-h-[24px] items-center justify-between px-1">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{children}</h2>
      {action}
    </div>
  );
}

/** One line in a list. Becomes a link or button when given href / onClick. */
export function Row({ title, sub, right, href, onClick, chevron, last }: {
  title: ReactNode; sub?: ReactNode; right?: ReactNode; href?: string; onClick?: () => void; chevron?: boolean; last?: boolean;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-lma-ink">{title}</div>
        {sub && <div className="mt-0.5 truncate text-[12px] text-lma-ink-3">{sub}</div>}
      </div>
      {right}
      {chevron && <IconChevron size={18} className="shrink-0 text-lma-ink-3" />}
    </>
  );
  const cls = cx("flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left",
    !last && "border-b border-lma-line", (href || onClick) && "lma-noscale active:bg-lma-bg");
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** ₹ amount with aligned digits. tone: in = green, out = red, sign = by its sign. */
export function Amount({ value, tone = "plain", className }: {
  value: number | null | undefined; tone?: "plain" | "in" | "out" | "sign"; className?: string;
}) {
  const t = tone === "sign" ? (value != null && value < 0 ? "out" : "in") : tone;
  return (
    <span className={cx("font-lma-mono tabular-nums tracking-[-0.01em]", t === "in" && "text-lma-in", t === "out" && "text-lma-out", className)}>
      {money(value)}
    </span>
  );
}

// ── Actions ─────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

type BtnProps = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  full?: boolean;
  loading?: boolean;
  loadingText?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "primary", size = "md", full, loading, loadingText, className, disabled, children, type = "button", ...rest }: BtnProps) {
  const look = {
    primary: "lma-glass-btn text-white active:brightness-90",
    secondary: "border border-lma-line bg-lma-surface text-lma-ink active:bg-lma-bg",
    ghost: "bg-transparent text-lma-brand active:bg-lma-brand-soft",
    danger: "bg-lma-out text-white active:opacity-90",
  }[variant];
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx(
        "lma-btn inline-flex select-none items-center justify-center gap-2 rounded-[14px] font-semibold transition",
        "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-lma-line disabled:bg-none disabled:text-lma-ink-3 disabled:shadow-none",
        size === "lg" ? "h-[52px] px-5 text-[16px]" : "h-11 px-4 text-[15px]",
        look, full && "w-full", className)}
      {...rest}>
      {loading && <Spinner />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

export function IconButton({ label, onClick, href, children, className }: {
  label: string; onClick?: () => void; href?: string; children: ReactNode; className?: string;
}) {
  const cls = cx("grid h-11 w-11 shrink-0 place-items-center rounded-full text-lma-ink-2 active:bg-lma-line/60", className);
  if (href) return <Link href={href} aria-label={label} className={cls}>{children}</Link>;
  return <button type="button" aria-label={label} onClick={onClick} className={cls}>{children}</button>;
}

// ── Choosing ────────────────────────────────────────────────────────
export function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} disabled={disabled}
      className={cx("lma-btn inline-flex min-h-[40px] max-w-full items-center rounded-full px-4 text-left text-[14px] font-medium transition",
        on ? ACTIVE : "bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg")}>
      <span className="truncate">{children}</span>
    </button>
  );
}

export function ChipGroup({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5">
      {label && <div className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{label}</div>}
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <div className="mt-1.5 px-1 text-[12px] text-lma-ink-3">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: {
  value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div role="radiogroup" className={cx("grid gap-1 rounded-[14px] bg-lma-line/70 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cx("lma-btn h-10 rounded-[10px] text-[14px] font-semibold transition",
            value === o.v ? "bg-lma-surface text-lma-ink shadow-lma-card" : "text-lma-ink-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Typing ──────────────────────────────────────────────────────────
export const inputCls =
  "h-12 w-full rounded-[12px] border border-lma-line bg-lma-surface px-3.5 text-[16px] text-lma-ink outline-none transition " +
  "placeholder:text-lma-ink-3 focus:border-lma-brand focus:ring-2 focus:ring-lma-brand/20";

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{label}</span>
      {children}
      {error
        ? <span className="mt-1.5 block px-1 text-[12px] font-medium text-lma-out">{error}</span>
        : hint ? <span className="mt-1.5 block px-1 text-[12px] text-lma-ink-3">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(inputCls, className)} />;
}

// ── Telling ─────────────────────────────────────────────────────────
export function Banner({ tone = "warn", title, children, action }: {
  tone?: "warn" | "out" | "in" | "info"; title?: ReactNode; children?: ReactNode; action?: ReactNode;
}) {
  const look = {
    warn: "bg-lma-warn-soft text-lma-warn-2",
    out: "bg-lma-out-soft text-lma-out",
    in: "bg-lma-in-soft text-lma-in",
    info: "bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line",
  }[tone];
  return (
    <div role={tone === "warn" || tone === "out" ? "alert" : undefined}
      className={cx("mb-4 rounded-lma px-4 py-3 text-[13.5px] leading-relaxed", look)}>
      {title && <div className="font-bold">{title}</div>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-lma-brand-soft text-lma-brand">{icon}</div>}
      <div className="text-[15px] font-semibold text-lma-ink">{title}</div>
      {body && <div className="mx-auto mt-1 max-w-[300px] text-[13px] leading-relaxed text-lma-ink-3">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("lma-skeleton block", className)} />;
}

export function ToastView({ toast }: { toast: { msg: string; type: "success" | "error" } | null }) {
  return (
    <div aria-live="polite" role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+10px)]">
      {toast && (
        <div className={cx("lma-toast-in max-w-[420px] rounded-[14px] px-4 py-3 text-center text-[14px] font-semibold text-white shadow-lma-float",
          toast.type === "error" ? "bg-lma-out" : "lma-glass-dark")}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/** Bottom sheet. Closes on the ✕, a tap outside, or Escape. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div aria-hidden="true" onClick={onClose} className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.45)]" />
      <div className="lma-sheet-up relative w-full max-w-[560px] rounded-t-[22px] bg-lma-surface px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2 shadow-lma-float">
        <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-lma-line" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-lma-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2"><IconClose size={20} /></IconButton>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

// ── Settings parts ───────────────────────────────────────────────────
/** A labelled on/off switch row (role="switch"). */
export function SwitchRow({ label, hint, on, onChange, last }: {
  label: ReactNode; hint?: ReactNode; on: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cx("lma-noscale flex min-h-[56px] w-full items-center gap-3 py-2.5 text-left", !last && "border-b border-lma-line")}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-lma-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-snug text-lma-ink-3">{hint}</span>}
      </span>
      <span aria-hidden="true" className={cx("relative h-7 w-12 shrink-0 rounded-full transition", on ? "lma-glass-btn" : "bg-lma-line")}>
        <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/** − n + for small whole numbers (e.g. settlement days). */
export function Stepper({ value, onChange, min = 0, max = 30, unit }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: (n: number) => string;
}) {
  const btn = "lma-btn grid h-11 w-11 place-items-center rounded-[12px] bg-lma-bg text-[20px] font-semibold text-lma-ink active:bg-lma-line disabled:text-lma-ink-3";
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" aria-label="Less" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="min-w-[88px] text-center font-lma-mono text-[16px] text-lma-ink" aria-live="polite">{unit ? unit(value) : value}</span>
      <button type="button" aria-label="More" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

// ── Library / branch chips ──────────────────────────────────────────
// Every LMA screen filters by library or branch. Pages get the list from
// useScopeChips() in LMAProvider and pass it in, so this file stays pure UI.
export type ScopeChip = { code: string; label: string; emoji?: string; color?: string };
export function ScopeChips({ chips, value, onChange, counts }: {
  chips: ScopeChip[]; value: string; onChange: (code: string) => void; counts?: Record<string, number>;
}) {
  return (
    <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {chips.map(c => {
        const on = value === c.code;
        return (
          <button key={c.code || "all"} type="button" onClick={() => onChange(c.code)} aria-pressed={on}
            style={on && c.color ? { background: c.color, color: "#fff" } : undefined}
            className={cx("lma-btn inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold",
              on && !c.color ? ACTIVE : on ? "" : "bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg")}>
            {c.emoji && <span aria-hidden="true">{c.emoji}</span>}
            {c.label}
            {counts && (
              <span className={cx("rounded-full px-1.5 py-px text-[11px] font-bold", on ? "bg-white/25 text-white" : "bg-lma-bg text-lma-ink-3")}>
                {counts[c.code] ?? 0}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main navigation ─────────────────────────────────────────────────
// Ordered by how the app is actually used: the seat chart is where almost
// everything happens, then enquiry codes, then misc income. Direct admission
// sits in the + sheet, at the bottom, because it is rare.
type NavLink = { href: string; label: string; desc: string; icon: ComponentType<{ size?: number; className?: string }> };
export const MORE_LINKS: NavLink[] = [
  { href: BASE + "/renewals",        label: "Renewals",  desc: "Expiring & cancellations",    icon: IconRepeat },
  { href: BASE + "/dues",            label: "Dues",      desc: "Pending & written-off",       icon: IconWallet },
  { href: BASE + "/students",        label: "Students",  desc: "Browse & edit",               icon: IconUsers },
  { href: BASE + "/receipts",        label: "Receipts",  desc: "Full log & edits",            icon: IconBook },
  { href: BASE + "/refunds",         label: "Refunds",   desc: "Issue & track",               icon: IconUndo },
  { href: BASE + "/dashboard/ledger",label: "Ledger",    desc: "Every entry behind a figure", icon: IconBook },
  { href: BASE + "/settings",        label: "Settings",  desc: "Libraries, fees, layouts",    icon: IconSettings },
];
// The centre button: the two jumps that are not tabs. Enquiry and Misc are tabs
// already; the money screen (Today + Dashboard) and direct admission live here.
const QUICK_LINKS: NavLink[] = [
  { href: BASE + "/today",      label: "Today & Dashboard", desc: "Collection, alerts, occupancy, analytics", icon: IconChart },
  { href: BASE + "/vacant",     label: "Vacant seats",      desc: "What is free · list to send out",          icon: IconSeat },
  { href: BASE + "/admissions", label: "Direct admission",  desc: "Without opening the seat chart",           icon: IconPlus },
];

/** Screens that are a single focused task hide the tab bar. */
export function tabBarHidden(pathname: string): boolean {
  return pathname.startsWith(BASE + "/admissions");
}

function Tab({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cx("flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-lma-brand" : "text-lma-ink-3")}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function LinkGrid({ links, onPick, at }: { links: NavLink[]; onPick: () => void; at: (p: string) => boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 pb-3">
      {links.map(l => (
        <Link key={l.href} href={l.href} onClick={onPick} aria-current={at(l.href) ? "page" : undefined}
          className={cx("rounded-lma border p-3 active:bg-lma-bg", at(l.href) ? "border-lma-brand bg-lma-brand-soft" : "border-lma-line bg-lma-surface")}>
          <l.icon size={22} className="text-lma-brand" />
          <div className="mt-2 text-[14.5px] font-semibold text-lma-ink">{l.label}</div>
          <div className="text-[12px] leading-snug text-lma-ink-3">{l.desc}</div>
        </Link>
      ))}
    </div>
  );
}

export function TabBar({ onLock }: { onLock: () => void }) {
  const pathname = usePathname() || "";
  const [more, setMore] = useState(false);
  const [quick, setQuick] = useState(false);
  if (tabBarHidden(pathname)) return null;
  const at = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const moreActive = MORE_LINKS.some(l => at(l.href));
  return (
    <>
      <nav aria-label="Main" className="lma-glass-light fixed inset-x-0 bottom-0 z-40 border-t border-lma-line/70 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid h-16 max-w-[560px] grid-cols-5 items-center px-1">
          <Tab href={BASE + "/board"} label="Seat chart" icon={<IconSeat />} active={pathname === BASE || at(BASE + "/board")} />
          <Tab href={BASE + "/intake"} label="Enquiry" icon={<IconTicket />} active={at(BASE + "/intake")} />
          <div className="flex justify-center">
            <button type="button" onClick={() => setQuick(true)} aria-haspopup="dialog" aria-label="Quick jumps"
              className="lma-glass-btn -mt-6 grid h-14 w-14 place-items-center rounded-full text-white ring-4 ring-lma-bg active:brightness-95">
              <IconBolt size={25} strokeWidth={2} />
            </button>
          </div>
          <Tab href={BASE + "/misc-income"} label="Misc" icon={<IconRupee />} active={at(BASE + "/misc-income")} />
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog"
            className={cx("flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", moreActive ? "text-lma-brand" : "text-lma-ink-3")}>
            <IconMore />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={quick} onClose={() => setQuick(false)} title="Jump to">
        <LinkGrid links={QUICK_LINKS} onPick={() => setQuick(false)} at={at} />
      </Sheet>

      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <LinkGrid links={MORE_LINKS} onPick={() => setMore(false)} at={at} />
        <Button variant="secondary" full onClick={() => { setMore(false); onLock(); }}>
          <IconLock size={18} /> Lock the app
        </Button>
      </Sheet>
    </>
  );
}
