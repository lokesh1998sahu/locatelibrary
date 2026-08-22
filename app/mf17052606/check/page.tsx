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

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Check</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {accounts.map(a => (
          <Chip key={a.id} on={accountId === a.id} onClick={() => { setAccountId(a.id); setRealStr(""); }}>
            {a.bank_name}
          </Chip>
        ))}
        {accounts.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--mf-ink-2)", lineHeight: 1.6 }}>
            No account has an opening balance yet. Set one in{" "}
            <Link href="/mf17052606/setup" style={{ color: "var(--mf-have)" }}>Set up</Link>.
          </div>
        )}
      </div>

      {accountId && (
        <label className="mf-card mf-tap" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>
          <span>As at {onDate === todayIso() ? "today" : onDate}</span>
          <input type="date" value={onDate} max={todayIso()}
            onChange={e => e.target.value && setOnDate(e.target.value)}
            style={{ width: 18, border: "none", background: "none", padding: 0, color: "inherit", fontFamily: "inherit" }} />
        </label>
      )}

      {prep?.needs_setup && (
        <div className="mf-card" style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--mf-ink-2)", lineHeight: 1.6 }}>
          {prep.name} has no opening balance, so there is nothing to compare against yet.
        </div>
      )}

      {prep && !prep.needs_setup && (
        <>
          <div className="mf-card" style={{ padding: "16px", marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, color: "var(--mf-ink-2)" }}>MF 2.0 says</div>
            <div className="mf-num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.02em", marginTop: 3 }}>
              {money(app)}
            </div>
            {prep.last_check && (
              <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginTop: 8 }}>
                Last checked {prep.last_check.checked_on}
                {Math.abs(prep.last_check.difference) < 0.005 ? " — matched" : ` — was off by ${money(prep.last_check.difference)}`}
              </div>
            )}
          </div>

          <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)", margin: "0 0 7px 2px" }}>
            What does the bank say
          </div>
          <input
            value={realStr} inputMode="decimal" placeholder="Real balance"
            onChange={e => setRealStr(e.target.value.replace(/[^0-9.\-]/g, ""))}
            className="mf-card"
            style={{ width: "100%", padding: "12px 14px", fontSize: 18, fontFamily: "var(--mf-mono)",
              color: "var(--mf-ink)", marginBottom: 12 }}
          />

          {diff != null && (
            <div className="mf-card" style={{ padding: "14px 16px", marginBottom: 12,
              background: matched ? "var(--mf-have-bg)" : "var(--mf-owe-bg)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: matched ? "var(--mf-have)" : "var(--mf-owe)" }}>
                {matched ? "They match." : `Off by ${money(Math.abs(diff))}`}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4,
                color: matched ? "var(--mf-have)" : "var(--mf-owe)" }}>
                {matched
                  ? "Everything on or before this date is confirmed."
                  : diff > 0
                    ? "The bank has more than MF 2.0 knows about — money came in that was never recorded."
                    : "The bank has less than MF 2.0 thinks — something went out that was never recorded."}
              </div>
              {!matched && (
                <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--mf-owe)" }}>
                  Open the{" "}
                  <Link href="/mf17052606/passbook" style={{ color: "var(--mf-owe)", fontWeight: 600 }}>passbook</Link>{" "}
                  and scroll to where the two stop agreeing — that line is the answer.
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="mf-card" style={{ padding: "12px 14px", marginBottom: 12, fontSize: 12.5, color: "var(--mf-ink-2)", lineHeight: 1.6 }}>
              Check saved{done.adjusted ? ` and settled with an adjustment of ${money(done.diff)} — it appears in the passbook and can be removed there.` : "."}
            </div>
          )}

          {diff != null && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn busy={busy} onClick={() => submit(false)}>
                {matched ? "Confirm the match" : "Save the check"}
              </Btn>
              {!matched && (
                <Btn busy={busy} ghost onClick={() => submit(true)}>
                  Settle the difference
                </Btn>
              )}
            </div>
          )}

          {!matched && diff != null && (
            <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", lineHeight: 1.6, marginTop: 10 }}>
              Saving the check records the difference without changing anything — use it when you
              intend to go looking. Settling writes a visible adjustment so the balance agrees;
              only do that once you accept the money is genuinely gone or genuinely arrived.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mf-tap"
      style={{ border: "none", borderRadius: 999, padding: "7px 13px", fontSize: 13,
        background: on ? "var(--mf-have)" : "var(--mf-surface)",
        color: on ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>
      {children}
    </button>
  );
}

function Btn({ busy, ghost, onClick, children }: { busy: boolean; ghost?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={busy} className="mf-tap"
      style={{ border: "none", borderRadius: 9, padding: "11px 18px", fontSize: 14, fontWeight: 600,
        background: ghost ? "var(--mf-surface)" : "var(--mf-have)",
        color: ghost ? "var(--mf-ink-2)" : "var(--mf-have-bg)",
        boxShadow: ghost ? "inset 0 0 0 1px var(--mf-line)" : "none",
        opacity: busy ? .6 : 1 }}>
      {busy ? "Saving…" : children}
    </button>
  );
}