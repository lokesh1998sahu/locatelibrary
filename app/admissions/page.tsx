"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── API ───────────────────────────────────────────────────────────────────────
const API = "/api/admissions";
const PASSWORD = process.env.NEXT_PUBLIC_ADMISSIONS_PASSWORD!;

// ── LIBRARY MASTER DATA ───────────────────────────────────────────────────────
const LIBRARIES = [
  { code: "KAL", name: "KIRAN AC LIBRARY",   display: "Kiran AC Library" },
  { code: "YAL", name: "YUVIKA AC LIBRARY",  display: "Yuvika AC Library" },
  { code: "SL",  name: "SURAJ LIBRARY",      display: "Suraj Library" },
  { code: "KL",  name: "KIRTI LIBRARY",      display: "Kirti Library" },
];

const YAL_BRANCHES = ["YAL-1", "YAL-2"];

const SHIFTS = [
  { key: "MORNING",  label: "Morning",  time: "7AM TO 2PM" },
  { key: "EVENING",  label: "Evening",  time: "2PM TO 9PM" },
  { key: "FULL DAY", label: "Full Day", time: "7AM TO 9PM" },
];

const FEES: Record<string, Record<string, number>> = {
  KAL:  { MORNING: 600,  EVENING: 600,  "FULL DAY": 1000 },
  YAL1: { MORNING: 700,  EVENING: 700,  "FULL DAY": 1100 },
  YAL2: { MORNING: 600,  EVENING: 600,  "FULL DAY": 1000 },
  SL:   { MORNING: 600,  EVENING: 600,  "FULL DAY": 1000 },
  KL:   { MORNING: 600,  EVENING: 600,  "FULL DAY": 1000 },
};

// ── TYPES ─────────────────────────────────────────────────────────────────────
type Tab = "receipt" | "students" | "board" | "optional" | "settings";
type ReceiptStep = "library" | "type" | "student_search" | "form" | "result";
type EntryType = "NEW" | "RENEWAL";

interface PaymentTag { tag_name: string; active: boolean; created_at: string; }
interface Settings { [lib: string]: { library: string; last_student_id: number; last_receipt_no: number; cutoff_student_id: number; cutoff_receipt_no: number; } }
interface Student {
  student_id: string; library: string; yal_branch: string;
  name: string; phone: string; seat_no: string; shift: string;
  payment_tag: string; source?: string; row_index?: number;
  last_receipt_no?: string;
  address?: string; preparing_for?: string; aadhaar_last4?: string; date_of_birth?: string;
}
interface ReceiptResult {
  receipt_no: string; student_id: string;
  receipt_text: string; registration_text: string | null; contact_name: string;
}
interface ReceiptLogEntry {
  receipt_no: string; student_id: string; library: string; yal_branch: string;
  name: string; phone: string; seat_no: string; shift: string;
  booking_from: string; booking_to: string; receipt_date: string;
  fee: number; pay_mode_1: string; pay_amount_1: number;
  pay_mode_2: string; pay_amount_2: number; pay_mode_3: string; pay_amount_3: number;
  fees_due: number; type: string; is_cross_library: string; board_updated: string; generated_at: string;
}

// ── STYLE CONSTANTS ───────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: "100vh",
    background: "#f5f5f4",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    paddingBottom: 100,
  } as React.CSSProperties,

  card: {
    background: "#fff",
    borderRadius: 16,
    border: "1.5px solid #e5e5e4",
    padding: "16px",
    marginBottom: 12,
  } as React.CSSProperties,

  input: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1.5px solid #e5e5e4",
    fontSize: 15,
    background: "#fafafa",
    color: "#111",
    fontFamily: "'DM Sans', sans-serif",
    width: "100%",
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  select: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1.5px solid #e5e5e4",
    fontSize: 15,
    background: "#fafafa",
    color: "#111",
    fontFamily: "'DM Sans', sans-serif",
    width: "100%",
    outline: "none",
    appearance: "none" as const,
    cursor: "pointer",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  btn: {
    padding: "13px",
    borderRadius: 12,
    border: "none",
    background: "#111",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    width: "100%",
    transition: "all 0.15s",
  } as React.CSSProperties,

  label: {
    fontSize: 11,
    fontWeight: 700,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 5,
    display: "block",
  } as React.CSSProperties,

  bigBtn: (active: boolean) => ({
    flex: 1,
    padding: "14px 10px",
    borderRadius: 12,
    border: `2px solid ${active ? "#111" : "#e5e5e4"}`,
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#6b7280",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.15s",
    textAlign: "center" as const,
  }),
};

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────
function toUpper(v: string) { return (v || "").toUpperCase().trim(); }

function formatDate(d: Date) {
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}

function addOneMonth(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  d.setMonth(d.getMonth() + 1);
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

function todayStr() { return formatDate(new Date()); }

function getFee(libCode: string, yalBranch: string, shift: string): number {
  let key = libCode;
  if (libCode === "YAL") key = yalBranch === "YAL-1" ? "YAL1" : "YAL2";
  return FEES[key]?.[shift.toUpperCase()] || 0;
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: "#fff", padding: "24px 32px", borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ width: 28, height: 28, border: "3px solid #e5e5e4", borderTop: "3px solid #111", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{label}</div>
      </div>
    </div>
  );
}

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: type === "error" ? "#dc2626" : "#111", color: "#fff", padding: "12px 20px", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", fontSize: 14, fontWeight: 600, zIndex: 9998, whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif", maxWidth: "90vw", textAlign: "center", wordBreak: "break-word" as const }}>
      {msg}
    </div>
  );
}

function ConfirmDialog({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9997, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 24, width: "100%", maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 20, lineHeight: 1.5 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1.5px solid #e5e5e4", background: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy} style={{ padding: "11px 14px", borderRadius: 10, border: "1.5px solid #e5e5e4", background: copied ? "#dcfce7" : "#fafafa", color: copied ? "#16a34a" : "#111", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s", flex: 1 }}>
      {copied ? "✓ Copied!" : `📋 ${label}`}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={s.label}>{label}</span>
      {children}
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function AdmissionsPage() {
  const [authorized, setAuthorized] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("receipt");
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Loading...");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; onConfirm: () => void } | null>(null);

  const [allTags, setAllTags] = useState<PaymentTag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>({});

  const isSubmittingRef = useRef(false);

  useEffect(() => {
    setHydrated(true);
    if (localStorage.getItem("admissionsAuthorized") === "true") setAuthorized(true);
  }, []);

  useEffect(() => {
    if (authorized) loadInitData();
  }, [authorized]);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function showConfirm(msg: string, onConfirm: () => void) {
    setConfirm({ msg, onConfirm });
  }

  async function loadInitData() {
    try {
      const res = await fetch(`${API}?action=getInitData`);
      const d = await res.json();
      if (d.ok) {
        setAllTags(d.allTags || []);
        setActiveTags(d.tags || []);
        setSettings(d.settings || {});
      }
    } catch {}
  }

  function logout() {
    localStorage.removeItem("admissionsAuthorized");
    setAuthorized(false);
  }

  function checkPassword() {
    if (pwInput === PASSWORD) {
      localStorage.setItem("admissionsAuthorized", "true");
      setAuthorized(true);
    } else {
      setPwError(true);
      setTimeout(() => setPwError(false), 2000);
    }
  }

  if (!hydrated) return null;

  if (!authorized) {
    return (
      <>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400&display=swap');`}</style>
        <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 28, alignItems: "center" }}>
            <div style={{ width: 60, height: 60, background: "#fff", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🎓</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Admissions</div>
              <div style={{ fontSize: 13, color: "#666" }}>Locate Library — Private Access</div>
            </div>
            <div style={{ width: "100%", background: "#161616", borderRadius: 18, padding: 22, border: "1px solid #222", display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="password" placeholder="Enter password"
                value={pwInput} onChange={e => setPwInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && checkPassword()}
                autoFocus
                style={{ padding: "13px 16px", borderRadius: 10, border: `1.5px solid ${pwError ? "#dc2626" : "#2a2a2a"}`, background: "#0a0a0a", color: "#fff", fontSize: 16, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", outline: "none", width: "100%", boxSizing: "border-box" }}
              />
              {pwError && <div style={{ fontSize: 13, color: "#f87171", textAlign: "center", fontWeight: 500 }}>Incorrect password</div>}
              <button onClick={checkPassword} disabled={!pwInput} style={{ padding: "13px", borderRadius: 10, border: "none", background: "#fff", color: "#0a0a0a", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Access →
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const tabProps = { loading, setLoading, setLoadingLabel, showToast, showConfirm, activeTags, allTags, setAllTags, setActiveTags, settings, loadInitData, isSubmittingRef };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400&display=swap');
        * { box-sizing: border-box; }
        input, select, textarea { box-sizing: border-box; }
        select option { background: #fff; color: #111; }
      `}</style>

      <div style={s.page}>
        {/* Header */}
        <div style={{ background: "#111", padding: "18px 16px 14px", color: "#fff", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Locate Library</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>Admissions</div>
            </div>
            <button onClick={logout} style={{ fontSize: 12, color: "#f87171", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Logout</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 14px 0" }}>
          {activeTab === "receipt"   && <ReceiptTab   {...tabProps} />}
          {activeTab === "students"  && <StudentsTab  {...tabProps} />}
          {activeTab === "board"     && <BoardTab     {...tabProps} />}
          {activeTab === "optional"  && <OptionalTab  {...tabProps} />}
          {activeTab === "settings"  && <SettingsTab  {...tabProps} />}
        </div>

        {/* Bottom Tab Bar */}
        <div style={{ position: "fixed", bottom: 0, left: 0, width: "100%", background: "#fff", borderTop: "1.5px solid #e5e5e4", display: "flex", zIndex: 100 }}>
          {([
            { id: "receipt",  icon: "🧾", label: "Receipt" },
            { id: "students", icon: "👥", label: "Students" },
            { id: "board",    icon: "📋", label: "Board" },
            { id: "optional", icon: "📝", label: "Pending" },
            { id: "settings", icon: "⚙️", label: "Settings" },
          ] as { id: Tab; icon: string; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ flex: 1, padding: "10px 4px 12px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: activeTab === t.id ? "#111" : "#9ca3af", borderTop: `2px solid ${activeTab === t.id ? "#111" : "transparent"}`, fontFamily: "'DM Sans', sans-serif" }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: activeTab === t.id ? 700 : 500 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && <FullScreenLoader label={loadingLabel} />}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {confirm && (
        <ConfirmDialog
          msg={confirm.msg}
          onConfirm={() => { const fn = confirm.onConfirm; setConfirm(null); fn(); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: RECEIPT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════
function ReceiptTab({ loading, setLoading, setLoadingLabel, showToast, showConfirm, activeTags, isSubmittingRef }: any) {
  const [step, setStep] = useState<ReceiptStep>("library");
  const [library, setLibrary] = useState("");
  const [yalBranch, setYalBranch] = useState("YAL-1");
  const [entryType, setEntryType] = useState<EntryType>("NEW");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isCrossLibrary, setIsCrossLibrary] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);

  // Form fields
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [seatNo, setSeatNo] = useState("");
  const [shift, setShift] = useState("");
  const [bookingFrom, setBookingFrom] = useState(todayStr());
  const [bookingTo, setBookingTo] = useState(() => addOneMonth(todayStr()));
  const [receiptDate, setReceiptDate] = useState(todayStr());
  const [fee, setFee] = useState("");
  const [payMode1, setPayMode1] = useState("");
  const [payAmount1, setPayAmount1] = useState("");
  const [payMode2, setPayMode2] = useState("");
  const [payAmount2, setPayAmount2] = useState("");
  const [payMode3, setPayMode3] = useState("");
  const [payAmount3, setPayAmount3] = useState("");
  const [feesDue, setFeesDue] = useState("0");
  const [manualReceiptNo, setManualReceiptNo] = useState("");
  const [manualStudentId, setManualStudentId] = useState("");

  // Result
  const [result, setResult] = useState<ReceiptResult | null>(null);

  // Auto-fill fee when shift or library changes
  useEffect(() => {
    if (library && shift) {
      const autoFee = getFee(library, yalBranch, shift);
      if (autoFee) setFee(String(autoFee));
    }
  }, [library, yalBranch, shift]);

  // Auto-calculate booking_to
  useEffect(() => {
    if (bookingFrom) setBookingTo(addOneMonth(bookingFrom));
  }, [bookingFrom]);

  // Auto-calculate fees due
  useEffect(() => {
    const totalFee = Number(fee) || 0;
    const paid = (Number(payAmount1) || 0) + (Number(payAmount2) || 0) + (Number(payAmount3) || 0);
    const due = paid > 0 ? Math.max(0, totalFee - paid) : 0;
    setFeesDue(String(due));
  }, [fee, payAmount1, payAmount2, payAmount3]);

  async function doSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API}?action=searchStudents&q=${encodeURIComponent(searchQuery)}`);
      const d = await res.json();
      if (d.ok) setSearchResults(d.results || []);
    } catch { showToast("Search failed. Please retry.", "error"); }
    setSearching(false);
  }

  function selectStudent(st: Student) {
    setSelectedStudent(st);
    // Pre-fill form
    setStudentId(st.student_id);
    setName(st.name);
    setPhone(st.phone);
    setSeatNo(st.seat_no);
    setShift(st.shift);
    if (st.payment_tag) setPayMode1(st.payment_tag);
    // Cross-library check
    if (toUpper(st.library) !== toUpper(library)) {
      setIsCrossLibrary(true);
    } else {
      setIsCrossLibrary(false);
    }
    setStep("form");
  }

  async function submitReceipt() {
    if (isSubmittingRef.current) return;
    if (!name || !phone) { showToast("Name and phone are required.", "error"); return; }
    if (!shift) { showToast("Please select a shift.", "error"); return; }
    if (!bookingFrom || !bookingTo) { showToast("Booking period is required.", "error"); return; }
    if (!fee) { showToast("Fee amount is required.", "error"); return; }

    showConfirm(
      "Generate and save this receipt? This cannot be undone.",
      async () => {
        isSubmittingRef.current = true;
        setLoadingLabel("Generating receipt...");
        setLoading(true);
        try {
          const payload = {
            type: entryType,
            library, yal_branch: yalBranch,
            student_id: manualStudentId || studentId,
            name: toUpper(name), phone: toUpper(phone),
            seat_no: toUpper(seatNo), shift: toUpper(shift),
            booking_from: bookingFrom, booking_to: bookingTo,
            receipt_date: receiptDate,
            fee: Number(fee),
            pay_mode_1: toUpper(payMode1), pay_amount_1: Number(payAmount1) || 0,
            pay_mode_2: toUpper(payMode2), pay_amount_2: Number(payAmount2) || 0,
            pay_mode_3: toUpper(payMode3), pay_amount_3: Number(payAmount3) || 0,
            fees_due: Number(feesDue) || 0,
            manual_receipt_no: manualReceiptNo || undefined,
            manual_student_id: manualStudentId || undefined,
            is_cross_library: isCrossLibrary,
          };

          const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createReceipt", payload }) });
          const d = await res.json();
          if (d.ok) {
            setResult(d);
            setStep("result");
            showToast("Receipt generated successfully!");
          } else {
            showToast(d.error || "Failed to generate receipt.", "error");
          }
        } catch { showToast("Network error. Please retry.", "error"); }
        setLoading(false);
        isSubmittingRef.current = false;
      }
    );
  }

  function reset() {
    setStep("library"); setLibrary(""); setYalBranch("YAL-1"); setEntryType("NEW");
    setSelectedStudent(null); setSearchQuery(""); setSearchResults([]);
    setStudentId(""); setName(""); setPhone(""); setSeatNo(""); setShift("");
    setBookingFrom(todayStr()); setBookingTo(addOneMonth(todayStr())); setReceiptDate(todayStr());
    setFee(""); setPayMode1(""); setPayAmount1(""); setPayMode2(""); setPayAmount2("");
    setPayMode3(""); setPayAmount3(""); setFeesDue("0"); setManualReceiptNo(""); setManualStudentId("");
    setResult(null); setIsCrossLibrary(false);
  }

  // ── STEP: RESULT ──────────────────────────────────────────────────────────
  if (step === "result" && result) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...s.card, background: "#f0fdf4", border: "1.5px solid #86efac" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 4 }}>✓ Receipt Generated!</div>
          <div style={{ fontSize: 13, color: "#166534" }}>Receipt No: <strong>{result.receipt_no}</strong> | Student ID: <strong>{result.student_id}</strong></div>
        </div>

        {/* Copy buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {result.registration_text && (
            <CopyBtn text={result.registration_text} label="Group Copy (Registration Form)" />
          )}
          <CopyBtn text={result.receipt_text} label="Student Copy (Receipt)" />
          <CopyBtn text={result.contact_name} label="Contact Name" />
        </div>

        {/* Receipt preview */}
        <div style={s.card}>
          <div style={s.label}>Receipt Preview</div>
          <pre style={{ fontSize: 12, color: "#374151", whiteSpace: "pre-wrap", fontFamily: "monospace", background: "#f9fafb", borderRadius: 8, padding: 12, margin: 0, lineHeight: 1.6 }}>
            {result.receipt_text}
          </pre>
        </div>

        <button onClick={reset} style={s.btn}>+ New Receipt</button>
      </div>
    );
  }

  // ── STEP: LIBRARY ─────────────────────────────────────────────────────────
  if (step === "library") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 4 }}>Select Library</div>
        {LIBRARIES.map(lib => (
          <button key={lib.code} onClick={() => { setLibrary(lib.code); setStep(lib.code === "YAL" ? "library" : "type"); }}
            style={{ ...s.card, border: `2px solid ${library === lib.code ? "#111" : "#e5e5e4"}`, background: library === lib.code ? "#111" : "#fff", color: library === lib.code ? "#fff" : "#111", fontWeight: 700, fontSize: 15, cursor: "pointer", textAlign: "left", marginBottom: 0 }}>
            {lib.display}
          </button>
        ))}
        {library === "YAL" && (
          <div style={s.card}>
            <div style={s.label}>Select Branch</div>
            <div style={{ display: "flex", gap: 10 }}>
              {YAL_BRANCHES.map(b => (
                <button key={b} onClick={() => { setYalBranch(b); setStep("type"); }}
                  style={s.bigBtn(yalBranch === b)}>{b}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── STEP: TYPE ────────────────────────────────────────────────────────────
  if (step === "type") {
    const libObj = LIBRARIES.find(l => l.code === library);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setStep("library")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{libObj?.display}{library === "YAL" ? ` (${yalBranch})` : ""}</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>New Admission or Renewal?</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => { setEntryType("NEW"); setStep("form"); }} style={s.bigBtn(entryType === "NEW")}>
            ✨ New Admission
          </button>
          <button onClick={() => { setEntryType("RENEWAL"); setStep("student_search"); }} style={s.bigBtn(entryType === "RENEWAL")}>
            🔄 Renewal
          </button>
        </div>
      </div>
    );
  }

  // ── STEP: STUDENT SEARCH ──────────────────────────────────────────────────
  if (step === "student_search") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setStep("type")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Search Student</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder="Name / Phone / Student ID" style={{ ...s.input, flex: 1 }} />
          <button onClick={doSearch} style={{ ...s.btn, width: "auto", padding: "11px 16px", fontSize: 14 }}>
            {searching ? "..." : "Search"}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {searchResults.map((st, i) => (
              <button key={i} onClick={() => selectStudent(st)}
                style={{ ...s.card, marginBottom: 0, cursor: "pointer", textAlign: "left", border: "1.5px solid #e5e5e4" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{st.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                  {st.student_id} · {st.phone} · {st.library}{st.yal_branch ? ` (${st.yal_branch})` : ""}
                </div>
                {st.source === "PAST_STUDENTS" && (
                  <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontWeight: 700, marginTop: 4, display: "inline-block" }}>PAST</span>
                )}
                {toUpper(st.library) !== toUpper(library) && (
                  <span style={{ fontSize: 10, background: "#ede9fe", color: "#5b21b6", padding: "2px 6px", borderRadius: 4, fontWeight: 700, marginTop: 4, display: "inline-block", marginLeft: 4 }}>CROSS-LIBRARY</span>
                )}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => { setEntryType("RENEWAL"); setStep("form"); }} style={{ ...s.btn, background: "#f5f5f4", color: "#374151", fontSize: 14 }}>
          Skip Search — Fill Manually
        </button>
      </div>
    );
  }

  // ── STEP: FORM ────────────────────────────────────────────────────────────
  if (step === "form") {
    const libObj = LIBRARIES.find(l => l.code === library);
    const totalPaid = (Number(payAmount1)||0) + (Number(payAmount2)||0) + (Number(payAmount3)||0);
    const multiPayMode = totalPaid > 0;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setStep(entryType === "NEW" ? "type" : "student_search")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{entryType === "NEW" ? "New Admission" : "Renewal"}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{libObj?.display}{library === "YAL" ? ` · ${yalBranch}` : ""}</div>
          </div>
        </div>

        {isCrossLibrary && selectedStudent && (
          <div style={{ background: "#ede9fe", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#5b21b6", fontWeight: 600 }}>
            ↔ Cross-Library: {selectedStudent.student_id} from {selectedStudent.library}
          </div>
        )}

        {/* Mandatory fields */}
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 12 }}>Student Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Full Name *">
              <input value={name} onChange={e => setName(e.target.value.toUpperCase())} placeholder="FULL NAME" style={s.input} />
            </Field>
            <Field label="WhatsApp Number *">
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone Number" style={s.input} inputMode="numeric" />
            </Field>
            <Field label="Student ID">
              <input value={studentId || manualStudentId} onChange={e => setManualStudentId(e.target.value.toUpperCase())} placeholder="Auto-generated if blank" style={s.input} />
            </Field>
            <Field label="Seat Number">
              <input value={seatNo} onChange={e => setSeatNo(e.target.value.toUpperCase())} placeholder="Seat No." style={s.input} />
            </Field>
          </div>
        </div>

        {/* Shift selector */}
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Shift *</div>
          <div style={{ display: "flex", gap: 8 }}>
            {SHIFTS.map(sh => (
              <button key={sh.key} onClick={() => setShift(sh.key)}
                style={{ ...s.bigBtn(shift === sh.key), flex: 1, fontSize: 13 }}>
                <div>{sh.label}</div>
                <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.75, marginTop: 2 }}>{sh.time}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Booking Period */}
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Booking Period *</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="From Date">
              <input type="date" value={bookingFrom.split("-").reverse().join("-")}
                onChange={e => { const parts = e.target.value.split("-"); setBookingFrom(`${parts[2]}-${parts[1]}-${parts[0]}`); }}
                style={s.input} />
            </Field>
            <Field label="To Date">
              <input type="date" value={bookingTo.split("-").reverse().join("-")}
                onChange={e => { const parts = e.target.value.split("-"); setBookingTo(`${parts[2]}-${parts[1]}-${parts[0]}`); }}
                style={s.input} />
            </Field>
            <Field label="Receipt Date">
              <input type="date" value={receiptDate.split("-").reverse().join("-")}
                onChange={e => { const parts = e.target.value.split("-"); setReceiptDate(`${parts[2]}-${parts[1]}-${parts[0]}`); }}
                style={s.input} />
            </Field>
          </div>
        </div>

        {/* Fees */}
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Fees *</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Total Fee (₹)">
              <input type="number" value={fee} onChange={e => setFee(e.target.value)} placeholder="0" style={{ ...s.input, fontFamily: "'DM Mono', monospace", fontSize: 17 }} />
            </Field>

            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginTop: 2 }}>Payment Mode(s)</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={payMode1} onChange={e => setPayMode1(e.target.value)} style={{ ...s.select, flex: 2 }}>
                <option value="">Mode 1</option>
                {activeTags.map((t: string) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="number" value={payAmount1} onChange={e => setPayAmount1(e.target.value)} placeholder="Amount" style={{ ...s.input, flex: 1, fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={payMode2} onChange={e => setPayMode2(e.target.value)} style={{ ...s.select, flex: 2 }}>
                <option value="">Mode 2</option>
                {activeTags.map((t: string) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="number" value={payAmount2} onChange={e => setPayAmount2(e.target.value)} placeholder="Amount" style={{ ...s.input, flex: 1, fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={payMode3} onChange={e => setPayMode3(e.target.value)} style={{ ...s.select, flex: 2 }}>
                <option value="">Mode 3</option>
                {activeTags.map((t: string) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="number" value={payAmount3} onChange={e => setPayAmount3(e.target.value)} placeholder="Amount" style={{ ...s.input, flex: 1, fontSize: 13 }} />
            </div>

            {multiPayMode && (
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>Total Paid</span>
                <span style={{ fontWeight: 700 }}>₹{totalPaid}</span>
              </div>
            )}

            <Field label="Fees Due (₹)">
              <input type="number" value={feesDue} onChange={e => setFeesDue(e.target.value)} style={{ ...s.input, fontFamily: "'DM Mono', monospace" }} />
            </Field>
          </div>
        </div>

        {/* Manual receipt override */}
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Advanced (Optional)</div>
          <Field label="Manual Receipt No. (leave blank for auto)">
            <input value={manualReceiptNo} onChange={e => setManualReceiptNo(e.target.value.toUpperCase())} placeholder="e.g. R1587" style={s.input} />
          </Field>
        </div>

        <button onClick={submitReceipt} style={s.btn} disabled={loading}>
          Generate Receipt →
        </button>
      </div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: STUDENTS DATABASE
// ═══════════════════════════════════════════════════════════════════════════════
function StudentsTab({ loading, setLoading, setLoadingLabel, showToast, showConfirm, activeTags, isSubmittingRef }: any) {
  const [mode, setMode] = useState<"search" | "add" | "add_past" | "edit">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLib, setFilterLib] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [editStudent, setEditStudent] = useState<Student | null>(null);

  // Add new student form
  const [form, setForm] = useState({ library: "", yal_branch: "", name: "", phone: "", seat_no: "", shift: "", payment_tag: "", address: "", preparing_for: "", aadhaar_last4: "", date_of_birth: "" });
  // Past student form
  const [pastForm, setPastForm] = useState({ student_id: "", library: "", yal_branch: "", name: "", phone: "", seat_no: "", shift: "", payment_tag: "", last_receipt_no: "" });

  async function doSearch() {
    setLoadingLabel("Searching...");
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "searchStudents", q: searchQuery, library: filterLib });
      const res = await fetch(`${API}?${params}`);
      const d = await res.json();
      if (d.ok) setResults(d.results || []);
    } catch { showToast("Search failed.", "error"); }
    setLoading(false);
  }

  async function deleteStudent(st: Student) {
    showConfirm(`Delete ${st.name} (${st.student_id})? This cannot be undone.`, async () => {
      setLoadingLabel("Deleting...");
      setLoading(true);
      try {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteStudent", payload: { student_id: st.student_id } }) });
        const d = await res.json();
        if (d.ok) { showToast("Student deleted."); doSearch(); }
        else showToast(d.error || "Delete failed.", "error");
      } catch { showToast("Network error.", "error"); }
      setLoading(false);
    });
  }

  async function saveEdit() {
    if (!editStudent) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoadingLabel("Saving...");
    setLoading(true);
    try {
      const payload = { student_id: editStudent.student_id, ...Object.fromEntries(Object.entries(editStudent).map(([k, v]) => [k, toUpper(String(v))])) };
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateStudent", payload }) });
      const d = await res.json();
      if (d.ok) { showToast("Student updated!"); setMode("search"); doSearch(); }
      else showToast(d.error || "Update failed.", "error");
    } catch { showToast("Network error.", "error"); }
    setLoading(false);
    isSubmittingRef.current = false;
  }

  async function addStudent() {
    if (!form.library || !form.name || !form.phone) { showToast("Library, Name, and Phone are required.", "error"); return; }
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoadingLabel("Adding student...");
    setLoading(true);
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addStudent", payload: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, toUpper(v)])) }) });
      const d = await res.json();
      if (d.ok) { showToast("Student added!"); setForm({ library: "", yal_branch: "", name: "", phone: "", seat_no: "", shift: "", payment_tag: "", address: "", preparing_for: "", aadhaar_last4: "", date_of_birth: "" }); setMode("search"); }
      else showToast(d.error || "Failed to add.", "error");
    } catch { showToast("Network error.", "error"); }
    setLoading(false);
    isSubmittingRef.current = false;
  }

  async function addPastStudent() {
    if (!pastForm.student_id || !pastForm.library || !pastForm.name || !pastForm.phone) { showToast("ID, Library, Name, and Phone are required.", "error"); return; }
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoadingLabel("Adding past student...");
    setLoading(true);
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addPastStudent", payload: Object.fromEntries(Object.entries(pastForm).map(([k, v]) => [k, toUpper(v)])) }) });
      const d = await res.json();
      if (d.ok) { showToast("Past student added!"); setPastForm({ student_id: "", library: "", yal_branch: "", name: "", phone: "", seat_no: "", shift: "", payment_tag: "", last_receipt_no: "" }); setMode("search"); }
      else showToast(d.error || "Failed.", "error");
    } catch { showToast("Network error.", "error"); }
    setLoading(false);
    isSubmittingRef.current = false;
  }

  if (mode === "add") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <button onClick={() => setMode("search")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Add New Student</div>
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[["Library *","library"],["YAL Branch","yal_branch"],["Name *","name"],["Phone *","phone"],["Seat No","seat_no"],["Shift","shift"],["Payment Tag","payment_tag"],["Address","address"],["Preparing For","preparing_for"],["Aadhaar Last 4","aadhaar_last4"],["Date of Birth","date_of_birth"]].map(([label, key]) => (
            key === "library" ? (
              <Field key={key} label={label}><select value={form[key as keyof typeof form]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} style={s.select}><option value="">Select</option>{LIBRARIES.map(l => <option key={l.code} value={l.code}>{l.display}</option>)}</select></Field>
            ) : key === "yal_branch" ? (
              form.library === "YAL" ? <Field key={key} label={label}><select value={form.yal_branch} onChange={e => setForm(f => ({...f, yal_branch: e.target.value}))} style={s.select}>{YAL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}</select></Field> : null
            ) : key === "shift" ? (
              <Field key={key} label={label}><select value={form.shift} onChange={e => setForm(f => ({...f, shift: e.target.value}))} style={s.select}><option value="">Select</option>{SHIFTS.map(sh => <option key={sh.key} value={sh.key}>{sh.label}</option>)}</select></Field>
            ) : (
              <Field key={key} label={label}><input value={form[key as keyof typeof form]} onChange={e => setForm(f => ({...f, [key]: e.target.value.toUpperCase()}))} style={s.input} /></Field>
            )
          ))}
        </div>
      </div>
      <button onClick={addStudent} style={s.btn}>Add Student</button>
    </div>
  );

  if (mode === "add_past") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <button onClick={() => setMode("search")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Add Past Student</div>
      </div>
      <div style={{ background: "#fffbeb", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#92400e", marginBottom: 4 }}>
        Enter original Student ID and last Receipt No. for existing students.
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[["Student ID *","student_id"],["Library *","library"],["YAL Branch","yal_branch"],["Name *","name"],["Phone *","phone"],["Seat No","seat_no"],["Shift","shift"],["Payment Tag","payment_tag"],["Last Receipt No","last_receipt_no"]].map(([label, key]) => (
            key === "library" ? (
              <Field key={key} label={label}><select value={pastForm[key as keyof typeof pastForm]} onChange={e => setPastForm(f => ({...f, [key]: e.target.value}))} style={s.select}><option value="">Select</option>{LIBRARIES.map(l => <option key={l.code} value={l.code}>{l.display}</option>)}</select></Field>
            ) : key === "yal_branch" ? (
              pastForm.library === "YAL" ? <Field key={key} label={label}><select value={pastForm.yal_branch} onChange={e => setPastForm(f => ({...f, yal_branch: e.target.value}))} style={s.select}>{YAL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}</select></Field> : null
            ) : key === "shift" ? (
              <Field key={key} label={label}><select value={pastForm.shift} onChange={e => setPastForm(f => ({...f, shift: e.target.value}))} style={s.select}><option value="">Select</option>{SHIFTS.map(sh => <option key={sh.key} value={sh.key}>{sh.label}</option>)}</select></Field>
            ) : (
              <Field key={key} label={label}><input value={pastForm[key as keyof typeof pastForm]} onChange={e => setPastForm(f => ({...f, [key]: e.target.value.toUpperCase()}))} style={s.input} /></Field>
            )
          ))}
        </div>
      </div>
      <button onClick={addPastStudent} style={s.btn}>Add Past Student</button>
    </div>
  );

  if (mode === "edit" && editStudent) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <button onClick={() => setMode("search")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Edit: {editStudent.student_id}</div>
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(["name","phone","seat_no","shift","payment_tag","yal_branch","address","preparing_for","aadhaar_last4","date_of_birth"] as (keyof Student)[]).map(key => (
            key === "shift" ? (
              <Field key={key} label={String(key).replace(/_/g," ").toUpperCase()}>
                <select value={String(editStudent[key] || "")} onChange={e => setEditStudent(s => s ? {...s, [key]: e.target.value} : s)} style={s.select}>
                  <option value="">Select</option>
                  {SHIFTS.map(sh => <option key={sh.key} value={sh.key}>{sh.label}</option>)}
                </select>
              </Field>
            ) : (
              <Field key={key} label={String(key).replace(/_/g," ").toUpperCase()}>
                <input value={String(editStudent[key] || "")} onChange={e => setEditStudent(s => s ? {...s, [key]: e.target.value.toUpperCase()} : s)} style={s.input} />
              </Field>
            )
          ))}
        </div>
      </div>
      <button onClick={saveEdit} style={s.btn}>Save Changes</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setMode("add")} style={{ ...s.btn, flex: 1, fontSize: 13, padding: "11px 8px", background: "#f5f5f4", color: "#111" }}>+ New Student</button>
        <button onClick={() => setMode("add_past")} style={{ ...s.btn, flex: 1, fontSize: 13, padding: "11px 8px", background: "#f5f5f4", color: "#111" }}>+ Past Student</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder="Search name / phone / ID" style={{ ...s.input, flex: 1 }} />
        <button onClick={doSearch} style={{ ...s.btn, width: "auto", padding: "11px 16px", fontSize: 14 }}>Go</button>
      </div>

      <select value={filterLib} onChange={e => setFilterLib(e.target.value)} style={s.select}>
        <option value="">All Libraries</option>
        {LIBRARIES.map(l => <option key={l.code} value={l.code}>{l.display}</option>)}
      </select>

      {results.length > 0 && results.map((st, i) => (
        <div key={i} style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{st.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{st.student_id} · {st.phone}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{st.library}{st.yal_branch ? ` (${st.yal_branch})` : ""} · Seat {st.seat_no} · {st.shift}</div>
              {st.source === "PAST_STUDENTS" && <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontWeight: 700, marginTop: 4, display: "inline-block" }}>PAST STUDENT</span>}
            </div>
            {st.source !== "PAST_STUDENTS" && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setEditStudent(st); setMode("edit"); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e5e5e4", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Edit</button>
                <button onClick={() => deleteStudent(st)} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626" }}>Delete</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {results.length === 0 && searchQuery && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontSize: 14 }}>No students found</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: WHITEBOARD TRACKER
// ═══════════════════════════════════════════════════════════════════════════════
function BoardTab({ loading, setLoading, setLoadingLabel, showToast, showConfirm, isSubmittingRef }: any) {
  const [pending, setPending] = useState<any[]>([]);
  const [filterLib, setFilterLib] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoadingLabel("Loading pending...");
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "getPendingBoard", library: filterLib });
      const res = await fetch(`${API}?${params}`);
      const d = await res.json();
      if (d.ok) { setPending(d.pending || []); setLoaded(true); }
    } catch { showToast("Failed to load.", "error"); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filterLib]);

  async function markUpdated(receiptNo: string) {
    showConfirm(`Mark receipt ${receiptNo} as updated to whiteboard?`, async () => {
      setLoadingLabel("Updating...");
      setLoading(true);
      try {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "markBoardUpdated", payload: { receipt_no: receiptNo } }) });
        const d = await res.json();
        if (d.ok) { showToast("Marked as updated!"); load(); }
        else showToast(d.error || "Failed.", "error");
      } catch { showToast("Network error.", "error"); }
      setLoading(false);
    });
  }

  // Re-copy receipt from log entry
  function buildTextFromEntry(entry: any, title: string): string {
    const libNames: Record<string, string> = { KAL: "KIRAN AC LIBRARY", YAL: "YUVIKA AC LIBRARY", SL: "SURAJ LIBRARY", KL: "KIRTI LIBRARY" };
    const shifts: Record<string, string> = { MORNING: "MORNING (7AM TO 2PM)", EVENING: "EVENING (2PM TO 9PM)", "FULL DAY": "FULL DAY (7AM TO 9PM)" };
    const libName = libNames[entry.library] || entry.library;
    const shiftText = shifts[entry.shift] || entry.shift;
    let seatLine = `Seat No.: *${entry.seat_no}*`;
    if (entry.library === "YAL" && entry.yal_branch) seatLine = `Seat No.: *${entry.seat_no} IN ${entry.yal_branch}*`;
    const payLines = [];
    if (entry.pay_mode_1 && entry.pay_amount_1) payLines.push(`*${entry.pay_mode_1}-${entry.pay_amount_1}*`);
    if (entry.pay_mode_2 && entry.pay_amount_2) payLines.push(`*${entry.pay_mode_2}-${entry.pay_amount_2}*`);
    if (entry.pay_mode_3 && entry.pay_amount_3) payLines.push(`*${entry.pay_mode_3}-${entry.pay_amount_3}*`);
    const lines = [
      `*_${libName}_*`, `*{${title}}*`, `*${entry.student_id}*`, `*${entry.name}*`, `*${entry.phone}*`,
      seatLine, `*${shiftText}*`, `Booking Period:`, `*${entry.booking_from} to ${entry.booking_to}*`,
      `*${entry.receipt_date}*`, `Fees: *Rs. ${entry.fee}/-*`,
      ...payLines,
      `*${entry.receipt_no}*`,
      `*1.Fee is neither refundable nor transferrable under any circumstances.*`,
      `*2.Fees paid for the period as per the receipt will not be carried forward for any other period.*`,
    ];
    if (Number(entry.fees_due) > 0) lines.push(`Fees Due: *Rs. ${entry.fees_due}/-*`);
    return lines.join("\n");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Whiteboard Pending ({pending.length})</div>

      <select value={filterLib} onChange={e => setFilterLib(e.target.value)} style={s.select}>
        <option value="">All Libraries</option>
        {LIBRARIES.map(l => <option key={l.code} value={l.code}>{l.display}</option>)}
      </select>

      {loaded && pending.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 14 }}>All receipts updated to whiteboard!</div>
        </div>
      )}

      {pending.map((entry: any, i: number) => (
        <div key={i} style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{entry.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{entry.receipt_no} · {entry.student_id}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{entry.library}{entry.yal_branch ? ` (${entry.yal_branch})` : ""} · Seat {entry.seat_no}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{entry.booking_from} → {entry.booking_to}</div>
              <span style={{ fontSize: 10, background: entry.type === "NEW" ? "#dbeafe" : "#f3e8ff", color: entry.type === "NEW" ? "#1e40af" : "#6b21a8", padding: "2px 6px", borderRadius: 4, fontWeight: 700, display: "inline-block", marginTop: 4 }}>{entry.type}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopyBtn text={buildTextFromEntry(entry, "RECEIPT")} label="Copy Receipt" />
            {entry.type === "NEW" && <CopyBtn text={buildTextFromEntry(entry, "REGISTRATION FORM")} label="Copy Reg. Form" />}
            <CopyBtn text={`${entry.name} ${entry.library} ${entry.student_id}`} label="Contact Name" />
            <button onClick={() => markUpdated(entry.receipt_no)} style={{ padding: "11px 14px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", flex: 1 }}>
              ✓ Mark Updated
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PENDING OPTIONAL DATA
// ═══════════════════════════════════════════════════════════════════════════════
function OptionalTab({ loading, setLoading, setLoadingLabel, showToast, isSubmittingRef }: any) {
  const [students, setStudents] = useState<Student[]>([]);
  const [filterLib, setFilterLib] = useState("");
  const [editing, setEditing] = useState<{ [id: string]: { address: string; preparing_for: string; aadhaar_last4: string; date_of_birth: string } }>({});
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoadingLabel("Loading...");
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "getPendingOptional", library: filterLib });
      const res = await fetch(`${API}?${params}`);
      const d = await res.json();
      if (d.ok) { setStudents(d.students || []); setLoaded(true); }
    } catch { showToast("Failed to load.", "error"); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filterLib]);

  async function saveOptional(studentId: string) {
    if (isSubmittingRef.current) return;
    const data = editing[studentId];
    if (!data) return;
    isSubmittingRef.current = true;
    setLoadingLabel("Saving...");
    setLoading(true);
    try {
      const payload = { student_id: studentId, ...Object.fromEntries(Object.entries(data).map(([k,v]) => [k, v.toUpperCase()])) };
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateOptional", payload }) });
      const d = await res.json();
      if (d.ok) { showToast("Data saved!"); load(); setEditing(e => { const ne = {...e}; delete ne[studentId]; return ne; }); }
      else showToast(d.error || "Failed.", "error");
    } catch { showToast("Network error.", "error"); }
    setLoading(false);
    isSubmittingRef.current = false;
  }

  function startEdit(st: Student) {
    setEditing(e => ({...e, [st.student_id]: { address: st.address || "", preparing_for: st.preparing_for || "", aadhaar_last4: st.aadhaar_last4 || "", date_of_birth: st.date_of_birth || "" }}));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Pending Optional Data ({students.length})</div>

      <select value={filterLib} onChange={e => setFilterLib(e.target.value)} style={s.select}>
        <option value="">All Libraries</option>
        {LIBRARIES.map(l => <option key={l.code} value={l.code}>{l.display}</option>)}
      </select>

      {loaded && students.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 14 }}>All student data is complete!</div>
        </div>
      )}

      {students.map((st, i) => {
        const isEditing = !!editing[st.student_id];
        const editData = editing[st.student_id];
        const missing = [];
        if (!st.address) missing.push("Address");
        if (!st.preparing_for) missing.push("Preparing For");
        if (!st.aadhaar_last4) missing.push("Aadhaar Last 4");
        if (!st.date_of_birth) missing.push("Date of Birth");

        return (
          <div key={i} style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{st.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{st.student_id} · {st.library}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {missing.map(m => <span key={m} style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>Missing: {m}</span>)}
                </div>
              </div>
              {!isEditing && (
                <button onClick={() => startEdit(st)} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e5e5e4", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Fill</button>
              )}
            </div>

            {isEditing && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[["Address","address"],["Preparing For","preparing_for"],["Aadhaar Last 4","aadhaar_last4"],["Date of Birth","date_of_birth"]].map(([label, key]) => (
                  <Field key={key} label={label}>
                    <input value={editData[key as keyof typeof editData]} onChange={e => setEditing(ed => ({...ed, [st.student_id]: {...editData, [key]: e.target.value.toUpperCase()}}))} style={s.input} />
                  </Field>
                ))}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditing(ed => { const ne = {...ed}; delete ne[st.student_id]; return ne; })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e5e5e4", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                  <button onClick={() => saveOptional(st.student_id)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#111", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: SETTINGS (Payment Tags + Counters)
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsTab({ loading, setLoading, setLoadingLabel, showToast, showConfirm, allTags, setAllTags, setActiveTags, settings, loadInitData, isSubmittingRef }: any) {
  const [newTag, setNewTag] = useState("");
  const [settingsEdit, setSettingsEdit] = useState<{ [lib: string]: any }>({});

  useEffect(() => {
    // Pre-fill settings edit state from loaded settings
    const edit: any = {};
    Object.keys(settings).forEach(lib => {
      edit[lib] = { ...settings[lib] };
    });
    setSettingsEdit(edit);
  }, [settings]);

  async function addTag() {
    if (!newTag.trim()) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoadingLabel("Adding tag...");
    setLoading(true);
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addPaymentTag", payload: { tag_name: newTag.toUpperCase() } }) });
      const d = await res.json();
      if (d.ok) { showToast("Tag added!"); setNewTag(""); loadInitData(); }
      else showToast(d.error || "Failed.", "error");
    } catch { showToast("Network error.", "error"); }
    setLoading(false);
    isSubmittingRef.current = false;
  }

  async function toggleTag(tagName: string, currentActive: boolean) {
    showConfirm(`${currentActive ? "Deactivate" : "Activate"} tag "${tagName}"?`, async () => {
      setLoadingLabel("Updating tag...");
      setLoading(true);
      try {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "togglePaymentTag", payload: { tag_name: tagName, active: !currentActive } }) });
        const d = await res.json();
        if (d.ok) { showToast(`Tag ${currentActive ? "deactivated" : "activated"}!`); loadInitData(); }
        else showToast(d.error || "Failed.", "error");
      } catch { showToast("Network error.", "error"); }
      setLoading(false);
    });
  }

  async function saveSettings(lib: string) {
    showConfirm(`Save counter settings for ${lib}?`, async () => {
      setLoadingLabel("Saving settings...");
      setLoading(true);
      try {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateSettings", payload: { library: lib, ...settingsEdit[lib] } }) });
        const d = await res.json();
        if (d.ok) { showToast("Settings saved!"); loadInitData(); }
        else showToast(d.error || "Failed.", "error");
      } catch { showToast("Network error.", "error"); }
      setLoading(false);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Payment Tags */}
      <div style={s.card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 12 }}>Payment Tags</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {(allTags as PaymentTag[]).map((tag, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e5e4" }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>{tag.tag_name}</span>
                <span style={{ fontSize: 11, marginLeft: 8, color: tag.active ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>{tag.active ? "● Active" : "○ Inactive"}</span>
              </div>
              <button onClick={() => toggleTag(tag.tag_name, tag.active)}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${tag.active ? "#fecaca" : "#bbf7d0"}`, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: tag.active ? "#dc2626" : "#16a34a" }}>
                {tag.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newTag} onChange={e => setNewTag(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && addTag()} placeholder="New tag name" style={{ ...s.input, flex: 1 }} />
          <button onClick={addTag} style={{ ...s.btn, width: "auto", padding: "11px 16px", fontSize: 14 }}>Add</button>
        </div>
      </div>

      {/* Counter Settings per library */}
      {LIBRARIES.map(lib => {
        const libSettings = settingsEdit[lib.code];
        if (!libSettings) return null;
        return (
          <div key={lib.code} style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 12 }}>{lib.display} — Counters</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["cutoff_student_id","Cutoff Student ID (starting point)"],["last_student_id","Last Student ID (current counter)"],["cutoff_receipt_no","Cutoff Receipt No. (starting point)"],["last_receipt_no","Last Receipt No. (current counter)"]].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input type="number" value={libSettings[key] || 0}
                    onChange={e => setSettingsEdit((se: any) => ({...se, [lib.code]: {...se[lib.code], [key]: Number(e.target.value)}}))}
                    style={{ ...s.input, fontFamily: "'DM Mono', monospace" }} />
                </Field>
              ))}
            </div>
            <button onClick={() => saveSettings(lib.code)} style={{ ...s.btn, marginTop: 12 }}>Save {lib.code} Settings</button>
          </div>
        );
      })}
    </div>
  );
}