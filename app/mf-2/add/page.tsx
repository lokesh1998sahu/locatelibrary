"use client";

import { useEffect, useState, useRef } from "react";

const API = "/api/ledger";

// ── Shared style helpers ────────────────────────────────────
const selectStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 10,
  border: "1.5px solid #e5e5e4",
  fontSize: 15,
  background: "#fafafa",
  color: "#111",
  fontFamily: "'DM Sans', sans-serif",
  width: "100%",
  outline: "none",
  cursor: "pointer",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
  paddingRight: 36
}

const inputStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 10,
  border: "1.5px solid #e5e5e4",
  fontSize: 15,
  background: "#fafafa",
  color: "#111",
  fontFamily: "'DM Sans', sans-serif",
  width: "100%",
  outline: "none",
  boxSizing: "border-box"
}

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 5,
  display: "block"
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </div>
  )
}

export default function AddEntryPage() {

  const [engine, setEngine] = useState("transaction")
  const [masters, setMasters] = useState<any>(null)

  const [sheet, setSheet] = useState("")
  const [type, setType] = useState("")
  const [tag, setTag] = useState("")
  const [name, setName] = useState("")
  const [head, setHead] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState("")
  const [description, setDescription] = useState("")

  const [fromTag, setFromTag] = useState("")
  const [toTag, setToTag] = useState("")

  const [mainSheet, setMainSheet] = useState("")
  const [mainType, setMainType] = useState("")
  const [mainName, setMainName] = useState("")
  const [ncSheet, setNcSheet] = useState("")
  const [ncType, setNcType] = useState("")
  const [ncName, setNcName] = useState("")

  const isWriteoff  = type?.toUpperCase().includes("WRITEOFF")
  const isTransferred = type === "TRANSFERRED"
  const isNotional  = type?.toUpperCase().includes("NOTIONAL")

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" }>({ msg: "", type: "success" })
  const amountRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: "", type: "success" }), 3000)
  }

  useEffect(() => {
    const auth = localStorage.getItem("financeAuthorized")
    if (auth !== "true") window.location.href = "/mf-2"
  }, [])

  useEffect(() => {
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "master" })
    })
      .then(r => r.json())
      .then(d => {
        if (d && d.status === "success") setMasters(d)
        else showToast("Master data load failed", "error")
      })
      .catch(() => showToast("API connection failed", "error"))
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("duplicateEntry")
    if (!saved) return
    const data = JSON.parse(saved)
    setSheet(data.sheet || "")
    setHead(data.head || "")
    setName(data.name || "")
    setType(data.type || "")
    setTag(data.tag || "")
    setAmount(data.amount || "")
    setDescription(data.description || "")
    localStorage.removeItem("duplicateEntry")
  }, [])

  if (!masters) return <FullScreenLoader label="Loading data..." />

  const sheets = Object.keys(masters.names)
  const tags   = masters.tags || []
  const names  = masters.names[sheet]

  const allTypes = sheet ? (masters.types[sheet] || []) : []

  const types =
    engine === "transaction"
      ? allTypes.filter((t: any) => {
          const m = String(t.mode).toUpperCase()
          return m === "CASH" || m === "WRITEOFF" || m === "NOTIONAL"
        })
      : engine === "adjustment"
      ? allTypes.filter((t: any) => String(t.mode).toUpperCase() === "NON-CASH")
      : []

  function resetCommon() {
    setAmount(""); setDate(""); setDescription("")
  }

  function dateField(value: string, setter: (v: string) => void) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="date"
          value={value}
          onChange={e => setter(e.target.value)}
          onClick={(e: any) => e.target.showPicker?.()}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => setter(new Date().toISOString().split("T")[0])}
          style={{
            padding: "11px 14px",
            borderRadius: 10,
            border: "1.5px solid #e5e5e4",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            fontSize: 13,
            whiteSpace: "nowrap",
            flexShrink: 0
          }}
        >
          Today
        </button>
      </div>
    )
  }

  /* ── Submit Transaction ── */
  async function submitTransaction() {
    if (saving) return
    if (!sheet || !name || !type || !date || !amount) {
      showToast("Please fill all required fields", "error"); return
    }
    setSaving(true)
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transaction",
          payload: { sheet, name: String(name).trim(), tType: type, tag, amount: Number(amount), date, description: String(description || "").trim() }
        })
      })
      const data = await res.json()
      if (data.status === "success") {
        showToast("✓ Transaction added — " + data.entryId)
        resetCommon()
        amountRef.current?.focus()
      } else {
        showToast(data.message || "Transaction failed", "error")
      }
    } catch { showToast("Network error", "error") }
    setSaving(false)
  }

  /* ── Submit Contra ── */
  async function submitContra() {
    if (saving) return
    if (!name || !fromTag || !toTag || !date || !amount) {
      showToast("Please fill all required fields", "error"); return
    }
    if (fromTag === toTag) {
      showToast("From and To tags cannot be the same", "error"); return
    }
    setSaving(true)
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "contra",
          payload: { fromTag, toTag, name: String(name).trim(), amount: Number(amount), date, description: String(description || "").trim() }
        })
      })
      const data = await res.json()
      if (data.status === "success") {
        showToast("✓ Contra added — " + data.entryId)
        resetCommon(); setFromTag(""); setToTag("")
        amountRef.current?.focus()
      } else {
        showToast(data.message || "Contra failed", "error")
      }
    } catch { showToast("Network error", "error") }
    setSaving(false)
  }

  /* ── Submit Adjustment ── */
  async function submitAdjustment() {
    if (saving) return
    if (!mainSheet || !mainType || !mainName || !ncSheet || !ncType || !ncName || !amount || !date) {
      showToast("Please fill all required fields", "error"); return
    }
    setSaving(true)
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjustment",
          payload: { mainSheet, mainType, mainName: String(mainName).trim(), ncSheet, ncType, ncName: String(ncName).trim(), amount: Number(amount), date, description: String(description || "").trim() }
        })
      })
      const data = await res.json()
      if (data.status === "success") {
        showToast("✓ Adjustment added — " + data.entryId)
        resetCommon()
        amountRef.current?.focus()
      } else {
        showToast(data.message || "Adjustment failed", "error")
      }
    } catch { showToast("Network error", "error") }
    setSaving(false)
  }

  const engines = [
    { id: "transaction", label: "Transaction" },
    { id: "contra",      label: "Contra" },
    { id: "adjustment",  label: "Adjustment" }
  ]

  return (
    <div className="finance-page">
      <div className="finance-card">

        {/* Header */}
        <div className="finance-header">
          <div style={{ position: "relative", textAlign: "center" }}>
            <div className="finance-title">My Financials 2.0</div>
            <button onClick={() => { localStorage.removeItem("financeAuthorized"); window.location.href = "/mf-2" }} style={{
              position: "absolute", right: 0, top: 0,
              fontSize: 13, border: "none", background: "transparent",
              color: "#dc2626", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif"
            }}>
              Logout
            </button>
          </div>

          {/* Top Nav */}
          <div className="finance-nav">
            <button className="active">Add</button>
            <button onClick={() => window.location.href = "/mf-2/ledger"}>Ledger</button>
            <button onClick={() => window.location.href = "/mf-2/masters"}>Masters</button>
          </div>

          {/* Engine Switcher */}
          <div style={{
            display: "flex",
            gap: 4,
            padding: "5px",
            background: "#f5f5f4",
            borderRadius: 12,
            marginBottom: 18
          }}>
            {engines.map(e => (
              <button
                key={e.id}
                onClick={() => setEngine(e.id)}
                style={{
                  flex: 1,
                  padding: "9px 6px",
                  borderRadius: 8,
                  border: "none",
                  background: engine === e.id ? "#111" : "transparent",
                  color: engine === e.id ? "#fff" : "#6b7280",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.15s",
                  boxShadow: engine === e.id ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                }}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── TRANSACTION ── */}
        {engine === "transaction" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            <Field label="Sheet">
              <select value={sheet} onChange={e => { setSheet(e.target.value); setName(""); setHead(""); setType(""); setTag(""); setAmount(""); setDescription("") }} style={selectStyle}>
                <option value="">Select sheet</option>
                {sheets.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            {sheet === "PERSONAL-T" && (
              <Field label="Head">
                <select value={head} onChange={e => { setHead(e.target.value); setName("") }} style={selectStyle}>
                  <option value="">Select head</option>
                  {Object.keys(names || {}).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            )}

            {sheet && (
              <Field label="Name">
                <select value={name} onChange={e => setName(e.target.value)} style={selectStyle}>
                  <option value="">Select name</option>
                  {sheet === "PERSONAL-T"
                    ? (names?.[head] || []).map((n: any) => <option key={n} value={n}>{n}</option>)
                    : (names || []).map((n: any) => <option key={n} value={n}>{n}</option>)
                  }
                </select>
              </Field>
            )}

            <Field label="Type">
              <select value={type} onChange={e => setType(e.target.value)} style={selectStyle}>
                <option value="">Select type</option>
                {types.map((t: any) => <option key={t.type} value={t.type}>{t.type}</option>)}
              </select>
            </Field>

            {!isWriteoff && !isTransferred && !isNotional && (
              <Field label="Tag">
                <select value={tag} onChange={e => setTag(e.target.value)} style={selectStyle}>
                  <option value="">Select tag</option>
                  {tags.map((t: any) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            )}

            <Field label="Amount">
              <input ref={amountRef} type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                style={{ ...inputStyle, fontFamily: "'DM Mono', monospace", fontSize: 17 }} />
            </Field>

            <Field label="Date">{dateField(date, setDate)}</Field>

            <Field label="Description">
              <input placeholder="Optional note" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
            </Field>

            <SubmitButton disabled={saving} onClick={submitTransaction} saving={saving} />
          </div>
        )}

        {/* ── CONTRA ── */}
        {engine === "contra" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            <Field label="Name">
              <select value={name} onChange={e => setName(e.target.value)} style={selectStyle}>
                <option value="">Select name</option>
                {(masters.names["OTHER-T"] || []).map((n: any) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>

            <div style={{ display: "flex", gap: 10 }}>
              <Field label="From">
                <select value={fromTag} onChange={e => setFromTag(e.target.value)} style={selectStyle}>
                  <option value="">From tag</option>
                  {tags.map((t: any) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="To">
                <select value={toTag} onChange={e => setToTag(e.target.value)} style={selectStyle}>
                  <option value="">To tag</option>
                  {tags.map((t: any) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Amount">
              <input ref={amountRef} type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                style={{ ...inputStyle, fontFamily: "'DM Mono', monospace", fontSize: 17 }} />
            </Field>

            <Field label="Date">{dateField(date, setDate)}</Field>

            <Field label="Description">
              <input placeholder="Optional note" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
            </Field>

            <SubmitButton disabled={saving} onClick={submitContra} saving={saving} />
          </div>
        )}

        {/* ── ADJUSTMENT ── */}
        {engine === "adjustment" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            <div style={{ background: "#fafafa", borderRadius: 12, padding: "14px 14px 6px", border: "1.5px solid #e5e5e4" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Main Sheet</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select value={mainSheet} onChange={e => { setMainSheet(e.target.value); setMainType(""); setMainName("") }} style={selectStyle}>
                  <option value="">Select sheet</option>
                  {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={mainType} onChange={e => setMainType(e.target.value)} style={selectStyle}>
                  <option value="">Select type</option>
                  {(masters.types[mainSheet] || []).filter((t: any) => String(t.mode).toUpperCase() === "NON-CASH").map((t: any) => <option key={t.type} value={t.type}>{t.type}</option>)}
                </select>
                <select value={mainName} onChange={e => setMainName(e.target.value)} style={selectStyle}>
                  <option value="">Select name</option>
                  {Object.values(masters.names[mainSheet] || {}).flat().map((n: any) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div style={{ background: "#fafafa", borderRadius: 12, padding: "14px 14px 6px", border: "1.5px solid #e5e5e4" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>NC Sheet</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select value={ncSheet} onChange={e => { setNcSheet(e.target.value); setNcType(""); setNcName("") }} style={selectStyle}>
                  <option value="">Select sheet</option>
                  {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={ncType} onChange={e => setNcType(e.target.value)} style={selectStyle}>
                  <option value="">Select type</option>
                  {(masters.types[ncSheet] || []).filter((t: any) => String(t.mode).toUpperCase() === "NON-CASH").map((t: any) => <option key={t.type} value={t.type}>{t.type}</option>)}
                </select>
                <select value={ncName} onChange={e => setNcName(e.target.value)} style={selectStyle}>
                  <option value="">Select name</option>
                  {Object.values(masters.names[ncSheet] || {}).flat().map((n: any) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <Field label="Amount">
              <input ref={amountRef} type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                style={{ ...inputStyle, fontFamily: "'DM Mono', monospace", fontSize: 17 }} />
            </Field>

            <Field label="Date">{dateField(date, setDate)}</Field>

            <Field label="Description">
              <input placeholder="Optional note" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
            </Field>

            <SubmitButton disabled={saving} onClick={submitAdjustment} saving={saving} />
          </div>
        )}

      </div>

      {saving && <FullScreenLoader label="Saving entry..." />}
      {toast.msg && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

/* ── Shared sub-components ── */

function SubmitButton({ disabled, onClick, saving }: { disabled: boolean; onClick: () => void; saving: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "14px",
        borderRadius: 12,
        border: "none",
        background: "#111",
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "'DM Sans', sans-serif",
        marginTop: 4,
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s",
        letterSpacing: "-0.2px"
      }}
    >
      {saving ? "Saving..." : "Submit"}
    </button>
  )
}

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
      background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 999
    }}>
      <div style={{
        background: "#fff", padding: "24px 32px", borderRadius: 16,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
      }}>
        <div style={{
          width: 28, height: 28, border: "3px solid #e5e5e4",
          borderTop: "3px solid #111", borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{label}</div>
      </div>
    </div>
  )
}

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: type === "error" ? "#dc2626" : "#111",
      color: "#fff", padding: "12px 20px", borderRadius: 10,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)", fontSize: 14, fontWeight: 600,
      zIndex: 1000, whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif",
      animation: "fadeIn 0.2s ease"
    }}>
      {msg}
    </div>
  )
}