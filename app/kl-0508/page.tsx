"use client";

import { useState, useEffect } from "react";

export default function KLPage() {

  const PASSWORD = process.env.NEXT_PUBLIC_KL_PASSWORD;
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwV5B1buaIIzhtWqp3MHbt6on2Pul6_VfZteQSIrqojQPsSnXp5bcZs9ooEOk-DXdk/exec";

  const [tags, setTags] = useState<string[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({
    date: "",
    amount: "",
    paymentTag: "",
    remark: "",
    receipt: "Pending"
  });

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  };

  const loadData = () => {
    fetch(`${SCRIPT_URL}?action=get`)
      .then(res => res.json())
      .then(data => {
        setTags(data.tags || []);
        setPendingCount(data.pendingCount || 0);
      });
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const savedAuth = localStorage.getItem("klAuthorized");
    if (savedAuth === "true") setAuthorized(true);
  }, []);

  const checkPassword = () => {
    if (passwordInput === PASSWORD) {
      setAuthorized(true);
      localStorage.setItem("klAuthorized", "true");
    } else {
      showMsg("Incorrect access code", "error");
    }
  };

  const loadPending = () => {
    fetch(`${SCRIPT_URL}?action=getPending`)
      .then(res => res.json())
      .then(data => setPendingList(data || []));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!form.date || !form.amount || !form.paymentTag) {
      showMsg("Fill all required fields", "error");
      return;
    }

    setLoading(true);

    await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "newEntry", ...form })
    });

    setForm({ date: "", amount: "", paymentTag: "", remark: "", receipt: "Pending" });
    setLoading(false);
    showMsg("Entry saved successfully");
    loadData();
  };

  const updateReceipt = async (row: number, status: string, item: any) => {
    await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "updateReceipt",
        row, status,
        date: item.date,
        amount: item.amount,
        paymentTag: item.paymentTag,
        remark: item.remark
      })
    });
    setPendingList(prev => prev.filter(p => p.row !== row));
    loadData();
    showMsg(status === "Receipt Made" ? "Receipt marked as done" : "Marked as not required");
  };

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

        body { background: var(--bg); font-family: var(--font-ui); color: var(--cream); min-height: 100vh; }

        .kl-page {
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

        .kl-page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.025;
          pointer-events: none;
          z-index: 0;
        }

        .kl-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          width: 100%;
          max-width: 440px;
          position: relative;
          z-index: 1;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.5);
          animation: klSlideUp 0.4s cubic-bezier(0.16,1,0.3,1) both;
        }

        @keyframes klSlideUp {
          from { opacity:0; transform: translateY(20px); }
          to   { opacity:1; transform: translateY(0); }
        }

        .kl-card-header {
          padding: 24px 28px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .kl-card-body { padding: 24px 28px 28px; }

        .kl-logo-area { display: flex; align-items: center; gap: 10px; }

        .kl-logo-icon {
          width: 36px; height: 36px;
          background: var(--gold);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono);
          font-weight: 600;
          font-size: 13px;
          color: #0c0e14;
          letter-spacing: -0.5px;
          box-shadow: 0 0 20px rgba(232,168,51,0.3);
          flex-shrink: 0;
        }

        .kl-logo-text {
          font-family: var(--font-display);
          font-size: 20px;
          color: var(--cream);
          letter-spacing: -0.3px;
        }

        .kl-logo-sub {
          font-size: 11px;
          color: var(--muted);
          font-weight: 400;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .kl-toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          padding: 10px 20px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 500;
          font-family: var(--font-ui);
          white-space: nowrap;
          animation: klToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
          border: 1px solid;
        }

        .kl-toast.success { background: var(--green-dim); color: var(--green); border-color: rgba(52,211,153,0.2); }
        .kl-toast.error   { background: var(--red-dim);   color: var(--red);   border-color: rgba(240,82,82,0.2); }

        @keyframes klToastIn {
          from { opacity:0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }

        .kl-auth-title {
          font-family: var(--font-display);
          font-size: 28px;
          color: var(--cream);
          text-align: center;
          margin-bottom: 6px;
        }

        .kl-auth-sub {
          font-size: 13px;
          color: var(--muted);
          text-align: center;
          margin-bottom: 28px;
        }

        .kl-form-grid { display: flex; flex-direction: column; gap: 16px; }
        .kl-field-group { display: flex; flex-direction: column; gap: 6px; }

        .kl-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          color: var(--muted2);
        }

        .kl-req { color: var(--gold); margin-left: 2px; }

        .kl-input, .kl-select {
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

        .kl-input::placeholder { color: var(--muted); }

        .kl-input:focus, .kl-select:focus {
          border-color: var(--gold-dim);
          box-shadow: 0 0 0 3px var(--gold-glow);
        }

        .kl-input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.4) sepia(1) saturate(2) hue-rotate(5deg);
          cursor: pointer;
        }

        .kl-select { cursor: pointer; }
        .kl-select option { background: #1c2030; color: var(--cream); }

        .kl-select-wrap { position: relative; }
        .kl-select-wrap::after {
          content: '▾';
          position: absolute;
          right: 14px; top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          pointer-events: none;
          font-size: 12px;
        }

        .kl-pass-wrap { position: relative; }
        .kl-pass-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: var(--muted); font-size: 16px; padding: 4px;
          transition: color 0.2s;
        }
        .kl-pass-toggle:hover { color: var(--cream); }

        .kl-date-row { display: flex; gap: 8px; }
        .kl-date-row .kl-input { flex: 1; }

        .kl-today-btn {
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
        }

        .kl-today-btn:hover { border-color: var(--gold-dim); background: var(--gold-glow); }

        .kl-btn-primary {
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

        .kl-btn-primary::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%);
          pointer-events: none;
        }

        .kl-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(232,168,51,0.35); }
        .kl-btn-primary:active:not(:disabled) { transform: translateY(0); }
        .kl-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .kl-pending-card {
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

        .kl-pending-card:hover {
          background: rgba(240,82,82,0.15);
          border-color: rgba(240,82,82,0.35);
          transform: translateY(-1px);
        }

        .kl-pending-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--red);
          opacity: 0.8;
          margin-bottom: 2px;
        }

        .kl-pending-count {
          font-family: var(--font-mono);
          font-size: 32px;
          font-weight: 600;
          color: var(--red);
          line-height: 1;
        }

        .kl-pending-arrow { color: var(--red); opacity: 0.6; font-size: 20px; }

        .kl-logout-btn {
          background: none;
          border: 1px solid var(--border2);
          border-radius: 8px;
          padding: 6px 12px;
          font-family: var(--font-ui);
          font-size: 12px;
          font-weight: 500;
          color: var(--muted2);
          cursor: pointer;
          transition: all 0.2s;
        }

        .kl-logout-btn:hover { border-color: var(--red); color: var(--red); }

        .kl-footer {
          margin-top: 20px;
          text-align: center;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.4px;
        }

        .kl-spinner-overlay {
          position: fixed; inset: 0;
          background: rgba(12,14,20,0.7);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 60;
          animation: klFadeIn 0.2s ease;
        }

        @keyframes klFadeIn { from { opacity:0; } to { opacity:1; } }

        .kl-spinner-box {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: 16px;
          padding: 28px 36px;
          display: flex; flex-direction: column; align-items: center; gap: 12px;
        }

        .kl-spinner {
          width: 32px; height: 32px;
          border: 3px solid var(--border2);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: klSpin 0.7s linear infinite;
        }

        @keyframes klSpin { to { transform: rotate(360deg); } }
        .kl-spinner-text { font-size: 13px; color: var(--muted2); font-weight: 500; }

        .kl-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(8,10,16,0.85);
          backdrop-filter: blur(8px);
          z-index: 50;
          display: flex; justify-content: center; align-items: flex-start;
          padding: 20px 16px;
          overflow-y: auto;
          animation: klFadeIn 0.25s ease;
        }

        .kl-modal {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          width: 100%; max-width: 480px;
          overflow: hidden;
          box-shadow: 0 40px 100px rgba(0,0,0,0.6);
          animation: klSlideUp 0.35s cubic-bezier(0.16,1,0.3,1) both;
          margin-top: 10px;
        }

        .kl-modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
        }

        .kl-modal-title { font-family: var(--font-display); font-size: 20px; color: var(--cream); }

        .kl-modal-close {
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 8px;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          color: var(--muted2);
          font-size: 14px;
          transition: all 0.2s;
          font-family: var(--font-ui);
        }

        .kl-modal-close:hover { color: var(--cream); border-color: var(--muted2); }

        .kl-modal-body { padding: 20px 24px 24px; }

        .kl-item {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 12px;
          transition: border-color 0.2s;
        }

        .kl-item:hover { border-color: var(--border2); }

        .kl-item-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px;
        }

        .kl-sno-badge {
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

        .kl-item-fields { display: flex; flex-direction: column; gap: 8px; }

        .kl-item-input, .kl-item-select {
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

        .kl-item-input:focus, .kl-item-select:focus { border-color: var(--gold-dim); }

        .kl-item-input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.4) sepia(1) saturate(2) hue-rotate(5deg);
          cursor: pointer;
        }

        .kl-item-select option { background: #13161f; }

        .kl-action-row { display: flex; gap: 8px; margin-top: 12px; }

        .kl-btn-action {
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

        .kl-btn-action.made {
          background: var(--green-dim);
          color: var(--green);
          border: 1px solid rgba(52,211,153,0.2);
        }

        .kl-btn-action.made:hover { background: rgba(52,211,153,0.18); box-shadow: 0 0 12px rgba(52,211,153,0.15); }

        .kl-btn-action.skip {
          background: rgba(90,98,120,0.15);
          color: var(--muted2);
          border: 1px solid var(--border2);
        }

        .kl-btn-action.skip:hover { background: rgba(90,98,120,0.25); color: var(--cream); }

        .kl-empty { text-align: center; padding: 40px 20px; color: var(--muted); font-size: 14px; }
        .kl-empty-icon { font-size: 40px; margin-bottom: 10px; opacity: 0.4; }
      `}</style>

      <div className="kl-page">

        {loading && (
          <div className="kl-spinner-overlay">
            <div className="kl-spinner-box">
              <div className="kl-spinner" />
              <span className="kl-spinner-text">Processing entry…</span>
            </div>
          </div>
        )}

        {message && (
          <div className={`kl-toast ${message.type}`}>
            {message.type === "success" ? "✓ " : "✕ "}
            {message.text}
          </div>
        )}

        <div className="kl-card">

          <div className="kl-card-header">
            <div className="kl-logo-area">
              <div className="kl-logo-icon">KL</div>
              <div>
                <div className="kl-logo-text">Kirti Library</div>
                <div className="kl-logo-sub">Fee Management</div>
              </div>
            </div>

            {authorized && (
              <button
                className="kl-logout-btn"
                onClick={() => { setAuthorized(false); localStorage.removeItem("klAuthorized"); }}
              >
                Sign out
              </button>
            )}
          </div>

          <div className="kl-card-body">

            {!authorized ? (

              <div>
                <div className="kl-auth-title">Welcome back</div>
                <div className="kl-auth-sub">Enter your access code to continue</div>

                <div className="kl-form-grid">
                  <div className="kl-field-group">
                    <label className="kl-label">Access Code</label>
                    <div className="kl-pass-wrap">
                      <input
                        type={showPass ? "text" : "password"}
                        placeholder="••••••••"
                        value={passwordInput}
                        onChange={e => setPasswordInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && checkPassword()}
                        className="kl-input"
                        style={{ paddingRight: "44px" }}
                      />
                      <button type="button" className="kl-pass-toggle" onClick={() => setShowPass(!showPass)}>
                        {showPass ? "🙈" : "👁"}
                      </button>
                    </div>
                  </div>

                  <button className="kl-btn-primary" onClick={checkPassword}>
                    Access Portal
                  </button>
                </div>
              </div>

            ) : (

              <form onSubmit={handleSubmit}>
                <div className="kl-form-grid">

                  <div className="kl-field-group">
                    <label className="kl-label">Date <span className="kl-req">*</span></label>
                    <div className="kl-date-row">
                      <input
                        type="date"
                        value={form.date}
                        onChange={e => setForm({ ...form, date: e.target.value })}
                        className="kl-input"
                      />
                      <button
                        type="button"
                        className="kl-today-btn"
                        onClick={() => setForm({ ...form, date: new Date().toISOString().split("T")[0] })}
                      >
                        Today
                      </button>
                    </div>
                  </div>

                  <div className="kl-field-group">
                    <label className="kl-label">Amount <span className="kl-req">*</span></label>
                    <input
                      type="number"
                      placeholder="₹ 0"
                      value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      className="kl-input"
                      style={{ fontFamily: "var(--font-mono)", fontSize: "16px" }}
                    />
                  </div>

                  <div className="kl-field-group">
                    <label className="kl-label">Payment Tag <span className="kl-req">*</span></label>
                    <div className="kl-select-wrap">
                      <select
                        value={form.paymentTag}
                        onChange={e => setForm({ ...form, paymentTag: e.target.value })}
                        className="kl-select"
                      >
                        <option value="">Select tag</option>
                        {tags.map((tag, i) => (
                          <option key={i} value={tag}>{tag}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="kl-field-group">
                    <label className="kl-label">Receipt Status</label>
                    <div className="kl-select-wrap">
                      <select
                        value={form.receipt}
                        onChange={e => setForm({ ...form, receipt: e.target.value })}
                        className="kl-select"
                      >
                        <option>Pending</option>
                        <option>Receipt Made</option>
                        <option>Not Required</option>
                      </select>
                    </div>
                  </div>

                  <div className="kl-field-group">
                    <label className="kl-label">Remark</label>
                    <input
                      type="text"
                      placeholder="Optional note…"
                      value={form.remark}
                      onChange={e => setForm({ ...form, remark: e.target.value })}
                      className="kl-input"
                    />
                  </div>

                  <button type="submit" className="kl-btn-primary" disabled={loading}>
                    {loading ? "Saving…" : "Submit Entry →"}
                  </button>

                </div>
              </form>

            )}

            {authorized && (
              <div
                className="kl-pending-card"
                onClick={() => { setPendingOpen(true); loadPending(); }}
              >
                <div>
                  <div className="kl-pending-label">Pending Receipts</div>
                  <div className="kl-pending-count">{pendingCount}</div>
                </div>
                <div className="kl-pending-arrow">→</div>
              </div>
            )}

            {authorized && (
              <div className="kl-footer">Kirti Library — Internal Panel</div>
            )}

          </div>
        </div>

        {pendingOpen && (
          <div
            className="kl-modal-overlay"
            onClick={e => { if (e.target === e.currentTarget) setPendingOpen(false); }}
          >
            <div className="kl-modal">

              <div className="kl-modal-header">
                <div className="kl-modal-title">Pending Receipts</div>
                <button className="kl-modal-close" onClick={() => setPendingOpen(false)}>✕</button>
              </div>

              <div className="kl-modal-body">

                {pendingList.length === 0 ? (
                  <div className="kl-empty">
                    <div className="kl-empty-icon">✓</div>
                    <div>All receipts cleared</div>
                  </div>
                ) : (
                  pendingList.map((item, i) => (
                    <div key={i} className="kl-item">

                      <div className="kl-item-header">
                        <span className="kl-sno-badge">SNO {item.sno}</span>
                      </div>

                      <div className="kl-item-fields">

                        <input
                          type="date"
                          value={item.dateRaw}
                          onChange={e => { item.dateRaw = e.target.value; setPendingList([...pendingList]); }}
                          className="kl-item-input"
                        />

                        <input
                          type="number"
                          value={item.amount}
                          onChange={e => { item.amount = e.target.value; setPendingList([...pendingList]); }}
                          className="kl-item-input"
                          placeholder="Amount"
                          style={{ fontFamily: "var(--font-mono)" }}
                        />

                        <div className="kl-select-wrap">
                          <select
                            value={item.paymentTag}
                            onChange={e => { item.paymentTag = e.target.value; setPendingList([...pendingList]); }}
                            className="kl-item-select"
                          >
                            {tags.map((t, i) => (
                              <option key={i} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>

                        <input
                          type="text"
                          value={item.remark}
                          onChange={e => { item.remark = e.target.value; setPendingList([...pendingList]); }}
                          className="kl-item-input"
                          placeholder="Remark"
                        />

                      </div>

                      <div className="kl-action-row">
                        <button
                          className="kl-btn-action made"
                          onClick={() => updateReceipt(item.row, "Receipt Made", item)}
                        >
                          ✓ Receipt Made
                        </button>
                        <button
                          className="kl-btn-action skip"
                          onClick={() => updateReceipt(item.row, "Not Required", item)}
                        >
                          ✕ Not Required
                        </button>
                      </div>

                    </div>
                  ))
                )}

              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
} 