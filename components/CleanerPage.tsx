"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_SCRIPT_URL!;

// ── Types ──────────────────────────────────────────────────
interface Location {
  location_id: string;
  location_name: string;
  order: number;
  active: boolean;
}

interface Task {
  task_id: string;
  task_name: string;
  task_hint: string;
  order: number;
  checked: boolean;
}

interface CleanerPageProps {
  type: "daily" | "weekly";
}

type Step = "select" | "loading" | "blocked" | "empty" | "tasks" | "confirm" | "submitting" | "done";

// ── Component ──────────────────────────────────────────────
export default function CleanerPage({ type }: CleanerPageProps) {
  const isDaily = type === "daily";
  const accent  = isDaily ? "#15803d" : "#6d28d9";
  const label   = isDaily ? "Daily Cleaning" : "Weekly Cleaning";

  const [locations, setLocations]   = useState<Location[]>([]);
  const [locLoading, setLocLoading] = useState(true);
  const [step, setStep]             = useState<Step>("select");
  const [selLoc, setSelLoc]         = useState<Location | null>(null);
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [error, setError]           = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`${API}?action=getLocations`);
        const data = await res.json();
        if (data.ok) setLocations((data.locations as Location[]).filter(l => l.active));
        else setError("Locations load nahi hui.");
      } catch { setError("Network error. Refresh karo."); }
      setLocLoading(false);
    })();
  }, []);

  async function selectLocation(loc: Location) {
    setSelLoc(loc);
    setStep("loading");
    setError("");
    try {
      const res  = await fetch(`${API}?action=getTasks&type=${type}&location=${encodeURIComponent(loc.location_name)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      if (data.alreadyDone) { setStep("blocked"); return; }
      if (data.empty)       { setStep("empty");   return; }
      setTasks((data.tasks as Omit<Task, "checked">[]).map(t => ({ ...t, checked: false })));
      setStep("tasks");
    } catch { setError("Tasks load nahi hui. Dobara try karo."); setStep("select"); }
  }

  function toggle(i: number) {
    setTasks(p => p.map((t, idx) => idx === i ? { ...t, checked: !t.checked } : t));
  }

  async function submit() {
    if (!selLoc) return;
    setStep("submitting");
    try {
      const res  = await fetch(API, {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "submit", type,
          location:   selLoc.location_name,
          locationId: selLoc.location_id,
          tasks: tasks.map(t => ({ task_id: t.task_id, task_name: t.task_name, done: t.checked }))
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setStep("done");
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message === "already_submitted"
        ? "Aaj ki entry pehle se ho chuki hai!"
        : "Submit nahi hua. Dobara try karo.";
      setError(msg);
      setStep("tasks");
    }
  }

  function reset() { setStep("select"); setSelLoc(null); setTasks([]); setError(""); }

  const doneCount = tasks.filter(t => t.checked).length;
  const pct       = tasks.length > 0 ? Math.round(doneCount / tasks.length * 100) : 0;
  const today     = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  const btnStyle = (bg: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
    width: "100%", padding: "15px 20px", background: bg, color: "#fff",
    border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700,
    cursor: "pointer", fontFamily: "'DM Sans',sans-serif", ...extra
  });

  return (
    <div style={{ minHeight: "100svh", background: "#f1f5f9", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: accent, padding: "20px 16px 18px", color: "#fff" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <p style={{ margin: 0, fontSize: 10, letterSpacing: 2, opacity: .65, textTransform: "uppercase" }}>Library</p>
          <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800 }}>{isDaily ? "🧹" : "✨"} {label}</h1>
          <p style={{ margin: "3px 0 0", fontSize: 12, opacity: .75 }}>{today}</p>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>

        {/* SELECT */}
        {step === "select" && (
          locLoading
            ? <Centered>⏳ Loading...</Centered>
            : <>
                <p style={{ color: "#64748b", fontSize: 14, marginBottom: 14, fontWeight: 600 }}>📍 Apni location select karo:</p>
                {locations.length === 0 && <p style={{ color: "#ef4444", fontSize: 14, textAlign: "center" }}>Koi location available nahi.</p>}
                {locations.map(loc => (
                  <button key={loc.location_id} onClick={() => selectLocation(loc)} style={{
                    width: "100%", padding: "15px 16px", marginBottom: 10, textAlign: "left",
                    background: "#fff", border: "2px solid #e2e8f0", borderRadius: 14,
                    fontSize: 15, fontWeight: 600, cursor: "pointer", color: "#1e293b",
                    fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
                  }}>
                    <span style={{ fontSize: 22 }}>🏢</span>
                    <span>{loc.location_name}</span>
                  </button>
                ))}
                {error && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginTop: 8 }}>{error}</p>}
              </>
        )}

        {step === "loading" && <Centered>⏳ Tasks load ho rahi hain...</Centered>}

        {/* BLOCKED */}
        {step === "blocked" && (
          <div style={{ background: "#fff7ed", border: "2px solid #f97316", borderRadius: 18, padding: 28, textAlign: "center", marginTop: 12 }}>
            <div style={{ fontSize: 56 }}>🚫</div>
            <h2 style={{ margin: "14px 0 0", fontSize: 20, fontWeight: 800, color: "#c2410c" }}>Aaj ki entry ho chuki hai!</h2>
            <p style={{ color: "#92400e", fontSize: 14, marginTop: 10, lineHeight: 1.8 }}>
              Bhai, <strong>{selLoc?.location_name}</strong> ki aaj ki<br />
              cleaning already submit ho gayi hai. ✅<br /><br />
              📌 <strong>Ek din mein sirf ek entry allowed hai.</strong><br />
              Koi galti lage toh owner se baat karo.
            </p>
            <button onClick={reset} style={btnStyle(accent, { width: "auto", padding: "12px 28px", marginTop: 20 })}>← Dusri Location</button>
          </div>
        )}

        {/* EMPTY */}
        {step === "empty" && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 28, textAlign: "center", marginTop: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 48 }}>📋</div>
            <h2 style={{ margin: "12px 0 0", fontSize: 18, fontWeight: 800, color: "#1e293b" }}>Koi task nahi mila</h2>
            <p style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>
              <strong>{selLoc?.location_name}</strong> mein abhi koi task set nahi hai.<br />Owner se contact karo.
            </p>
            <button onClick={reset} style={btnStyle(accent, { width: "auto", padding: "12px 28px", marginTop: 20 })}>← Wapas</button>
          </div>
        )}

        {/* TASKS */}
        {step === "tasks" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1e293b" }}>{selLoc?.location_name}</h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94a3b8" }}>{tasks.length} tasks</p>
              </div>
              <button onClick={reset} style={{ background: "none", border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "6px 14px", fontSize: 12, color: "#64748b", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            </div>

            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.08)", marginBottom: 14 }}>
              {tasks.map((t, i) => (
                <div key={t.task_id} onClick={() => toggle(i)} style={{
                  display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px",
                  borderBottom: i < tasks.length - 1 ? "1px solid #f1f5f9" : "none",
                  background: t.checked ? "#f0fdf4" : "#fff", cursor: "pointer", transition: "background 0.12s"
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 7, border: `2px solid ${t.checked ? accent : "#cbd5e1"}`,
                    background: t.checked ? accent : "#fff", display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0, marginTop: 1, transition: "all 0.12s"
                  }}>
                    {t.checked && <span style={{ color: "#fff", fontSize: 14, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.checked ? "#16a34a" : "#1e293b", textDecoration: t.checked ? "line-through" : "none" }}>{t.task_name}</p>
                    {t.task_hint && <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>{t.task_hint}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", marginBottom: 6 }}>
                <span>{doneCount} of {tasks.length} complete</span>
                <span style={{ fontWeight: 700, color: accent }}>{pct}%</span>
              </div>
              <div style={{ height: 7, background: "#e2e8f0", borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: accent, borderRadius: 99, transition: "width .3s" }} />
              </div>
            </div>

            {error && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{error}</p>}
            <button onClick={() => setStep("confirm")} style={btnStyle(accent)}>Submit ✅</button>
          </>
        )}

        {/* CONFIRM */}
        {step === "confirm" && (
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.1)", marginTop: 24, textAlign: "center" }}>
            <div style={{ fontSize: 52 }}>🤔</div>
            <h2 style={{ margin: "12px 0 0", fontSize: 20, fontWeight: 800, color: "#1e293b" }}>Sure ho?</h2>
            <p style={{ color: "#64748b", fontSize: 14, marginTop: 10, lineHeight: 1.8 }}>
              <strong style={{ color: "#1e293b" }}>{selLoc?.location_name}</strong> ki aaj ki entry submit hogi.<br />
              <span style={{ color: accent, fontWeight: 700 }}>✅ {doneCount} Done</span>
              {tasks.length - doneCount > 0 && <> &nbsp;·&nbsp; <span style={{ color: "#ef4444", fontWeight: 700 }}>❌ {tasks.length - doneCount} Not Done</span></>}
              <br /><br />
              ⚠️ Submit ke baad <strong>aaj dobara entry nahi</strong> ho sakti.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={() => setStep("tasks")} style={btnStyle("#f1f5f9", { color: "#475569" })}>← Wapas</button>
              <button onClick={submit} style={btnStyle(accent)}>Haan, Submit! ✅</button>
            </div>
          </div>
        )}

        {step === "submitting" && <Centered>⏳ Submit ho raha hai...</Centered>}

        {/* DONE */}
        {step === "done" && (
          <div style={{ textAlign: "center", paddingTop: 48 }}>
            <div style={{ fontSize: 72 }}>🎉</div>
            <h2 style={{ margin: "12px 0 0", fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Ho Gaya!</h2>
            <p style={{ color: "#64748b", marginTop: 8, fontSize: 15 }}>
              <strong style={{ color: accent }}>{doneCount}/{tasks.length} tasks</strong> logged for <strong>{selLoc?.location_name}</strong>
            </p>
            <button onClick={reset} style={btnStyle(accent, { width: "auto", padding: "13px 32px", marginTop: 28 })}>+ Dusri Location</button>
          </div>
        )}

      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 64, color: "#94a3b8", fontSize: 15 }}>
      {children}
    </div>
  );
}
