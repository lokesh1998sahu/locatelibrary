"use client"

import { useEffect, useState } from "react"

const API = "/api/ledger"

interface RecentEntry {
  name: string
  type: string
  amount: number | null
  tag: string
  date: string
  entryId: string
  isReversal: boolean
}

const reverseSheets = ["LIBRARY-T","PERSONAL-T","OTHER-T","IPO & TRADING","INVESTMENTS","RECEIVABLES","ASSETS","PORTFOLIO"]

export default function FinanceDashboard() {

  const [recentSheet, setRecentSheet] = useState("")
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)

  useEffect(() => {
    const auth = localStorage.getItem("financeAuthorized")
    if (auth !== "true") {
      window.location.href = "/mf-2"
    }
  }, [])

  useEffect(() => {
    const lastSheet = localStorage.getItem("mf2_last_sheet")
    if (!lastSheet) return
    setRecentSheet(lastSheet)
    setLoadingRecent(true)

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ledger", payload: { sheet: lastSheet, limit: 5 } })
    })
      .then(r => r.json())
      .then(d => {
        if (d.status === "success" && d.rows?.length) {
          const headers: string[] = d.headers || []

          const idx = (col: string) => headers.indexOf(col)

          const entries = (d.rows as any[][]).map(row => {
            const nonCashIdx = idx("NON-CASH-AMOUNT")
            const transferIdx = idx("TRANSFER AMOUNT")

            let amount: number | null = null
            let tag = ""

            if (nonCashIdx >= 0 && typeof row[nonCashIdx] === "number" && row[nonCashIdx] !== 0) {
              amount = row[nonCashIdx]; tag = "NON-CASH"
            } else if (transferIdx >= 0 && typeof row[transferIdx] === "number" && row[transferIdx] !== 0) {
              amount = row[transferIdx]; tag = "TRANSFER"
            } else {
              const start = Math.max(nonCashIdx + 1, transferIdx + 1)
              for (let i = start; i < row.length; i++) {
                if (typeof row[i] === "number" && row[i] !== 0) {
                  amount = row[i]; tag = headers[i]; break
                }
              }
            }

            if (amount !== null && reverseSheets.includes(lastSheet)) {
              amount = amount * -1
            }

            return {
              name: String(row[idx("NAME")] || ""),
              type: String(row[idx("T-TYPE")] || ""),
              amount,
              tag,
              date: row[idx("DATE")] ? new Date(row[idx("DATE")]).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "",
              entryId: String(row[idx("ENTRY-ID")] || ""),
              isReversal: row[idx("ENTRY-TYPE")] === "REVERSAL"
            }
          })
          setRecent(entries)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRecent(false))
  }, [])

  function logout() {
    localStorage.removeItem("financeAuthorized")
    window.location.href = "/mf-2"
  }

  const navItems = [
    {
      label: "Add Entry",
      icon: "+",
      desc: "Transaction, Contra, Adjustment",
      href: "/mf-2/add",
      color: "#0a0a0a"
    },
    {
      label: "Ledger",
      icon: "≡",
      desc: "View, search & reverse entries",
      href: "/mf-2/ledger",
      color: "#0a0a0a"
    },
    {
      label: "Masters",
      icon: "⊕",
      desc: "Manage names & heads",
      href: "/mf-2/masters",
      color: "#0a0a0a"
    }
  ]

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
              color: "#dc2626", cursor: "pointer", fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", padding: "2px 0"
            }}>
              Logout
            </button>
          </div>
        </div>

        {/* Nav Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {navItems.map(item => (
            <button
              key={item.href}
              onClick={() => window.location.href = item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 18px",
                borderRadius: 14,
                border: "1.5px solid #e5e5e4",
                background: "#fff",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#111"
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e5e4"
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "#0a0a0a", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 700, flexShrink: 0
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 2 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>
                  {item.desc}
                </div>
              </div>
              <div style={{ marginLeft: "auto", color: "#d1d5db", fontSize: 18 }}>→</div>
            </button>
          ))}
        </div>

        {/* Recent Entries */}
        {recentSheet && (
          <>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Recent — {recentSheet}
              </div>
              <button
                onClick={() => {
                  localStorage.setItem("mf2_open_sheet", recentSheet)
                  window.location.href = "/mf-2/ledger"
                }}
                style={{
                  fontSize: 12, color: "#111", fontWeight: 600,
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif"
                }}
              >
                View all →
              </button>
            </div>

            {loadingRecent ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: 13 }}>
                Loading...
              </div>
            ) : recent.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: 13 }}>
                No recent entries
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {recent.map((e, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: e.isReversal ? "#fef2f2" : "#fafafa",
                    border: "1px solid transparent"
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: "#111",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>
                        {e.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                        {e.type} · {e.date}
                      </div>
                    </div>
                    {e.amount !== null && (
                      <div style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: e.amount > 0 ? "#16a34a" : "#dc2626",
                        fontFamily: "'DM Mono', monospace",
                        flexShrink: 0
                      }}>
                        {e.amount > 0 ? "+" : ""}₹{Math.abs(e.amount).toLocaleString("en-IN")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}