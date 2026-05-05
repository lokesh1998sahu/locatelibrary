"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────
type StatusFilter = "" | "Pending" | "Receipt Made" | "Not Required";

// Format any date-like input (GMT string, ISO, D-M-YYYY) to "DD MMM YYYY"
function fmtDate(v: string): string {
  if (!v) return "—";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  // Already "d MMMM yyyy" from Apps Script (e.g. "5 May 2026")
  const longMatch = v.match(/^(\d{1,2}) (\w+) (\d{4})/);
  if (longMatch) return `${longMatch[1].padStart(2,"0")} ${longMatch[2].slice(0,3)} ${longMatch[3]}`;
  // GMT or JS Date string
  if (v.includes("GMT") || /^\w{3} \w{3}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return `${String(d.getDate()).padStart(2,"0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const p = v.split("T")[0].split("-");
    return `${p[2].padStart(2,"0")} ${months[parseInt(p[1])-1]||""} ${p[0]}`;
  }
  return v;
}

interface Entry {
  row: number; sno: number; timestamp: string; date: string; dateRaw: string;
  month: string; library: string; amount: number; paymentTag: string;
  feesMode: string; remark: string; status: string;
  receipt_no: string; source_key: string;
}

interface StatusCounts { Pending: number; "Receipt Made": number; "Not Required": number; Deleted: number; }

export default function LibrariesPage() {
  const PASSWORD = process.env.NEXT_PUBLIC_LIBRARIES_PASSWORD;
  const SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbyWzuVGTo52BEOMpxefp5fBAxBAukESmqtK0JxhlHMFTZV9guTJ-rh19grWw8THDut64g/exec";

  const [tags, setTags]                       = useState<string[]>([]);
  const [codes, setCodes]                     = useState<{ code: string; name: string }[]>([]);
  const [pendingCount, setPendingCount]       = useState(0);
  const [authorized, setAuthorized]           = useState(false);
  const [passwordInput, setPasswordInput]     = useState("");
  const [loading, setLoading]                 = useState(false);
  const [message, setMessage]                 = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showPass, setShowPass]               = useState(false);

  // ── Entries modal state ──
  const [entriesOpen, setEntriesOpen]         = useState(false);
  const [entries, setEntries]                 = useState<Entry[]>([]);
  const [statusCounts, setStatusCounts]       = useState<StatusCounts>({ Pending:0, "Receipt Made":0, "Not Required":0, Deleted:0 });
  const [page, setPage]                       = useState(1);
  const [totalPages, setTotalPages]           = useState(0);
  const [total, setTotal]                     = useState(0);
  const [loadingEntries, setLoadingEntries]   = useState(false);

  // ── Filters ──
  const [fStatus, setFStatus]                 = useState<StatusFilter>("Pending");
  const [fLibrary, setFLibrary]               = useState("");
  const [fPaymentTag, setFPaymentTag]         = useState("");
  const [fDateFrom, setFDateFrom]             = useState("");
  const [fDateTo, setFDateTo]                 = useState("");
  const [fAmountMin, setFAmountMin]           = useState("");
  const [fAmountMax, setFAmountMax]           = useState("");
  const [fQ, setFQ]                           = useState("");
  const [showFilters, setShowFilters]         = useState(false);

  // ── Edit state ──
  const [editing, setEditing]                 = useState<Entry | null>(null);

  const isSubmitting = useRef(false);
  const [form, setForm] = useState({
    date: "", amount: "", paymentTag: "", libraryCode: "", remark: "", receipt: "Pending",
  });

  // ─── Initial Load ──────────────────────────────────────────────────────
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

  // ─── Entries fetcher (filterable, paginated) ──────────────────────────
  const loadEntries = async (pg = 1) => {
    setLoadingEntries(true);
    try {
      const params = new URLSearchParams({
        action: "getEntries",
        status: fStatus,
        library: fLibrary,
        paymentTag: fPaymentTag,
        dateFrom: fDateFrom,
        dateTo: fDateTo,
        amountMin: fAmountMin,
        amountMax: fAmountMax,
        q: fQ,
        page: String(pg),
        limit: "20",
      });
      const res = await fetch(`${SCRIPT_URL}?${params}`);
      const d = await res.json();
      setEntries(d.entries || []);
      setStatusCounts(d.statusCounts || { Pending:0, "Receipt Made":0, "Not Required":0, Deleted:0 });
      setTotal(d.total || 0);
      setTotalPages(d.totalPages || 0);
      setPage(d.page || 1);
    } catch {
      showMsg("Failed to load entries", "error");
    }
    setLoadingEntries(false);
  };

  // Reload when filters change OR modal opens
  useEffect(() => {
    if (entriesOpen) loadEntries(1);
  }, [entriesOpen, fStatus, fLibrary, fPaymentTag, fDateFrom, fDateTo, fAmountMin, fAmountMax, fQ]);

  const clearFilters = () => {
    setFLibrary(""); setFPaymentTag(""); setFDateFrom(""); setFDateTo("");
    setFAmountMin(""); setFAmountMax(""); setFQ("");
  };

  // ─── New Entry submit ─────────────────────────────────────────────────
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (isSubmitting.current) return;
    if (!form.date || !form.amount || !form.paymentTag || !form.libraryCode) {
      showMsg("Fill all required fields", "error");
      return;
    }
    isSubmitting.current = true;
    setLoading(true);
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "newEntry", ...form }),
      });
      setForm({ date: "", amount: "", paymentTag: "", libraryCode: "", remark: "", receipt: "Pending" });
      showMsg("Entry saved successfully");
      loadData();
    } catch {
      showMsg("Something went wrong, please retry", "error");
    } finally {
      isSubmitting.current = false;
      setLoading(false);
    }
  };

  // ─── Status update (Receipt Made / Not Required) ──────────────────────
  const updateReceiptStatus = async (entry: Entry, newStatus: string) => {
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updateReceipt",
          row: entry.row, status: newStatus,
          date: entry.dateRaw, library: entry.library,
          amount: entry.amount, paymentTag: entry.paymentTag, remark: entry.remark,
          receipt_no: newStatus === "Not Required" ? "N/A" : entry.receipt_no || "",
        }),
      });
      loadEntries(page); loadData();
      showMsg(newStatus === "Receipt Made" ? "Marked Receipt Made" : "Marked Not Required");
    } catch { showMsg("Failed to update", "error"); }
  };

  // ─── Delete entry ─────────────────────────────────────────────────────
  const deleteEntry = async (entry: Entry) => {
    if (!confirm(`Delete entry #${entry.sno} (${entry.library} ₹${entry.amount})? Cannot be undone.`)) return;
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "deleteEntry", row: entry.row, remark: entry.remark || "" }),
      });
      loadEntries(page); loadData();
      showMsg("Entry deleted");
    } catch { showMsg("Failed to delete", "error"); }
  };

  // ─── Save edited entry ────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editing) return;
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updateReceipt",
          row: editing.row, status: editing.status,
          date: editing.dateRaw, library: editing.library,
          amount: editing.amount, paymentTag: editing.paymentTag, remark: editing.remark,
          receipt_no: editing.receipt_no || "",
        }),
      });
      setEditing(null);
      loadEntries(page); loadData();
      showMsg("Entry updated");
    } catch { showMsg("Failed to update", "error"); }
  };

  // ─── Library colors ───────────────────────────────────────────────────
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

  const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    "Pending":      { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24", border: "rgba(251,191,36,0.3)" },
    "Receipt Made": { bg: "rgba(52,211,153,0.15)",  color: "#34d399", border: "rgba(52,211,153,0.3)" },
    "Not Required": { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", border: "rgba(148,163,184,0.3)" },
    "Deleted":      { bg: "rgba(240,82,82,0.15)",   color: "#f05252", border: "rgba(240,82,82,0.3)"  },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:#0c0e14;--surface:#13161f;--surface2:#1c2030;--border:#252a38;--border2:#2e3448;
          --gold:#e8a833;--gold-dim:#c48c20;--gold-glow:rgba(232,168,51,0.12);
          --cream:#ede8df;--muted:#5a6278;--muted2:#8892aa;
          --red:#f05252;--red-dim:rgba(240,82,82,0.12);
          --green:#34d399;--green-dim:rgba(52,211,153,0.1);
          --blue:#60a5fa;--blue-dim:rgba(96,165,250,0.12);
          --font-display:'DM Serif Display',serif;--font-ui:'Outfit',sans-serif;--font-mono:'JetBrains Mono',monospace;
        }
        body { background: var(--bg); font-family: var(--font-ui); color: var(--cream); min-height: 100vh; }
        .page {
          min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;
          background:radial-gradient(ellipse 60% 50% at 50% -10%,rgba(232,168,51,0.07) 0%,transparent 70%),radial-gradient(ellipse 40% 40% at 80% 110%,rgba(232,168,51,0.04) 0%,transparent 60%),var(--bg);
          position:relative;
        }
        .page::before {
          content:'';position:fixed;inset:0;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity:0.025;pointer-events:none;z-index:0;
        }
        .card {
          background:var(--surface);border:1px solid var(--border);border-radius:20px;
          width:100%;max-width:440px;position:relative;z-index:1;overflow:hidden;
          box-shadow:0 0 0 1px rgba(255,255,255,0.03),0 24px 80px rgba(0,0,0,0.5);
          animation:slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .card-header {
          padding:28px 28px 0;border-bottom:1px solid var(--border);padding-bottom:20px;
          display:flex;align-items:center;justify-content:space-between;
        }
        .card-body { padding:24px 28px 28px; }
        .logo-area { display:flex;align-items:center;gap:10px; }
        .logo-icon { width:36px;height:36px;background:var(--gold);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 20px rgba(232,168,51,0.3); }
        .logo-text { font-family:var(--font-display);font-size:20px;color:var(--cream);letter-spacing:-0.3px; }
        .logo-sub { font-size:11px;color:var(--muted);font-weight:400;letter-spacing:0.5px;text-transform:uppercase; }
        .toast {
          position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:100;
          padding:10px 20px;border-radius:100px;font-size:13px;font-weight:500;white-space:nowrap;
          animation:toastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;border:1px solid;
        }
        .toast.success { background:var(--green-dim);color:var(--green);border-color:rgba(52,211,153,0.2); }
        .toast.error   { background:var(--red-dim);color:var(--red);border-color:rgba(240,82,82,0.2); }
        @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .auth-title { font-family:var(--font-display);font-size:28px;color:var(--cream);text-align:center;margin-bottom:6px; }
        .auth-sub   { font-size:13px;color:var(--muted);text-align:center;margin-bottom:28px; }
        .field-group { display:flex;flex-direction:column;gap:6px; }
        .field-label { font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--muted2); }
        .field-label .req { color:var(--gold);margin-left:2px; }
        .input,.select {
          width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;
          padding:12px 14px;font-family:var(--font-ui);font-size:14px;color:var(--cream);outline:none;
          transition:border-color 0.2s,box-shadow 0.2s;appearance:none;-webkit-appearance:none;
        }
        .input::placeholder { color:var(--muted); }
        .input:focus,.select:focus { border-color:var(--gold-dim);box-shadow:0 0 0 3px var(--gold-glow); }
        .input[type="date"] { cursor:pointer; }
        .input[type="date"]::-webkit-calendar-picker-indicator { filter:invert(0.4) sepia(1) saturate(2) hue-rotate(5deg);cursor:pointer; }
        .select { cursor:pointer; }
        .select option { background:#1c2030;color:var(--cream); }
        .select-wrapper { position:relative; }
        .select-wrapper::after { content:'▾';position:absolute;right:14px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;font-size:12px; }
        .pass-wrapper { position:relative; }
        .pass-toggle { position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:4px;transition:color 0.2s; }
        .pass-toggle:hover { color:var(--cream); }
        .date-row { display:flex;gap:8px; }
        .date-row .input { flex:1; }
        .today-btn { background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:12px 14px;font-family:var(--font-ui);font-size:12px;font-weight:600;color:var(--gold);cursor:pointer;white-space:nowrap;transition:all 0.2s;letter-spacing:0.3px; }
        .today-btn:hover { border-color:var(--gold-dim);background:var(--gold-glow); }
        .btn-primary {
          width:100%;background:var(--gold);border:none;border-radius:12px;padding:14px;
          font-family:var(--font-ui);font-size:15px;font-weight:700;color:#0c0e14;cursor:pointer;
          letter-spacing:0.2px;transition:all 0.2s;box-shadow:0 4px 20px rgba(232,168,51,0.25);
          position:relative;overflow:hidden;
        }
        .btn-primary::before { content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.15) 0%,transparent 60%);pointer-events:none; }
        .btn-primary:hover:not(:disabled) { transform:translateY(-1px);box-shadow:0 8px 30px rgba(232,168,51,0.35); }
        .btn-primary:active:not(:disabled) { transform:translateY(0); }
        .btn-primary:disabled { opacity:0.6;cursor:not-allowed; }
        .entries-banner {
          margin-top:20px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);
          border-radius:14px;padding:16px 20px;cursor:pointer;display:flex;align-items:center;
          justify-content:space-between;transition:all 0.2s;
        }
        .entries-banner:hover { background:rgba(96,165,250,0.12);border-color:rgba(96,165,250,0.35);transform:translateY(-1px); }
        .entries-label { font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:var(--blue);opacity:0.85;margin-bottom:2px; }
        .entries-count-row { display:flex;gap:14px;align-items:baseline; }
        .stat-num { font-family:var(--font-mono);font-size:22px;font-weight:600;line-height:1; }
        .stat-num.pending { color:var(--gold); }
        .stat-num.made    { color:var(--green); }
        .stat-num.notreq  { color:var(--muted2); }
        .stat-label { font-size:9px;color:var(--muted);text-transform:uppercase;margin-top:3px;letter-spacing:0.6px; }
        .entries-arrow { color:var(--blue);opacity:0.7;font-size:20px; }
        .logout-btn { background:none;border:1px solid var(--border2);border-radius:8px;padding:6px 12px;font-family:var(--font-ui);font-size:12px;font-weight:500;color:var(--muted2);cursor:pointer;letter-spacing:0.3px;transition:all 0.2s; }
        .logout-btn:hover { border-color:var(--red);color:var(--red); }
        .header-link {
          background:rgba(232,168,51,0.1);border:1px solid rgba(232,168,51,0.25);border-radius:8px;
          padding:6px 12px;font-family:var(--font-ui);font-size:12px;font-weight:600;color:var(--gold);
          cursor:pointer;letter-spacing:0.3px;transition:all 0.2s;text-decoration:none;display:inline-block;
        }
        .header-link:hover { background:rgba(232,168,51,0.2);border-color:var(--gold); }
        .header-actions { display:flex;gap:8px;align-items:center; }
        .form-grid { display:flex;flex-direction:column;gap:16px; }
        .spinner-overlay { position:fixed;inset:0;background:rgba(12,14,20,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:60;animation:fadeIn 0.2s ease; }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .spinner-box { background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:28px 36px;display:flex;flex-direction:column;align-items:center;gap:12px; }
        .spinner { width:32px;height:32px;border:3px solid var(--border2);border-top-color:var(--gold);border-radius:50%;animation:spin 0.7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .spinner-text { font-size:13px;color:var(--muted2);font-weight:500; }
        .modal-overlay { position:fixed;inset:0;background:rgba(8,10,16,0.85);backdrop-filter:blur(8px);z-index:50;display:flex;justify-content:center;align-items:flex-start;padding:20px 16px;overflow-y:auto;animation:fadeIn 0.25s ease; }
        .modal { background:var(--surface);border:1px solid var(--border);border-radius:20px;width:100%;max-width:560px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,0.6);animation:slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both;margin-top:10px;display:flex;flex-direction:column;max-height:calc(100vh - 40px); }
        .modal-header { padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0; }
        .modal-title { font-family:var(--font-display);font-size:20px;color:var(--cream); }
        .modal-close { background:var(--surface2);border:1px solid var(--border2);border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted2);font-size:16px;transition:all 0.2s;line-height:1; }
        .modal-close:hover { color:var(--cream);border-color:var(--muted2); }
        .modal-body { padding:16px 20px 24px;overflow-y:auto;flex:1; }
        .filter-tabs { display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px; }
        .filter-tab {
          display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:100px;
          font-size:12px;font-weight:600;font-family:var(--font-mono);cursor:pointer;
          border:1px solid var(--border2);background:transparent;color:var(--muted2);
          transition:all 0.15s;letter-spacing:0.3px;min-height:32px;
        }
        .filter-tab:hover { border-color:var(--muted2);color:var(--cream); }
        .filter-tab.active { background:var(--gold);border-color:var(--gold);color:#0c0e14; }
        .tab-count { font-family:var(--font-mono);font-size:10px;font-weight:600;padding:2px 6px;border-radius:20px;background:rgba(46,52,72,0.8);color:var(--muted);border:1px solid var(--border2);line-height:1.4;letter-spacing:0; }
        .filter-tab.active .tab-count { background:rgba(12,14,20,0.25);color:rgba(12,14,20,0.7);border-color:rgba(0,0,0,0.12); }
        .filter-toggle { display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;cursor:pointer;font-size:12px;color:var(--muted2);font-weight:600;margin-bottom:10px; }
        .filter-toggle:hover { color:var(--cream); }
        .filter-grid { display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;margin-bottom:12px; }
        .filter-grid .full { grid-column:1/-1; }
        .filter-input,.filter-select {
          width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;
          padding:8px 10px;font-family:var(--font-ui);font-size:12px;color:var(--cream);outline:none;
          appearance:none;-webkit-appearance:none;
        }
        .filter-input::placeholder { color:var(--muted); }
        .filter-input:focus,.filter-select:focus { border-color:var(--gold-dim); }
        .filter-input[type="date"] { cursor:pointer; }
        .filter-input[type="date"]::-webkit-calendar-picker-indicator { filter:invert(0.4) sepia(1) saturate(2) hue-rotate(5deg);cursor:pointer; }
        .filter-row-label { font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;font-weight:600; }
        .clear-filters { background:none;border:none;color:var(--gold);cursor:pointer;font-size:11px;font-weight:600;text-decoration:underline;padding:2px 4px;font-family:var(--font-ui); }
        .entry-card { background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:10px;transition:border-color 0.2s; }
        .entry-card:hover { border-color:var(--border2); }
        .entry-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px;flex-wrap:wrap; }
        .entry-badges { display:flex;gap:6px;flex-wrap:wrap;align-items:center; }
        .sno-badge { font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--gold);background:var(--gold-glow);border:1px solid rgba(232,168,51,0.2);border-radius:6px;padding:3px 8px;letter-spacing:0.5px; }
        .lib-badge { font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:3px 8px;border-radius:6px;border:1px solid; }
        .status-badge { font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid;letter-spacing:0.4px; }
        .receipt-badge { font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--blue);background:var(--blue-dim);border:1px solid rgba(96,165,250,0.25);border-radius:6px;padding:3px 8px;letter-spacing:0.5px; }
        .entry-info { display:flex;flex-direction:column;gap:4px;margin-bottom:10px; }
        .entry-meta { font-size:12px;color:var(--muted2); }
        .entry-amount { font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--cream); }
        .entry-remark { font-size:12px;color:var(--muted2);font-style:italic;line-height:1.4;padding-top:4px;border-top:1px dashed var(--border); }
        .entry-actions { display:flex;flex-wrap:wrap;gap:6px;margin-top:10px; }
        .btn-action {
          flex:1;min-width:fit-content;border:none;border-radius:8px;padding:9px 12px;
          font-family:var(--font-ui);font-size:11px;font-weight:700;cursor:pointer;
          transition:all 0.2s;letter-spacing:0.3px;min-height:34px;
        }
        .btn-action.made { background:var(--green-dim);color:var(--green);border:1px solid rgba(52,211,153,0.2); }
        .btn-action.made:hover { background:rgba(52,211,153,0.18); }
        .btn-action.skip { background:rgba(90,98,120,0.15);color:var(--muted2);border:1px solid var(--border2); }
        .btn-action.skip:hover { background:rgba(90,98,120,0.25);color:var(--cream); }
        .btn-action.edit { background:var(--gold-glow);color:var(--gold);border:1px solid rgba(232,168,51,0.25); }
        .btn-action.edit:hover { background:rgba(232,168,51,0.2); }
        .btn-action.delete { background:var(--red-dim);color:var(--red);border:1px solid rgba(240,82,82,0.2);flex:0 0 auto;padding:9px 12px; }
        .btn-action.delete:hover { background:rgba(240,82,82,0.2); }
        .btn-action.unmark { background:rgba(232,168,51,0.1);color:var(--gold);border:1px solid rgba(232,168,51,0.2); }
        .pagination { display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 0; }
        .pagination button { padding:6px 12px;border-radius:8px;border:1px solid var(--border2);background:var(--surface2);color:var(--muted2);cursor:pointer;font-size:12px;font-weight:600;font-family:var(--font-ui); }
        .pagination button:disabled { opacity:0.4;cursor:not-allowed; }
        .pagination .page-info { font-size:12px;color:var(--muted2);font-weight:600; }
        .empty-state { text-align:center;padding:40px 20px;color:var(--muted);font-size:14px; }
        .empty-icon { font-size:40px;margin-bottom:10px;opacity:0.4; }
      `}</style>

      <div className="page">
        {loading && (
          <div className="spinner-overlay">
            <div className="spinner-box">
              <div className="spinner" />
              <span className="spinner-text">Processing entry…</span>
            </div>
          </div>
        )}

        {message && (
          <div className={`toast ${message.type}`}>
            {message.type === "success" ? "✓ " : "✕ "}
            {message.text}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <div className="logo-area">
              <div className="logo-icon">📚</div>
              <div>
                <div className="logo-text">LibraryLedger</div>
                <div className="logo-sub">Fee Management</div>
              </div>
            </div>
            {authorized && (
              <div className="header-actions">
                <a href="/admissions" target="_blank" rel="noopener noreferrer" className="header-link">🎓 Admissions ↗</a>
                <button className="logout-btn" onClick={() => { setAuthorized(false); localStorage.removeItem("librariesAuthorized"); }}>Sign out</button>
              </div>
            )}
          </div>

          <div className="card-body">
            {!authorized ? (
              <div style={{ animation: "slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both" }}>
                <div className="auth-title">Welcome back</div>
                <div className="auth-sub">Enter your access code to continue</div>
                <div className="form-grid">
                  <div className="field-group">
                    <label className="field-label">Access Code</label>
                    <div className="pass-wrapper">
                      <input type={showPass ? "text" : "password"} placeholder="••••••••" value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && checkPassword()}
                        className="input" style={{ paddingRight: "44px" }} />
                      <button className="pass-toggle" type="button" onClick={() => setShowPass(!showPass)}>{showPass ? "🙈" : "👁"}</button>
                    </div>
                  </div>
                  <button className="btn-primary" onClick={checkPassword}>Access Portal</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="field-group">
                    <label className="field-label">Date <span className="req">*</span></label>
                    <div className="date-row">
                      <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} className="input" />
                      <button type="button" className="today-btn" onClick={() => setForm({ ...form, date: new Date().toISOString().split("T")[0] })}>Today</button>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Amount <span className="req">*</span></label>
                    <input type="number" placeholder="₹ 0.00" value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="input" style={{ fontFamily: "var(--font-mono)", fontSize: "16px" }} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Library <span className="req">*</span></label>
                    <div className="select-wrapper">
                      <select value={form.libraryCode} onChange={(e) => setForm({ ...form, libraryCode: e.target.value })} className="select">
                        <option value="">Select library</option>
                        {codes.map((c, i) => (<option key={i} value={c.code}>{c.code} — {c.name}</option>))}
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Payment Tag <span className="req">*</span></label>
                    <div className="select-wrapper">
                      <select value={form.paymentTag} onChange={(e) => setForm({ ...form, paymentTag: e.target.value })} className="select">
                        <option value="">Select tag</option>
                        {tags.map((t, i) => (<option key={i} value={t}>{t}</option>))}
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Receipt Status</label>
                    <div className="select-wrapper">
                      <select value={form.receipt} onChange={(e) => setForm({ ...form, receipt: e.target.value })} className="select">
                        <option>Pending</option><option>Receipt Made</option><option>Not Required</option>
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Remark</label>
                    <input type="text" placeholder="Optional note…" value={form.remark}
                      onChange={(e) => setForm({ ...form, remark: e.target.value })} className="input" />
                  </div>
                  <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Saving…" : "Submit Entry →"}</button>
                </div>
              </form>
            )}

            {/* Entries Banner — replaces old Pending banner */}
            {authorized && (
              <div className="entries-banner" onClick={() => { setEntriesOpen(true); }}>
                <div>
                  <div className="entries-label">View All Entries</div>
                  <div className="entries-count-row">
                    <div>
                      <div className="stat-num pending">{pendingCount}</div>
                      <div className="stat-label">Pending</div>
                    </div>
                  </div>
                </div>
                <div className="entries-arrow">→</div>
              </div>
            )}
          </div>
        </div>

        {/* All Entries Modal */}
        {entriesOpen && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEntriesOpen(false); }}>
            <div className="modal">
              <div className="modal-header">
                <div className="modal-title">📋 All Entries</div>
                <button className="modal-close" onClick={() => setEntriesOpen(false)}>✕</button>
              </div>
              <div className="modal-body">
                {/* Status pills */}
                <div className="filter-tabs">
                  {(["", "Pending", "Receipt Made", "Not Required"] as StatusFilter[]).map((s) => {
                    const isActive = fStatus === s;
                    const count = s === "" ? (statusCounts.Pending + statusCounts["Receipt Made"] + statusCounts["Not Required"]) : (statusCounts[s as keyof StatusCounts] || 0);
                    return (
                      <button key={s} className={`filter-tab ${isActive ? "active" : ""}`} onClick={() => setFStatus(s)}>
                        {s || "All"}
                        <span className="tab-count">{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Filter — Library pills */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6 }}>Library</div>
                  <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4 }}>
                    <button className={`filter-tab ${fLibrary===""?"active":""}`} onClick={() => setFLibrary("")}>All</button>
                    {codes.map((c, i) => (
                      <button key={i} className={`filter-tab ${fLibrary===c.code?"active":""}`} onClick={() => setFLibrary(c.code)}>{c.code}</button>
                    ))}
                  </div>
                </div>

                {/* Filter — Payment Tag pills */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6 }}>Payment Tag</div>
                  <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4 }}>
                    <button className={`filter-tab ${fPaymentTag===""?"active":""}`} onClick={() => setFPaymentTag("")}>All</button>
                    {tags.map((t, i) => (
                      <button key={i} className={`filter-tab ${fPaymentTag===t?"active":""}`} onClick={() => setFPaymentTag(t)}>{t}</button>
                    ))}
                  </div>
                </div>

                {/* Search bar — always visible (most-used filter) */}
                <div style={{ position:"relative",marginBottom:10 }}>
                  <input
                    className="filter-input"
                    placeholder="🔍 Search remarks…"
                    value={fQ}
                    onChange={(e) => setFQ(e.target.value)}
                    style={{ padding:"10px 32px 10px 12px",fontSize:13 }}
                  />
                  {fQ && (
                    <button onClick={()=>setFQ("")} style={{ position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"var(--border2)",border:"none",borderRadius:"50%",width:22,height:22,cursor:"pointer",fontSize:13,fontWeight:700,color:"var(--muted2)",display:"flex",alignItems:"center",justifyContent:"center" }}>×</button>
                  )}
                </div>

                {/* Advanced filters toggle (date range + amount range) */}
                <div className="filter-toggle" onClick={() => setShowFilters(!showFilters)}>
                  <span>🎛 Advanced Filters {(fDateFrom||fDateTo||fAmountMin||fAmountMax) ? "· active" : ""}</span>
                  <span>{showFilters ? "▲" : "▼"}</span>
                </div>

                {showFilters && (
                  <div style={{ display:"flex",flexDirection:"column",gap:10,padding:12,background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:10,marginBottom:12 }}>
                    <div>
                      <div className="filter-row-label">Date Range</div>
                      <div style={{ display:"flex",gap:8 }}>
                        <input
                          type="date"
                          className="filter-input"
                          value={fDateFrom}
                          onChange={(e) => setFDateFrom(e.target.value)}
                          onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          style={{ flex:1 }}
                        />
                        <span style={{ alignSelf:"center",color:"var(--muted)",fontSize:12 }}>→</span>
                        <input
                          type="date"
                          className="filter-input"
                          value={fDateTo}
                          onChange={(e) => setFDateTo(e.target.value)}
                          onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                          style={{ flex:1 }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="filter-row-label">Amount Range (₹)</div>
                      <div style={{ display:"flex",gap:8 }}>
                        <input type="number" className="filter-input" placeholder="Min" value={fAmountMin} onChange={(e) => setFAmountMin(e.target.value)} style={{ flex:1 }} />
                        <span style={{ alignSelf:"center",color:"var(--muted)",fontSize:12 }}>→</span>
                        <input type="number" className="filter-input" placeholder="Max" value={fAmountMax} onChange={(e) => setFAmountMax(e.target.value)} style={{ flex:1 }} />
                      </div>
                    </div>
                  </div>
                )}

                {(fLibrary||fPaymentTag||fDateFrom||fDateTo||fAmountMin||fAmountMax||fQ) && (
                  <div style={{ textAlign:"right",marginBottom:8 }}>
                    <button className="clear-filters" onClick={clearFilters}>× Clear all filters</button>
                  </div>
                )}

                {/* Result count */}
                <div style={{ fontSize:11,color:"var(--muted)",marginBottom:10,letterSpacing:0.4 }}>
                  {loadingEntries ? "Loading…" : `${total} ${total===1?"entry":"entries"}`}
                </div>

                {/* Entries list */}
                {!loadingEntries && entries.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <div>No entries match your filters</div>
                  </div>
                ) : (
                  entries.map((entry) => {
                    const col = getLibraryColor(entry.library);
                    const sCol = STATUS_COLORS[entry.status] || STATUS_COLORS["Pending"];
                    const isSyncedFromAdmissions = !!entry.source_key;
                    return (
                      <div key={entry.row} className="entry-card" style={{ borderLeftWidth:"3px",borderLeftColor:col.border,background:col.bg }}>
                        <div className="entry-header">
                          <div className="entry-badges">
                            <span className="sno-badge">SNO {entry.sno}</span>
                            <span className="lib-badge" style={{ color:col.text,background:col.badge,borderColor:`${col.border}44` }}>{entry.library}</span>
                            <span className="status-badge" style={{ background:sCol.bg,color:sCol.color,borderColor:sCol.border }}>{entry.status}</span>
                            {entry.receipt_no && entry.receipt_no !== "N/A" && (
                              <span className="receipt-badge">🔗 {entry.receipt_no}</span>
                            )}
                            {isSyncedFromAdmissions && (
                              <span style={{ fontSize:9,color:"var(--blue)",fontWeight:600,letterSpacing:0.4 }}>SYNCED FROM ADMISSIONS</span>
                            )}
                          </div>
                        </div>
                        <div className="entry-info">
                          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:10 }}>
                            <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                              <span style={{ fontSize:12,fontWeight:600,color:"var(--cream)",fontFamily:"var(--font-mono)",letterSpacing:0.3 }}>{fmtDate(entry.date)}</span>
                              <span style={{ fontSize:10,fontWeight:700,color:"var(--gold)",background:"var(--gold-glow)",border:"1px solid rgba(232,168,51,0.25)",borderRadius:6,padding:"3px 8px",letterSpacing:0.5,textTransform:"uppercase" }}>{entry.paymentTag}</span>
                            </div>
                            <div className="entry-amount" style={{ color: entry.amount<0?"var(--red)":"var(--cream)" }}>
                              {entry.amount<0?"−":""}₹{Math.abs(entry.amount)}
                            </div>
                          </div>
                          {entry.remark && <div className="entry-remark">"{entry.remark}"</div>}
                        </div>
                        <div className="entry-actions">
                          <button className="btn-action edit" onClick={() => setEditing(entry)}>✏️ Edit</button>
                          {entry.status === "Pending" && (
                            <>
                              <button className="btn-action made" onClick={() => updateReceiptStatus(entry, "Receipt Made")}>✓ Receipt Made</button>
                              <button className="btn-action skip" onClick={() => updateReceiptStatus(entry, "Not Required")}>Not Required</button>
                            </>
                          )}
                          {entry.status === "Receipt Made" && (
                            <button className="btn-action unmark" onClick={() => updateReceiptStatus(entry, "Pending")}>↶ Move to Pending</button>
                          )}
                          {entry.status === "Not Required" && (
                            <button className="btn-action unmark" onClick={() => updateReceiptStatus(entry, "Pending")}>↶ Move to Pending</button>
                          )}
                          <button className="btn-action delete" onClick={() => deleteEntry(entry)}>🗑</button>
                        </div>
                      </div>
                    );
                  })
                )}

                {totalPages > 1 && (
                  <div className="pagination">
                    <button onClick={() => loadEntries(page - 1)} disabled={page <= 1}>← Prev</button>
                    <span className="page-info">{page} / {totalPages}</span>
                    <button onClick={() => loadEntries(page + 1)} disabled={page >= totalPages}>Next →</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit Entry Modal */}
        {editing && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
            <div className="modal" style={{ maxWidth:440 }}>
              <div className="modal-header">
                <div className="modal-title">✏️ Edit Entry #{editing.sno}</div>
                <button className="modal-close" onClick={() => setEditing(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field-group">
                    <label className="field-label">Date</label>
                    <input type="date" className="input" value={editing.dateRaw} onChange={(e) => setEditing({ ...editing, dateRaw: e.target.value })} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Library</label>
                    <div className="select-wrapper">
                      <select className="select" value={editing.library} onChange={(e) => setEditing({ ...editing, library: e.target.value })}>
                        {codes.map((c, i) => <option key={i} value={c.code}>{c.code} — {c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Amount</label>
                    <input type="number" className="input" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} style={{ fontFamily:"var(--font-mono)" }} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Payment Tag</label>
                    <div className="select-wrapper">
                      <select className="select" value={editing.paymentTag} onChange={(e) => setEditing({ ...editing, paymentTag: e.target.value })}>
                        {tags.map((t, i) => <option key={i} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Status</label>
                    <div className="select-wrapper">
                      <select className="select" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                        <option>Pending</option><option>Receipt Made</option><option>Not Required</option>
                      </select>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Receipt No.</label>
                    <input type="text" className="input" value={editing.receipt_no || ""} onChange={(e) => setEditing({ ...editing, receipt_no: e.target.value })} placeholder="e.g. R500 (optional)" />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Remark</label>
                    <input type="text" className="input" value={editing.remark || ""} onChange={(e) => setEditing({ ...editing, remark: e.target.value })} />
                  </div>
                  {editing.source_key && (
                    <div style={{ background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)",borderRadius:10,padding:"10px 12px",fontSize:11,color:"var(--blue)",lineHeight:1.5 }}>
                      🔗 This entry was synced from Admissions (source: {editing.source_key}). Editing here will not update the linked receipt in Admissions.
                    </div>
                  )}
                  <div style={{ display:"flex",gap:8 }}>
                    <button className="btn-action skip" style={{ flex:1 }} onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn-primary" style={{ flex:2 }} onClick={saveEdit}>Save Changes</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}