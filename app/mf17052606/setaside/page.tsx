"use client";

// MF 2.0 — Set aside.
// Two things that look alike and behave oppositely, kept on separate tabs so
// they can never be confused:
//
//   Provisions — money you will owe later. Real ledger entries. Net worth
//                falls when you recognise one, and does not move again when
//                you pay it. No account is touched at set-aside time, so a
//                Check still balances.
//
//   Earmarks   — labels on money you already have. No entry, no line, no
//                effect on any balance. They only answer "what is free".

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";

type Prov = { id: number; name: string; note: string; balance: number };
type Mark = { id: number; name: string; amount: number; note: string; account_id: number | null; account_name: string | null };
type Tab = "PROV" | "MARK";
type Act = "SET_ASIDE" | "PAY" | "RELEASE";

const ACTS: { k: Act; label: string; hint: string }[] = [
  { k: "SET_ASIDE", label: "Set aside more", hint: "Recognises the obligation. Net worth falls; no account moves." },
  { k: "PAY",       label: "Pay it",         hint: "Cash leaves an account and the provision clears. Net worth unchanged." },
  { k: "RELEASE",   label: "Not needed",     hint: "Cancels what was set aside. Net worth comes back up." },
];

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function SetAside() {
  const { post } = useMF();
  const [tab, setTab] = useState<Tab>("PROV");
  const [provs, setProvs] = useState<Prov[]>([]);
  const [provTotal, setProvTotal] = useState(0);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [markTotal, setMarkTotal] = useState(0);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([post("provisions"), post("earmarks")]);
    if (a) { setProvs(a.provisions ?? []); setProvTotal(a.total ?? 0); }
    if (b) { setMarks(b.earmarks ?? []); setMarkTotal(b.total ?? 0); }
  }, [post]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Set aside</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Seg on={tab === "PROV"} onClick={() => setTab("PROV")}>Provisions</Seg>
        <Seg on={tab === "MARK"} onClick={() => setTab("MARK")}>Earmarks</Seg>
      </div>

      {tab === "PROV"
        ? <Provisions rows={provs} total={provTotal} reload={load} />
        : <Earmarks rows={marks} total={markTotal} reload={load} />}
    </div>
  );
}

/* ── provisions ─────────────────────────────────────────────────────── */

function Provisions({ rows, total, reload }: { rows: Prov[]; total: number; reload: () => Promise<void> }) {
  const { init, post, showToast, refreshInit } = useMF();
  const [openId, setOpenId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const j = await post("saveProvision", { name: newName });
    setBusy(false);
    if (j) { setNewName(""); showToast("Added " + newName.trim()); await reload(); }
  };

  return (
    <>
      <Note>Money you will owe later — tax, a deposit to return, a repair you have committed to.
        Recognising one lowers your net worth, because the obligation is real. Your bank balance
        is untouched until you actually pay.</Note>

      <div className="mf-card" style={{ padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "var(--mf-ink-2)" }}>Set aside in total</div>
        <div className="mf-num" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.02em",
          marginTop: 3, color: "var(--mf-owe)" }}>{money(total)}</div>
      </div>

      <div className="mf-card" style={{ padding: "12px 14px", marginBottom: 12, display: "flex", gap: 8 }}>
        <input value={newName} placeholder="New provision — e.g. Income tax"
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          style={{ flex: 1, padding: "9px 11px", fontSize: 14, color: "var(--mf-ink)", fontFamily: "inherit",
            border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
        <Btn ok={!!newName.trim() && !busy} busy={busy} onClick={add}>Add</Btn>
      </div>

      {rows.length === 0 ? <Empty>None yet.</Empty> : (
        <div className="mf-card" style={{ padding: "0 14px" }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--mf-line)" }}>
              <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="mf-tap"
                style={{ width: "100%", border: "none", background: "none", padding: "12px 0",
                  textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, fontSize: 14, color: "var(--mf-ink)" }}>{r.name}</span>
                <span className="mf-num" style={{ fontSize: 14, color: r.balance > 0 ? "var(--mf-owe)" : "var(--mf-ink-3)" }}>
                  {r.balance === 0 ? "—" : money(r.balance)}
                </span>
              </button>
              {openId === r.id && (
                <ProvForm r={r} accounts={init?.accounts.filter(a => !a.is_liability) ?? []}
                  post={post} showToast={showToast}
                  onDone={async () => { setOpenId(null); await refreshInit(); await reload(); }} />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProvForm({ r, accounts, post, showToast, onDone }: {
  r: Prov;
  accounts: { id: number; bank_name: string; owner_name: string }[];
  post: (a: string, p?: any) => Promise<any | null>;
  showToast: (m: string, t?: "success" | "error") => void;
  onDone: () => Promise<void>;
}) {
  const [act, setAct] = useState<Act>(r.balance > 0 ? "PAY" : "SET_ASIDE");
  const [amountStr, setAmountStr] = useState(r.balance > 0 ? String(r.balance) : "");
  const [dateIso, setDateIso] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  const amount = Number(amountStr || 0);
  const needsAccount = act === "PAY";
  const ok = amount > 0 && (!needsAccount || !!accountId) && !busy;

  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("provisionMove", {
      reserve_id: r.id, kind: act, amount, entry_date: dateIso,
      account_id: needsAccount ? accountId : null,
    });
    setBusy(false);
    if (j) { showToast("Recorded " + money(amount)); await onDone(); }
  };

  return (
    <div style={{ padding: "2px 0 14px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {ACTS.map(a => <Chip key={a.k} on={act === a.k} onClick={() => setAct(a.k)}>{a.label}</Chip>)}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginBottom: 10, lineHeight: 1.55 }}>
        {ACTS.find(a => a.k === act)?.hint}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={amountStr} inputMode="decimal" placeholder="Amount"
          onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
          style={{ flex: 1, padding: "10px 12px", fontSize: 15, fontFamily: "var(--mf-mono)", color: "var(--mf-ink)",
            border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
        <input type="date" value={dateIso} max={todayIso()}
          onChange={e => e.target.value && setDateIso(e.target.value)}
          style={{ padding: "10px 12px", fontSize: 13, color: "var(--mf-ink-2)", fontFamily: "inherit",
            border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
      </div>
      {needsAccount && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {accounts.map(a => (
            <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>
              {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
            </Chip>
          ))}
        </div>
      )}
      <Btn ok={ok} busy={busy} onClick={go}>Record it</Btn>
    </div>
  );
}

/* ── earmarks ───────────────────────────────────────────────────────── */

function Earmarks({ rows, total, reload }: { rows: Mark[]; total: number; reload: () => Promise<void> }) {
  const { init, post, showToast } = useMF();
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const accounts = init?.accounts.filter(a => !a.is_liability && a.is_set_up) ?? [];
  const amount = Number(amountStr || 0);
  const ok = !!name.trim() && amount > 0 && !busy;

  const add = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveEarmark", { name, amount, account_id: accountId });
    setBusy(false);
    if (j) { setName(""); setAmountStr(""); showToast("Earmarked " + money(amount)); await reload(); }
  };

  const drop = async (id: number) => {
    const j = await post("removeEarmark", { id });
    if (j) { showToast("Removed"); await reload(); }
  };

  return (
    <>
      <Note>Labels on money you already have. Nothing is recorded and no balance changes —
        these only tell you how much of a balance is already spoken for.</Note>

      <div className="mf-card" style={{ padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "var(--mf-ink-2)" }}>Spoken for</div>
        <div className="mf-num" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", marginTop: 3 }}>
          {money(total)}
        </div>
      </div>

      <div className="mf-card" style={{ padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={name} placeholder="What for" onChange={e => setName(e.target.value)}
            style={{ flex: 1, padding: "9px 11px", fontSize: 14, color: "var(--mf-ink)", fontFamily: "inherit",
              border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
          <input value={amountStr} inputMode="decimal" placeholder="Amount"
            onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
            style={{ width: 120, padding: "9px 11px", fontSize: 14, fontFamily: "var(--mf-mono)", color: "var(--mf-ink)",
              border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <Chip on={accountId === null} onClick={() => setAccountId(null)}>Any account</Chip>
          {accounts.map(a => (
            <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.bank_name}</Chip>
          ))}
        </div>
        <Btn ok={ok} busy={busy} onClick={add}>Add earmark</Btn>
      </div>

      {rows.length === 0 ? <Empty>Nothing earmarked.</Empty> : (
        <div className="mf-card" style={{ padding: "0 14px" }}>
          {rows.map((m, i) => {
            const acct = accounts.find(a => a.id === m.account_id);
            const free = acct && acct.balance != null ? acct.balance - m.amount : null;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--mf-line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: "var(--mf-ink)" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--mf-ink-3)", marginTop: 2 }}>
                    {m.account_name ?? "any account"}
                    {free != null ? ` · ${money(free)} free there` : ""}
                  </div>
                </div>
                <span className="mf-num" style={{ fontSize: 14 }}>{money(m.amount)}</span>
                <button onClick={() => drop(m.id)} className="mf-tap"
                  style={{ border: "none", background: "none", padding: "4px 2px", fontSize: 12,
                    color: "var(--mf-ink-3)", cursor: "pointer" }}>
                  remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── small pieces ───────────────────────────────────────────────────── */

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
function Btn({ ok, busy, onClick, children }: { ok: boolean; busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={!ok} className="mf-tap"
      style={{ border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 600,
        background: ok ? "var(--mf-have)" : "var(--mf-line)",
        color: ok ? "var(--mf-have-bg)" : "var(--mf-ink-3)", cursor: ok ? "pointer" : "default" }}>
      {busy ? "Saving…" : children}
    </button>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--mf-ink-2)", lineHeight: 1.6, marginBottom: 12 }}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="mf-card" style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--mf-ink-2)" }}>{children}</div>;
}