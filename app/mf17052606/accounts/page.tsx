"use client";

// MF 2.0 — Accounts & routes.
// An account is a real pot of money with a permanent code. Routes are the ways
// money reaches it, listed underneath as its children. Several routes can feed
// one account — GSP and a direct UPI both land in Yes Bank–GS, but they clear
// on different days, which is exactly why they are separate rows.
//
// Codes are permanent by design: every receipt LMA has ever written is stamped
// with one, so renaming would detach the history. Names are yours to change.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";

type Route = {
  id: number; display_code: string; bank_code: string; settlement_days: number;
  active_lma: boolean; active_mf: boolean; description: string;
};
type Acct = {
  id: number; bank_code: string; bank_name: string; owner_name: string;
  acct_type: string; is_liability: boolean; active: boolean; quick: boolean;
  opening_balance: number | null; opening_date: string | null;
  history_rows: number; routes: Route[];
};

const TYPES = [
  { v: "BANK", label: "Bank" }, { v: "CASH", label: "Cash" },
  { v: "WALLET", label: "Wallet" }, { v: "CREDIT_CARD", label: "Card" },
];

export default function AccountsAndRoutes() {
  const { post, showToast, refreshInit } = useMF();
  const [rows, setRows] = useState<Acct[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [addingAcct, setAddingAcct] = useState(false);

  const load = useCallback(async () => {
    const j = await post("accountsTree");
    if (j) setRows(j.accounts ?? []);
  }, [post]);
  useEffect(() => { load(); }, [load]);

  const after = async () => { await refreshInit(); await load(); };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>Accounts &amp; routes</div>
        <Chip on={addingAcct} onClick={() => setAddingAcct(a => !a)}>{addingAcct ? "Close" : "New account"}</Chip>
      </div>

      <Note>
        An <b>account</b> is a real pot of money. A <b>route</b> is a way money reaches it —
        a swipe machine, a UPI handle, cash in hand. One account can have several routes,
        each with its own settlement delay.
      </Note>

      {addingAcct && <NewAccount onDone={async () => { setAddingAcct(false); await after(); }} />}

      {rows.map(a => (
        <div key={a.id} className="mf-card" style={{ padding: "12px 14px", marginBottom: 8, opacity: a.active ? 1 : .55 }}>
          <button onClick={() => setOpenId(openId === a.id ? null : a.id)} className="mf-tap"
            style={{ width: "100%", border: "none", background: "none", padding: 0, textAlign: "left",
              display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, color: "var(--mf-ink)" }}>
                {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
              </span>
              <span style={{ display: "block", fontSize: 11, color: "var(--mf-ink-3)", marginTop: 2 }}>
                {a.bank_code} · {a.routes.length} route{a.routes.length === 1 ? "" : "s"}
                {a.history_rows > 0 ? ` · ${a.history_rows} in history` : ""}
                {a.active ? "" : " · off"}
              </span>
            </span>
            <span className="mf-num" style={{ fontSize: 13, color: a.is_liability ? "var(--mf-owe)" : "var(--mf-ink-2)" }}>
              {a.opening_date ? money(a.opening_balance) : "—"}
            </span>
          </button>

          {a.routes.length > 0 && (
            <div style={{ marginTop: 10, paddingLeft: 10, borderLeft: "2px solid var(--mf-line)" }}>
              {a.routes.map(r => (
                <RouteRow key={r.id} r={r} onDone={after} />
              ))}
            </div>
          )}

          {openId === a.id && <AcctPanel a={a} onDone={after} />}
        </div>
      ))}
    </div>
  );
}

function RouteRow({ r, onDone }: { r: Route; onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(String(r.settlement_days));
  const [lma, setLma] = useState(r.active_lma);
  const [mf, setMf] = useState(r.active_mf);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const j = await post("saveRoute", { id: r.id, settlement_days: Number(days || 0), active_lma: lma, active_mf: mf });
    setBusy(false);
    if (j) { showToast(r.display_code + " saved"); setOpen(false); await onDone(); }
  };

  return (
    <div style={{ padding: "7px 0" }}>
      <button onClick={() => setOpen(o => !o)} className="mf-tap"
        style={{ width: "100%", border: "none", background: "none", padding: 0, textAlign: "left",
          display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 13, color: "var(--mf-ink-2)" }}>{r.display_code}</span>
        <span style={{ fontSize: 11, color: "var(--mf-ink-3)" }}>
          {r.settlement_days === 0 ? "same day" : `+${r.settlement_days}d`}
        </span>
        <Dot on={r.active_lma} label="LMA" />
        <Dot on={r.active_mf} label="MF" />
      </button>

      {open && (
        <div style={{ padding: "8px 0 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--mf-ink-3)" }}>Settles after</span>
            <input value={days} inputMode="numeric"
              onChange={e => setDays(e.target.value.replace(/[^0-9]/g, ""))}
              style={{ width: 56, padding: "6px 9px", fontSize: 13, textAlign: "center",
                fontFamily: "var(--mf-mono)", color: "var(--mf-ink)",
                border: "1px solid var(--mf-line)", borderRadius: 8, background: "var(--mf-surface)" }} />
            <span style={{ fontSize: 12, color: "var(--mf-ink-3)" }}>days</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <Chip on={lma} onClick={() => setLma(!lma)}>Offer in LMA</Chip>
            <Chip on={mf} onClick={() => setMf(!mf)}>Offer in MF</Chip>
          </div>
          <Btn ok={!busy} busy={busy} onClick={save}>Save route</Btn>
        </div>
      )}
    </div>
  );
}

function AcctPanel({ a, onDone }: { a: Acct; onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [mode, setMode] = useState<"EDIT" | "ROUTE">("EDIT");

  // account fields
  const [name, setName] = useState(a.bank_name);
  const [owner, setOwner] = useState(a.owner_name);
  const [type, setType] = useState(a.acct_type);
  const [bal, setBal] = useState(a.opening_balance == null ? "" : String(a.opening_balance));
  const [date, setDate] = useState(a.opening_date ?? "");

  // new route fields
  const [code, setCode] = useState("");
  const [days, setDays] = useState("0");
  const [lma, setLma] = useState(true);

  const [busy, setBusy] = useState(false);

  const saveAcct = async () => {
    setBusy(true);
    const j = await post("saveAccount", {
      id: a.id, bank_name: name, owner_name: owner, acct_type: type,
      opening_balance: bal === "" ? null : Number(bal),
      opening_date: date || null, active: a.active, quick: a.quick,
    });
    setBusy(false);
    if (j) { showToast("Saved"); await onDone(); }
  };

  const addRoute = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const j = await post("saveRoute", {
      display_code: code, bank_code: a.bank_code,
      settlement_days: Number(days || 0), active_lma: lma, active_mf: true,
    });
    setBusy(false);
    if (j) { setCode(""); setMode("EDIT"); showToast("Route added"); await onDone(); }
  };

  const toggle = async () => {
    const j = await post("toggleAccount", { id: a.id });
    if (j) { showToast(j.active ? "Switched on" : "Switched off — history is untouched"); await onDone(); }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--mf-line)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Chip on={mode === "EDIT"} onClick={() => setMode("EDIT")}>Account</Chip>
        <Chip on={mode === "ROUTE"} onClick={() => setMode("ROUTE")}>Add a route</Chip>
      </div>

      {mode === "EDIT" ? (
        <>
          <Lbl>Name</Lbl>
          <Inp value={name} onChange={setName} placeholder="Yes Bank" />
          <Lbl>Owner</Lbl>
          <Inp value={owner} onChange={setOwner} placeholder="GS" />
          <Lbl>Type</Lbl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {TYPES.map(t => <Chip key={t.v} on={type === t.v} onClick={() => setType(t.v)}>{t.label}</Chip>)}
          </div>
          <Lbl>Opening balance</Lbl>
          <input value={bal} inputMode="decimal" placeholder="0"
            onChange={e => setBal(e.target.value.replace(/[^0-9.\-]/g, ""))}
            style={{ width: "100%", padding: "10px 12px", fontSize: 14.5, marginBottom: 10,
              fontFamily: "var(--mf-mono)", color: "var(--mf-ink)",
              border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
          <Lbl>True on</Lbl>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", fontSize: 14.5, marginBottom: 6,
              color: "var(--mf-ink)", fontFamily: "inherit",
              border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
          <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginBottom: 12, lineHeight: 1.55 }}>
            From this date the balance counts every LMA collection and everything you record.
            Code {a.bank_code} is permanent — it links this account to its history.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn ok={!busy} busy={busy} onClick={saveAcct}>Save account</Btn>
            <GhostBtn onClick={toggle}>{a.active ? "Switch off" : "Switch on"}</GhostBtn>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginBottom: 8, lineHeight: 1.55 }}>
            The code is what LMA stamps on every receipt, so it cannot be changed later.
            Settlement days is how long money on this route takes to reach the bank.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={code} placeholder="GSP-UPI"
              onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              style={{ flex: 1, padding: "9px 11px", fontSize: 14, fontFamily: "var(--mf-mono)",
                color: "var(--mf-ink)", border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
            <input value={days} inputMode="numeric" onChange={e => setDays(e.target.value.replace(/[^0-9]/g, ""))}
              style={{ width: 60, padding: "9px 11px", fontSize: 14, textAlign: "center", fontFamily: "var(--mf-mono)",
                color: "var(--mf-ink)", border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <Chip on={lma} onClick={() => setLma(!lma)}>Offer in LMA</Chip>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn ok={!!code.trim() && !busy} busy={busy} onClick={addRoute}>Add route</Btn>
            <GhostBtn onClick={() => setMode("EDIT")}>Cancel</GhostBtn>
          </div>
        </>
      )}
    </div>
  );
}

function NewAccount({ onDone }: { onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [type, setType] = useState("BANK");
  const [busy, setBusy] = useState(false);
  const ok = !!code.trim() && !!name.trim() && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("createAccount", { bank_code: code, bank_name: name, owner_name: owner, acct_type: type });
    setBusy(false);
    if (j) { setCode(""); setName(""); setOwner(""); showToast("Account added"); await onDone(); }
  };

  return (
    <div className="mf-card" style={{ padding: 14, marginBottom: 12 }}>
      <Lbl>Code — permanent, short</Lbl>
      <input value={code} placeholder="HDFC-KD"
        onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
        style={{ width: "100%", padding: "10px 12px", fontSize: 14.5, marginBottom: 4,
          fontFamily: "var(--mf-mono)", color: "var(--mf-ink)",
          border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
      <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginBottom: 10, lineHeight: 1.5 }}>
        This is stamped onto every transaction and can never be changed. The name below can.
      </div>
      <Lbl>Name</Lbl>
      <Inp value={name} onChange={setName} placeholder="HDFC Bank" />
      <Lbl>Owner</Lbl>
      <Inp value={owner} onChange={setOwner} placeholder="KD" />
      <Lbl>Type</Lbl>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {TYPES.map(t => <Chip key={t.v} on={type === t.v} onClick={() => setType(t.v)}>{t.label}</Chip>)}
      </div>
      <Btn ok={ok} busy={busy} onClick={save}>Add account</Btn>
    </div>
  );
}

function Dot({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999,
      background: on ? "var(--mf-have-bg)" : "var(--mf-line)",
      color: on ? "var(--mf-have)" : "var(--mf-ink-3)" }}>{label}</span>
  );
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mf-ink-3)", margin: "0 0 5px 2px" }}>{children}</div>;
}
function Inp({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ width: "100%", padding: "10px 12px", fontSize: 14.5, marginBottom: 10, color: "var(--mf-ink)",
        fontFamily: "inherit", border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
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
function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="mf-tap"
      style={{ border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 14,
        background: "var(--mf-surface)", color: "var(--mf-ink-2)", boxShadow: "inset 0 0 0 1px var(--mf-line)" }}>
      {children}
    </button>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--mf-ink-2)", lineHeight: 1.6, marginBottom: 12 }}>{children}</div>;
}