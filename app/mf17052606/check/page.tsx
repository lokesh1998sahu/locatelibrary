"use client";

// MF 2.0 — Check.
// Pick an account, type what the bank actually says, and see whether MF 2.0
// agrees. A matching check confirms every entry on or before that date.
//
// A difference is never quietly absorbed. You can settle it, but only as a
// visible ADJUSTMENT entry you can find in the passbook and undo — a balance
// moves because something was recorded, never because a screen decided so.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";
import { TopBar, Card, Chip, ChipGroup, Button, Banner, Empty, Field, cx, ACTIVE, BASE } from "../_ui/kit";
import { IconCheck, IconCalendar } from "../_ui/icons";
import { dateLong, dayLabel } from "../_ui/format";

type Prep = {
  needs_setup: boolean;
  account_id?: number;
  name: string;
  on_date: string;
  app_balance?: number;
  last_check?: { checked_on: string; real_balance: number; difference: number } | null;
};

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function Check() {
  const { init, post, showToast, refreshInit } = useMF();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [onDate, setOnDate] = useState(todayIso);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [realStr, setRealStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ diff: number; adjusted: boolean } | null>(null);

  const accounts = init?.accounts.filter(a => a.is_set_up) ?? [];

  const load = useCallback(async () => {
    if (!accountId) { setPrep(null); return; }
    const j = await post("checkPrepare", { account_id: accountId, on_date: onDate });
    if (j) { setPrep(j as Prep); setDone(null); }
  }, [accountId, onDate, post]);

  useEffect(() => { load(); }, [load]);

  const app = prep?.app_balance ?? 0;
  const typed = realStr.trim() === "" ? null : Number(realStr);
  const diff = typed == null ? null : Math.round((typed - app) * 100) / 100;
  const matched = diff != null && Math.abs(diff) < 0.005;

  const submit = async (settle: boolean) => {
    if (!accountId || typed == null) return;
    setBusy(true);
    const j = await post("saveCheck", {
      account_id: accountId, on_date: onDate,
      real_balance: typed, app_balance: app, settle,
    });
    setBusy(false);
    if (j) {
      setDone({ diff: j.difference, adjusted: !!j.adjusted });
      showToast(j.adjusted ? "Checked and settled" : "Check saved");
      await refreshInit();
      await load();
    }
  };

  const acc = accountId != null ? accounts.find(a => a.id === accountId) ?? null : null;
  const isToday = onDate === todayIso();

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar title="Check" sub="Does the bank agree with MF?" back={BASE} />

      {accounts.length === 0 ? (
        <Card>
          <Empty icon={<IconCheck size={22} />} title="Nothing to check yet"
            body="No account has an opening balance yet, so there is nothing to compare against."
            action={<Link href={BASE + "/accounts"} className="text-[14px] font-semibold text-mf-ink underline">Set one in Accounts</Link>} />
        </Card>
      ) : (
        <ChipGroup label="Which account">
          {accounts.map(a => (
            <Chip key={a.id} on={accountId === a.id} onClick={() => { setAccountId(a.id); setRealStr(""); }}>
              {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {accountId && (
        <ChipGroup label="As at">
          <Chip on={isToday} onClick={() => setOnDate(todayIso())}>Today</Chip>
          <label className={cx("mf-noscale relative inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] font-medium",
            !isToday ? ACTIVE : "bg-mf-surface text-mf-ink-2 ring-1 ring-inset ring-mf-line")}>
            <IconCalendar size={16} />
            {!isToday ? dayLabel(onDate) : "Other date"}
            <input type="date" value={onDate} max={todayIso()} aria-label="Pick a date"
              onChange={e => e.target.value && setOnDate(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
        </ChipGroup>
      )}

      {prep?.needs_setup && (
        <Banner tone="info">{prep.name} has no opening balance, so there is nothing to compare against yet.</Banner>
      )}

      {prep && !prep.needs_setup && (
        <>
          <section className="mf-glass-dark mb-5 rounded-[22px] p-5 text-white">
            <div className="text-[13px] font-semibold text-white/75">MF says{isToday ? "" : `, on ${dateLong(onDate)}`}</div>
            <div className="mt-1 font-mf-mono text-[32px] font-medium leading-none tracking-[-0.02em]">{money(app)}</div>
            {prep.last_check && (
              <div className="mt-3 text-[12px] text-white/70">
                Last checked {dateLong(prep.last_check.checked_on)}
                {Math.abs(prep.last_check.difference) < 0.005 ? " · matched" : ` · was off by ${money(prep.last_check.difference)}`}
              </div>
            )}
          </section>

          <Field label="What does the bank say">
            <input value={realStr} inputMode="decimal" placeholder="Balance in the bank app or statement"
              onChange={e => setRealStr(e.target.value.replace(/[^0-9.\-]/g, ""))}
              className="h-14 w-full rounded-[14px] border border-mf-line bg-mf-surface px-4 font-mf-mono text-[22px] text-mf-ink outline-none transition placeholder:font-mf-sans placeholder:text-[15px] placeholder:text-mf-ink-3 focus:border-mf-ink focus:ring-2 focus:ring-mf-brand/15" />
          </Field>

          {diff != null && (
            <div role="status" className={cx("mb-4 rounded-mf px-4 py-3.5", matched ? "bg-mf-in-soft text-mf-in" : "bg-mf-out-soft text-mf-out")}>
              <div className="text-[15px] font-bold">{matched ? "They match." : `Off by ${money(Math.abs(diff))}`}</div>
              <div className="mt-1 text-[13px] leading-relaxed">
                {matched
                  ? "Everything on or before this date is confirmed."
                  : diff > 0
                    ? "The bank has more than MF knows about: money came in that was never recorded."
                    : "The bank has less than MF thinks: something went out that was never recorded."}
              </div>
              {!matched && (
                <div className="mt-2 text-[13px]">
                  Open the <Link href={`${BASE}/passbook?account=${accountId}`} className="font-bold underline">passbook for {acc?.bank_name ?? "this account"}</Link> and
                  look for where the two stop agreeing. That line is the answer.
                </div>
              )}
            </div>
          )}

          {done && (
            <Banner tone="in">
              Check saved{done.adjusted ? ` and settled with an adjustment of ${money(done.diff)}. It appears in the passbook and can be removed there.` : "."}
            </Banner>
          )}

          {diff != null && (
            <div className="grid gap-2">
              <Button size="lg" full loading={busy} loadingText="Saving…" onClick={() => submit(false)}>
                {matched ? "Confirm the match" : "Save the check"}
              </Button>
              {!matched && (
                <Button size="lg" full variant="secondary" disabled={busy} onClick={() => submit(true)}>
                  Settle the difference
                </Button>
              )}
            </div>
          )}

          {!matched && diff != null && (
            <p className="mt-3 px-1 text-[12px] leading-relaxed text-mf-ink-3">
              Saving the check records the difference without changing anything; use it when you intend to go looking.
              Settling writes a visible adjustment so the balance agrees. Only do that once you accept the money is
              genuinely gone or genuinely arrived.
            </p>
          )}
        </>
      )}
    </div>
  );
}
