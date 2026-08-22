"use client";

// MF 2.0 — Passbook.
// Pick an account and every movement appears oldest-to-newest with the balance
// after each line: LMA collections and MF 2.0 entries in one column, because
// they are the same money. The last row equals the dashboard figure — if it
// ever does not, something is wrong and you want to see it.
//
// Tap an MF 2.0 line to remove it. LMA lines are not editable here; they
// belong to the library app and are corrected there.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMF, money } from "../_components/MFProvider";

type Row = {
  entry_id: number | null;
  on_date: string;
  kind: string;
  label: string;
  amount: number;
  balance: number | null;
  source: "MF" | "LMA";
};

const REASONS: { v: string; label: string }[] = [
  { v: "TYPED_WRONG", label: "Typed it wrong" },
  { v: "DUPLICATE", label: "Duplicate" },
  { v: "NEVER_HAPPENED", label: "Never happened" },
  { v: "OTHER", label: "Other" },
];

export default function Passbook() {
  const { init, post, showToast, refreshInit } = useMF();
  const router = useRouter();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ needs_setup?: boolean; total?: number; shown?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const j = await post("ledger", { account_id: accountId ?? 0 });
    setBusy(false);
    if (j) { setRows(j.rows ?? []); setMeta({ needs_setup: j.needs_setup, total: j.total, shown: j.shown }); }
  }, [accountId, post]);

  useEffect(() => { load(); }, [load]);

  const removeEntry = async (entryId: number, reason: string) => {
    const j = await post("voidEntry", { entry_id: entryId, reason });
    if (j) { showToast("Removed"); setOpenId(null); await refreshInit(); await load(); }
  };

  const accounts = init?.accounts.filter(a => a.is_set_up) ?? [];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Passbook</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        <Chip on={accountId === null} onClick={() => setAccountId(null)}>Everything</Chip>
        {accounts.map(a => (
          <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.bank_name}</Chip>
        ))}
      </div>

      {busy && rows.length === 0 ? (
        <Muted>Loading…</Muted>
      ) : meta?.needs_setup ? (
        <div className="mf-card" style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--mf-ink-2)", lineHeight: 1.6 }}>
          This account has no opening balance yet, so there is nothing to run a balance from.
          Set one in <Link href="/mf17052606/setup" style={{ color: "var(--mf-have)" }}>Set up</Link>.
        </div>
      ) : rows.length === 0 ? (
        <div className="mf-card" style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--mf-ink-2)" }}>
          Nothing recorded yet.
        </div>
      ) : (
        <div className="mf-card" style={{ padding: "0 14px" }}>
          {rows.map((r, i) => (
            <div key={`${r.source}-${r.entry_id ?? i}-${r.on_date}-${i}`}>
              <button
                onClick={() => r.entry_id && setOpenId(openId === r.entry_id ? null : r.entry_id)}
                className={r.entry_id ? "mf-tap" : undefined}
                style={{ width: "100%", border: "none", background: "none", padding: "11px 0", textAlign: "left",
                  borderTop: i === 0 ? "none" : "1px solid var(--mf-line)", display: "flex", alignItems: "center", gap: 12,
                  cursor: r.entry_id ? "pointer" : "default" }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, color: "var(--mf-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.label}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--mf-ink-3)", marginTop: 2 }}>
                    {r.on_date}{r.source === "LMA" ? " · from LMA" : ""}
                  </span>
                </span>
                <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <span className="mf-num" style={{ display: "block", fontSize: 13.5,
                    color: r.amount < 0 ? "var(--mf-owe)" : "var(--mf-have)" }}>
                    {r.amount < 0 ? "" : "+"}{money(r.amount)}
                  </span>
                  {r.balance != null && (
                    <span className="mf-num" style={{ display: "block", fontSize: 11, color: "var(--mf-ink-3)", marginTop: 2 }}>
                      {money(r.balance)}
                    </span>
                  )}
                </span>
              </button>

              {openId != null && r.entry_id === openId && (
                <div style={{ padding: "0 0 12px" }}>
                  {/* Only expenses can be edited: the Add screen is an expense
                      form, and loading anything else into it would rewrite the
                      entry as an expense on save. */}
                  <div style={{ display: r.kind === "EXPENSE" ? "flex" : "none", gap: 6, marginBottom: 10 }}>
                    <button onClick={() => router.push(`/mf17052606/add?edit=${r.entry_id}`)} className="mf-tap"
                      style={{ border: "none", borderRadius: 999, padding: "6px 13px", fontSize: 12.5,
                        background: "var(--mf-have)", color: "var(--mf-have-bg)" }}>
                      Edit it
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mf-ink-2)", marginBottom: 7 }}>
                    {r.kind === "EXPENSE" ? "Or remove it — why?" : "Remove this entry — why?"}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {REASONS.map(x => (
                      <button key={x.v} onClick={() => removeEntry(r.entry_id!, x.v)} className="mf-tap"
                        style={{ border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12.5,
                          background: "var(--mf-owe-bg)", color: "var(--mf-owe)" }}>
                        {x.label}
                      </button>
                    ))}
                    <button onClick={() => setOpenId(null)} className="mf-tap"
                      style={{ border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12.5,
                        background: "var(--mf-surface)", color: "var(--mf-ink-2)", boxShadow: "inset 0 0 0 1px var(--mf-line)" }}>
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {meta?.total != null && meta.shown != null && meta.total > meta.shown && (
        <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", textAlign: "center", marginTop: 12 }}>
          Showing the most recent {meta.shown} of {meta.total}.
        </div>
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

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12.5, color: "var(--mf-ink-3)" }}>{children}</span>;
}