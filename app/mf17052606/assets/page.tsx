"use client";

// MF 2.0 — Assets.
// Cost is the sum of the ledger; current value is a dated observation you add.
// The gap between them is your gain, and it is never hidden inside one number.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";

type Asset = {
  id: number; name: string; asset_type: string | null; nature: string;
  value_trend: string; income_generating: boolean;
  cost: number; current_value: number | null; valued_as_of: string | null; gain: number | null;
};

const TRENDS = [
  { v: "APPRECIATING", label: "Grows" },
  { v: "STABLE", label: "Steady" },
  { v: "DEPRECIATING", label: "Wears out" },
];

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

type Act = "BUY" | "VALUE" | "SELL";

export default function Assets() {
  const { init, post, showToast, refreshInit } = useMF();
  const [rows, setRows] = useState<Asset[]>([]);
  const [totals, setTotals] = useState<{ cost: number; value: number } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const j = await post("assets");
    if (j) { setRows(j.assets ?? []); setTotals(j.totals ?? null); }
  }, [post]);

  useEffect(() => { load(); }, [load]);

  const after = async () => { setOpenId(null); await refreshInit(); await load(); };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0 14px" }}>
        <Link href="/mf17052606" style={{ textDecoration: "none", color: "var(--mf-ink-2)", fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>Assets</div>
        <button onClick={() => setAdding(a => !a)} className="mf-tap"
          style={{ border: "none", borderRadius: 999, padding: "7px 13px", fontSize: 13,
            background: adding ? "var(--mf-have)" : "var(--mf-surface)",
            color: adding ? "var(--mf-have-bg)" : "var(--mf-ink-2)",
            boxShadow: adding ? "none" : "inset 0 0 0 1px var(--mf-line)" }}>
          {adding ? "Close" : "New"}
        </button>
      </div>

      {totals && rows.length > 0 && (
        <div className="mf-card" style={{ padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: "var(--mf-ink-2)" }}>Worth today</div>
          <div className="mf-num" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.02em", marginTop: 3 }}>
            {money(totals.value)}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginTop: 6 }}>
            paid <span className="mf-num">{money(totals.cost)}</span> ·{" "}
            <span style={{ color: totals.value - totals.cost < 0 ? "var(--mf-owe)" : "var(--mf-have)" }}>
              {totals.value - totals.cost < 0 ? "down " : "up "}
              <span className="mf-num">{money(Math.abs(totals.value - totals.cost))}</span>
            </span>
          </div>
        </div>
      )}

      {adding && <NewAsset onDone={async () => { setAdding(false); await load(); }} />}

      {rows.length === 0 && !adding ? (
        <div className="mf-card" style={{ padding: "14px 16px", fontSize: 13.5, color: "var(--mf-ink-2)", lineHeight: 1.6 }}>
          No assets yet. Property, gold, deposits, a vehicle — anything you own that has a value
          worth tracking in your net worth.
        </div>
      ) : (
        <div className="mf-card" style={{ padding: "0 14px" }}>
          {rows.map((a, i) => (
            <div key={a.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--mf-line)" }}>
              <button onClick={() => setOpenId(openId === a.id ? null : a.id)} className="mf-tap"
                style={{ width: "100%", border: "none", background: "none", padding: "12px 0",
                  textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, color: "var(--mf-ink)" }}>{a.name}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--mf-ink-3)", marginTop: 2 }}>
                    {a.valued_as_of ? `valued ${a.valued_as_of}` : "never valued"}
                    {a.income_generating ? " · earns" : ""}
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className="mf-num" style={{ display: "block", fontSize: 14 }}>
                    {money(a.current_value ?? a.cost)}
                  </span>
                  {a.gain != null && Math.abs(a.gain) >= 1 && (
                    <span className="mf-num" style={{ display: "block", fontSize: 11, marginTop: 2,
                      color: a.gain < 0 ? "var(--mf-owe)" : "var(--mf-have)" }}>
                      {a.gain < 0 ? "" : "+"}{money(a.gain)}
                    </span>
                  )}
                </span>
              </button>
              {openId === a.id && <Actions a={a} onDone={after} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Actions({ a, onDone }: { a: Asset; onDone: () => Promise<void> }) {
  const { init, post, showToast } = useMF();
  const [act, setAct] = useState<Act>("VALUE");
  const [amountStr, setAmountStr] = useState("");
  const [dateIso, setDateIso] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const accounts = init?.accounts.filter(x => !x.is_liability) ?? [];
  const amount = Number(amountStr || 0);
  const needsAccount = act !== "VALUE";
  const ok = amount > 0 && (!needsAccount || !!accountId) && !busy;

  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const j =
      act === "VALUE" ? await post("assetRevalue", { asset_id: a.id, value: amount, as_of: dateIso })
      : act === "BUY" ? await post("assetBuy", { asset_id: a.id, account_id: accountId, amount, entry_date: dateIso })
      :                 await post("assetSell", { asset_id: a.id, account_id: accountId, amount, entry_date: dateIso });
    setBusy(false);
    if (j) {
      showToast(act === "VALUE" ? "Value updated"
        : act === "BUY" ? "Recorded " + money(amount)
        : `Sold — ${j.gain >= 0 ? "gain" : "loss"} of ${money(Math.abs(j.gain))}`);
      await onDone();
    }
  };

  return (
    <div style={{ padding: "2px 0 14px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <Chip on={act === "VALUE"} onClick={() => setAct("VALUE")}>Update value</Chip>
        <Chip on={act === "BUY"} onClick={() => setAct("BUY")}>Put money in</Chip>
        <Chip on={act === "SELL"} onClick={() => setAct("SELL")}>Sell it</Chip>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--mf-ink-3)", marginBottom: 10, lineHeight: 1.55 }}>
        {act === "VALUE" ? "No money moves — this records what it is worth today, and the date."
          : act === "BUY" ? "Money leaves an account and becomes part of this asset. Net worth is unchanged."
          : `Cost so far is ${money(a.cost)}. Anything above that is booked as a gain, anything below as a loss.`}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={amountStr} inputMode="decimal"
          placeholder={act === "VALUE" ? "Worth today" : act === "BUY" ? "Amount" : "Sale proceeds"}
          onChange={e => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
          style={{ flex: 1, padding: "10px 12px", fontSize: 15, fontFamily: "var(--mf-mono)",
            color: "var(--mf-ink)", border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
        <input type="date" value={dateIso} max={todayIso()}
          onChange={e => e.target.value && setDateIso(e.target.value)}
          style={{ padding: "10px 12px", fontSize: 13, color: "var(--mf-ink-2)", fontFamily: "inherit",
            border: "1px solid var(--mf-line)", borderRadius: 9, background: "var(--mf-surface)" }} />
      </div>

      {needsAccount && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {accounts.map(x => (
            <Chip key={x.id} on={accountId === x.id} onClick={() => setAccountId(x.id)}>
              {x.bank_name}{x.owner_name ? " · " + x.owner_name : ""}
            </Chip>
          ))}
        </div>
      )}

      <button onClick={go} disabled={!ok} className="mf-tap"
        style={{ border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 600,
          background: ok ? "var(--mf-have)" : "var(--mf-line)",
          color: ok ? "var(--mf-have-bg)" : "var(--mf-ink-3)", cursor: ok ? "pointer" : "default" }}>
        {busy ? "Saving…" : act === "VALUE" ? "Record value" : act === "BUY" ? "Record it" : "Record sale"}
      </button>
    </div>
  );
}

function NewAsset({ onDone }: { onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [trend, setTrend] = useState("STABLE");
  const [earns, setEarns] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = !!name.trim() && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveAsset", { name, asset_type: type, value_trend: trend, income_generating: earns });
    setBusy(false);
    if (j) { showToast("Added " + name.trim()); await onDone(); }
  };

  return (
    <div className="mf-card" style={{ padding: 14, marginBottom: 12 }}>
      <Lbl>Name</Lbl>
      <Inp value={name} onChange={setName} placeholder="Flat in Jaipur" />
      <Lbl>Kind (optional)</Lbl>
      <Inp value={type} onChange={setType} placeholder="Property, gold, FD…" />
      <Lbl>Over time</Lbl>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {TRENDS.map(t => <Chip key={t.v} on={trend === t.v} onClick={() => setTrend(t.v)}>{t.label}</Chip>)}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Chip on={earns} onClick={() => setEarns(!earns)}>Earns income</Chip>
      </div>
      <button onClick={save} disabled={!ok} className="mf-tap"
        style={{ border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 14, fontWeight: 600,
          background: ok ? "var(--mf-have)" : "var(--mf-line)",
          color: ok ? "var(--mf-have-bg)" : "var(--mf-ink-3)", cursor: ok ? "pointer" : "default" }}>
        {busy ? "Saving…" : "Add asset"}
      </button>
    </div>
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