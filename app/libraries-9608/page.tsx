"use client";

import { useState, useEffect } from "react";

export default function LibrariesPage() {
  const PASSWORD = process.env.NEXT_PUBLIC_LIBRARIES_PASSWORD;
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyWzuVGTo52BEOMpxefp5fBAxBAukESmqtK0JxhlHMFTZV9guTJ-rh19grWw8THDut64g/exec";

  const [tags, setTags] = useState<string[]>([]);
  const [codes, setCodes] = useState<{ code: string; name: string }[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [activeLibrary, setActiveLibrary] = useState("ALL");
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showPass, setShowPass] = useState(false);

  const [form, setForm] = useState({
    date: "",
    amount: "",
    paymentTag: "",
    libraryCode: "",
    remark: "",
    receipt: "Pending",
  });

  const loadData = () => {
    fetch(`${SCRIPT_URL}?action=get`)
      .then((res) => res.json())
      .then((data) => {
        setTags(data.tags || []);
        setCodes(data.codes || []);
        setPendingCount(data.pendingCount || 0);
      });
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const savedAuth = localStorage.getItem("librariesAuthorized");
    if (savedAuth === "true") setAuthorized(true);
  }, []);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  };

  const checkPassword = () => {
    if (passwordInput === PASSWORD) {
      setAuthorized(true);
      localStorage.setItem("librariesAuthorized", "true");
    } else {
      showMsg("Incorrect access code", "error");
    }
  };

  const loadPending = () => {
    fetch(`${SCRIPT_URL}?action=getPending`)
      .then((res) => res.json())
      .then((data) => setPendingList(data || []));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (loading) return;
    if (!form.date || !form.amount || !form.paymentTag || !form.libraryCode) {
      showMsg("Fill all required fields", "error");
      return;
    }
    setLoading(true);
    await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "newEntry", ...form }),
    });
    setForm({ date: "", amount: "", paymentTag: "", libraryCode: "", remark: "", receipt: "Pending" });
    showMsg("Entry saved successfully");
    setLoading(false);
    loadData();
  };

  const updateReceipt = async (row: number, status: string, item: any) => {
    await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "updateReceipt",
        row, status,
        date: item.date, library: item.library,
        amount: item.amount, paymentTag: item.paymentTag, remark: item.remark,
      }),
    });
    setPendingList((prev) => prev.filter((p) => p.row !== row));
    loadData();
    showMsg(status === "Receipt Made" ? "Receipt marked as done" : "Marked as not required");
  };

  // Colour palette — theme-safe accents assigned per library index
  const LIBRARY_COLORS = [
    { border: "#60a5fa", bg: "rgba(96,165,250,0.07)",  badge: "rgba(96,165,250,0.15)",  text: "#60a5fa"  },
    { border: "#f472b6", bg: "rgba(244,114,182,0.07)", badge: "rgba(244,114,182,0.15)", text: "#f472b6"  },
    { border: "#34d399", bg: "rgba(52,211,153,0.07)",  badge: "rgba(52,211,153,0.15)",  text: "#34d399"  },
    { border: "#fb923c", bg: "rgba(251,146,60,0.07)",  badge: "rgba(251,146,60,0.15)",  text: "#fb923c"  },
    { border: "#a78bfa", bg: "rgba(167,139,250,0.07)", badge: "rgba(167,139,250,0.15)", text: "#a78bfa"  },
    { border: "#22d3ee", bg: "rgba(34,211,238,0.07)",  badge: "rgba(34,211,238,0.15)",  text: "#22d3ee"  },
    { border: "#a3e635", bg: "rgba(163,230,53,0.07)",  badge: "rgba(163,230,53,0.15)",  text: "#a3e635"  },
    { border: "#fbbf24", bg: "rgba(251,191,36,0.07)",  badge: "rgba(251,191,36,0.15)",  text: "#fbbf24"  },
  ];

  const getLibraryColor = (libraryCode: string) => {
    const idx = codes.findIndex((c) => c.code === libraryCode);
    return LIBRARY_COLORS[(idx >= 0 ? idx : 0) % LIBRARY_COLORS.length];
  };

  const libraries = ["ALL", ...codes.map((c) => c.code)];
  const filteredList = activeLibrary === "ALL" ? pendingList : pendingList.filter((p) => p.library === activeLibrary);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0c0e14;
          --surface: #13161f;
          --surface2: #1c2030;
          --border: #252a38;
          --border2: #2e3448;
          --gold: #e8a833;
          --gold-dim: #c48c20;
          --gold-glow: rgba(232,168,51,0.12);
          --cream: #ede8df;
          --muted: #5a6278;
          --muted2: #8892aa;
          --red: #f05252;
          --red-dim: rgba(240,82,82,0.12);
          --green: #34d399;
          --green-dim: rgba(52,211,153,0.1);
          --font-display: 'DM Serif Display', serif;
          --font-ui: 'Outfit', sans-serif;
          --font-mono: 'JetBrains Mono', monospace;
        }

        body {
          background: var(--bg);
          font-family: var(--font-ui);
          color: var(--cream);
          min-height: 100vh;
        }

        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          background:
            radial-gradient(ellipse 60% 50% at 50% -10%, rgba(232,168,51,0.07) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 80% 110%, rgba(232,168,51,0.04) 0%, transparent 60%),
            var(--bg);
          position: relative;
        }

        .page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.025;
          pointer-events: none;
          z-index: 0;
        }

        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          width: 100%;
          max-width: 440px;
          position: relative;
          z-index: 1;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.5);
          animation: slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both;
        }

        @keyframes slideUp {
          from { opacity:0; transform: translateY(20px); }
          to   { opacity:1; transform: translateY(0); }
        }

        .card-header {
          padding: 28px 28px 0;
          border-bottom: 1px solid var(--border);
          padding-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .card-body { padding: 24px 28px 28px; }

        .logo-area { display: flex; align-items: center; gap: 10px; }

        .logo-icon {
          width: 36px; height: 36px;
          background: var(--gold);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          box-shadow: 0 0 20px rgba(232,168,51,0.3);
        }

        .logo-text {
          font-family: var(--font-display);
          font-size: 20px;
          color: var(--cream);
          letter-spacing: -0.3px;
        }

        .logo-sub {
          font-size: 11px;
          color: var(--muted);
          font-weight: 400;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* Toast */
        .toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(0);
          z-index: 100;
          padding: 10px 20px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          animation: toastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
          border: 1px solid;
        }

        .toast.success {
          background: var(--green-dim);
          color: var(--green);
          border-color: rgba(52,211,153,0.2);
        }

        .toast.error {
          background: var(--red-dim);
          color: var(--red);
          border-color: rgba(240,82,82,0.2);
        }

        @keyframes toastIn {
          from { opacity:0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }

        /* Auth screen */
        .auth-title {
          font-family: var(--font-display);
          font-size: 28px;
          color: var(--cream);
          text-align: center;
          margin-bottom: 6px;
        }

        .auth-sub {
          font-size: 13px;
          color: var(--muted);
          text-align: center;
          margin-bottom: 28px;
        }

        /* Form elements */
        .field-group { display: flex; flex-direction: column; gap: 6px; }

        .field-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          color: var(--muted2);
        }

        .field-label .req { color: var(--gold); margin-left: 2px; }

        .input, .select {
          width: 100%;
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 10px;
          padding: 12px 14px;
          font-family: var(--font-ui);
          font-size: 14px;
          color: var(--cream);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          appearance: none;
          -webkit-appearance: none;
        }

        .input::placeholder { color: var(--muted); }

        .input:focus, .select:focus {
          border-color: var(--gold-dim);
          box-shadow: 0 0 0 3px var(--gold-glow);
        }

        .input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.4) sepia(1) saturate(2) hue-rotate(5deg);
          cursor: pointer;
        }

        .select { cursor: pointer; }

        .select option {
          background: #1c2030;
          color: var(--cream);
        }

        .select-wrapper {
          position: relative;
        }

        .select-wrapper::after {
          content: '▾';
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          pointer-events: none;
          font-size: 12px;
        }

        /* Password field */
        .pass-wrapper { position: relative; }
        .pass-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: var(--muted); font-size: 16px; padding: 4px;
          transition: color 0.2s;
        }
        .pass-toggle:hover { color: var(--cream); }

        /* Date row */
        .date-row { display: flex; gap: 8px; }
        .date-row .input { flex: 1; }

        .today-btn {
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 10px;
          padding: 12px 14px;
          font-family: var(--font-ui);
          font-size: 12px;
          font-weight: 600;
          color: var(--gold);
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
          letter-spacing: 0.3px;
        }

        .today-btn:hover {
          border-color: var(--gold-dim);
          background: var(--gold-glow);
        }

        /* Buttons */
        .btn-primary {
          width: 100%;
          background: var(--gold);
          border: none;
          border-radius: 12px;
          padding: 14px;
          font-family: var(--font-ui);
          font-size: 15px;
          font-weight: 700;
          color: #0c0e14;
          cursor: pointer;
          letter-spacing: 0.2px;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(232,168,51,0.25);
          position: relative;
          overflow: hidden;
        }

        .btn-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%);
          pointer-events: none;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(232,168,51,0.35);
        }

        .btn-primary:active:not(:disabled) {
          transform: translateY(0);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Pending card */
        .pending-card {
          margin-top: 20px;
          background: var(--red-dim);
          border: 1px solid rgba(240,82,82,0.2);
          border-radius: 14px;
          padding: 16px 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.2s;
        }

        .pending-card:hover {
          background: rgba(240,82,82,0.15);
          border-color: rgba(240,82,82,0.35);
          transform: translateY(-1px);
        }

        .pending-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--red);
          opacity: 0.8;
          margin-bottom: 2px;
        }

        .pending-count {
          font-family: var(--font-mono);
          font-size: 32px;
          font-weight: 600;
          color: var(--red);
          line-height: 1;
        }

        .pending-arrow {
          color: var(--red);
          opacity: 0.6;
          font-size: 20px;
        }

        /* Logout */
        .logout-btn {
          background: none;
          border: 1px solid var(--border2);
          border-radius: 8px;
          padding: 6px 12px;
          font-family: var(--font-ui);
          font-size: 12px;
          font-weight: 500;
          color: var(--muted2);
          cursor: pointer;
          letter-spacing: 0.3px;
          transition: all 0.2s;
        }

        .logout-btn:hover {
          border-color: var(--red);
          color: var(--red);
        }

        /* Divider */
        .divider {
          height: 1px;
          background: var(--border);
          margin: 20px 0;
        }

        /* Form grid */
        .form-grid { display: flex; flex-direction: column; gap: 16px; }

        /* Loading spinner */
        .spinner-overlay {
          position: fixed;
          inset: 0;
          background: rgba(12,14,20,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 60;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

        .spinner-box {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: 16px;
          padding: 28px 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .spinner {
          width: 32px; height: 32px;
          border: 3px solid var(--border2);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .spinner-text {
          font-size: 13px;
          color: var(--muted2);
          font-weight: 500;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(8,10,16,0.85);
          backdrop-filter: blur(8px);
          z-index: 50;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 20px 16px;
          overflow-y: auto;
          animation: fadeIn 0.25s ease;
        }

        .modal {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          width: 100%;
          max-width: 480px;
          overflow: hidden;
          box-shadow: 0 40px 100px rgba(0,0,0,0.6);
          animation: slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both;
          margin-top: 10px;
        }

        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .modal-title {
          font-family: var(--font-display);
          font-size: 20px;
          color: var(--cream);
        }

        .modal-close {
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 8px;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          color: var(--muted2);
          font-size: 16px;
          transition: all 0.2s;
          line-height: 1;
        }

        .modal-close:hover { color: var(--cream); border-color: var(--muted2); }

        .modal-body { padding: 20px 24px 24px; }

        /* Filter tabs */
        .filter-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 20px;
        }

        .filter-tab {
          padding: 5px 12px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 600;
          font-family: var(--font-mono);
          cursor: pointer;
          border: 1px solid var(--border2);
          background: transparent;
          color: var(--muted2);
          transition: all 0.15s;
          letter-spacing: 0.3px;
        }

        .filter-tab:hover { border-color: var(--muted2); color: var(--cream); }

        .filter-tab.active {
          background: var(--gold);
          border-color: var(--gold);
          color: #0c0e14;
        }

        /* Pending item card */
        .pending-item {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 12px;
          transition: border-color 0.2s;
        }

        .pending-item:hover { border-color: var(--border2); }

        .pending-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .sno-badge {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          color: var(--gold);
          background: var(--gold-glow);
          border: 1px solid rgba(232,168,51,0.2);
          border-radius: 6px;
          padding: 3px 8px;
          letter-spacing: 0.5px;
        }

        .item-fields { display: flex; flex-direction: column; gap: 8px; }

        .item-input, .item-select {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 9px 12px;
          font-family: var(--font-ui);
          font-size: 13px;
          color: var(--cream);
          outline: none;
          transition: border-color 0.2s;
          appearance: none;
          -webkit-appearance: none;
        }

        .item-input:focus, .item-select:focus {
          border-color: var(--gold-dim);
        }

        .item-input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.4) sepia(1) saturate(2) hue-rotate(5deg);
          cursor: pointer;
        }

        .item-select option { background: #13161f; }

        .action-row { display: flex; gap: 8px; margin-top: 12px; }

        .btn-receipt {
          flex: 1;
          border: none;
          border-radius: 9px;
          padding: 11px;
          font-family: var(--font-ui);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.3px;
        }

        .btn-receipt.made {
          background: var(--green-dim);
          color: var(--green);
          border: 1px solid rgba(52,211,153,0.2);
        }

        .btn-receipt.made:hover {
          background: rgba(52,211,153,0.18);
          box-shadow: 0 0 12px rgba(52,211,153,0.15);
        }

        .btn-receipt.skip {
          background: rgba(90,98,120,0.15);
          color: var(--muted2);
          border: 1px solid var(--border2);
        }

        .btn-receipt.skip:hover {
          background: rgba(90,98,120,0.25);
          color: var(--cream);
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--muted);
          font-size: 14px;
        }

        .empty-icon {
          font-size: 40px;
          margin-bottom: 10px;
          opacity: 0.4;
        }
      `}</style>

      <div className="page">

        {/* Loading */}
        {loading && (
          <div className="spinner-overlay">
            <div className="spinner-box">
              <div className="spinner" />
              <span className="spinner-text">Processing entry…</span>
            </div>
          </div>
        )}

        {/* Toast */}
        {message && (
          <div className={`toast ${message.type}`}>
            {message.type === "success" ? "✓ " : "✕ "}
            {message.text}
          </div>
        )}

        <div className="card">

          {/* Header */}
          <div className="card-header">
            <div className="logo-area">
              <div className="logo-icon">📚</div>
              <div>
                <div className="logo-text">LibraryLedger</div>
                <div className="logo-sub">Fee Management</div>
              </div>
            </div>

            {authorized && (
              <button
                className="logout-btn"
                onClick={() => {
                  setAuthorized(false);
                  localStorage.removeItem("librariesAuthorized");
                }}
              >
                Sign out
              </button>
            )}
          </div>

          <div className="card-body">

            {!authorized ? (

              /* Auth Screen */
              <div style={{ animation: "slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both" }}>
                <div className="auth-title">Welcome back</div>
                <div className="auth-sub">Enter your access code to continue</div>

                <div className="form-grid">
                  <div className="field-group">
                    <label className="field-label">Access Code</label>
                    <div className="pass-wrapper">
                      <input
                        type={showPass ? "text" : "password"}
                        placeholder="••••••••"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && checkPassword()}
                        className="input"
                        style={{ paddingRight: "44px" }}
                      />
                      <button
                        className="pass-toggle"
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                      >
                        {showPass ? "🙈" : "👁"}
                      </button>
                    </div>
                  </div>

                  <button className="btn-primary" onClick={checkPassword}>
                    Access Portal
                  </button>
                </div>
              </div>

            ) : (

              /* Main Form */
              <form onSubmit={handleSubmit}>
                <div className="form-grid">

                  {/* Date */}
                  <div className="field-group">
                    <label className="field-label">Date <span className="req">*</span></label>
                    <div className="date-row">
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className="input"
                      />
                      <button
                        type="button"
                        className="today-btn"
                        onClick={() => setForm({ ...form, date: new Date().toISOString().split("T")[0] })}
                      >
                        Today
                      </button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="field-group">
                    <label className="field-label">Amount <span className="req">*</span></label>
                    <input
                      type="number"
                      placeholder="₹ 0.00"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="input"
                      style={{ fontFamily: "var(--font-mono)", fontSize: "16px" }}
                    />
                  </div>

                  {/* Library */}
                  <div className="field-group">
                    <label className="field-label">Library <span className="req">*</span></label>
                    <div className="select-wrapper">
                      <select
                        value={form.libraryCode}
                        onChange={(e) => setForm({ ...form, libraryCode: e.target.value })}
                        className="select"
                      >
                        <option value="">Select library</option>
                        {codes.map((c, i) => (
                          <option key={i} value={c.code}>{c.code} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Payment Tag */}
                  <div className="field-group">
                    <label className="field-label">Payment Tag <span className="req">*</span></label>
                    <div className="select-wrapper">
                      <select
                        value={form.paymentTag}
                        onChange={(e) => setForm({ ...form, paymentTag: e.target.value })}
                        className="select"
                      >
                        <option value="">Select tag</option>
                        {tags.map((t, i) => (
                          <option key={i} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Receipt Status */}
                  <div className="field-group">
                    <label className="field-label">Receipt Status</label>
                    <div className="select-wrapper">
                      <select
                        value={form.receipt}
                        onChange={(e) => setForm({ ...form, receipt: e.target.value })}
                        className="select"
                      >
                        <option>Pending</option>
                        <option>Receipt Made</option>
                        <option>Not Required</option>
                      </select>
                    </div>
                  </div>

                  {/* Remark */}
                  <div className="field-group">
                    <label className="field-label">Remark</label>
                    <input
                      type="text"
                      placeholder="Optional note…"
                      value={form.remark}
                      onChange={(e) => setForm({ ...form, remark: e.target.value })}
                      className="input"
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? "Saving…" : "Submit Entry →"}
                  </button>

                </div>
              </form>

            )}

            {/* Pending Banner */}
            {authorized && (
              <div
                className="pending-card"
                onClick={() => { setPendingOpen(true); loadPending(); }}
              >
                <div>
                  <div className="pending-label">Pending Receipts</div>
                  <div className="pending-count">{pendingCount}</div>
                </div>
                <div className="pending-arrow">→</div>
              </div>
            )}

          </div>
        </div>

        {/* Pending Modal */}
        {pendingOpen && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPendingOpen(false); }}>
            <div className="modal">

              <div className="modal-header">
                <div className="modal-title">Pending Receipts</div>
                <button className="modal-close" onClick={() => setPendingOpen(false)}>✕</button>
              </div>

              <div className="modal-body">

                {/* Library Filter — with colour dots */}
                <div className="filter-tabs">
                  {libraries.map((l, li) => {
                    const col = l === "ALL" ? null : getLibraryColor(l);
                    const isActive = activeLibrary === l;
                    return (
                      <button
                        key={l}
                        className={`filter-tab ${isActive ? "active" : ""}`}
                        style={isActive && col ? { background: col.border, borderColor: col.border, color: "#0c0e14" } : {}}
                        onClick={() => setActiveLibrary(l)}
                      >
                        {col && (
                          <span style={{
                            display: "inline-block",
                            width: "7px", height: "7px",
                            borderRadius: "50%",
                            background: col.border,
                            marginRight: "5px",
                            verticalAlign: "middle",
                            opacity: isActive ? 0.6 : 1,
                            flexShrink: 0,
                          }} />
                        )}
                        {l}
                      </button>
                    );
                  })}
                </div>

                {/* Items */}
                {filteredList.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">✓</div>
                    <div>All receipts cleared</div>
                  </div>
                ) : (
                  filteredList.map((item, i) => {
                    const col = getLibraryColor(item.library);
                    return (
                    <div
                      key={i}
                      className="pending-item"
                      style={{
                        borderColor: col.border,
                        borderLeftWidth: "3px",
                        background: col.bg,
                      }}
                    >

                      <div className="pending-item-header">
                        <span
                          className="sno-badge"
                          style={{
                            color: col.text,
                            background: col.badge,
                            borderColor: `${col.border}44`,
                          }}
                        >
                          SNO {item.sno}
                        </span>
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: col.text,
                          opacity: 0.85,
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                        }}>
                          {item.library}
                        </span>
                      </div>

                      <div className="item-fields">

                        <input
                          type="date"
                          value={item.dateRaw}
                          onChange={(e) => { item.dateRaw = e.target.value; setPendingList([...pendingList]); }}
                          className="item-input"
                        />

                        <div className="select-wrapper">
                          <select
                            value={item.library}
                            onChange={(e) => { item.library = e.target.value; setPendingList([...pendingList]); }}
                            className="item-select"
                          >
                            {codes.map((c, i) => (
                              <option key={i} value={c.code}>{c.code} — {c.name}</option>
                            ))}
                          </select>
                        </div>

                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => { item.amount = e.target.value; setPendingList([...pendingList]); }}
                          className="item-input"
                          placeholder="Amount"
                          style={{ fontFamily: "var(--font-mono)" }}
                        />

                        <div className="select-wrapper">
                          <select
                            value={item.paymentTag}
                            onChange={(e) => { item.paymentTag = e.target.value; setPendingList([...pendingList]); }}
                            className="item-select"
                          >
                            {tags.map((t, i) => (
                              <option key={i} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>

                        <input
                          type="text"
                          value={item.remark}
                          onChange={(e) => { item.remark = e.target.value; setPendingList([...pendingList]); }}
                          className="item-input"
                          placeholder="Remark"
                        />

                      </div>

                      <div className="action-row">
                        <button
                          className="btn-receipt made"
                          onClick={() => updateReceipt(item.row, "Receipt Made", item)}
                        >
                          ✓ Receipt Made
                        </button>
                        <button
                          className="btn-receipt skip"
                          onClick={() => updateReceipt(item.row, "Not Required", item)}
                        >
                          ✕ Not Required
                        </button>
                      </div>

                    </div>
                    );
                  })
                )}

              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}