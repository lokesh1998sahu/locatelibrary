"use client";

// MF 2.0 — Scheduled payments.
// Rent, EMIs, recurring bills. They remind; they never record themselves.
// Confirming one writes an ordinary expense, so it appears in the passbook and
// can be removed like anything else — then the schedule moves on a period.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";

type Sched = {
  id: number; name: string; amount: number;
  account_id: number | null; account_name: string | null;
  category_id: number | null; category_name: string | null;
  world: string; library_code: string | null;
  frequency: string; next_due: string; days_away: number;
  installments_total: number | null; installments_paid: number; remaining: number | null;
};

const FREQ = [
  { v: "MONTHLY", label: "Monthly" }, { v: "WEEKLY", label: "Weekly" },
  { v: "QUARTERLY", label: "Quarterly" }, { v: "YEARLY", label: "Yearly" },
  { v: "ONE_OFF", label: "One-off" },
];

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function dueText(d: number): { text: string; urgent: boolean } {
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, urgent: true };
  if (d === 0) return { text: "due today", urgent: true };
  if (d === 1) return { text: "due tomorrow", urgent: true };
  if (d <= 7) return { text: `in ${d} days`, urgent: true };
  return { text: `in ${d} days`, urgent: false };
}

export default function Schedules() {
  const { init, post, showToast, refreshInit } = useMF();
  const [rows, setRows] = useState<Sched[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await post("schedules");
    if (j) setRows(j.schedules ?? []);
  }, [post]);

  useEffect(() => { load(); }, [load]);

  const confirmPaid = async (s: Sched, accountId: number | null, paidOn: string, amount: number) => {
    setBusy(true);
    const j = await post("recordSchedule", { id: s.id, account_id: accountId, paid_on: paidOn, amount });
    setBusy(false);
    if (j) {
      showToast(j.finished ? `${s.name} — last one, done` : `Recorded ${money(amount)}`);
      setOpenId(null);
      await refreshInit();
      await load();
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>Scheduled</div>
        <button onClick={() => setAdding(a => !a)} className="mf-tap"
          style={{ border: "none", borderRadius: 999, padding: "7px 13px", fontSize: 13,
            background: adding ? "var(--mf-have)" : "var(--mf-surface)",
            color: adding ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
            boxShadow: adding ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>
          {adding ? "Close" : "New"}
        </button>
      </div>

      {adding && <NewForm onDone={async () => { setAdding(false); await load(); }} />}

      {rows.length === 0 && !adding ? (
        <div className="mf-card" style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--mf-ink-2)", lineHeight: 1.6 }}>
          Nothing scheduled. Add rent, an EMI, or any bill that repeats — it will remind you,
          and only record once you confirm it happened.
        </div>
      ) : (
        <div className="mf-card" style={{ padding: "0 14px" }}>
          {rows.map((s, i) => {
            const d = dueText(s.days_away);
            return (
              <div key={s.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--mf-line)" }}>
                <button onClick={() => setOpenId(openId === s.id ? null : s.id)} className="mf-tap"
                  style={{ width: "100%", border: "none", background: "none", padding: "12px 0",
                    textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, color: "var(--mf-ink)" }}>{s.name}</span>
                    <span style={{ display: "block", fontSize: 11, marginTop: 2,
                      color: d.urgent ? "var(--mf-owe)" : "var(--mf-ink-3)" }}>
                      {d.text}
                      {s.remaining != null ? ` · ${s.remaining} left` : ""}
                      {s.account_name ? ` · ${s.account_name}` : ""}
                    </span>
                  </span>
                  <span className="mf-num" style={{ fontSize: 14 }}>{money(s.amount)}</span>
                </button>

                {openId === s.id && (
                  <ConfirmForm s={s} busy={busy}
                    accounts={init?.accounts.filter(a => !a.is_liability) ?? []}
                    onConfirm={confirmPaid} onCancel={() => setOpenId(null)} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfirmForm({ s, accounts, onConfirm, onCancel, busy }: {
  s: Sched;
  accounts: { id: number; bank_name: string; owner_name: string }[];
  onConfirm: (s: Sched, accountId: number | null, paidOn: string, amount: number) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [accountId, setAccountId] = useState<number | null>(s.account_id ?? accounts[0]?.id ?? null);
  const [paidOn, setPaidOn] = useState(todayIso);
  const [amountStr, setAmountStr] = useState(String(s.amount));
  const amount = Number(amountStr || 0);
  const ok = amount > 0 && !!accountId && !busy;

  return (
    <div style={{ padding: "2px 0 14px" }}>
      <div style={{ fontSize: 12, color: "var(--mf-ink-2)", marginBottom: 9 }}>
        Did this actually happen? Confirming records it as an expense.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={amountStr} inputMode="decimal"
          onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
          style={{ flex: 1, padding: "10px 12px", fontSize: 15, fontFamily: "var(--mf-mono)",
            color: "var(--mf-ink)", border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
        <input type="date" value={paidOn} max={todayIso()}
          onChange={e => e.target.value && setPaidOn(e.target.value)}
          style={{ padding: "10px 12px", fontSize: 13, color: "var(--mf-ink-2)", fontFamily: "inherit",
            border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {accounts.map(a => (
          <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>
            {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
          </Chip>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => ok && onConfirm(s, accountId, paidOn, amount)} disabled={!ok} className="mf-tap"
          style={{ border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 600,
            background: ok ? "var(--mf-have)" : "var(--mf-line)",
            color: ok ? "var(--mf-have-bg)" : "var(--mf-ink-3)", cursor: ok ? "pointer" : "default" }}>
          {busy ? "Saving…" : "Yes, it happened"}
        </button>
        <button onClick={onCancel} className="mf-tap"
          style={{ border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 14,
            background: "var(--mf-surface)", color: "var(--mf-ink-2)", boxShadow: "inset 0 0 0 1px var(--mf-line)" }}>
          Not yet
        </button>
      </div>
    </div>
  );
}

function NewForm({ onDone }: { onDone: () => Promise<void> }) {
  const { init, post, showToast } = useMF();
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [freq, setFreq] = useState("MONTHLY");
  const [nextDue, setNextDue] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [totalStr, setTotalStr] = useState("");
  const [busy, setBusy] = useState(false);

  const cats = (init?.categories ?? []).filter(c => c.kind === "EXPENSE");
  const accounts = init?.accounts.filter(a => !a.is_liability) ?? [];
  const ok = !!name.trim() && Number(amountStr) > 0 && !!categoryId && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveSchedule", {
      name, amount: Number(amountStr), frequency: freq, next_due: nextDue,
      account_id: accountId, category_id: categoryId, world: "PERSONAL",
      installments_total: totalStr === "" ? null : Number(totalStr),
    });
    setBusy(false);
    if (j) { showToast("Added " + name.trim()); await onDone(); }
  };

  return (
    <div className="mf-card" style={{ padding: "14px", marginBottom: 12 }}>
      <Lbl>Name</Lbl>
      <Inp value={name} onChange={setName} placeholder="Flat rent" />
      <Lbl>Amount</Lbl>
      <Inp value={amountStr} onChange={v => setAmountStr(v.replace(/[^0-9.]/g, ""))} placeholder="0" mono />
      <Lbl>How often</Lbl>
      <Row>{FREQ.map(f => <Chip key={f.v} on={freq === f.v} onClick={() => setFreq(f.v)}>{f.label}</Chip>)}</Row>
      <Lbl>Next due</Lbl>
      <Inp value={nextDue} onChange={setNextDue} type="date" />
      <Lbl>Category</Lbl>
      <Row>{cats.map(c => <Chip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>)}</Row>
      <Lbl>Usually paid from</Lbl>
      <Row>{accounts.map(a => <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.bank_name}</Chip>)}</Row>
      <Lbl>How many payments (blank = forever)</Lbl>
      <Inp value={totalStr} onChange={v => setTotalStr(v.replace(/[^0-9]/g, ""))} placeholder="e.g. 36 for an EMI" mono />
      <button onClick={save} disabled={!ok} className="mf-tap"
        style={{ border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 600, marginTop: 4,
          background: ok ? "var(--mf-have)" : "var(--mf-line)",
          color: ok ? "var(--mf-have-bg)" : "var(--mf-ink-3)", cursor: ok ? "pointer" : "default" }}>
        {busy ? "Saving…" : "Add schedule"}
      </button>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)", margin: "0 0 5px 2px" }}>{children}</div>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{children}</div>;
}
function Inp({ value, onChange, placeholder, type, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <input value={value} type={type} placeholder={placeholder} inputMode={mono ? "decimal" : undefined}
      onChange={e => onChange(e.target.value)}
      style={{ width: "100%", padding: "10px 12px", fontSize: 14.5, marginBottom: 10,
        fontFamily: mono ? "var(--mf-mono)" : "inherit", color: "var(--mf-ink)",
        border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
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