"use client";

// MF 2.0 — Home. "Where you stand": net worth (loads by itself when Home opens;
// refresh any time), anything due, quick actions, and every account with its
// balance. Every figure comes from the server (fin.v_account_balance and
// initLive) — this page never computes a balance.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMF } from "./_components/MFProvider";
import { Screen, Card, SectionTitle, Row, Amount, IconButton, Skeleton, Empty, BASE, cx } from "./_ui/kit";
import { IconLock, IconRefresh, IconIn, IconPlus, IconRepeat, IconChevron, IconWallet } from "./_ui/icons";
import { money, dateShort } from "./_ui/format";

const TYPE_LABEL: Record<string, string> = { BANK: "Bank", CASH: "Cash", WALLET: "Wallet", CREDIT_CARD: "Card" };

export default function MFHome() {
  const { init, live, loadLive, liveLoading, lock } = useMF();
  const [tried, setTried] = useState(!!live);
  const started = useRef(false);

  // Figures load by themselves the first time Home opens; ↻ reloads them.
  useEffect(() => {
    if (live || started.current) return;
    started.current = true;
    loadLive().finally(() => setTried(true));
  }, [live, loadLive]);

  const today = useMemo(
    () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }),
    [],
  );
  const setUp = init?.accounts.filter((a) => a.is_set_up) ?? [];
  const pending = init?.accounts.filter((a) => !a.is_set_up) ?? [];
  const t = live?.totals;
  const alerts = live?.alerts ?? null;

  return (
    <Screen>
      <header className="flex items-start justify-between pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-mf-ink-3">{today}</p>
          <h1 className="mt-0.5 text-[24px] font-bold tracking-[-0.02em] text-mf-ink">Where you stand</h1>
        </div>
        <IconButton label="Lock the app" onClick={lock} className="-mr-2"><IconLock size={20} /></IconButton>
      </header>

      {/* Net worth */}
      <section aria-label="Net worth"
        className="rounded-[20px] bg-mf-brand p-5 text-white shadow-[0_14px_30px_-14px_rgb(15_110_86/0.75)]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white/75">Net worth</span>
          <button type="button" onClick={() => loadLive()} disabled={liveLoading} aria-label="Refresh figures"
            className="mf-btn -mr-2 grid h-10 w-10 place-items-center rounded-full text-white/85 active:bg-white/10 disabled:opacity-60">
            <IconRefresh size={19} className={liveLoading ? "animate-spin" : ""} />
          </button>
        </div>

        {t ? (
          <>
            <div className="mt-1 font-mf-mono text-[34px] font-medium leading-none tracking-[-0.02em]">{money(t.net)}</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Stat label="You have" value={t.haves} />
              <Stat label="You owe" value={t.owes} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/15 pt-3 text-[12.5px]">
              <Pair k="In accounts" v={t.in_accounts} />
              <Pair k="Owed to you" v={t.owed_to_you} />
              <Pair k="You owe people" v={t.you_owe_people} />
              <Pair k="In assets" v={t.in_assets} />
            </dl>
          </>
        ) : tried && !liveLoading ? (
          <div className="mt-2">
            <p className="text-[14px] text-white/85">Couldn’t load your figures.</p>
            <button type="button" onClick={() => loadLive()}
              className="mf-btn mt-3 h-10 rounded-[12px] bg-white/15 px-4 text-[14px] font-semibold text-white active:bg-white/25">
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-2" aria-label="Loading">
            <Skeleton className="h-9 w-48 bg-white/20" />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Skeleton className="h-10 bg-white/15" />
              <Skeleton className="h-10 bg-white/15" />
            </div>
          </div>
        )}
      </section>

      {/* Anything due */}
      {alerts && (
        <Link href={BASE + "/scheduled"}
          className={cx("mt-3 flex min-h-[56px] items-center gap-3 rounded-mf px-4 py-3",
            alerts.overdue > 0 ? "bg-mf-out-soft text-mf-out" : "bg-mf-warn-soft text-mf-warn")}>
          <IconRepeat size={20} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">
              {alerts.overdue > 0
                ? `${alerts.overdue} payment${alerts.overdue === 1 ? " is" : "s are"} overdue`
                : `${alerts.due_soon} payment${alerts.due_soon === 1 ? "" : "s"} due this week`}
            </div>
            {alerts.next_name && (
              <div className="truncate text-[12px] opacity-80">Next: {alerts.next_name} on {dateShort(alerts.next_due)}</div>
            )}
          </div>
          <IconChevron size={18} />
        </Link>
      )}

      {/* Quick actions */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <QuickLink href={BASE + "/add"} icon={<IconPlus size={18} className="text-mf-out" />}>Add expense</QuickLink>
        <QuickLink href={BASE + "/money"} icon={<IconIn size={18} className="text-mf-in" />}>Money in</QuickLink>
      </div>

      {/* Accounts */}
      <SectionTitle action={<Link href={BASE + "/accounts"} className="text-[13px] font-semibold text-mf-brand">Manage</Link>}>
        Accounts
      </SectionTitle>
      <Card pad={false} className="overflow-hidden">
        {!init ? (
          [0, 1, 2].map((i) => (
            <div key={i} className={cx("flex items-center gap-3 px-4 py-4", i < 2 && "border-b border-mf-line")}>
              <div className="flex-1"><Skeleton className="h-4 w-36" /><Skeleton className="mt-2 h-3 w-24" /></div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))
        ) : setUp.length === 0 ? (
          <Empty icon={<IconWallet size={22} />} title="No balances yet"
            body="Give an account its opening balance and it shows up here with its live balance."
            action={<Link href={BASE + "/accounts"} className="text-[14px] font-semibold text-mf-brand">Set one up</Link>} />
        ) : (
          setUp.map((a, i) => (
            <Row key={a.id} href={`${BASE}/passbook?account=${a.id}`} last={i === setUp.length - 1}
              title={a.bank_name}
              sub={[a.owner_name, TYPE_LABEL[a.acct_type] || a.acct_type].filter(Boolean).join(" · ")}
              right={<Amount value={a.balance} tone={a.is_liability ? "out" : "plain"} className="text-[15px]" />} />
          ))
        )}
      </Card>

      {pending.length > 0 && (
        <>
          <SectionTitle>Not set up yet</SectionTitle>
          <Card>
            <p className="text-[13px] leading-relaxed text-mf-ink-2">
              {pending.length === 1
                ? "1 account has no opening balance, so its balance isn’t shown."
                : `${pending.length} accounts have no opening balance, so their balances aren’t shown.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {pending.map((a) => (
                <span key={a.id} className="rounded-full bg-mf-bg px-3 py-1.5 text-[12.5px] font-medium text-mf-ink-2 ring-1 ring-inset ring-mf-line">
                  {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
                </span>
              ))}
            </div>
            <Link href={BASE + "/accounts"} className="mt-2 inline-flex h-11 items-center gap-1 text-[14px] font-semibold text-mf-brand">
              Set opening balances <IconChevron size={16} />
            </Link>
          </Card>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[14px] bg-white/10 px-3 py-2.5">
      <div className="text-[11.5px] font-semibold text-white/70">{label}</div>
      <div className="mt-0.5 font-mf-mono text-[17px] font-medium">{money(value)}</div>
    </div>
  );
}

function Pair({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-white/70">{k}</dt>
      <dd className="font-mf-mono text-white">{money(v)}</dd>
    </div>
  );
}

function QuickLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href}
      className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-mf-surface text-[14.5px] font-semibold text-mf-ink ring-1 ring-inset ring-mf-line active:bg-mf-bg">
      {icon}{children}
    </Link>
  );
}
