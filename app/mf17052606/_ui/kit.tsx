"use client";
// MF 2.0 — UI kit. Every screen is built from these parts, so the whole app
// looks and behaves the same. Pure UI: no data fetching, no app state.
// Styling: Tailwind v4 utilities + the MF colours defined in app/globals.css
// (bg-mf-brand, text-mf-ink, border-mf-line …). Mobile only.
//
// House rules baked in: every tappable thing is at least 44px, focus is always
// visible, text inputs use 16px (no iOS zoom), amounts use tabular digits.

import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { money, typedAmount } from "./format";
import {
  IconBack, IconClose, IconHome, IconBook, IconPlus, IconBank, IconMore, IconIn, IconCheck,
  IconPeople, IconChart, IconRepeat, IconAsset, IconFolder, IconSettings, IconLock, IconChevron, IconBackspace, IconCalendar,
} from "./icons";

export const BASE = "/mf17052606";
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
/** The look of anything "on" or primary: glassy black. */
export const ACTIVE = "mf-glass-btn text-white";

// ── Page frame ──────────────────────────────────────────────────────
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("mx-auto w-full max-w-[560px] px-4 pb-6", className)}>{children}</main>;
}

/** Sticky page header: back, title (+ small line under it), optional actions on the right. */
export function TopBar({ title, sub, back, right }: {
  title: ReactNode; sub?: ReactNode; back?: string | (() => void); right?: ReactNode;
}) {
  return (
    <header className="mf-glass-light sticky top-0 z-30 -mx-4 mb-2 flex items-center gap-1 border-b border-transparent px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
      {back && (typeof back === "string"
        ? <IconButton label="Back" href={back} className="-ml-2"><IconBack /></IconButton>
        : <IconButton label="Back" onClick={back} className="-ml-2"><IconBack /></IconButton>)}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[19px] font-bold tracking-[-0.01em] text-mf-ink">{title}</h1>
        {sub && <p className="truncate text-[12px] font-medium text-mf-ink-3">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={cx("rounded-mf border border-mf-line bg-mf-surface shadow-mf-card", pad && "p-4", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex min-h-[24px] items-center justify-between px-1">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">{children}</h2>
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
        <div className="truncate text-[15px] font-medium text-mf-ink">{title}</div>
        {sub && <div className="mt-0.5 truncate text-[12px] text-mf-ink-3">{sub}</div>}
      </div>
      {right}
      {chevron && <IconChevron size={18} className="shrink-0 text-mf-ink-3" />}
    </>
  );
  const cls = cx("flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left",
    !last && "border-b border-mf-line", (href || onClick) && "mf-noscale active:bg-mf-bg");
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
    <span className={cx("font-mf-mono tabular-nums tracking-[-0.01em]", t === "in" && "text-mf-in", t === "out" && "text-mf-out", className)}>
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
    primary: "mf-glass-btn text-white active:brightness-90",
    secondary: "border border-mf-line bg-mf-surface text-mf-ink active:bg-mf-bg",
    ghost: "bg-transparent text-mf-brand active:bg-mf-brand-soft",
    danger: "bg-mf-out text-white active:opacity-90",
  }[variant];
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx(
        "mf-btn inline-flex select-none items-center justify-center gap-2 rounded-[14px] font-semibold transition",
        "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-mf-line disabled:bg-none disabled:text-mf-ink-3 disabled:shadow-none",
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
  const cls = cx("grid h-11 w-11 shrink-0 place-items-center rounded-full text-mf-ink-2 active:bg-mf-line/60", className);
  if (href) return <Link href={href} aria-label={label} className={cls}>{children}</Link>;
  return <button type="button" aria-label={label} onClick={onClick} className={cls}>{children}</button>;
}

// ── Choosing ────────────────────────────────────────────────────────
export function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} disabled={disabled}
      className={cx("mf-btn inline-flex min-h-[40px] max-w-full items-center rounded-full px-4 text-left text-[14px] font-medium transition",
        on ? ACTIVE : "bg-mf-surface text-mf-ink-2 ring-1 ring-inset ring-mf-line active:bg-mf-bg")}>
      <span className="truncate">{children}</span>
    </button>
  );
}

export function ChipGroup({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5">
      {label && <div className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">{label}</div>}
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <div className="mt-1.5 px-1 text-[12px] text-mf-ink-3">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: {
  value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div role="radiogroup" className={cx("grid gap-1 rounded-[14px] bg-mf-line/70 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cx("mf-btn h-10 rounded-[10px] text-[14px] font-semibold transition",
            value === o.v ? "bg-mf-surface text-mf-ink shadow-mf-card" : "text-mf-ink-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Typing ──────────────────────────────────────────────────────────
export const inputCls =
  "h-12 w-full rounded-[12px] border border-mf-line bg-mf-surface px-3.5 text-[16px] text-mf-ink outline-none transition " +
  "placeholder:text-mf-ink-3 focus:border-mf-brand focus:ring-2 focus:ring-mf-brand/20";

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">{label}</span>
      {children}
      {error
        ? <span className="mt-1.5 block px-1 text-[12px] font-medium text-mf-out">{error}</span>
        : hint ? <span className="mt-1.5 block px-1 text-[12px] text-mf-ink-3">{hint}</span> : null}
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
    warn: "bg-mf-warn-soft text-mf-warn",
    out: "bg-mf-out-soft text-mf-out",
    in: "bg-mf-in-soft text-mf-in",
    info: "bg-mf-surface text-mf-ink-2 ring-1 ring-inset ring-mf-line",
  }[tone];
  return (
    <div role={tone === "warn" || tone === "out" ? "alert" : undefined}
      className={cx("mb-4 rounded-mf px-4 py-3 text-[13.5px] leading-relaxed", look)}>
      {title && <div className="font-bold">{title}</div>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-mf-brand-soft text-mf-brand">{icon}</div>}
      <div className="text-[15px] font-semibold text-mf-ink">{title}</div>
      {body && <div className="mx-auto mt-1 max-w-[300px] text-[13px] leading-relaxed text-mf-ink-3">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("mf-skeleton block", className)} />;
}

export function ToastView({ toast }: { toast: { msg: string; type: "success" | "error" } | null }) {
  return (
    <div aria-live="polite" role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+10px)]">
      {toast && (
        <div className={cx("mf-toast-in max-w-[420px] rounded-[14px] px-4 py-3 text-center text-[14px] font-semibold text-white shadow-mf-float",
          toast.type === "error" ? "bg-mf-out" : "mf-glass-dark")}>
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
      <div aria-hidden="true" onClick={onClose} className="mf-fade-in absolute inset-0 bg-[rgb(15_23_42/0.45)]" />
      <div className="mf-sheet-up relative w-full max-w-[560px] rounded-t-[22px] bg-mf-surface px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2 shadow-mf-float">
        <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-mf-line" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-mf-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2"><IconClose size={20} /></IconButton>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

// ── Main navigation ─────────────────────────────────────────────────
type NavLink = { href: string; label: string; desc: string; icon: ComponentType<{ size?: number; className?: string }> };
export const MORE_LINKS: NavLink[] = [
  { href: BASE + "/money", label: "Money in", desc: "Income & moving money", icon: IconIn },
  { href: BASE + "/check", label: "Check", desc: "Does the bank agree?", icon: IconCheck },
  { href: BASE + "/people", label: "People", desc: "Who owes what", icon: IconPeople },
  { href: BASE + "/reports", label: "Reports", desc: "Profit & where money goes", icon: IconChart },
  { href: BASE + "/scheduled", label: "Scheduled", desc: "Rent, EMIs, bills", icon: IconRepeat },
  { href: BASE + "/assets", label: "Assets", desc: "Property, gold, deposits", icon: IconAsset },
  { href: BASE + "/setaside", label: "Set aside", desc: "Provisions & earmarks", icon: IconFolder },
  { href: BASE + "/setup", label: "Set up", desc: "Categories & people", icon: IconSettings },
];

/** Screens that are a single focused task hide the tab bar (they have their own Save bar). */
export function tabBarHidden(pathname: string): boolean {
  return pathname.startsWith(BASE + "/add");
}

function Tab({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cx("flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-mf-brand" : "text-mf-ink-3")}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export function TabBar({ onLock }: { onLock: () => void }) {
  const pathname = usePathname() || "";
  const [more, setMore] = useState(false);
  if (tabBarHidden(pathname)) return null;
  const at = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const moreActive = MORE_LINKS.some(l => at(l.href));
  return (
    <>
      <nav aria-label="Main" className="mf-glass-light fixed inset-x-0 bottom-0 z-40 border-t border-mf-line/70 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid h-16 max-w-[560px] grid-cols-5 items-center px-1">
          <Tab href={BASE} label="Home" icon={<IconHome />} active={pathname === BASE || pathname === BASE + "/"} />
          <Tab href={BASE + "/passbook"} label="Passbook" icon={<IconBook />} active={at(BASE + "/passbook")} />
          <div className="flex justify-center">
            <Link href={BASE + "/add"} aria-label="Add expense"
              className="mf-glass-btn -mt-6 grid h-14 w-14 place-items-center rounded-full text-white ring-4 ring-mf-bg active:brightness-90">
              <IconPlus size={26} strokeWidth={2.2} />
            </Link>
          </div>
          <Tab href={BASE + "/accounts"} label="Accounts" icon={<IconBank />} active={at(BASE + "/accounts")} />
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog"
            className={cx("flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", moreActive ? "text-mf-brand" : "text-mf-ink-3")}>
            <IconMore />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="grid grid-cols-2 gap-2 pb-3">
          {MORE_LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMore(false)} aria-current={at(l.href) ? "page" : undefined}
              className={cx("rounded-mf border p-3 active:bg-mf-bg", at(l.href) ? "border-mf-brand bg-mf-brand-soft" : "border-mf-line bg-mf-surface")}>
              <l.icon size={22} className="text-mf-brand" />
              <div className="mt-2 text-[14.5px] font-semibold text-mf-ink">{l.label}</div>
              <div className="text-[12px] leading-snug text-mf-ink-3">{l.desc}</div>
            </Link>
          ))}
        </div>
        <Button variant="secondary" full onClick={() => { setMore(false); onLock(); }}>
          <IconLock size={18} /> Lock the app
        </Button>
      </Sheet>
    </>
  );
}

// ── Money entry parts (shared by Add expense and Money in) ─────────
/** Amount display + keypad. The page owns the value and the typing rules (onKey). */
export function AmountPad({ value, onKey, label = "Amount" }: { value: string; onKey: (k: string) => void; label?: string }) {
  const total = Number(value || 0);
  return (
    <Card className="mb-5 text-center">
      <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">{label}</div>
      <div aria-live="polite"
        className={cx("mt-1 font-mf-mono text-[40px] font-medium leading-tight tracking-[-0.02em]", total > 0 ? "text-mf-ink" : "text-mf-ink-3")}>
        ₹{typedAmount(value)}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {PAD_KEYS.map(k => (
          <button key={k} type="button" onClick={() => onKey(k)}
            aria-label={k === "<" ? "Delete last digit" : k === "." ? "Decimal point" : k}
            className="mf-btn grid h-12 place-items-center rounded-[12px] bg-mf-bg font-mf-mono text-[20px] font-medium text-mf-ink active:bg-mf-line">
            {k === "<" ? <IconBackspace size={22} /> : k}
          </button>
        ))}
      </div>
    </Card>
  );
}
const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "<"];

/** When: Today · Yesterday · Other date (native picker). The page passes its own date maths. */
export function DateChips({ value, onChange, ago, label, today, yesterday, title = "When" }: {
  value: string; onChange: (iso: string) => void; ago: number; label: string; today: string; yesterday: string; title?: string;
}) {
  return (
    <ChipGroup label={title} hint={ago > 1 ? <span className="font-medium text-mf-warn">{ago} days ago</span> : undefined}>
      <Chip on={ago === 0} onClick={() => onChange(today)}>Today</Chip>
      <Chip on={ago === 1} onClick={() => onChange(yesterday)}>Yesterday</Chip>
      <label className={cx("mf-noscale relative inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] font-medium",
        ago > 1 ? ACTIVE : "bg-mf-surface text-mf-ink-2 ring-1 ring-inset ring-mf-line")}>
        <IconCalendar size={16} />
        {ago > 1 ? label : "Other date"}
        <input type="date" value={value} max={today} aria-label="Pick a date"
          onChange={e => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
    </ChipGroup>
  );
}

/** Save bar pinned to the bottom: says what is still missing, then saves. */
export function SaveBar({ hint, onSave, disabled, loading, children }: {
  hint?: string; onSave: () => void; disabled: boolean; loading: boolean; children: ReactNode;
}) {
  return (
    <div className="mf-glass-light fixed inset-x-0 bottom-0 z-30 border-t border-mf-line/70 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
      <div className="mx-auto max-w-[560px]">
        {hint && <p className="mb-2 text-center text-[12.5px] font-medium text-mf-ink-3">{hint}</p>}
        <Button size="lg" full onClick={onSave} disabled={disabled} loading={loading} loadingText="Saving…">{children}</Button>
      </div>
    </div>
  );
}

/** "Yes Bank after this   ₹1,20,000 → ₹1,18,750" */
export function BalanceChange({ name, before, after, first = true }: { name: ReactNode; before: number; after: number; first?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between gap-3 py-2.5", !first && "border-t border-mf-line")}>
      <span className="min-w-0 truncate text-[13px] text-mf-ink-2">{name}</span>
      <span className="shrink-0 font-mf-mono text-[14px] text-mf-ink">
        {money(before)} <span className="text-mf-ink-3">→</span> {money(after)}
      </span>
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
      className={cx("mf-noscale flex min-h-[56px] w-full items-center gap-3 py-2.5 text-left", !last && "border-b border-mf-line")}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-mf-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-snug text-mf-ink-3">{hint}</span>}
      </span>
      <span aria-hidden="true" className={cx("relative h-7 w-12 shrink-0 rounded-full transition", on ? "mf-glass-btn" : "bg-mf-line")}>
        <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/** − n + for small whole numbers (e.g. settlement days). */
export function Stepper({ value, onChange, min = 0, max = 30, unit }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: (n: number) => string;
}) {
  const btn = "mf-btn grid h-11 w-11 place-items-center rounded-[12px] bg-mf-bg text-[20px] font-semibold text-mf-ink active:bg-mf-line disabled:text-mf-ink-3";
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" aria-label="Less" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="min-w-[88px] text-center font-mf-mono text-[16px] text-mf-ink" aria-live="polite">{unit ? unit(value) : value}</span>
      <button type="button" aria-label="More" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
