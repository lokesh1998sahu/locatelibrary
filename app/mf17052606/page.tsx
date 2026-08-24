"use client";

// MF 2.0 — Dashboard. "Where you stand", then the accounts behind it.
// Opening the app costs nothing: the net-worth figures come from initLive,
// which runs only when the owner taps for them. Every figure still comes from
// fin.v_account_balance server-side; this page never computes a balance.

import { useMemo } from "react";
import Link from "next/link";
import { useMF, money, MFAccount } from "./_components/MFProvider";

type Tile = { href: string; label: string; emoji: string; desc: string };
const TILES: Tile[] = [
  { href: "/mf17052606/money",    label: "Money in",  emoji: "💵", desc: "Income & transfers" },
  { href: "/mf17052606/passbook", label: "Passbook",  emoji: "📖", desc: "Every line, running balance" },
  { href: "/mf17052606/check",    label: "Check",     emoji: "✅", desc: "Does the bank agree" },
  { href: "/mf17052606/people",   label: "People",    emoji: "🤝", desc: "Who owes what" },
  { href: "/mf17052606/reports",  label: "Reports",   emoji: "📊", desc: "P&L and where money goes" },
  { href: "/mf17052606/scheduled", label: "Scheduled", emoji: "🔁", desc: "Rent, EMIs, recurring bills" },
  { href: "/mf17052606/assets",   label: "Assets",    emoji: "🏠", desc: "Property, gold, deposits" },
  { href: "/mf17052606/setaside", label: "Set aside", emoji: "🗂️", desc: "Provisions and earmarks" },
  { href: "/mf17052606/accounts", label: "Accounts",  emoji: "🏦", desc: "Banks, cards, payment routes" },
  { href: "/mf17052606/setup",    label: "Set up",    emoji: "⚙️", desc: "Categories and people" },
];

const TYPE_LABEL: Record<string, string> = {
  BANK: "Bank", CASH: "Cash", WALLET: "Wallet", CREDIT_CARD: "Card",
};

export default function MFDashboard() {
  const { init, live, loadLive, liveLoading, lock } = useMF();

  const today = useMemo(
    () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }),
    [],
  );

  const setUp = init?.accounts.filter((a) => a.is_set_up) ?? [];
  const pending = init?.accounts.filter((a) => !a.is_set_up) ?? [];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 96px" }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 0 14px" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)" }}>
            {today}
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 600, margin: "3px 0 0" }}>Where you stand</h1>
        </div>
        <button
          onClick={lock} aria-label="Lock"
          style={{ border: "1px solid var(--mf-line)", background: "var(--mf-surface)", borderRadius: 999, padding: "7px 13px", fontSize: 13, color: "var(--mf-ink-2)" }}
        >
          Lock
        </button>
      </header>

      {!live ? (
        <button
          onClick={loadLive} disabled={liveLoading} className="mf-tap"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
            border: "none", borderRadius: "var(--mf-radius)", padding: "22px 16px",
            background: "var(--mf-have)", color: "var(--mf-have-bg)",
            fontSize: 15, fontWeight: 600, opacity: liveLoading ? 0.65 : 1,
            boxShadow: "0 4px 14px rgba(15,110,86,.18)",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 18 }}>💰</span>
          {liveLoading ? "Counting…" : "Show where you stand"}
        </button>
      ) : (
        <>
          <section aria-label="Net worth" className="mf-card" style={{ padding: "16px 18px", borderLeft: "3px solid var(--mf-have)", borderRadius: "var(--mf-radius)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "var(--mf-ink-2)" }}>Net worth</span>
              <button
                onClick={loadLive} disabled={liveLoading} className="mf-tap" aria-label="Refresh"
                style={{ border: "none", background: "none", padding: 0, fontSize: 11, fontWeight: 600, color: "var(--mf-ink-3)" }}
              >
                {liveLoading ? "updating…" : "↻ refresh"}
              </button>
            </div>
            <div className="mf-num" style={{ fontSize: 30, fontWeight: 600, marginTop: 2 }}>
              {money(live.totals.net)}
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div className="mf-card" style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--mf-have)" }}>You have</div>
              <div className="mf-num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{money(live.totals.haves)}</div>
            </div>
            <div className="mf-card" style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--mf-owe)" }}>You owe</div>
              <div className="mf-num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{money(live.totals.owes)}</div>
            </div>
          </div>

          <SectionLabel>Accounts</SectionLabel>
          <div className="mf-card" style={{ padding: "2px 14px" }}>
            {setUp.length === 0 ? (
              <div style={{ padding: "16px 0", fontSize: 14, color: "var(--mf-ink-2)" }}>
                No account has a starting balance yet. Set one and this page comes alive.
              </div>
            ) : setUp.map((a, i) => (
              <AccountRow key={a.id} a={a} last={i === setUp.length - 1} />
            ))}
          </div>

          {pending.length > 0 && (
            <>
              <SectionLabel>Not set up yet</SectionLabel>
              <div className="mf-card" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: 13, color: "var(--mf-ink-2)", lineHeight: 1.55 }}>
                  {pending.length} account{pending.length === 1 ? "" : "s"} have no starting balance, so no balance is shown for them.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {pending.map((a) => (
                    <span key={a.id} style={{ fontSize: 12, color: "var(--mf-ink-2)", border: "1px solid var(--mf-line)", borderRadius: 999, padding: "5px 10px" }}>
                      {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {live.alerts && (
            <Link href="/mf17052606/scheduled" className="mf-card mf-tap"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginTop: 16,
                textDecoration: "none",
                background: live.alerts.overdue > 0 ? "var(--mf-owe-bg)" : "var(--mf-surface)" }}>
              <span aria-hidden="true" style={{ fontSize: 20 }}>🔁</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5,
                  color: live.alerts.overdue > 0 ? "var(--mf-owe)" : "var(--mf-ink)" }}>
                  {live.alerts.overdue > 0
                    ? `${live.alerts.overdue} payment${live.alerts.overdue === 1 ? " is" : "s are"} overdue`
                    : `${live.alerts.due_soon} payment${live.alerts.due_soon === 1 ? "" : "s"} due this week`}
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--mf-ink-3)", marginTop: 2 }}>
                  next: {live.alerts.next_name} on {live.alerts.next_due}
                </span>
              </span>
              <span style={{ fontSize: 18, color: "var(--mf-ink-3)" }}>›</span>
            </Link>
          )}
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
        {TILES.map(t => (
          <Link key={t.href} href={t.href} className="mf-card mf-tap"
            style={{ textDecoration: "none", padding: 14, position: "relative", overflow: "hidden", display: "block" }}>
            <span aria-hidden="true" style={{ position: "absolute", right: -8, top: -10, fontSize: 52, opacity: .06, userSelect: "none" }}>{t.emoji}</span>
            <span aria-hidden="true" style={{ display: "block", fontSize: 22, marginBottom: 6 }}>{t.emoji}</span>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--mf-ink)", lineHeight: 1.2 }}>{t.label}</span>
            <span style={{ display: "block", fontSize: 11, color: "var(--mf-ink-3)", marginTop: 3, lineHeight: 1.35 }}>{t.desc}</span>
          </Link>
        ))}
      </div>

      <Link
        href="/mf17052606/add" aria-label="Add expense" className="mf-tap"
        style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 22, zIndex: 50,
          background: "var(--mf-have)", color: "var(--mf-have-bg)", textDecoration: "none",
          borderRadius: 999, padding: "14px 26px", fontSize: 15, fontWeight: 600,
          boxShadow: "0 6px 20px rgba(15,110,86,.28)",
        }}
      >
        Add expense
      </Link>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)", margin: "18px 0 8px 2px" }}>
      {children}
    </div>
  );
}

function AccountRow({ a, last }: { a: MFAccount; last: boolean }) {
  const owe = a.is_liability;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: last ? "none" : "1px solid var(--mf-line)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.bank_name}
        </div>
        <div style={{ fontSize: 11, color: "var(--mf-ink-3)", marginTop: 1 }}>
          {[a.owner_name, TYPE_LABEL[a.acct_type] || a.acct_type].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="mf-num" style={{ fontSize: 14, color: owe ? "var(--mf-owe)" : "var(--mf-ink)", paddingLeft: 12 }}>
        {money(a.balance)}
      </div>
    </div>
  );
}