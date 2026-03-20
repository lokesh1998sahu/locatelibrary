"use client";
import { useState, useEffect } from "react";

const API      = process.env.NEXT_PUBLIC_SCRIPT_URL!;
const PASSWORD = process.env.NEXT_PUBLIC_OWNER_PASSWORD || "library2024";

// ── Types ──────────────────────────────────────────────────
interface Location {
  location_id: string;
  location_name: string;
  order: number;
  active: boolean;
}

interface Task {
  task_id: string;
  locations: string[];
  task_name: string;
  task_hint: string;
  order: number;
  active: boolean;
}

type CleanType  = "daily" | "weekly";
type SectionType = "tasks" | "libraries";

// ── Gate ───────────────────────────────────────────────────
function Gate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState(""), [err, setErr] = useState(false);
  const attempt = () => pw === PASSWORD ? onAuth() : setErr(true);
  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      <div style={{ width: 300, background: "#1e293b", borderRadius: 20, padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>⚙️</div>
        <h2 style={{ color: "#f1f5f9", margin: "10px 0 4px", fontWeight: 800 }}>Settings</h2>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>Owner only</p>
        <input type="password" placeholder="Password..." value={pw}
          onChange={e => { setPw(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && attempt()}
          style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: `2px solid ${err ? "#ef4444" : "#334155"}`, background: "#0f172a", color: "#f1f5f9", fontSize: 15, fontFamily: "'DM Mono'", outline: "none", boxSizing: "border-box", marginBottom: 8 }}
        />
        {err && <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 8px" }}>Wrong password ❌</p>}
        <button onClick={attempt} style={{ width: "100%", padding: 12, background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Unlock →</button>
      </div>
    </div>
  );
}

// ── Library Picker ─────────────────────────────────────────
function LibraryPicker({ allLocations, selected, onChange }: {
  allLocations: Location[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const active = allLocations.filter(l => l.active);
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", border: "1.5px solid #e2e8f0" }}>
      <p style={{ margin: "0 0 8px", fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>Applicable Libraries *</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {active.map(loc => {
          const checked = selected.includes(loc.location_name);
          return (
            <button key={loc.location_id} onClick={() => {
              const next = checked
                ? selected.filter(n => n !== loc.location_name)
                : [...selected, loc.location_name];
              onChange(next);
            }} style={{
              padding: "6px 12px", borderRadius: 99,
              border: `2px solid ${checked ? "#6366f1" : "#e2e8f0"}`,
              background: checked ? "#eef2ff" : "#fff",
              color: checked ? "#4338ca" : "#64748b",
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s"
            }}>
              {checked ? "✓ " : ""}{loc.location_name}
            </button>
          );
        })}
      </div>
      {selected.length === 0 && <p style={{ margin: "6px 0 0", fontSize: 11, color: "#ef4444" }}>Kam se kam ek library select karo</p>}
    </div>
  );
}

// ── Shared Input ───────────────────────────────────────────
function Inp({ value, onChange, placeholder, style = {} }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  style?: React.CSSProperties;
}) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit", ...style }}
    />
  );
}

function iconBtn(disabled = false): React.CSSProperties {
  return {
    width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
    background: disabled ? "#f8fafc" : "#f1f5f9", border: "1px solid #e2e8f0",
    borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.35 : 1, flexShrink: 0
  };
}

// ── Main Component ─────────────────────────────────────────
export default function TaskSettings() {
  // ── HYDRATION FIX ──
  // Always start as false on both server and client.
  // Read localStorage only after mount in useEffect — this prevents
  // the SSR/client mismatch that caused the hydration error.
  const [authed, setAuthed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (localStorage.getItem("owner_authed") === "true") {
      setAuthed(true);
    }
  }, []);

  function logout() {
    localStorage.removeItem("owner_authed");
    setAuthed(false);
  }

  const [type, setType]         = useState<CleanType>("daily");
  const [section, setSection]   = useState<SectionType>("tasks");
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState("");
  const [msg, setMsg]           = useState("");
  const [filterLoc, setFilterLoc] = useState("ALL");

  // Task edit/add
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTask, setEditTask]     = useState<{ task_name: string; task_hint: string; locations: string[] }>({ task_name: "", task_hint: "", locations: [] });
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask]       = useState<{ task_name: string; task_hint: string; locations: string[] }>({ task_name: "", task_hint: "", locations: [] });

  // Library edit/add
  const [editLocId, setEditLocId]     = useState<string | null>(null);
  const [editLocName, setEditLocName] = useState("");
  const [addingLoc, setAddingLoc]     = useState(false);
  const [newLocName, setNewLocName]   = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [locRes, setRes] = await Promise.all([
        fetch(`${API}?action=getLocations`),
        fetch(`${API}?action=getSettings&type=${type}`)
      ]);
      const locData = await locRes.json();
      const setData = await setRes.json();
      if (locData.ok) setAllLocations(locData.locations as Location[]);
      if (setData.ok) setTasks(setData.tasks as Task[]);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { if (authed) loadData(); }, [authed, type]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch(API, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) });
    return res.json();
  }
  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(""), 2500); }

  const visibleTasks = filterLoc === "ALL" ? tasks : tasks.filter(t => t.locations.includes(filterLoc));

  // ── Task actions ──────────────────────────────────────
  async function saveEditTask(task_id: string) {
    if (!editTask.task_name.trim() || editTask.locations.length === 0) return;
    setSaving(task_id);
    await post({ action: "updateTask", type, task_id, task_name: editTask.task_name, task_hint: editTask.task_hint, locations: editTask.locations });
    flash("Task updated ✅"); setEditTaskId(null);
    await loadData(); setSaving("");
  }
  async function addTask() {
    if (!newTask.task_name.trim() || newTask.locations.length === 0) return;
    setSaving("newtask");
    await post({ action: "addTask", type, task_name: newTask.task_name, task_hint: newTask.task_hint, locations: newTask.locations });
    flash("Task added ✅"); setNewTask({ task_name: "", task_hint: "", locations: [] }); setAddingTask(false);
    await loadData(); setSaving("");
  }
  async function toggleTask(task: Task) {
    setSaving(task.task_id);
    await post({ action: "toggleTask", type, task_id: task.task_id, active: !task.active });
    flash(task.active ? "Task hidden ✅" : "Task active ✅");
    await loadData(); setSaving("");
  }
  async function moveTask(task_id: string, direction: "up" | "down") {
    const list = [...visibleTasks];
    const idx  = list.findIndex(t => t.task_id === task_id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === list.length - 1) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    setSaving(task_id);
    await post({ action: "reorderTasks", type, location: filterLoc === "ALL" ? null : filterLoc, orderedIds: list.map(t => t.task_id) });
    await loadData(); setSaving("");
  }

  // ── Library actions ───────────────────────────────────
  async function saveEditLib(location_id: string) {
    if (!editLocName.trim()) return;
    setSaving(location_id);
    await post({ action: "updateLocation", location_id, location_name: editLocName });
    flash("Library updated ✅"); setEditLocId(null);
    await loadData(); setSaving("");
  }
  async function toggleLib(loc: Location) {
    setSaving(loc.location_id);
    await post({ action: "toggleLocation", location_id: loc.location_id, active: !loc.active });
    flash(loc.active ? "Library hidden ✅" : "Library active ✅");
    await loadData(); setSaving("");
  }
  async function addLib() {
    if (!newLocName.trim()) return;
    setSaving("newlib");
    await post({ action: "addLocation", location_name: newLocName });
    flash("Library added ✅"); setNewLocName(""); setAddingLoc(false);
    await loadData(); setSaving("");
  }

  // ── Render nothing until client has hydrated ──
  // This prevents any flash of the wrong screen during SSR reconciliation.
  if (!hydrated) return null;

  if (!authed) return <Gate onAuth={() => { localStorage.setItem("owner_authed", "true"); setAuthed(true); }} />;

  return (
    <div style={{ minHeight: "100svh", background: "#f1f5f9", fontFamily: "'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "#0f172a", padding: "18px 16px 0", color: "#fff" }}>
        <div style={{ maxWidth: 580, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, letterSpacing: 2, color: "#475569", textTransform: "uppercase" }}>Locate Library</p>
              <h1 style={{ margin: "3px 0 0", fontSize: 20, fontWeight: 800 }}>⚙️ Settings</h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a href="/owner" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← Dashboard</a>
              <button onClick={logout} style={{ padding: "6px 12px", fontSize: 13, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Logout</button>
            </div>
          </div>

          <div style={{ display: "flex", background: "#1e293b", borderRadius: 11, padding: 4, gap: 3, marginTop: 14, width: "fit-content" }}>
            {(["daily", "weekly"] as CleanType[]).map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                background: type === t ? "#6366f1" : "transparent", color: type === t ? "#fff" : "#94a3b8"
              }}>{t === "daily" ? "🧹 Daily" : "✨ Weekly"}</button>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: 14 }}>
            {(["tasks", "libraries"] as SectionType[]).map(k => (
              <button key={k} onClick={() => setSection(k)} style={{
                padding: "10px 18px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                fontFamily: "inherit", background: "transparent",
                color: section === k ? "#fff" : "#64748b",
                borderBottom: `2px solid ${section === k ? "#6366f1" : "transparent"}`
              }}>{k === "tasks" ? "📋 Tasks" : "🏢 Libraries"}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 580, margin: "0 auto", padding: 16 }}>

        {msg && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#166534", textAlign: "center", fontWeight: 600 }}>
            {msg}
          </div>
        )}

        {loading ? <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>⏳ Loading...</div>

        : section === "tasks" ? (
          /* ══ TASKS ══ */
          <>
            {/* Filter pills */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 2 }}>
              {["ALL", ...allLocations.filter(l => l.active).map(l => l.location_name)].map(name => (
                <button key={name} onClick={() => setFilterLoc(name)} style={{
                  padding: "7px 14px", borderRadius: 99, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", fontFamily: "inherit",
                  background: filterLoc === name ? "#6366f1" : "#e2e8f0",
                  color: filterLoc === name ? "#fff" : "#475569"
                }}>{name === "ALL" ? "All Tasks" : name}</button>
              ))}
            </div>

            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
              {visibleTasks.length} task{visibleTasks.length !== 1 ? "s" : ""}{filterLoc !== "ALL" && ` in ${filterLoc}`}
            </p>

            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", marginBottom: 14 }}>
              {visibleTasks.length === 0 && <p style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Koi task nahi. Neeche add karo.</p>}
              {visibleTasks.map((task, i) => (
                <div key={task.task_id} style={{ padding: "12px 14px", borderBottom: i < visibleTasks.length - 1 ? "1px solid #f1f5f9" : "none", opacity: task.active ? 1 : 0.45, background: task.active ? "#fff" : "#f8fafc" }}>
                  {editTaskId === task.task_id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <Inp value={editTask.task_name} onChange={v => setEditTask(p => ({ ...p, task_name: v }))} placeholder="Task name *" />
                      <Inp value={editTask.task_hint} onChange={v => setEditTask(p => ({ ...p, task_hint: v }))} placeholder="Hint (optional)" />
                      <LibraryPicker allLocations={allLocations} selected={editTask.locations} onChange={v => setEditTask(p => ({ ...p, locations: v }))} />
                      <div style={{ display: "flex", gap: 7 }}>
                        <button onClick={() => saveEditTask(task.task_id)} disabled={saving === task.task_id || !editTask.task_name.trim() || editTask.locations.length === 0}
                          style={{ flex: 1, padding: "9px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          {saving === task.task_id ? "Saving..." : "Save ✅"}
                        </button>
                        <button onClick={() => setEditTaskId(null)} style={{ flex: 1, padding: "9px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: task.active ? "#1e293b" : "#94a3b8" }}>{task.task_name}</p>
                        {task.task_hint && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94a3b8" }}>{task.task_hint}</p>}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                          {task.locations.map(loc => (
                            <span key={loc} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "#eef2ff", color: "#4338ca", fontWeight: 600 }}>{loc}</span>
                          ))}
                        </div>
                        <span style={{ fontSize: 10, color: task.active ? "#16a34a" : "#94a3b8", fontWeight: 700, marginTop: 2, display: "block" }}>
                          {task.active ? "● Active" : "○ Hidden"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => moveTask(task.task_id, "up")}   disabled={i === 0}                        style={iconBtn(i === 0)}>↑</button>
                        <button onClick={() => moveTask(task.task_id, "down")} disabled={i === visibleTasks.length - 1} style={iconBtn(i === visibleTasks.length - 1)}>↓</button>
                        <button onClick={() => { setEditTaskId(task.task_id); setEditTask({ task_name: task.task_name, task_hint: task.task_hint, locations: [...task.locations] }); }} style={iconBtn()}>✏️</button>
                        <button onClick={() => toggleTask(task)} disabled={saving === task.task_id} style={iconBtn()}>{task.active ? "🟢" : "🔴"}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!addingTask ? (
              <button onClick={() => setAddingTask(true)} style={{ width: "100%", padding: 14, background: "#fff", color: "#6366f1", border: "2px dashed #c7d2fe", borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                + Add New Task
              </button>
            ) : (
              <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14, color: "#1e293b" }}>New Task</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Inp value={newTask.task_name} onChange={v => setNewTask(p => ({ ...p, task_name: v }))} placeholder="Task name *" />
                  <Inp value={newTask.task_hint} onChange={v => setNewTask(p => ({ ...p, task_hint: v }))} placeholder="Hint (optional)" />
                  <LibraryPicker allLocations={allLocations} selected={newTask.locations} onChange={v => setNewTask(p => ({ ...p, locations: v }))} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={addTask} disabled={saving === "newtask" || !newTask.task_name.trim() || newTask.locations.length === 0}
                      style={{ flex: 1, padding: 12, background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {saving === "newtask" ? "Adding..." : "Add ✅"}
                    </button>
                    <button onClick={() => { setAddingTask(false); setNewTask({ task_name: "", task_hint: "", locations: [] }); }}
                      style={{ flex: 1, padding: 12, background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>

        ) : (
          /* ══ LIBRARIES ══ */
          <>
            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", marginBottom: 14 }}>
              {allLocations.length === 0 && <p style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>Koi library nahi.</p>}
              {allLocations.map((loc, i) => (
                <div key={loc.location_id} style={{ padding: "12px 14px", borderBottom: i < allLocations.length - 1 ? "1px solid #f1f5f9" : "none", opacity: loc.active ? 1 : 0.45, background: loc.active ? "#fff" : "#f8fafc" }}>
                  {editLocId === loc.location_id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Inp value={editLocName} onChange={setEditLocName} placeholder="Library name" style={{ flex: 1 }} />
                      <button onClick={() => saveEditLib(loc.location_id)} style={{ padding: "8px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Save ✅</button>
                      <button onClick={() => setEditLocId(null)} style={{ padding: "8px 12px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: loc.active ? "#1e293b" : "#94a3b8" }}>🏢 {loc.location_name}</p>
                        <span style={{ fontSize: 10, color: loc.active ? "#16a34a" : "#94a3b8", fontWeight: 700 }}>
                          {loc.active ? "● Active" : "○ Hidden"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => { setEditLocId(loc.location_id); setEditLocName(loc.location_name); }} style={iconBtn()}>✏️</button>
                        <button onClick={() => toggleLib(loc)} disabled={saving === loc.location_id} style={iconBtn()}>{loc.active ? "🟢" : "🔴"}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#92400e" }}>
              💡 Hidden libraries disappear from cleaner app + dashboard. Unka data safe rehta hai.
            </div>

            {!addingLoc ? (
              <button onClick={() => setAddingLoc(true)} style={{ width: "100%", padding: 14, background: "#fff", color: "#6366f1", border: "2px dashed #c7d2fe", borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                + Add New Library
              </button>
            ) : (
              <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14, color: "#1e293b" }}>New Library</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Inp value={newLocName} onChange={setNewLocName} placeholder="Library name *" style={{ flex: 1 }} />
                  <button onClick={addLib} disabled={saving === "newlib" || !newLocName.trim()} style={{ padding: "9px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    {saving === "newlib" ? "Adding..." : "Add ✅"}
                  </button>
                  <button onClick={() => { setAddingLoc(false); setNewLocName(""); }} style={{ padding: "9px 12px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}