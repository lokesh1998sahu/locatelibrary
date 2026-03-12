"use client";
import { useState, useEffect, useCallback } from "react";

const API      = process.env.NEXT_PUBLIC_SCRIPT_URL!;
const PASSWORD = process.env.NEXT_PUBLIC_OWNER_PASSWORD || "library2024";

// ── Types ──────────────────────────────────────────────────
interface TaskStat {
  name: string;
  pct: number;
  done: number;
  total: number;
}

interface DayBar {
  day: string;
  pct: number;
}

interface LocationData {
  location: string;
  submitted: boolean;
  todayDone: number;
  todayTotal: number;
  todayPct: number | null;
  monthPct: number | null;
  streak: number;
  taskStats: TaskStat[];
  dailyChart: DayBar[];
}

interface DashboardData {
  locations: LocationData[];
  month: string;
  availableMonths: string[];
}

type TabType  = "today" | "monthly";
type CleanType = "daily" | "weekly";

// ── Helpers ────────────────────────────────────────────────
function pctColor(p: number | null): string {
  if (p == null) return "#94a3b8";
  if (p >= 80)   return "#16a34a";
  if (p >= 50)   return "#d97706";
  return "#dc2626";
}
function pctBg(p: number | null): string {
  if (p == null) return "#f8fafc";
  if (p >= 80)   return "#f0fdf4";
  if (p >= 50)   return "#fffbeb";
  return "#fef2f2";
}

// ── Gate ───────────────────────────────────────────────────
function Gate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState(""), [err, setErr] = useState(false);
  const attempt = () => pw === PASSWORD ? onAuth() : setErr(true);
  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      <div style={{ width: 320, background: "#1e293b", borderRadius: 22, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 44 }}>🔐</div>
        <h2 style={{ color: "#f1f5f9", margin: "10px 0 4px", fontSize: 20, fontWeight: 800 }}>Owner Dashboard</h2>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 22px" }}>Locate Library</p>
        <input type="password" placeholder="Password daalo..." value={pw}
          onChange={e => { setPw(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && attempt()}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 11, border: `2px solid ${err ? "#ef4444" : "#334155"}`, background: "#0f172a", color: "#f1f5f9", fontSize: 15, fontFamily: "'DM Mono'", outline: "none", boxSizing: "border-box", marginBottom: 8 }}
        />
        {err && <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 10px" }}>Wrong password ❌</p>}
        <button onClick={attempt} style={{ width: "100%", padding: 13, background: "#6366f1", color: "#fff", border: "none", borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Unlock →
        </button>
      </div>
    </div>
  );
}

// ── Today Card ─────────────────────────────────────────────
function TodayCard({ loc }: { loc: LocationData }) {
  const [open, setOpen] = useState(false);
  const p = loc.todayPct;
  return (
    <div style={{ background: "#fff", borderRadius: 16, marginBottom: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
      <div onClick={() => setOpen(!open)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{
          width: 54, height: 54, borderRadius: 13, flexShrink: 0,
          background: loc.submitted ? pctBg(p) : "#f8fafc",
          border: `2px solid ${loc.submitted ? pctColor(p) + "50" : "#e2e8f0"}`,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: loc.submitted ? pctColor(p) : "#94a3b8" }}>
            {loc.submitted ? `${p}%` : "—"}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{loc.location}</p>
          <p style={{ margin: "3px 0 0", fontSize: 13, fontWeight: 500, color: loc.submitted ? pctColor(p) : "#94a3b8" }}>
            {loc.submitted ? `${loc.todayDone}/${loc.todayTotal} tasks done` : "⏳ Submit nahi hua"}
          </p>
        </div>
        {loc.streak > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#ea580c", background: "#fff7ed", padding: "3px 9px", borderRadius: 99, flexShrink: 0 }}>
            🔥 {loc.streak}d
          </span>
        )}
        <span style={{ color: "#cbd5e1", fontSize: 15 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #f1f5f9" }}>
          {!loc.submitted
            ? <p style={{ padding: "14px 16px", color: "#94a3b8", fontSize: 13, margin: 0 }}>Aaj koi submission nahi.</p>
            : loc.taskStats.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: i < loc.taskStats.length - 1 ? "1px solid #f8fafc" : "none" }}>
                  <span style={{ fontSize: 15 }}>{t.pct === 100 ? "✅" : t.pct === 0 ? "❌" : "⚠️"}</span>
                  <span style={{ fontSize: 13, color: "#334155", flex: 1 }}>{t.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: pctBg(t.pct), color: pctColor(t.pct) }}>{t.pct}%</span>
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── Monthly View ───────────────────────────────────────────
function MonthlyView({ data }: { data: DashboardData }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {data.locations.map(loc => (
          <div key={loc.location} style={{ background: pctBg(loc.monthPct), border: `1.5px solid ${pctColor(loc.monthPct)}30`, borderRadius: 14, padding: "14px 12px" }}>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {loc.location}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 30, fontWeight: 800, color: pctColor(loc.monthPct), lineHeight: 1 }}>
              {loc.monthPct != null ? `${loc.monthPct}%` : "—"}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>
              {loc.streak > 0 ? `🔥 ${loc.streak} day streak` : "No streak yet"}
            </p>
          </div>
        ))}
      </div>

      {data.locations.map(loc => (
        <div key={loc.location} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{loc.location}</p>
          {loc.dailyChart.length > 0 ? (
            <>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 40, marginBottom: 4 }}>
                {loc.dailyChart.map((d, i) => (
                  <div key={i} title={`Day ${d.day}: ${d.pct}%`} style={{ flex: 1, minWidth: 3, height: `${Math.max(3, d.pct * 0.4)}px`, background: pctColor(d.pct), borderRadius: "2px 2px 0 0" }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 12 }}>
                <span>Day 1</span><span>Day {loc.dailyChart.length}</span>
              </div>
            </>
          ) : <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>No data this month</p>}

          {loc.taskStats.length > 0 ? (
            <>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>Task Consistency</p>
              {loc.taskStats.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, color: "#64748b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  <div style={{ width: 72, height: 5, background: "#e2e8f0", borderRadius: 99, flexShrink: 0 }}>
                    <div style={{ height: "100%", width: `${t.pct}%`, background: pctColor(t.pct), borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(t.pct), width: 32, textAlign: "right" }}>{t.pct}%</span>
                </div>
              ))}
            </>
          ) : <p style={{ color: "#94a3b8", fontSize: 12 }}>No submissions yet</p>}
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────
export default function OwnerDashboard() {
  const [authed, setAuthed]   = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("owner_authed") === "true";
  });

  function logout() {
    localStorage.removeItem("owner_authed");
    setAuthed(false);
  }
  const [tab, setTab]         = useState<TabType>("today");
  const [type, setType]       = useState<CleanType>("daily");
  const [month, setMonth]     = useState("");
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async (t: CleanType, m: string, silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}?action=getDashboard&type=${t}&month=${encodeURIComponent(m)}&_=${Date.now()}`);
      const d   = await res.json();
      if (!d.ok) throw new Error(d.error);
      setData(d as DashboardData);
      if (!m && d.month) setMonth(d.month);
      setLastRefresh(new Date());
    } catch { setError("Data load nahi hua. Dobara try karo."); }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { if (authed) load(type, ""); }, [authed, type, load]);

  if (!authed) return <Gate onAuth={() => { localStorage.setItem("owner_authed", "true"); setAuthed(true); }} />;

  const hour           = new Date().getHours();
  const unsubmitted    = data?.locations.filter(l => !l.submitted) ?? [];
  const showAlert      = hour >= 14 && unsubmitted.length > 0 && tab === "today";
  const today          = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const submittedCount = data?.locations.filter(l => l.submitted).length ?? 0;
  const totalCount     = data?.locations.length ?? 0;
  const allGreen       = submittedCount === totalCount && totalCount > 0;

  return (
    <div style={{ minHeight: "100svh", background: "#f1f5f9", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "#0f172a", padding: "18px 16px 0", color: "#fff" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, letterSpacing: 2, color: "#475569", textTransform: "uppercase" }}>Locate Library</p>
              <h1 style={{ margin: "3px 0 0", fontSize: 20, fontWeight: 800 }}>Cleaning Dashboard</h1>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>{today}</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => load(type, month)} title="Refresh" style={{ background: "#1e293b", border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>🔄</button>
              <div style={{ display: "flex", background: "#1e293b", borderRadius: 11, padding: 4, gap: 3 }}>
                {(["daily", "weekly"] as CleanType[]).map(t => (
                  <button key={t} onClick={() => setType(t)} style={{
                    padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                    background: type === t ? "#6366f1" : "transparent",
                    color: type === t ? "#fff" : "#94a3b8"
                  }}>{t === "daily" ? "🧹" : "✨"} {t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick stats */}
          {data && (
            <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center" }}>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, lineHeight: 1, color: allGreen ? "#4ade80" : submittedCount === 0 ? "#f87171" : "#fbbf24" }}>
                  {submittedCount}/{totalCount}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: "#64748b" }}>Submitted</p>
              </div>
              <div style={{ width: 1, height: 32, background: "#1e293b" }} />
              {data.locations.map(l => (
                <div key={l.location} style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: l.submitted ? pctColor(l.todayPct) : "#475569" }}>
                    {l.submitted ? `${l.todayPct}%` : "—"}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.location.split(/[\s-]/)[0]}
                  </p>
                </div>
              ))}
            </div>
          )}

          {lastRefresh && (
            <p style={{ margin: "8px 0 0", fontSize: 10, color: "#334155" }}>
              Last refreshed: {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          <div style={{ display: "flex", marginTop: 12 }}>
            {(["today", "monthly"] as TabType[]).map(k => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: "10px 20px", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                fontFamily: "inherit", background: "transparent",
                color: tab === k ? "#fff" : "#64748b",
                borderBottom: `2px solid ${tab === k ? "#6366f1" : "transparent"}`
              }}>{k.charAt(0).toUpperCase() + k.slice(1)}</button>
            ))}
            <a href="/owner/settings" style={{ marginLeft: "auto", padding: "10px 14px", fontSize: 13, color: "#64748b", textDecoration: "none", alignSelf: "center" }}>⚙️ Settings</a>
            <button onClick={logout} style={{ padding: "10px 14px", fontSize: 13, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Logout</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: 16 }}>

        {/* 2pm Alert */}
        {showAlert && (
          <div style={{ background: "#fef2f2", border: "2px solid #fca5a5", borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🔔</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#991b1b" }}>Submission pending!</p>
              <p style={{ margin: "3px 0 0", fontSize: 13, color: "#b91c1c" }}>
                {unsubmitted.map(l => l.location).join(", ")} — aaj abhi tak submit nahi hua.
              </p>
            </div>
          </div>
        )}

        {tab === "monthly" && data && data.availableMonths.length > 0 && (
          <select value={month} onChange={e => { setMonth(e.target.value); load(type, e.target.value); }}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e2e8f0", background: "#fff", fontSize: 14, marginBottom: 16, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}>
            {data.availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}

        {loading && <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}><div style={{ fontSize: 36 }}>⏳</div><p style={{ marginTop: 8 }}>Loading...</p></div>}
        {error   && <p style={{ color: "#ef4444", textAlign: "center", padding: 20, fontWeight: 500 }}>{error}</p>}

        {!loading && data && tab === "today"   && data.locations.map(loc => <TodayCard key={loc.location} loc={loc} />)}
        {!loading && data && tab === "monthly" && <MonthlyView data={data} />}
      </div>
    </div>
  );
}