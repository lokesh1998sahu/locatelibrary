"use client";

// MF 2.0 — Masters. Accounts, categories and people, managed in the app so
// the Table Editor is never needed for day-to-day setup.
//
// bank_code is deliberately not editable anywhere: it is the permanent link
// between an account and every rupee of history stamped to it. The database
// refuses to change it; this screen simply never offers.

import { useState } from "react";
import Link from "next/link";
import { useMF, MFCategory, MFPerson } from "../_components/MFProvider";

type Tab = "CATEGORIES" | "PEOPLE";

export default function Masters() {
  const { init } = useMF();
  const [tab, setTab] = useState<Tab>("CATEGORIES");

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Set up</div>
      </div>

      <Link href="/mf17052606/accounts" className="mf-card mf-tap"
        style={{ display: "block", padding: "12px 14px", marginBottom: 12, textDecoration: "none" }}>
        <span style={{ display: "block", fontSize: 14, color: "var(--mf-ink)" }}>Accounts &amp; routes &rsaquo;</span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--mf-ink-3)", marginTop: 2 }}>
          Banks, cards and cash · payment routes · opening balances
        </span>
      </Link>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["CATEGORIES", "PEOPLE"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className="mf-tap"
            style={{ flex: 1, border: "none", borderRadius: 999, padding: "8px 0", fontSize: 13,
              background: tab === t ? "var(--mf-have)" : "var(--mf-surface)",
              color: tab === t ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
              boxShadow: tab === t ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>
            {t === "CATEGORIES" ? "Categories" : "People"}
          </button>
        ))}
      </div>

      {!init ? <Muted>Loading…</Muted>
        : tab === "CATEGORIES" ? <Categories rows={init.categories} />
        :                        <People rows={init.people} />}
    </div>
  );
}

/* ── categories ─────────────────────────────────────────────────────── */

function Categories({ rows }: { rows: MFCategory[] }) {
  const { post, refreshInit, showToast } = useMF();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const j = await post("saveCategory", { name, kind, quick: true });
    setBusy(false);
    if (j) { setName(""); showToast("Added " + name.trim()); await refreshInit(); }
  };

  const expense = rows.filter(r => r.kind === "EXPENSE");
  const income  = rows.filter(r => r.kind === "INCOME");

  return (
    <>
      <div className="mf-card" style={{ padding: "12px 14px", marginBottom: 12 }}>
        <Field label="New category">
          <Input value={name} onChange={setName} placeholder="Petrol" onEnter={add} />
        </Field>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <Pill on={kind === "EXPENSE"} onClick={() => setKind("EXPENSE")}>Expense</Pill>
          <Pill on={kind === "INCOME"}  onClick={() => setKind("INCOME")}>Income</Pill>
        </div>
        <SaveBtn busy={busy} onClick={add} label="Add" disabled={!name.trim()} />
      </div>

      <ListBlock title="Expense" items={expense.map(c => c.name)} empty="None yet." />
      <ListBlock title="Income"  items={income.map(c => c.name)}  empty="None yet." />
    </>
  );
}

/* ── people ─────────────────────────────────────────────────────────── */

function People({ rows }: { rows: MFPerson[] }) {
  const { post, refreshInit, showToast } = useMF();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const j = await post("savePerson", { name, quick: true });
    setBusy(false);
    if (j) { setName(""); showToast("Added " + name.trim()); await refreshInit(); }
  };

  return (
    <>
      <Note>People you owe, or who owe you. Used when an expense is only part paid.</Note>
      <div className="mf-card" style={{ padding: "12px 14px", marginBottom: 12 }}>
        <Field label="New person">
          <Input value={name} onChange={setName} placeholder="Ramesh" onEnter={add} />
        </Field>
        <SaveBtn busy={busy} onClick={add} label="Add" disabled={!name.trim()} />
      </div>
      <ListBlock title="People" items={rows.map(p => p.name)} empty="None yet." />
    </>
  );
}

/* ── small pieces ───────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type, inputMode, onEnter }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; inputMode?: "decimal" | "text"; onEnter?: () => void;
}) {
  return (
    <input
      value={value} type={type} inputMode={inputMode} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
      style={{ width: "100%", padding: "10px 12px", fontSize: 14.5, color: "var(--mf-ink)",
        border: "1px solid var(--mf-line)", borderRadius: 9, fontFamily: "inherit", background: "var(--mf-surface)" }}
    />
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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

function SaveBtn({ busy, onClick, label, disabled }: { busy: boolean; onClick: () => void; label?: string; disabled?: boolean }) {
  const off = busy || disabled;
  return (
    <button onClick={onClick} disabled={off} className="mf-tap"
      style={{ border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 600,
        background: off ? "var(--mf-line)" : "var(--mf-have)",
        color: off ? "var(--mf-ink-3)" : "var(--mf-have-bg)", cursor: off ? "default" : "pointer" }}>
      {busy ? "Saving…" : (label ?? "Save")}
    </button>
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mf-tap"
      style={{ border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 14,
        background: "var(--mf-surface)", color: "var(--mf-ink-2)", boxShadow: "inset 0 0 0 1px var(--mf-line)" }}>
      {children}
    </button>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)", margin: "14px 0 7px 2px" }}>{title}</div>
      <div className="mf-card" style={{ padding: "12px 14px" }}>
        {items.length === 0 ? <Muted>{empty}</Muted> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {items.map(t => (
              <span key={t} style={{ fontSize: 12.5, color: "var(--mf-ink-2)", border: "1px solid var(--mf-line)", borderRadius: 999, padding: "5px 11px" }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--mf-ink-2)", lineHeight: 1.6, marginBottom: 12 }}>{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12.5, color: "var(--mf-ink-3)" }}>{children}</span>;
}