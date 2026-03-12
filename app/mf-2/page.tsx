"use client"

import { useState, useEffect } from "react"

export default function FinanceAccess() {

  const PASSWORD = process.env.NEXT_PUBLIC_FINANCE_PASSWORD

  const [passwordInput, setPasswordInput] = useState("")
  const [error, setError] = useState("")
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("financeAuthorized")
    if (saved === "true") {
      window.location.href = "/mf-2/dashboard"
    }
  }, [])

  function checkPassword() {
    if (checking) return
    setChecking(true)

    setTimeout(() => {
      if (passwordInput === PASSWORD) {
        localStorage.setItem("financeAuthorized", "true")
        window.location.href = "/mf-2/dashboard"
      } else {
        setError("Incorrect password")
        setPasswordInput("")
        setTimeout(() => setError(""), 2500)
      }
      setChecking(false)
    }, 300)
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: 16
    }}>

      <div style={{
        width: "100%",
        maxWidth: 380,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 32
      }}>

        {/* Logo mark */}
        <div style={{
          width: 64,
          height: 64,
          background: "#fff",
          borderRadius: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          fontWeight: 800,
          color: "#0a0a0a",
          fontFamily: "'DM Mono', monospace",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.1)"
        }}>
          ₹
        </div>

        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 24,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.5px",
            marginBottom: 6
          }}>
            My Financials 2.0
          </div>
          <div style={{
            fontSize: 13,
            color: "#666",
            letterSpacing: "0.02em"
          }}>
            Private access only
          </div>
        </div>

        {/* Form */}
        <div style={{
          width: "100%",
          background: "#161616",
          borderRadius: 18,
          padding: 24,
          border: "1px solid #222",
          display: "flex",
          flexDirection: "column",
          gap: 14
        }}>

          <input
            type="password"
            placeholder="Enter password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && checkPassword()}
            autoFocus
            style={{
              padding: "13px 16px",
              borderRadius: 10,
              border: `1.5px solid ${error ? "#dc2626" : "#2a2a2a"}`,
              background: "#0a0a0a",
              color: "#fff",
              fontSize: 16,
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.1em",
              outline: "none",
              transition: "border-color 0.15s",
              width: "100%",
              boxSizing: "border-box"
            }}
          />

          {error && (
            <div style={{
              fontSize: 13,
              color: "#f87171",
              textAlign: "center",
              fontWeight: 500
            }}>
              {error}
            </div>
          )}

          <button
            onClick={checkPassword}
            disabled={checking || !passwordInput}
            style={{
              padding: "13px",
              borderRadius: 10,
              border: "none",
              background: checking ? "#333" : "#fff",
              color: "#0a0a0a",
              fontSize: 15,
              fontWeight: 700,
              cursor: checking ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.15s",
              letterSpacing: "-0.2px"
            }}
          >
            {checking ? "Checking..." : "Access →"}
          </button>

        </div>

      </div>
    </div>
  )
}