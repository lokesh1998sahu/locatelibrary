"use client";

// MF 2.0 — Money in / Move money.
// Two entry types on one screen because they share a shape: an amount, a date,
// and where it lands. Kept apart from Add expense, which has its own
// complications (splits, part payments, who is owed).
//
// Neither screen decides whether an entry balances — it sends the lines and
// the database's guard rail is the judge.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";

type Mode = "IN" | "MOVE";

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function prettyDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const t = new Date(todayIso() + "T00:00:00");
  const ago = Math.round((t.getTime() - d.getTime()) / 86400000);
  const label = ago === 0 ? "Today" : ago === 1 ? "Yesterday"
    : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return { label, ago };
}

export default function MoneyInOrMove() {
  const { init, post, showToast, refreshInit } = useMF();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("IN");
  const [amountStr, setAmountStr] = useState("");
  const [dateIso, setDateIso] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = Number(amountStr || 0);
  const { label: dateLabel, ago } = prettyDate(dateIso);

  const accounts = init?.accounts ?? [];
  const incomeCats = useMemo(() => (init?.categories ?? []).filter(c => c.kind === "INCOME"), [init]);

  const from = accounts.find(a => a.id === fromId) ?? null;
  const to = accounts.find(a => a.id === toId) ?? null;
  const landing = accounts.find(a => a.id === accountId) ?? null;

  const canSave = amount > 0 && !busy && (
    mode === "IN"
      ? !!accountId && !!categoryId
      : !!fromId && !!toId && fromId !== toId
  );

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const j = mode === "IN"
      ? await post("addIncome", {
          entry_date: dateIso, world: "PERSONAL", amount,
          account_id: accountId, category_id: categoryId,
          description: note.trim() || null,
        })
      : await post("addMove", {
          entry_date: dateIso, amount,
          from_account_id: fromId, to_account_id: toId,
          description: note.trim() || null,
        });
    setBusy(false);
    if (j) {
      showToast((mode === "IN" ? "Recorded " : "Moved ") + money(amount));
      await refreshInit();
      router.push("/mf17052606");
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{mode === "IN" ? "Money in" : "Move money"}</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Seg on={mode === "IN"} onClick={() => setMode("IN")}>Money in</Seg>
        <Seg on={mode === "MOVE"} onClick={() => setMode("MOVE")}>Move between accounts</Seg>
      </div>

      <label className="mf-card mf-tap" style={{ display: "inline-flex", alignItems: "center", gap: 8,
        padding: "8px 12px", fontSize: 13, marginBottom: 12,
        background: ago > 0 ? "var(--mf-owe-bg)" : "var(--mf-surface)",
        color: ago > 0 ? "var(--mf-owe)" : "var(--mf-ink)" }}>
        <span>{dateLabel}{ago > 1 ? ` · ${ago} days ago` : ""}</span>
        <input type="date" value={dateIso} max={todayIso()}
          onChange={e => e.target.value && setDateIso(e.target.value)}
          style={{ width: 18, border: "none", background: "none", padding: 0, color: "inherit", fontFamily: "inherit" }} />
      </label>

      <input
        value={amountStr} inputMode="decimal" placeholder="Amount" autoFocus
        onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
        className="mf-card"
        style={{ width: "100%", padding: "14px", fontSize: 26, fontFamily: "var(--mf-mono)",
          textAlign: "center", color: "var(--mf-ink)", marginBottom: 12 }}
      />

      {mode === "IN" ? (
        <>
          <Label>Where did it land</Label>
          <Row>
            {accounts.filter(a => !a.is_liability).map(a => (
              <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>
                {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
              </Chip>
            ))}
          </Row>

          <Label>What for</Label>
          <Row>
            {incomeCats.map(c => (
              <Chip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>
            ))}
            {incomeCats.length === 0 && (
              <Muted>
                No income categories yet — add one in{" "}
                <Link href="/mf17052606/setup" style={{ color: "var(--mf-have)" }}>Set up</Link>.
              </Muted>
            )}
          </Row>

          {landing && landing.balance != null && amount > 0 && (
            <Preview name={landing.bank_name} before={landing.balance} after={landing.balance + amount} />
          )}
        </>
      ) : (
        <>
          <Label>Out of</Label>
          <Row>
            {accounts.map(a => (
              <Chip key={a.id} on={fromId === a.id} onClick={() => { setFromId(a.id); if (toId === a.id) setToId(null); }}>
                {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
              </Chip>
            ))}
          </Row>

          <Label>Into</Label>
          <Row>
            {accounts.filter(a => a.id !== fromId).map(a => (
              <Chip key={a.id} on={toId === a.id} onClick={() => setToId(a.id)}>
                {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
              </Chip>
            ))}
          </Row>

          {from && to && amount > 0 && (
            <div className="mf-card" style={{ padding: "12px 14px", marginBottom: 12 }}>
              {from.balance != null && (
                <PreviewRow name={from.bank_name} before={from.balance}
                  after={from.balance + (from.is_liability ? amount : -amount)} />
              )}
              {to.balance != null && (
                <PreviewRow name={to.bank_name} before={to.balance}
                  after={to.balance + (to.is_liability ? -amount : amount)} top />
              )}
              <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginTop: 8, lineHeight: 1.55 }}>
                {to.is_liability
                  ? "Paying this card down. Your net worth does not change — you have less, and you owe less."
                  : "Net worth does not change — the same money is simply somewhere else."}
              </div>
            </div>
          )}
        </>
      )}

      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
        className="mf-card" style={{ width: "100%", padding: "11px 14px", fontSize: 14, marginBottom: 12,
          color: "var(--mf-ink)", fontFamily: "inherit" }} />

      <button onClick={save} disabled={!canSave} className="mf-tap"
        style={{ width: "100%", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 600,
          background: canSave ? "var(--mf-have)" : "var(--mf-line)",
          color: canSave ? "var(--mf-have-bg)" : "var(--mf-ink-3)",
          cursor: canSave ? "pointer" : "default" }}>
        {busy ? "Saving…" : mode === "IN" ? "Record it" : "Move it"}
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)", margin: "0 0 7px 2px" }}>{children}</div>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>{children}</div>;
}
function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mf-tap"
      style={{ flex: 1, border: "none", borderRadius: 999, padding: "8px 0", fontSize: 13,
        background: on ? "var(--mf-have)" : "var(--mf-surface)",
        color: on ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>
      {children}
    </button>
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
function PreviewRow({ name, before, after, top }: { name: string; before: number; after: number; top?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      paddingTop: top ? 8 : 0, marginTop: top ? 8 : 0, borderTop: top ? "1px solid var(--mf-line)" : "none" }}>
      <span style={{ fontSize: 12.5, color: "var(--mf-ink-2)" }}>{name}</span>
      <span className="mf-num" style={{ fontSize: 13.5 }}>
        {money(before)} <span style={{ color: "var(--mf-ink-3)" }}>→</span> {money(after)}
      </span>
    </div>
  );
}
function Preview({ name, before, after }: { name: string; before: number; after: number }) {
  return (
    <div className="mf-card" style={{ padding: "11px 14px", marginBottom: 12 }}>
      <PreviewRow name={name + " after this"} before={before} after={after} />
    </div>
  );
}
function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12.5, color: "var(--mf-ink-3)" }}>{children}</span>;
}