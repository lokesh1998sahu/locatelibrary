"use client";

// MF 2.0 — People.
// Who owes you, who you owe, and the four ways money crosses between an
// account and a person. A payable created by a part-paid expense is settled
// here, which is what stops money going into one and never coming out.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";

type Row = { id: number; name: string; phone: string; receivable: number; payable: number; net: number };
type Kind = "LEND" | "COLLECT" | "BORROW" | "REPAY";

const ACTIONS: { k: Kind; label: string; hint: string }[] = [
  { k: "COLLECT", label: "They paid me",  hint: "Money comes back to you" },
  { k: "REPAY",   label: "I paid them",   hint: "You settle what you owe" },
  { k: "LEND",    label: "I lent them",   hint: "You hand money over" },
  { k: "BORROW",  label: "I borrowed",    hint: "You take money in" },
];

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function People() {
  const { init, post, showToast, refreshInit } = useMF();
  const [rows, setRows] = useState<Row[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await post("peopleBalances");
    if (j) setRows(j.people ?? []);
  }, [post]);

  useEffect(() => { load(); }, [load]);

  const owedToYou = rows.reduce((a, r) => a + Math.max(0, r.net), 0);
  const youOwe    = rows.reduce((a, r) => a + Math.max(0, -r.net), 0);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>People</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div className="mf-card" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 11.5, color: "var(--mf-have)" }}>Owed to you</div>
          <div className="mf-num" style={{ fontSize: 18, fontWeight: 600, marginTop: 3 }}>{money(owedToYou)}</div>
        </div>
        <div className="mf-card" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 11.5, color: "var(--mf-owe)" }}>You owe</div>
          <div className="mf-num" style={{ fontSize: 18, fontWeight: 600, marginTop: 3 }}>{money(youOwe)}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mf-card" style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--mf-ink-2)", lineHeight: 1.6 }}>
          Nobody added yet. Add people in{" "}
          <Link href="/mf17052606/setup" style={{ color: "var(--mf-have)" }}>Set up</Link>.
        </div>
      ) : (
        <div className="mf-card" style={{ padding: "0 14px" }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--mf-line)" }}>
              <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="mf-tap"
                style={{ width: "100%", border: "none", background: "none", padding: "12px 0",
                  textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, color: "var(--mf-ink)" }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--mf-ink-3)", marginTop: 2 }}>
                    {r.net === 0 ? "settled up" : r.net > 0 ? "owes you" : "you owe"}
                  </span>
                </span>
                <span className="mf-num" style={{ fontSize: 14,
                  color: r.net === 0 ? "var(--mf-ink-3)" : r.net > 0 ? "var(--mf-have)" : "var(--mf-owe)" }}>
                  {r.net === 0 ? "—" : money(Math.abs(r.net))}
                </span>
              </button>

              {openId === r.id && (
                <Form person={r} busy={busy} setBusy={setBusy}
                  onDone={async () => { setOpenId(null); await refreshInit(); await load(); }}
                  post={post} showToast={showToast}
                  accounts={init?.accounts.filter(a => !a.is_liability) ?? []} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Form({ person, accounts, post, showToast, onDone, busy, setBusy }: {
  person: Row;
  accounts: { id: number; bank_name: string; owner_name: string }[];
  post: (a: string, p?: any) => Promise<any | null>;
  showToast: (m: string, t?: "success" | "error") => void;
  onDone: () => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [kind, setKind] = useState<Kind>(person.net < 0 ? "REPAY" : "COLLECT");
  const [amountStr, setAmountStr] = useState(person.net === 0 ? "" : String(Math.abs(person.net)));
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [dateIso, setDateIso] = useState(todayIso);

  const amount = Number(amountStr || 0);
  const ok = amount > 0 && !!accountId && !busy;

  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("personMove", {
      person_id: person.id, account_id: accountId, amount, kind, entry_date: dateIso,
    });
    setBusy(false);
    if (j) { showToast("Recorded " + money(amount)); await onDone(); }
  };

  return (
    <div style={{ padding: "2px 0 14px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {ACTIONS.map(a => (
          <Chip key={a.k} on={kind === a.k} onClick={() => setKind(a.k)}>{a.label}</Chip>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginBottom: 10 }}>
        {ACTIONS.find(a => a.k === kind)?.hint}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={amountStr} inputMode="decimal" placeholder="Amount"
          onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
          style={{ flex: 1, padding: "10px 12px", fontSize: 15, fontFamily: "var(--mf-mono)",
            color: "var(--mf-ink)", border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
        <input type="date" value={dateIso} max={todayIso()}
          onChange={e => e.target.value && setDateIso(e.target.value)}
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

      <button onClick={go} disabled={!ok} className="mf-tap"
        style={{ border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 600,
          background: ok ? "var(--mf-have)" : "var(--mf-line)",
          color: ok ? "var(--mf-have-bg)" : "var(--mf-ink-3)", cursor: ok ? "pointer" : "default" }}>
        {busy ? "Saving…" : "Record it"}
      </button>
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