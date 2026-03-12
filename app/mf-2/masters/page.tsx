"use client"

import { useEffect, useState } from "react"

const API = "/api/ledger"

const selectStyle: React.CSSProperties = {
  padding: "11px 14px",
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
  padding: "11px 14px",
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

export default function MastersPage() {

  const [sheets,   setSheets]   = useState<any[]>([])
  const [sheet,    setSheet]    = useState("")
  const [data,     setData]     = useState<any>(null)
  const [head,     setHead]     = useState("")
  const [name,     setName]     = useState("")
  const [loading,  setLoading]  = useState(false)
  const [adding,   setAdding]   = useState(false)
  const [toast,    setToast]    = useState<{ msg: string; type: "success" | "error" }>({ msg: "", type: "success" })

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: "", type: "success" }), 3000)
  }

  useEffect(() => {
    const auth = localStorage.getItem("financeAuthorized")
    if (auth !== "true") window.location.href = "/mf-2"
  }, [])

  useEffect(() => {
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getSheets" }) })
      .then(r => r.json())
      .then(d => { if (d.status === "success") setSheets(d.sheets) })
  }, [])

  useEffect(() => {
    if (!sheet) return
    setLoading(true)
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getNames", payload: { sheet } }) })
      .then(r => r.json())
      .then(d => { setData(d); setHead(""); setLoading(false) })
  }, [sheet])

  async function addName() {
    if (adding) return
    if (!name) { showToast("Enter a name", "error"); return }
    if (data?.type === "HEAD" && !head) { showToast("Select or enter a head name", "error"); return }
    setAdding(true)

    const payload: any = { sheet, name }
    if (data?.type === "HEAD") payload.head = head

    try {
      const res    = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addName", payload }) })
      const result = await res.json()
      if (result.status !== "success") {
        showToast(result.message || "Error adding name", "error")
      } else {
        setName(""); setHead("")
        showToast("✓ Name added successfully")
        reload()
      }
    } catch { showToast("Network error", "error") }
    setAdding(false)
  }

  function reload() {
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getNames", payload: { sheet } }) })
      .then(r => r.json())
      .then(setData)
  }

  function logout() {
    localStorage.removeItem("financeAuthorized")
    window.location.href = "/mf-2"
  }

  const isHead = data?.type === "HEAD"
  const isFlat = data?.type === "FLAT"

  const headNames: string[] = isHead && head ? (data.data[head] || []) : []
  const flatNames: string[] = isFlat ? (data.data || []) : []
  const headKeys: string[]  = isHead ? Object.keys(data.data || {}) : []

  return (
    <div className="finance-page">
      <div className="finance-card">

        {/* Header */}
        <div className="finance-header">
          <div style={{ position: "relative", textAlign: "center" }}>
            <div className="finance-title">My Financials 2.0</div>
            <button onClick={logout} style={{ position: "absolute", right: 0, top: 0, fontSize: 13, border: "none", background: "transparent", color: "#dc2626", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
              Logout
            </button>
          </div>
          <div className="finance-nav">
            <button onClick={() => window.location.href = "/mf-2/add"}>Add</button>
            <button onClick={() => window.location.href = "/mf-2/ledger"}>Ledger</button>
            <button className="active">Masters</button>
          </div>
        </div>

        {/* Sheet selector */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Sheet</div>
          <select value={sheet} onChange={e => { setSheet(e.target.value); setHead(""); setData(null) }} style={selectStyle}>
            <option value="">Select sheet</option>
            {sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>

        {/* FLAT sheet */}
        {isFlat && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Name list */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Names ({flatNames.length})
              </div>
              <div style={{ border: "1.5px solid #e5e5e4", borderRadius: 12, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
                {flatNames.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No names yet</div>
                ) : (
                  flatNames.map((n, i) => (
                    <div key={n} style={{
                      padding: "10px 14px",
                      fontSize: 14,
                      color: "#111",
                      fontWeight: 500,
                      borderBottom: i < flatNames.length - 1 ? "1px solid #f5f5f4" : "none",
                      background: "#fff"
                    }}>
                      {n}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add name */}
            <AddNameCard>
              <input placeholder="New name" value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addName()} style={inputStyle} />
              <AddButton onClick={addName} loading={adding} />
            </AddNameCard>

          </div>
        )}

        {/* HEAD sheet (PERSONAL-T) */}
        {isHead && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Head selector */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Head</div>
              <select value={head} onChange={e => setHead(e.target.value)} style={selectStyle}>
                <option value="">Select head</option>
                {headKeys.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            {/* Names under selected head */}
            {head && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Names under {head} ({headNames.length})
                </div>
                <div style={{ border: "1.5px solid #e5e5e4", borderRadius: 12, overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
                  {headNames.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No names under this head</div>
                  ) : (
                    headNames.map((n, i) => (
                      <div key={n} style={{
                        padding: "10px 14px",
                        fontSize: 14,
                        color: "#111",
                        fontWeight: 500,
                        borderBottom: i < headNames.length - 1 ? "1px solid #f5f5f4" : "none",
                        background: "#fff"
                      }}>
                        {n}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "#f0f0ef" }} />

            {/* Add name form */}
            <AddNameCard title="Add Name">
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Head (new or existing)
              </div>
              <input
                placeholder="e.g. FAMILY, SELF, BUSINESS..."
                value={head}
                onChange={e => setHead(e.target.value)}
                style={inputStyle}
              />
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", margin: "10px 0 6px" }}>
                Name
              </div>
              <input
                placeholder="Name to add"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addName()}
                style={inputStyle}
              />
              <AddButton onClick={addName} loading={adding} />
            </AddNameCard>

          </div>
        )}

      </div>

      {(loading || adding) && <FullScreenLoader label={adding ? "Adding..." : "Loading..."} />}
      {toast.msg && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

/* ── Sub-components ── */

function AddNameCard({ children, title = "Add Name" }: { children: React.ReactNode; title?: string }) {
  return (
    <div style={{ background: "#fafafa", borderRadius: 14, padding: 16, border: "1.5px solid #e5e5e4", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  )
}

function AddButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: "12px",
        borderRadius: 10,
        border: "none",
        background: "#111",
        color: "#fff",
        fontWeight: 700,
        fontSize: 14,
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "'DM Sans', sans-serif",
        opacity: loading ? 0.6 : 1,
        transition: "all 0.15s"
      }}
    >
      {loading ? "Adding..." : "Add"}
    </button>
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