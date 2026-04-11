"use client"

import { useState, useEffect } from "react"

export default function WhatsAppPage() {
  const [value, setValue] = useState("")
  const [error, setError] = useState(false)
  const [preview, setPreview] = useState("")
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    // Register service worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }

    // Catch install prompt
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstall(true)
    }
    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", () => setShowInstall(false))
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  function extractNumber(raw: string): string {
    let val = raw.trim().replace(/\D/g, "")
    if (val.length === 12 && val.startsWith("91")) val = val.slice(2)
    if (val.length === 11 && val.startsWith("0")) val = val.slice(1)
    return val
  }

  function isValid(num: string): boolean {
    return /^[6-9]\d{9}$/.test(num)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setValue(raw)
    setError(false)
    const num = extractNumber(raw)
    if (num.length === 10 && isValid(num)) {
      setPreview("+91 " + num.slice(0, 5) + " " + num.slice(5))
    } else {
      setPreview("")
    }
  }

  function handleSubmit() {
    const num = extractNumber(value)
    if (!isValid(num)) {
      setError(true)
      setPreview("")
      return
    }
    window.open("https://wa.me/91" + num, "_blank")
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") setShowInstall(false)
    setDeferredPrompt(null)
  }

  return (
    <div style={styles.body}>
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.logo}>
          <WhatsAppIcon />
          <span style={styles.logoText}>locatelibrary.com</span>
        </div>

        <h1 style={styles.h1}>Open on WhatsApp</h1>
        <p style={styles.subtitle}>
          Paste any Indian mobile number and jump straight to the chat.
        </p>

        {/* Input */}
        <label style={styles.label} htmlFor="phone">Mobile Number</label>
        <input
          id="phone"
          type="text"
          inputMode="tel"
          autoComplete="off"
          placeholder="+911234567890 or 1234567890"
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          style={{
            ...styles.input,
            borderColor: error ? "#ef4444" : preview ? "#25d366" : "#d1d5db",
            boxShadow: error
              ? "0 0 0 3px rgba(239,68,68,0.1)"
              : preview
              ? "0 0 0 3px rgba(37,211,102,0.12)"
              : "none",
          }}
        />

        {/* Hint / Error / Preview */}
        {!preview && !error && (
          <p style={styles.hint}>Accepts +91XXXXXXXXXX or 10-digit format</p>
        )}
        {error && (
          <p style={styles.errorMsg}>
            Please enter a valid 10-digit Indian mobile number.
          </p>
        )}
        {preview && (
          <div style={styles.preview}>
            Opening WhatsApp for{" "}
            <span style={{ fontWeight: 600 }}>{preview}</span>
          </div>
        )}

        {/* Submit */}
        <button style={styles.button} onClick={handleSubmit}>
          <SendIcon />
          Open WhatsApp
        </button>

        {/* PWA Install Banner */}
        {showInstall && (
          <div style={styles.installBanner}>
            <span style={{ fontSize: 13, color: "#1e40af" }}>
              Add this as an app on your home screen
            </span>
            <button style={styles.installBtn} onClick={handleInstall}>
              Install
            </button>
          </div>
        )}

        <p style={styles.footer}>
          Powered by{" "}
          <a
            href="https://wa.me"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#25d366", textDecoration: "none", fontWeight: 500 }}
          >
            wa.me
          </a>{" "}
          · No data stored
        </p>
      </div>
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function WhatsAppIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="18" fill="#25d366" />
      <path
        d="M26.5 9.5C24.3 7.3 21.3 6 18 6C11.4 6 6 11.4 6 18c0 2.1.6 4.2 1.6 6L6 30l6.2-1.6c1.7.9 3.7 1.4 5.8 1.4 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.3z"
        fill="#fff"
      />
      <path
        d="M23.5 21.3c-.3-.2-1.7-.9-2-.9-.3-.1-.5-.1-.7.1-.2.2-.8.9-.9 1.1-.2.2-.3.2-.6.1s-1.2-.4-2.3-1.4c-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.1-.3.2-.4 0-.1 0-.3-.1-.4-.1-.1-.7-1.6-1-2.2-.3-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.1 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.2-.3-.3-.6-.4z"
        fill="#25d366"
      />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M20.5 3.5L3 10.5l7 2 2 7 8.5-16z"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  body: {
    fontFamily: "'DM Sans', sans-serif",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f0f2f5",
    padding: "20px",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 600,
    color: "#111",
  },
  h1: {
    fontSize: 22,
    fontWeight: 600,
    color: "#111",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 28,
    lineHeight: 1.5,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    width: "100%",
    padding: "13px 16px",
    fontSize: 18,
    border: "1.5px solid #d1d5db",
    borderRadius: 10,
    outline: "none",
    color: "#111",
    background: "#fff",
    letterSpacing: "0.5px",
    marginBottom: 8,
    transition: "border-color 0.15s",
    fontFamily: "'DM Sans', sans-serif",
  },
  hint: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 20,
    paddingLeft: 2,
  },
  errorMsg: {
    fontSize: 12,
    color: "#ef4444",
    marginBottom: 20,
    paddingLeft: 2,
  },
  preview: {
    marginTop: 4,
    marginBottom: 20,
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 13,
    color: "#166534",
  },
  button: {
    width: "100%",
    padding: "14px",
    background: "#25d366",
    color: "#fff",
    fontSize: 17,
    fontWeight: 600,
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "'DM Sans', sans-serif",
  },
  installBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 10,
    padding: "12px 14px",
  },
  installBtn: {
    marginLeft: "auto",
    background: "#1d4ed8",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  footer: {
    marginTop: 28,
    textAlign: "center",
    fontSize: 12,
    color: "#9ca3af",
  },
}