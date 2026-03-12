"use client";

import { useEffect, useState, useRef } from "react";

type SheetItem = { name: string; category: string }

const API = "/api/ledger"

const reverseSheets = ["LIBRARY-T","PERSONAL-T","OTHER-T","IPO & TRADING","INVESTMENTS","RECEIVABLES","ASSETS","PORTFOLIO"]

const selectStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #e5e5e4",
  fontSize: 14,
  background: "#fafafa",
  color: "#111",
  fontFamily: "'DM Sans', sans-serif",
  width: "100%",
  outline: "none",
  cursor: "pointer",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 32,
  boxSizing: "border-box"
}

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #e5e5e4",
  fontSize: 14,
  background: "#fafafa",
  color: "#111",
  fontFamily: "'DM Sans', sans-serif",
  width: "100%",
  outline: "none",
  boxSizing: "border-box"
}

export default function LedgerPage() {

  const [editEntry, setEditEntry]       = useState<any[] | null>(null)
  const [newDescription, setNewDescription] = useState("")
  const [savingEdit, setSavingEdit]     = useState(false)

  const [sheets, setSheets]             = useState<SheetItem[]>([])
  const [sheet, setSheet]               = useState("")
  const [category, setCategory]         = useState("")
  const [filteredSheets, setFilteredSheets] = useState<SheetItem[]>([])

  const [entries, setEntries]           = useState<any[][]>([])
  const [headers, setHeaders]           = useState<string[]>([])
  const [loading, setLoading]           = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<any[] | null>(null)
  const [reversingId, setReversingId]   = useState<string | null>(null)

  const [searchName, setSearchName]     = useState("")
  const [searchDesc, setSearchDesc]     = useState("")
  const [fromDate, setFromDate]         = useState("")
  const [toDate, setToDate]             = useState("")
  const [quickRange, setQuickRange]     = useState("")
  const [duplicating, setDuplicating]   = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" }>({ msg: "", type: "success" })
  const searchRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: "", type: "success" }), 3000)
  }

  useEffect(() => {
    const auth = localStorage.getItem("financeAuthorized")
    if (auth !== "true") window.location.href = "/mf-2"
  }, [])

  useEffect(() => { searchRef.current?.focus() }, [])

  // Restore sheet from dashboard "View all" link
  useEffect(() => {
    const openSheet = localStorage.getItem("mf2_open_sheet")
    if (openSheet) {
      setSheet(openSheet)
      localStorage.removeItem("mf2_open_sheet")
    }
  }, [])

  useEffect(() => { loadSheets() }, [])
  useEffect(() => { loadLedger() }, [sheet])

  useEffect(() => {
    if (!category) { setFilteredSheets([]); return }
    setFilteredSheets(sheets.filter(s => s.category === category))
  }, [category, sheets])

  function getValue(row: any[], column: string) {
    const idx = headers.indexOf(column)
    return idx === -1 ? "" : row[idx]
  }

  function formatDateTime(value: any) {
    if (!value) return ""
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    })
  }

  function detectAmount(row: any[]) {
    const idxNonCash  = headers.indexOf("NON-CASH-AMOUNT")
    const idxTransfer = headers.indexOf("TRANSFER AMOUNT")

    if (idxNonCash >= 0 && typeof row[idxNonCash] === "number" && row[idxNonCash] !== 0)
      return { amount: row[idxNonCash], tag: "NON-CASH" }

    if (idxTransfer >= 0 && typeof row[idxTransfer] === "number" && row[idxTransfer] !== 0)
      return { amount: row[idxTransfer], tag: "TRANSFER" }

    const start = idxTransfer !== -1 ? idxTransfer + 1 : idxNonCash + 1
    for (let i = start; i < row.length; i++) {
      if (typeof row[i] === "number" && row[i] !== 0)
        return { amount: row[i], tag: headers[i] }
    }
    return { amount: null, tag: "" }
  }

  async function loadSheets() {
    const res  = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getSheets" }) })
    const data = await res.json()
    if (data.status === "success") setSheets(data.sheets)
  }

  function applyQuickRange(range: string) {
    setQuickRange(range)
    const today = new Date()
    if (range === "today") {
      const d = today.toISOString().split("T")[0]
      setFromDate(d); setToDate(d)
    } else if (range === "week") {
      const start = new Date(); start.setDate(today.getDate() - 6)
      setFromDate(start.toISOString().split("T")[0]); setToDate(today.toISOString().split("T")[0])
    } else if (range === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      setFromDate(start.toISOString().split("T")[0]); setToDate(today.toISOString().split("T")[0])
    } else if (range === "all") {
      setFromDate(""); setToDate("")
    }
  }

  async function loadLedger() {
    if (!sheet) { setEntries([]); setLoading(false); return }
    setLoading(true)
    // Save last used sheet for dashboard recent preview
    localStorage.setItem("mf2_last_sheet", sheet)
    try {
      const res  = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ledger", payload: { sheet, limit: 20, name: searchName || null, description: searchDesc || null, fromDate: fromDate || null, toDate: toDate || null } })
      })
      const data = await res.json()
      if (data.status === "success") { setHeaders(data.headers || []); setEntries(data.rows || []) }
    } catch {}
    setLoading(false)
  }

  async function reverseEntry(entryId: string, cashType: string) {
    if (reversingId) return
    if (cashType === "NON-CASH") { showToast("Adjustment entries cannot be reversed", "error"); return }

    // Confirm inline via toast flow — no native alert
    const confirmed = window.confirm("Reverse this entry?")
    if (!confirmed) return

    setReversingId(entryId)
    try {
      const res  = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reversal", payload: { sheet, entryId } }) })
      const data = await res.json()
      if (data.status === "success") {
        showToast("↺ Entry reversed successfully")
        loadLedger()
      } else {
        showToast(data.message || "Reversal failed", "error")
      }
    } catch { showToast("Network error", "error") }
    setReversingId(null)
  }

  function duplicateEntry(row: any[]) {
    setDuplicating(true)
    const { amount, tag } = detectAmount(row)
    const payload = {
      sheet,
      name: getValue(row, "NAME"),
      head: getValue(row, "HEAD-NAME"),
      type: getValue(row, "T-TYPE"),
      description: getValue(row, "DESCRIPTION"),
      tag,
      amount
    }
    localStorage.setItem("duplicateEntry", JSON.stringify(payload))
    window.location.href = "/mf-2/add"
  }

  async function saveEdit() {
    if (!editEntry) return
    const entryId = getValue(editEntry, "ENTRY-ID")
    setSavingEdit(true)
    try {
      const res  = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit_description", payload: { sheet, entryId, description: newDescription } }) })
      const data = await res.json()
      if (data.status === "success") {
        setEditEntry(null); setNewDescription(""); loadLedger()
        showToast("Description updated")
      } else {
        showToast("Update failed", "error")
      }
    } catch { showToast("Network error", "error") }
    setSavingEdit(false)
  }

  function logout() {
    localStorage.removeItem("financeAuthorized")
    window.location.href = "/mf-2"
  }

  const categories = [...new Set(sheets.map(s => s.category))]

  const chipStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "8px 6px",
    borderRadius: 8,
    border: "none",
    background: active ? "#111" : "#f5f5f4",
    color: active ? "#fff" : "#6b7280",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s"
  })

  const actionBtn: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1.5px solid #e5e5e4",
    background: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.12s"
  }

  return (
    <div className="finance-page">
      <div className="finance-card">

        {/* Header */}
        <div className="finance-header">
          <div style={{ position: "relative", textAlign: "center" }}>
            <div className="finance-title">My Financials 2.0</div>
            <button onClick={logout} style={{
              position: "absolute", right: 0, top: 0,
              fontSize: 13, border: "none", background: "transparent",
              color: "#dc2626", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif"
            }}>Logout</button>
          </div>
          <div className="finance-nav">
            <button onClick={() => window.location.href = "/mf-2/add"}>Add</button>
            <button className="active">Ledger</button>
            <button onClick={() => window.location.href = "/mf-2/masters"}>Masters</button>
          </div>
        </div>

        {/* Quick range */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {["today","week","month","all"].map(r => (
            <button key={r} onClick={() => applyQuickRange(r)} style={chipStyle(quickRange === r)}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        {/* Sheet selectors */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <select value={category} onChange={e => { setCategory(e.target.value); setSheet(""); setEntries([]) }} style={selectStyle}>
            <option value="">Select category</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sheet} onChange={e => setSheet(e.target.value)} style={selectStyle}>
            <option value="">Select sheet</option>
            {filteredSheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>

        {/* Search filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, padding: "14px", background: "#fafafa", borderRadius: 12, border: "1.5px solid #e5e5e4" }}>
          <input ref={searchRef} placeholder="Search by name..." value={searchName} onChange={e => setSearchName(e.target.value)} style={inputStyle} />
          <input placeholder="Search description..." value={searchDesc} onChange={e => setSearchDesc(e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" value={fromDate} onChange={e => { setQuickRange(""); setFromDate(e.target.value) }} style={{ ...inputStyle, flex: 1 }} />
            <input type="date" value={toDate}   onChange={e => { setQuickRange(""); setToDate(e.target.value) }}   style={{ ...inputStyle, flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => loadLedger()} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Search
            </button>
            <button onClick={() => { setSearchName(""); setSearchDesc(""); setFromDate(""); setToDate(""); setQuickRange(""); loadLedger() }}
              style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e5e5e4", background: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>
              Clear
            </button>
          </div>
        </div>

        {/* Empty state */}
        {!loading && entries.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af", border: "1.5px dashed #e5e5e4", borderRadius: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {sheet ? "No entries found" : "Select a sheet to view entries"}
            </div>
          </div>
        )}

        {/* Entry cards */}
        {entries.map((row, i) => {
          const name       = getValue(row, "NAME")
          const type       = getValue(row, "T-TYPE")
          const entryId    = getValue(row, "ENTRY-ID")
          const cashType   = getValue(row, "CASH/NON-CASH")
          const description = getValue(row, "DESCRIPTION")
          const entryType  = getValue(row, "ENTRY-TYPE")
          const isReversal = entryType === "REVERSAL"
          const dateRaw    = getValue(row, "DATE")
          const dateStr    = dateRaw ? new Date(dateRaw).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""

          let { amount, tag } = detectAmount(row)
          if (amount !== null && reverseSheets.includes(sheet)) amount = amount * -1

          return (
            <div key={i} className="finance-entry-card" style={{
              border: `1.5px solid ${isReversal ? "#fecaca" : "#f0f0ef"}`,
              borderRadius: 14,
              padding: "14px 16px",
              marginBottom: 10,
              background: isReversal ? "#fff5f5" : "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)"
            }}>

              {/* Top row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#111", flex: 1, marginRight: 8 }}>{name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {isReversal && (
                    <span style={{ fontSize: 11, background: "#fecaca", color: "#dc2626", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>↺ REV</span>
                  )}
                  {amount !== null && (
                    <span style={{
                      fontSize: 15, fontWeight: 800,
                      color: amount > 0 ? "#16a34a" : "#dc2626",
                      fontFamily: "'DM Mono', monospace"
                    }}>
                      {amount > 0 ? "+" : ""}₹{Math.abs(amount).toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
              </div>

              {/* Type + tag + date */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: description ? 6 : 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#f5f5f4", padding: "2px 8px", borderRadius: 6 }}>{type}</span>
                {tag && tag !== "NON-CASH" && tag !== "TRANSFER" && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#f5f5f4", padding: "2px 8px", borderRadius: 6 }}>{tag}</span>
                )}
                <span style={{ fontSize: 11, color: "#9ca3af", padding: "2px 0" }}>{dateStr}</span>
              </div>

              {/* Description */}
              {description && (
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {description}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span
                  title="Click to copy"
                  onClick={() => navigator.clipboard.writeText(entryId)}
                  style={{ fontSize: 11, color: "#9ca3af", cursor: "pointer", fontFamily: "'DM Mono', monospace" }}
                >
                  {entryId}
                </span>
                <span style={{ fontSize: 11, color: "#d1d5db" }}>
                  {formatDateTime(getValue(row, "TIMESTAMP"))}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => setSelectedEntry(row)} style={actionBtn}>View</button>

                {entryType === "TRANSACTION" && (
                  <button onClick={() => duplicateEntry(row)} style={actionBtn}>Duplicate</button>
                )}

                <button onClick={() => { setEditEntry(row); setNewDescription(getValue(row, "DESCRIPTION")) }} style={actionBtn}>Edit</button>

                {!isReversal && (
                  <button
                    disabled={cashType === "NON-CASH" || reversingId === entryId}
                    onClick={() => reverseEntry(entryId, cashType)}
                    style={{ ...actionBtn, opacity: (cashType === "NON-CASH" || reversingId === entryId) ? 0.4 : 1, cursor: cashType === "NON-CASH" ? "not-allowed" : "pointer" }}
                  >
                    {reversingId === entryId ? "Reversing..." : "Reverse"}
                  </button>
                )}
              </div>

            </div>
          )
        })}

        {/* View Entry Modal */}
        {selectedEntry && (
          <Modal onClose={() => setSelectedEntry(null)} title="Entry Details">
            {getValue(selectedEntry, "REVERSAL-OF") && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fff5f5", borderRadius: 8, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                ↺ Reversal of: {getValue(selectedEntry, "REVERSAL-OF")}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {headers.map((h, i) => {
                const value = selectedEntry[i]
                if (value === "" || value === null) return null

                const amountColumns = ["NON-CASH-AMOUNT","TRANSFER AMOUNT",...headers.slice(headers.indexOf("NON-CASH-AMOUNT")+1)]
                let displayValue = value
                if (typeof value === "number" && amountColumns.includes(h) && reverseSheets.includes(sheet)) {
                  displayValue = value * -1
                }
                let color = "#333"
                if (typeof displayValue === "number" && amountColumns.includes(h)) {
                  color = displayValue > 0 ? "#16a34a" : "#dc2626"
                }

                return (
                  <div key={h} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5f5f4", fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: "#9ca3af", flex: 1 }}>{h}</span>
                    <span style={{ color, fontWeight: typeof displayValue === "number" ? 700 : 500, textAlign: "right", flex: 1, fontFamily: typeof displayValue === "number" ? "'DM Mono', monospace" : "inherit" }}>
                      {h === "TIMESTAMP" ? formatDateTime(displayValue) : h === "DATE" ? new Date(displayValue).toLocaleDateString("en-IN") : String(displayValue)}
                    </span>
                  </div>
                )
              })}
            </div>
          </Modal>
        )}

        {/* Edit Description Modal */}
        {editEntry && (
          <Modal onClose={() => setEditEntry(null)} title="Edit Description">
            <textarea
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e5e5e4", minHeight: 90, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => setEditEntry(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e5e5e4", background: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </Modal>
        )}

      </div>

      {(loading || reversingId || duplicating) && <FullScreenLoader label={duplicating ? "Switching..." : reversingId ? "Reversing entry..." : "Loading..."} />}
      {toast.msg && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

/* ── Shared components ── */

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 22, width: "100%", maxWidth: 440, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111" }}>{title}</h3>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #e5e5e4", background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "#fff", padding: "24px 32px", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ width: 28, height: 28, border: "3px solid #e5e5e4", borderTop: "3px solid #111", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{label}</div>
      </div>
    </div>
  )
}

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: type === "error" ? "#dc2626" : "#111", color: "#fff", padding: "12px 20px", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", fontSize: 14, fontWeight: 600, zIndex: 1000, whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", animation: "fadeIn 0.2s ease" }}>
      {msg}
    </div>
  )
}