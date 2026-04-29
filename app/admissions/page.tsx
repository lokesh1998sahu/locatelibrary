"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const API      = "/api/admissions";
const PASSWORD = process.env.NEXT_PUBLIC_ADMISSIONS_PASSWORD!;

// ── LIBRARY MASTER ────────────────────────────────────────────────────────────
const LIBRARIES = [
  { code: "KAL", name: "KIRAN AC LIBRARY",  display: "Kiran AC Library",  emoji: "🏛️" },
  { code: "YAL", name: "YUVIKA AC LIBRARY", display: "Yuvika AC Library", emoji: "📚" },
  { code: "SL",  name: "SURAJ LIBRARY",     display: "Suraj Library",     emoji: "☀️" },
  { code: "KL",  name: "KIRTI LIBRARY",     display: "Kirti Library",     emoji: "🌟" },
];
const YAL_BRANCHES = ["YAL-1", "YAL-2"];

// ── TYPES ─────────────────────────────────────────────────────────────────────
type Tab          = "receipt" | "students" | "board" | "pending" | "dues" | "settings";
type ReceiptStep  = "library" | "type" | "search" | "form" | "result";
type EntryType    = "NEW" | "RENEWAL";

interface Shift       { shift_key: string; shift_name: string; shift_time: string; active: boolean; fees: Record<string,number>; }
interface PaymentTag  { tag_name: string; active: boolean; created_at: string; }
interface LibSettings { library: string; last_student_id: number; last_receipt_no: number; cutoff_student_id: number; cutoff_receipt_no: number; }
interface Student     { s_no?: number; student_id: string; library: string; yal_branch: string; name: string; phone: string; seat_no: string; shift: string; payment_tag: string; last_receipt_no?: string; address?: string; preparing_for?: string; aadhaar_last4?: string; date_of_birth?: string; added_on?: string; source?: string; is_past?: boolean; }
interface ReceiptEntry { s_no?: number; receipt_no: string; student_id: string; library: string; yal_branch: string; name: string; phone: string; seat_no: string; shift: string; booking_from: string; booking_to: string; receipt_date: string; fee: number; pay_mode_1: string; pay_amount_1: number; pay_mode_2: string; pay_amount_2: number; pay_mode_3: string; pay_amount_3: number; fees_due: number; fees_due_balance: number; type: string; is_cross_library: string; board_updated: string; generated_at: string; receipt_text: string; registration_text: string; }
interface DuePayment  { s_no?: number; payment_id: string; receipt_no: string; student_id: string; library: string; name: string; phone: string; payment_mode: string; amount_received: number; balance_before: number; balance_after: number; received_on: string; notes: string; }
interface ReceiptResult { receipt_no: string; student_id: string; receipt_text: string; registration_text: string | null; contact_name: string; }

// ── PHONE NORMALIZATION ───────────────────────────────────────────────────────
// Accepts: +91 77426 14128 | +917742614128 | 77426 14128 | 7742614128
// Always outputs: 7742614128
function normalizePhone(input: string): string {
  if (!input) return "";
  let clean = input.replace(/[\s\-\.\(\)]/g, "");
  if (clean.startsWith("+91")) clean = clean.slice(3);
  else if (clean.startsWith("91") && clean.length > 10) clean = clean.slice(2);
  clean = clean.replace(/\D/g, "");
  if (clean.length > 10) clean = clean.slice(-10);
  return clean;
}

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
function todayDMY(): string { const d = new Date(); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function dmyToISO(dmy: string): string { if (!dmy) return ""; const p = dmy.split("-"); if (p.length !== 3) return ""; return `${p[2].padStart(4,"0")}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`; }
function isoToDMY(iso: string): string { if (!iso) return ""; const p = iso.split("-"); if (p.length !== 3) return ""; return `${parseInt(p[2])}-${parseInt(p[1])}-${p[0]}`; }
function addOneMonth(dmy: string): string { if (!dmy) return ""; const p = dmy.split("-"); if (p.length !== 3) return dmy; const d = new Date(Number(p[2]), Number(p[1])-1, Number(p[0])); d.setMonth(d.getMonth()+1); d.setDate(d.getDate()-1); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function fmtDate(dmy: string): string { if (!dmy) return "—"; const p = dmy.split("-"); if (p.length !== 3) return dmy; const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${p[0].padStart(2,"0")} ${m[parseInt(p[1])-1]||""} ${p[2]}`; }

function toU(v: string) { return (v || "").toUpperCase().trim(); }
function getFeeKey(lib: string, yal: string) { if (lib === "YAL") return yal === "YAL-1" ? "YAL1" : "YAL2"; return lib; }

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const inp:  React.CSSProperties = { padding:"11px 14px", borderRadius:12, border:"1.5px solid #e2e8f0", fontSize:14, background:"#f8fafc", color:"#1e293b", fontFamily:"'DM Sans',sans-serif", width:"100%", outline:"none", boxSizing:"border-box" };
const selS: React.CSSProperties = { ...inp, cursor:"pointer", appearance:"none" };
const card: React.CSSProperties = { background:"#fff", borderRadius:16, border:"1px solid #f1f5f9", padding:"16px", marginBottom:10, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" };
const primaryBtn: React.CSSProperties = { width:"100%", padding:"14px", borderRadius:14, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 14px rgba(99,102,241,0.3)" };
const ghostBtn: React.CSSProperties = { padding:"10px 14px", borderRadius:12, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:13, fontWeight:600, cursor:"pointer", color:"#64748b", fontFamily:"'DM Sans',sans-serif" };

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────
function Loader({ label }: { label: string }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#fff",padding:"28px 36px",borderRadius:20,display:"flex",flexDirection:"column",alignItems:"center",gap:16,boxShadow:"0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ width:36,height:36,border:"3px solid #e2e8f0",borderTop:"3px solid #6366f1",borderRadius:"50%",animation:"spin 0.7s linear infinite" }} />
        <div style={{ fontSize:14,fontWeight:600,color:"#1e293b" }}>{label}</div>
      </div>
    </div>
  );
}

function Toast({ msg, type, onDone }: { msg:string; type:"success"|"error"; onDone:()=>void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position:"fixed",bottom:88,left:"50%",transform:"translateX(-50%)",background:type==="error"?"#ef4444":"#10b981",color:"#fff",padding:"12px 22px",borderRadius:50,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",fontSize:14,fontWeight:600,zIndex:9998,whiteSpace:"nowrap",maxWidth:"88vw",textAlign:"center",animation:"slideUp 0.25s ease" }}>
      {type==="success"?"✓  ":"✕  "}{msg}
    </div>
  );
}

function Confirm({ msg, onConfirm, onCancel }: { msg:string; onConfirm:()=>void; onCancel:()=>void }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:9997,padding:"0 0 16px" }}>
      <div style={{ background:"#fff",borderRadius:"20px 20px 16px 16px",padding:"24px 20px 20px",width:"100%",maxWidth:480,boxShadow:"0 -8px 40px rgba(0,0,0,0.15)" }}>
        <div style={{ width:36,height:4,background:"#e2e8f0",borderRadius:99,margin:"0 auto 20px" }} />
        <p style={{ fontSize:15,fontWeight:600,color:"#1e293b",margin:"0 0 20px",lineHeight:1.6,textAlign:"center" }}>{msg}</p>
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onCancel} style={{ flex:1,padding:"13px",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",fontSize:14,fontWeight:600,cursor:"pointer",color:"#64748b",fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:1,padding:"13px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ text, label, accent="#6366f1" }: { text:string; label:string; accent?:string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); }); }}
      style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"11px 14px",borderRadius:12,border:`1.5px solid ${copied?"#10b981":accent+"33"}`,background:copied?"#ecfdf5":`${accent}0d`,color:copied?"#059669":accent,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.18s",flex:1 }}>
      {copied?"✓":"📋"} {copied?"Copied!":label}
    </button>
  );
}

function Badge({ text, color="#6366f1" }: { text:string; color?:string }) {
  return <span style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99,background:`${color}18`,color,letterSpacing:"0.05em" }}>{text}</span>;
}

function Pill({ text, active, onClick }: { text:string; active:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{ padding:"7px 14px",borderRadius:99,border:"none",background:active?"#6366f1":"#f1f5f9",color:active?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap" }}>
      {text}
    </button>
  );
}

function Field({ label, children, required }: { label:string; children:React.ReactNode; required?:boolean }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
      <span style={{ fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em" }}>{label}{required&&<span style={{ color:"#f43f5e",marginLeft:2 }}>*</span>}</span>
      {children}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page:number; totalPages:number; onChange:(p:number)=>void }) {
  if (totalPages<=1) return null;
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 0" }}>
      <button onClick={()=>onChange(page-1)} disabled={page===1} style={{ ...ghostBtn,padding:"8px 14px",opacity:page===1?0.4:1 }}>← Prev</button>
      <span style={{ fontSize:13,fontWeight:600,color:"#64748b" }}>{page} / {totalPages}</span>
      <button onClick={()=>onChange(page+1)} disabled={page===totalPages} style={{ ...ghostBtn,padding:"8px 14px",opacity:page===totalPages?0.4:1 }}>Next →</button>
    </div>
  );
}

// ── RECEIPT CARD ──────────────────────────────────────────────────────────────
function ReceiptCard({ r, showCopy=true }: { r:ReceiptEntry; showCopy?:boolean }) {
  const [open, setOpen] = useState(false);
  const lib = LIBRARIES.find(l=>l.code===r.library);
  const hasDue = (r.fees_due_balance||0) > 0;
  return (
    <div style={{ ...card,marginBottom:8,overflow:"hidden" }}>
      <div onClick={()=>setOpen(e=>!e)} style={{ cursor:"pointer" }}>
        <div style={{ display:"flex",alignItems:"flex-start",gap:10 }}>
          <div style={{ width:44,height:44,borderRadius:12,background:r.type==="NEW"?"linear-gradient(135deg,#10b981,#059669)":"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
            <span style={{ fontSize:20 }}>{r.type==="NEW"?"✨":"🔄"}</span>
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
              <span style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{r.name}</span>
              <Badge text={r.receipt_no} color="#6366f1" />
              {hasDue && <Badge text={`DUE ₹${r.fees_due_balance}`} color="#ef4444" />}
              {r.is_cross_library==="YES" && <Badge text="CROSS" color="#f59e0b" />}
            </div>
            <div style={{ fontSize:12,color:"#64748b",marginTop:3 }}>{r.student_id} · {lib?.display}{r.yal_branch?` (${r.yal_branch})`:""}</div>
            <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{fmtDate(r.booking_from)} → {fmtDate(r.booking_to)} · ₹{r.fee}</div>
            <div style={{ fontSize:11,color:"#cbd5e1",marginTop:2 }}>{r.generated_at}</div>
          </div>
          <span style={{ color:"#cbd5e1",fontSize:18,marginTop:2 }}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open && (
        <div style={{ marginTop:14,paddingTop:14,borderTop:"1px solid #f1f5f9" }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12 }}>
            {[["Seat",r.seat_no],["Shift",r.shift],["Receipt Date",fmtDate(r.receipt_date)],["Fee","₹"+r.fee]].map(([k,v])=>(
              <div key={k} style={{ background:"#f8fafc",borderRadius:10,padding:"8px 10px" }}>
                <div style={{ fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:13,fontWeight:600,color:"#1e293b" }}>{v||"—"}</div>
              </div>
            ))}
          </div>
          {showCopy && (
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              {r.registration_text && <CopyBtn text={r.registration_text} label="Group Copy" />}
              {r.receipt_text && <CopyBtn text={r.receipt_text} label="Student Copy" accent="#10b981" />}
              <CopyBtn text={`${r.name} ${r.library} ${r.student_id}`} label="Contact" accent="#f59e0b" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── STUDENT CARD ──────────────────────────────────────────────────────────────
function StudentCard({ st, onEdit, onDelete }: { st:Student; onEdit?:()=>void; onDelete?:()=>void }) {
  const lib = LIBRARIES.find(l=>l.code===st.library);
  return (
    <div style={{ ...card,marginBottom:8 }}>
      <div style={{ display:"flex",alignItems:"flex-start",gap:12 }}>
        <div style={{ width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>
          {lib?.emoji||"📚"}
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
            <span style={{ fontWeight:700,fontSize:15,color:"#1e293b" }}>{st.name}</span>
            {st.is_past && <Badge text="PAST" color="#f59e0b" />}
            {st.yal_branch && <Badge text={st.yal_branch} color="#6366f1" />}
          </div>
          <div style={{ fontSize:12,color:"#64748b",marginTop:3 }}>{st.student_id} · {st.phone}</div>
          <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{lib?.display} · Seat {st.seat_no||"—"} · {st.shift||"—"}</div>
          {st.added_on && <div style={{ fontSize:11,color:"#cbd5e1",marginTop:3 }}>{st.added_on}</div>}
        </div>
        {(onEdit||onDelete) && (
          <div style={{ display:"flex",gap:6,flexShrink:0 }}>
            {onEdit && <button onClick={onEdit} style={{ ...ghostBtn,padding:"6px 10px",fontSize:12 }}>Edit</button>}
            {onDelete && <button onClick={onDelete} style={{ ...ghostBtn,padding:"6px 10px",fontSize:12,color:"#ef4444",borderColor:"#fecaca" }}>Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function AdmissionsPage() {
  const [authed, setAuthed]       = useState(false);
  const [hydrated, setHydrated]   = useState(false);
  const [pwInput, setPwInput]     = useState("");
  const [pwError, setPwError]     = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("receipt");
  const [loading, setLoading]     = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Loading...");
  const [toast, setToast]         = useState<{msg:string;type:"success"|"error"}|null>(null);
  const [confirm, setConfirm]     = useState<{msg:string;onConfirm:()=>void}|null>(null);
  const [shifts, setShifts]       = useState<Shift[]>([]);
  const [allTags, setAllTags]     = useState<PaymentTag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [settings, setSettings]   = useState<Record<string,LibSettings>>({});
  const isSubmitting = useRef(false);

  useEffect(() => { setHydrated(true); if (localStorage.getItem("admissionsAuth")==="true") setAuthed(true); }, []);
  useEffect(() => { if (authed) loadInit(); }, [authed]);

  async function loadInit() {
    try {
      const res = await fetch(`${API}?action=getInitData`);
      const d   = await res.json();
      if (d.ok) { setShifts(d.shifts||[]); setAllTags(d.allTags||[]); setActiveTags(d.activeTags||[]); setSettings(d.settings||{}); }
    } catch {}
  }

  function showToast(msg:string, type:"success"|"error"="success") { setToast({msg,type}); }
  function showConfirm(msg:string, fn:()=>void) { setConfirm({msg,onConfirm:fn}); }
  function startLoading(label:string) { setLoadingLabel(label); setLoading(true); }
  function stopLoading() { setLoading(false); }
  function logout() { localStorage.removeItem("admissionsAuth"); setAuthed(false); }

  if (!hydrated) return null;

  if (!authed) return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box}`}</style>
      <div style={{ minHeight:"100vh",background:"linear-gradient(135deg,#0f172a,#1e1b4b)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ width:"100%",maxWidth:360,display:"flex",flexDirection:"column",alignItems:"center",gap:32 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:56,marginBottom:12 }}>🎓</div>
            <div style={{ fontSize:26,fontWeight:800,color:"#fff",marginBottom:6 }}>Admissions</div>
            <div style={{ fontSize:14,color:"#94a3b8" }}>Locate Library · Private Access</div>
          </div>
          <div style={{ width:"100%",background:"rgba(255,255,255,0.05)",borderRadius:20,padding:24,border:"1px solid rgba(255,255,255,0.1)" }}>
            <input type="password" placeholder="Enter password" value={pwInput}
              onChange={e=>{setPwInput(e.target.value);setPwError(false);}}
              onKeyDown={e=>{if(e.key==="Enter"){if(pwInput===PASSWORD){localStorage.setItem("admissionsAuth","true");setAuthed(true);}else{setPwError(true);setPwInput("");}}}}
              autoFocus
              style={{ padding:"13px 16px",borderRadius:12,border:`1.5px solid ${pwError?"#ef4444":"rgba(255,255,255,0.15)"}`,background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",outline:"none",width:"100%",boxSizing:"border-box",marginBottom:8 }} />
            {pwError && <p style={{ color:"#f87171",fontSize:13,textAlign:"center",margin:"0 0 10px" }}>Incorrect password.</p>}
            <button onClick={()=>{if(pwInput===PASSWORD){localStorage.setItem("admissionsAuth","true");setAuthed(true);}else{setPwError(true);setPwInput("");}}}
              disabled={!pwInput}
              style={{ width:"100%",padding:14,borderRadius:12,border:"none",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
              Access Portal →
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const tabProps = { showToast, showConfirm, startLoading, stopLoading, shifts, allTags, activeTags, settings, loadInit, isSubmitting };

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        input:focus,select:focus{border-color:#6366f1!important;box-shadow:0 0 0 3px rgba(99,102,241,0.1)}
        ::-webkit-scrollbar{display:none}
      `}</style>
      <div style={{ minHeight:"100vh",background:"#f8fafc",fontFamily:"'DM Sans',sans-serif",paddingBottom:80 }}>
        <div style={{ background:"linear-gradient(135deg,#1e293b,#0f172a)",padding:"16px 16px 0",position:"sticky",top:0,zIndex:100 }}>
          <div style={{ maxWidth:480,margin:"0 auto" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:14 }}>
              <div>
                <div style={{ fontSize:10,color:"#475569",letterSpacing:2,textTransform:"uppercase" }}>Locate Library</div>
                <div style={{ fontSize:20,fontWeight:800,color:"#fff",marginTop:2 }}>Admissions</div>
              </div>
              <button onClick={logout} style={{ fontSize:12,color:"#f87171",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontFamily:"'DM Sans',sans-serif" }}>Logout</button>
            </div>
            <div style={{ display:"flex",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
              {([
                {id:"receipt",icon:"🧾",label:"Receipt"},
                {id:"students",icon:"👥",label:"Students"},
                {id:"board",icon:"📋",label:"Board"},
                {id:"dues",icon:"💰",label:"Dues"},
                {id:"pending",icon:"📝",label:"Pending"},
                {id:"settings",icon:"⚙️",label:"Settings"},
              ] as {id:Tab;icon:string;label:string}[]).map(t=>(
                <button key={t.id} onClick={()=>setActiveTab(t.id)}
                  style={{ flex:1,padding:"10px 2px 12px",border:"none",background:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:activeTab===t.id?"#a5b4fc":"#475569",borderBottom:`2px solid ${activeTab===t.id?"#6366f1":"transparent"}`,fontFamily:"'DM Sans',sans-serif" }}>
                  <span style={{ fontSize:15 }}>{t.icon}</span>
                  <span style={{ fontSize:9,fontWeight:activeTab===t.id?700:500 }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ maxWidth:480,margin:"0 auto",padding:"16px 14px 0" }}>
          {activeTab==="receipt"  && <ReceiptTab  {...tabProps} />}
          {activeTab==="students" && <StudentsTab {...tabProps} />}
          {activeTab==="board"    && <BoardTab    {...tabProps} />}
          {activeTab==="dues"     && <DuesTab     {...tabProps} />}
          {activeTab==="pending"  && <PendingTab  {...tabProps} />}
          {activeTab==="settings" && <SettingsTab {...tabProps} />}
        </div>
      </div>
      {loading  && <Loader label={loadingLabel} />}
      {toast    && <Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)} />}
      {confirm  && <Confirm msg={confirm.msg} onConfirm={()=>{const fn=confirm.onConfirm;setConfirm(null);fn();}} onCancel={()=>setConfirm(null)} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RECEIPT TAB
// ═══════════════════════════════════════════════════════════════════
function ReceiptTab({ showToast, showConfirm, startLoading, stopLoading, shifts, activeTags, isSubmitting }: any) {
  const [step, setStep]   = useState<ReceiptStep>("library");
  const [library, setLibrary]     = useState("");
  const [yalBranch, setYalBranch] = useState("YAL-1");
  const [entryType, setEntryType] = useState<EntryType>("NEW");
  const [selectedStudent, setSelectedStudent] = useState<Student|null>(null);
  const [isCrossLib, setIsCrossLib] = useState(false);
  const [searchQ, setSearchQ]   = useState("");
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult]     = useState<ReceiptResult|null>(null);
  const [multiPay, setMultiPay] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  const [f, setF] = useState({
    studentId:"", name:"", phone:"",
    seatNo:"", shift:"",
    customShiftName:"", customShiftTime:"",  // editable per-receipt override
    bookingFrom:todayDMY(), bookingTo:addOneMonth(todayDMY()), receiptDate:todayDMY(),
    fee:"", payMode1:"", payAmount1:"", payMode2:"", payAmount2:"", payMode3:"", payAmount3:"",
    feesDue:"0", manualReceiptNo:"", manualStudentId:"",
    address:"", preparingFor:"", aadhaarLast4:"", dob:"",
  });

  const libData      = LIBRARIES.find(l=>l.code===library);
  const feeKey       = getFeeKey(library, yalBranch);
  const activeShifts = (shifts as Shift[]).filter(s=>s.active);

  // Auto-fill fee + shift name/time when shift selected
  useEffect(() => {
    if (f.shift && library) {
      const sh = (shifts as Shift[]).find(s=>s.shift_key===f.shift);
      if (sh) {
        const fee = sh.fees[feeKey];
        setF(p=>({ ...p, fee:fee?String(fee):p.fee, customShiftName:sh.shift_name, customShiftTime:sh.shift_time }));
      }
    }
  }, [f.shift, library, yalBranch]);

  // Auto-calc booking_to
  useEffect(() => { if (f.bookingFrom) setF(p=>({...p,bookingTo:addOneMonth(p.bookingFrom)})); }, [f.bookingFrom]);

  // Auto-calc fees due (only in multiPay mode)
  useEffect(() => {
    if (multiPay) {
      const paid = (Number(f.payAmount1)||0)+(Number(f.payAmount2)||0)+(Number(f.payAmount3)||0);
      setF(p=>({...p,feesDue:String(paid>0?Math.max(0,Number(p.fee)-paid):0)}));
    } else { setF(p=>({...p,feesDue:"0"})); }
  }, [f.fee, f.payAmount1, f.payAmount2, f.payAmount3, multiPay]);

  async function doSearch() {
    if (searchQ.trim().length < 2) return;
    setSearching(true);
    try {
      const q = normalizePhone(searchQ) || searchQ; // normalize if it looks like a phone
      const res = await fetch(`${API}?action=searchStudents&q=${encodeURIComponent(q)}&library=${library}`);
      const d   = await res.json();
      if (d.ok) setSearchResults(d.results||[]);
    } catch { showToast("Search failed. Please retry.","error"); }
    setSearching(false);
  }

  function pickStudent(st: Student) {
    setSelectedStudent(st);
    setF(p=>({...p, studentId:st.student_id, name:st.name, phone:st.phone, seatNo:st.seat_no, shift:st.shift, payMode1:st.payment_tag}));
    setIsCrossLib(toU(st.library)!==toU(library));
    setStep("form");
  }

  async function submit() {
    if (isSubmitting.current) return;
    if (!f.name.trim())  { showToast("Name is required.","error"); return; }
    if (!f.phone.trim()) { showToast("Phone is required.","error"); return; }
    if (!f.shift)        { showToast("Please select a shift.","error"); return; }
    if (!f.fee)          { showToast("Fee amount is required.","error"); return; }
    if (!f.bookingFrom||!f.bookingTo) { showToast("Booking period is required.","error"); return; }

    // Build shift_full: use custom values if user edited them
    const sh = (shifts as Shift[]).find(s=>s.shift_key===f.shift);
    const shName = f.customShiftName || sh?.shift_name || f.shift;
    const shTime = f.customShiftTime || sh?.shift_time || "";
    const shiftFull = shTime ? `${toU(shName)} (${toU(shTime)})` : toU(shName);

    showConfirm("Generate and save this receipt permanently?", async () => {
      isSubmitting.current = true;
      startLoading("Generating receipt...");
      try {
        const payload = {
          type: entryType, library, yal_branch: yalBranch,
          student_id:       f.manualStudentId || f.studentId,
          name:             toU(f.name),
          phone:            normalizePhone(f.phone),
          seat_no:          toU(f.seatNo),
          shift:            f.shift,
          shift_full:       shiftFull,
          booking_from:     f.bookingFrom,
          booking_to:       f.bookingTo,
          receipt_date:     f.receiptDate,
          fee:              Number(f.fee),
          pay_mode_1:       toU(f.payMode1),
          pay_amount_1:     multiPay ? (Number(f.payAmount1)||0) : Number(f.fee),
          pay_mode_2:       multiPay ? toU(f.payMode2) : "",
          pay_amount_2:     multiPay ? (Number(f.payAmount2)||0) : 0,
          pay_mode_3:       multiPay ? toU(f.payMode3) : "",
          pay_amount_3:     multiPay ? (Number(f.payAmount3)||0) : 0,
          fees_due:         Number(f.feesDue)||0,
          manual_receipt_no: f.manualReceiptNo||undefined,
          manual_student_id: f.manualStudentId||undefined,
          is_cross_library:  isCrossLib,
          is_past_student:   selectedStudent?.is_past||false,
          address:           toU(f.address),
          preparing_for:     toU(f.preparingFor),
          aadhaar_last4:     f.aadhaarLast4,
          date_of_birth:     f.dob,
        };
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"createReceipt",payload})});
        const d   = await res.json();
        if (d.ok) { setResult(d); setStep("result"); showToast("Receipt generated!"); }
        else showToast(d.error||"Failed to generate receipt.","error");
      } catch { showToast("Network error. Please retry.","error"); }
      stopLoading(); isSubmitting.current = false;
    });
  }

  function reset() {
    setStep("library"); setLibrary(""); setYalBranch("YAL-1"); setEntryType("NEW");
    setSelectedStudent(null); setSearchQ(""); setSearchResults([]); setResult(null); setMultiPay(false); setShowOptional(false);
    setF({ studentId:"",name:"",phone:"",seatNo:"",shift:"",customShiftName:"",customShiftTime:"",bookingFrom:todayDMY(),bookingTo:addOneMonth(todayDMY()),receiptDate:todayDMY(),fee:"",payMode1:"",payAmount1:"",payMode2:"",payAmount2:"",payMode3:"",payAmount3:"",feesDue:"0",manualReceiptNo:"",manualStudentId:"",address:"",preparingFor:"",aadhaarLast4:"",dob:"" });
  }

  const steps: ReceiptStep[] = ["library","type","search","form","result"];
  const stepIdx = steps.indexOf(step);

  // RESULT
  if (step==="result" && result) return (
    <div style={{ animation:"slideUp 0.3s ease" }}>
      <div style={{ background:"linear-gradient(135deg,#10b981,#059669)",borderRadius:16,padding:20,marginBottom:16,color:"#fff",textAlign:"center" }}>
        <div style={{ fontSize:36,marginBottom:8 }}>🎉</div>
        <div style={{ fontSize:18,fontWeight:800,marginBottom:4 }}>Receipt Generated!</div>
        <div style={{ fontSize:14,opacity:0.9 }}>{result.receipt_no} · {result.student_id}</div>
      </div>
      <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:16 }}>
        {result.registration_text && <CopyBtn text={result.registration_text} label="📢 Group Copy (Registration Form)" />}
        <CopyBtn text={result.receipt_text} label="👤 Student Copy (Receipt)" accent="#10b981" />
        <CopyBtn text={result.contact_name} label="📇 Contact Name" accent="#f59e0b" />
      </div>
      <div style={{ ...card,background:"#f8fafc" }}>
        <div style={{ fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.07em" }}>Receipt Preview</div>
        <pre style={{ fontSize:12,color:"#374151",whiteSpace:"pre-wrap",fontFamily:"'DM Mono',monospace",lineHeight:1.7,margin:0 }}>{result.receipt_text}</pre>
      </div>
      <button onClick={reset} style={{ ...primaryBtn,marginTop:12 }}>+ New Receipt</button>
    </div>
  );

  return (
    <div>
      {/* Progress */}
      <div style={{ display:"flex",gap:3,marginBottom:20 }}>
        {steps.map((s,i)=>(
          <div key={s} style={{ flex:1,height:3,borderRadius:99,background:i<=stepIdx?"#6366f1":"#e2e8f0",transition:"background 0.3s" }} />
        ))}
      </div>

      {/* LIBRARY */}
      {step==="library" && (
        <div style={{ animation:"slideUp 0.25s ease" }}>
          <div style={{ fontSize:17,fontWeight:800,color:"#1e293b",marginBottom:4 }}>Select Library</div>
          <div style={{ fontSize:13,color:"#94a3b8",marginBottom:16 }}>Which library is this receipt for?</div>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            {LIBRARIES.map(lib=>(
              <button key={lib.code} onClick={()=>{setLibrary(lib.code);if(lib.code!=="YAL")setStep("type");}}
                style={{ display:"flex",alignItems:"center",gap:14,padding:"16px",borderRadius:14,border:`2px solid ${library===lib.code?"#6366f1":"#e2e8f0"}`,background:library===lib.code?"#eff6ff":"#fff",cursor:"pointer",textAlign:"left",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s" }}>
                <span style={{ fontSize:28 }}>{lib.emoji}</span>
                <div>
                  <div style={{ fontWeight:700,fontSize:15,color:library===lib.code?"#4f46e5":"#1e293b" }}>{lib.display}</div>
                  <div style={{ fontSize:12,color:"#94a3b8",marginTop:1 }}>{lib.code}</div>
                </div>
                {library===lib.code && <span style={{ marginLeft:"auto",color:"#6366f1",fontSize:18 }}>✓</span>}
              </button>
            ))}
          </div>
          {library==="YAL" && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:10 }}>Select Branch</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                {YAL_BRANCHES.map(b=>(
                  <button key={b} onClick={()=>{setYalBranch(b);setStep("type");}}
                    style={{ padding:"18px",borderRadius:14,border:`2px solid ${yalBranch===b?"#6366f1":"#e2e8f0"}`,background:yalBranch===b?"#eff6ff":"#fff",fontWeight:800,fontSize:17,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",color:yalBranch===b?"#4f46e5":"#1e293b",transition:"all 0.15s" }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TYPE */}
      {step==="type" && (
        <div style={{ animation:"slideUp 0.25s ease" }}>
          <button onClick={()=>setStep("library")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:20 }}>
            <span style={{ fontSize:24 }}>{libData?.emoji}</span>
            <div>
              <div style={{ fontSize:16,fontWeight:800,color:"#1e293b" }}>{libData?.display}</div>
              {library==="YAL" && <div style={{ fontSize:12,color:"#6366f1",fontWeight:600 }}>{yalBranch}</div>}
            </div>
          </div>
          <div style={{ fontSize:14,fontWeight:700,color:"#64748b",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.07em" }}>Admission Type</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            {[{t:"NEW",icon:"✨",label:"New Admission",desc:"First time student"},{t:"RENEWAL",icon:"🔄",label:"Renewal",desc:"Existing student"}].map(opt=>(
              <button key={opt.t} onClick={()=>{setEntryType(opt.t as EntryType);setStep(opt.t==="RENEWAL"?"search":"form");}}
                style={{ padding:"22px 16px",borderRadius:16,border:`2px solid ${entryType===opt.t?"#6366f1":"#e2e8f0"}`,background:entryType===opt.t?"#eff6ff":"#fff",cursor:"pointer",textAlign:"center",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s" }}>
                <div style={{ fontSize:32,marginBottom:10 }}>{opt.icon}</div>
                <div style={{ fontWeight:700,fontSize:14,color:entryType===opt.t?"#4f46e5":"#1e293b" }}>{opt.label}</div>
                <div style={{ fontSize:11,color:"#94a3b8",marginTop:4 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SEARCH */}
      {step==="search" && (
        <div style={{ animation:"slideUp 0.25s ease" }}>
          <button onClick={()=>setStep("type")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
          <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:4 }}>Search Student</div>
          <div style={{ fontSize:13,color:"#94a3b8",marginBottom:14 }}>Search by name, phone (any format), or student ID</div>
          <div style={{ display:"flex",gap:8,marginBottom:12 }}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()}
              placeholder="Name / Phone / Student ID" style={{ ...inp,flex:1 }} />
            <button onClick={doSearch} style={{ padding:"11px 18px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>
              {searching?"...":"Search"}
            </button>
          </div>
          {searchResults.map((st,i)=>(
            <div key={i} onClick={()=>pickStudent(st)}
              style={{ ...card,cursor:"pointer",border:`1.5px solid ${toU(st.library)!==toU(library)?"#a78bfa33":"#e2e8f0"}`,marginBottom:8 }}>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <div style={{ width:40,height:40,borderRadius:10,background:st.is_past?"linear-gradient(135deg,#f59e0b,#d97706)":"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>
                  {st.is_past?"📁":"👤"}
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{st.name}</div>
                  <div style={{ fontSize:12,color:"#64748b",marginTop:2 }}>{st.student_id} · {st.phone}</div>
                  <div style={{ display:"flex",gap:4,marginTop:4,flexWrap:"wrap" }}>
                    {st.is_past && <Badge text="PAST" color="#f59e0b" />}
                    {toU(st.library)!==toU(library) && <Badge text="CROSS-LIBRARY" color="#8b5cf6" />}
                    <Badge text={st.library} color="#6366f1" />
                  </div>
                </div>
                <span style={{ color:"#cbd5e1",fontSize:18 }}>→</span>
              </div>
            </div>
          ))}
          {searchQ.length>=2 && !searching && searchResults.length===0 && (
            <div style={{ textAlign:"center",padding:"32px 0",color:"#94a3b8" }}>
              <div style={{ fontSize:36,marginBottom:8 }}>🔍</div>
              <div style={{ fontSize:14,marginBottom:12 }}>No students found.</div>
              <button onClick={()=>{setEntryType("NEW");setStep("form");}} style={{ ...ghostBtn,color:"#6366f1",borderColor:"#6366f1" }}>
                Create as New Admission →
              </button>
            </div>
          )}
          <div style={{ marginTop:12,paddingTop:12,borderTop:"1px solid #f1f5f9" }}>
            <button onClick={()=>{setStep("form");setEntryType("RENEWAL");}} style={{ ...ghostBtn,width:"100%",fontSize:13 }}>
              Skip Search — Fill Manually
            </button>
          </div>
        </div>
      )}

      {/* FORM */}
      {step==="form" && (
        <div style={{ animation:"slideUp 0.25s ease" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
            <button onClick={()=>setStep(entryType==="RENEWAL"?"search":"type")} style={{ ...ghostBtn }}>← Back</button>
            <div style={{ display:"flex",gap:6 }}>
              <Badge text={entryType==="NEW"?"NEW":"RENEWAL"} color={entryType==="NEW"?"#10b981":"#6366f1"} />
              <Badge text={libData?.code||""} color="#64748b" />
              {isCrossLib && <Badge text="CROSS" color="#f59e0b" />}
            </div>
          </div>

          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            {/* Student Details */}
            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>👤 Student Details</div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <Field label="Full Name" required>
                  <input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value.toUpperCase()}))} placeholder="FULL NAME" style={inp} />
                </Field>
                <Field label="WhatsApp Number" required>
                  <input value={f.phone}
                    onChange={e=>setF(p=>({...p,phone:normalizePhone(e.target.value)}))}
                    placeholder="Any format: +91 77426 14128 or 7742614128"
                    style={inp} inputMode="numeric" />
                </Field>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                  <Field label="Student ID">
                    <input value={f.manualStudentId||f.studentId} onChange={e=>setF(p=>({...p,manualStudentId:e.target.value.toUpperCase()}))} placeholder="Auto" style={{ ...inp,fontSize:13 }} />
                  </Field>
                  <Field label="Seat No.">
                    <input value={f.seatNo} onChange={e=>setF(p=>({...p,seatNo:e.target.value.toUpperCase()}))} placeholder="Seat" style={{ ...inp,fontSize:13 }} />
                  </Field>
                </div>
              </div>
            </div>

            {/* Shift — with editable name & time */}
            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>⏰ Shift <span style={{ color:"#f43f5e" }}>*</span></div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:12 }}>
                {activeShifts.map(sh=>{
                  const shFee = sh.fees[feeKey]||0;
                  const isActive = f.shift===sh.shift_key;
                  return (
                    <button key={sh.shift_key} onClick={()=>setF(p=>({...p,shift:sh.shift_key}))}
                      style={{ flex:1,minWidth:90,padding:"12px 8px",borderRadius:12,border:`2px solid ${isActive?"#6366f1":"#e2e8f0"}`,background:isActive?"#eff6ff":"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textAlign:"center",transition:"all 0.15s" }}>
                      <div style={{ fontWeight:700,fontSize:13,color:isActive?"#4f46e5":"#1e293b" }}>{sh.shift_name}</div>
                      <div style={{ fontSize:10,color:"#94a3b8",marginTop:2 }}>{sh.shift_time}</div>
                      <div style={{ fontSize:12,fontWeight:700,color:isActive?"#6366f1":"#64748b",marginTop:4 }}>₹{shFee}</div>
                    </button>
                  );
                })}
              </div>
              {/* Editable shift name & time for this receipt */}
              {f.shift && (
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:10,borderTop:"1px solid #f1f5f9" }}>
                  <Field label="Shift Name (editable)">
                    <input value={f.customShiftName} onChange={e=>setF(p=>({...p,customShiftName:e.target.value.toUpperCase()}))} placeholder="e.g. MORNING" style={{ ...inp,fontSize:13 }} />
                  </Field>
                  <Field label="Time Period (editable)">
                    <input value={f.customShiftTime} onChange={e=>setF(p=>({...p,customShiftTime:e.target.value.toUpperCase()}))} placeholder="e.g. 7AM TO 2PM" style={{ ...inp,fontSize:13 }} />
                  </Field>
                </div>
              )}
            </div>

            {/* Booking Period */}
            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>📅 Booking Period <span style={{ color:"#f43f5e" }}>*</span></div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                  <Field label="From">
                    <input type="date" value={dmyToISO(f.bookingFrom)} onChange={e=>setF(p=>({...p,bookingFrom:isoToDMY(e.target.value)}))} style={{ ...inp,fontSize:13 }} />
                  </Field>
                  <Field label="To">
                    <input type="date" value={dmyToISO(f.bookingTo)} onChange={e=>setF(p=>({...p,bookingTo:isoToDMY(e.target.value)}))} style={{ ...inp,fontSize:13 }} />
                  </Field>
                </div>
                <Field label="Receipt Date">
                  <input type="date" value={dmyToISO(f.receiptDate)} onChange={e=>setF(p=>({...p,receiptDate:isoToDMY(e.target.value)}))} style={inp} />
                </Field>
              </div>
            </div>

            {/* Fees */}
            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>💰 Fees <span style={{ color:"#f43f5e" }}>*</span></div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <Field label="Total Fee (₹)">
                  <input type="number" value={f.fee} onChange={e=>setF(p=>({...p,fee:e.target.value}))} placeholder="0" style={{ ...inp,fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700 }} />
                </Field>
                {!multiPay ? (
                  <div style={{ display:"flex",gap:8 }}>
                    <div style={{ flex:2 }}>
                      <Field label="Payment Mode">
                        <select value={f.payMode1} onChange={e=>setF(p=>({...p,payMode1:e.target.value}))} style={selS}>
                          <option value="">Select mode</option>
                          {(activeTags as string[]).map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </Field>
                    </div>
                    <button onClick={()=>setMultiPay(true)}
                      style={{ marginTop:22,padding:"11px 14px",borderRadius:12,border:"1.5px dashed #6366f1",background:"#eff6ff",color:"#6366f1",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>
                      + Split Pay
                    </button>
                  </div>
                ) : (
                  <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                      <span style={{ fontSize:12,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em" }}>Split Payments</span>
                      <button onClick={()=>{setMultiPay(false);setF(p=>({...p,payAmount1:"",payAmount2:"",payAmount3:"",payMode2:"",payMode3:"",feesDue:"0"}));}}
                        style={{ fontSize:11,color:"#ef4444",background:"none",border:"none",cursor:"pointer",fontWeight:600 }}>Remove Split</button>
                    </div>
                    {([[f.payMode1,f.payAmount1,"payMode1","payAmount1"],[f.payMode2,f.payAmount2,"payMode2","payAmount2"],[f.payMode3,f.payAmount3,"payMode3","payAmount3"]] as [string,string,string,string][]).map(([mode,amt,mKey,aKey],i)=>(
                      <div key={i} style={{ display:"flex",gap:8 }}>
                        <select value={mode} onChange={e=>setF(p=>({...p,[mKey]:e.target.value}))} style={{ ...selS,flex:2,fontSize:13 }}>
                          <option value="">Mode {i+1}</option>
                          {(activeTags as string[]).map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                        <input type="number" value={amt} onChange={e=>setF(p=>({...p,[aKey]:e.target.value}))} placeholder="₹" style={{ ...inp,flex:1,fontSize:13,fontFamily:"'DM Mono',monospace" }} />
                      </div>
                    ))}
                    <div style={{ background:"#f8fafc",borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",fontSize:13 }}>
                      <span style={{ color:"#64748b" }}>Total Paid</span>
                      <span style={{ fontWeight:700 }}>₹{(Number(f.payAmount1)||0)+(Number(f.payAmount2)||0)+(Number(f.payAmount3)||0)}</span>
                    </div>
                    <Field label="Fees Due (₹)">
                      <input type="number" value={f.feesDue} onChange={e=>setF(p=>({...p,feesDue:e.target.value}))} style={{ ...inp,fontFamily:"'DM Mono',monospace",color:Number(f.feesDue)>0?"#ef4444":"#1e293b" }} />
                    </Field>
                  </div>
                )}
              </div>
            </div>

            {/* Optional — New only */}
            {entryType==="NEW" && (
              <div style={card}>
                <button onClick={()=>setShowOptional(s=>!s)} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"'DM Sans',sans-serif" }}>
                  <div style={{ fontSize:13,fontWeight:700,color:"#1e293b" }}>📋 Additional Details <span style={{ fontSize:11,color:"#94a3b8",fontWeight:500 }}>(Optional)</span></div>
                  <span style={{ color:"#94a3b8",fontSize:16 }}>{showOptional?"▲":"▼"}</span>
                </button>
                {showOptional && (
                  <div style={{ display:"flex",flexDirection:"column",gap:10,marginTop:12 }}>
                    <Field label="Current Address"><input value={f.address} onChange={e=>setF(p=>({...p,address:e.target.value.toUpperCase()}))} placeholder="ADDRESS" style={inp} /></Field>
                    <Field label="Preparing For"><input value={f.preparingFor} onChange={e=>setF(p=>({...p,preparingFor:e.target.value.toUpperCase()}))} placeholder="EXAM / COURSE" style={inp} /></Field>
                    <Field label="Aadhaar Last 4 Digits"><input value={f.aadhaarLast4} onChange={e=>setF(p=>({...p,aadhaarLast4:e.target.value.slice(0,4)}))} placeholder="XXXX" maxLength={4} style={inp} inputMode="numeric" /></Field>
                    <Field label="Date of Birth"><input type="date" value={dmyToISO(f.dob)} onChange={e=>setF(p=>({...p,dob:isoToDMY(e.target.value)}))} style={inp} /></Field>
                  </div>
                )}
              </div>
            )}

            {/* Advanced */}
            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:10 }}>🔧 Advanced (Optional)</div>
              <Field label="Manual Receipt No. (leave blank for auto)">
                <input value={f.manualReceiptNo} onChange={e=>setF(p=>({...p,manualReceiptNo:e.target.value.toUpperCase()}))} placeholder="e.g. R1587" style={inp} />
              </Field>
            </div>

            <button onClick={submit} style={primaryBtn}>Generate Receipt →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STUDENTS TAB
// ═══════════════════════════════════════════════════════════════════
function StudentsTab({ showToast, showConfirm, startLoading, stopLoading, shifts, activeTags, isSubmitting }: any) {
  const [view, setView]       = useState<"list"|"add"|"addPast"|"edit">("list");
  const [searchQ, setSearchQ] = useState("");
  const [filterLib, setFilterLib] = useState("");
  const [students, setStudents]   = useState<Student[]>([]);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal]         = useState(0);
  const [searched, setSearched]   = useState(false);
  const [editSt, setEditSt]       = useState<Student|null>(null);
  const emptyForm = { library:"",yal_branch:"",name:"",phone:"",seat_no:"",shift:"",payment_tag:"",address:"",preparing_for:"",aadhaar_last4:"",date_of_birth:"" };
  const emptyPast = { student_id:"",library:"",yal_branch:"",name:"",phone:"",seat_no:"",shift:"",payment_tag:"",last_receipt_no:"" };
  const [form, setForm]     = useState<any>(emptyForm);
  const [pastForm, setPastForm] = useState<any>(emptyPast);

  async function loadAll(pg=1) {
    startLoading("Loading students...");
    try {
      const params = new URLSearchParams({action:"getAllStudents",library:filterLib,page:String(pg),limit:"20"});
      const res = await fetch(`${API}?${params}`);
      const d   = await res.json();
      if (d.ok) { setStudents(d.students||[]); setPage(d.page); setTotalPages(d.totalPages); setTotal(d.total); setSearched(true); }
    } catch { showToast("Failed to load students.","error"); }
    stopLoading();
  }

  async function doSearch(pg=1) {
    if (!searchQ.trim()) { loadAll(pg); return; }
    startLoading("Searching...");
    try {
      const q   = normalizePhone(searchQ)||searchQ;
      const params = new URLSearchParams({action:"searchStudents",q,library:filterLib});
      const res = await fetch(`${API}?${params}`);
      const d   = await res.json();
      if (d.ok) { setStudents(d.results||[]); setPage(1); setTotalPages(1); setTotal(d.results?.length||0); setSearched(true); }
    } catch { showToast("Search failed.","error"); }
    stopLoading();
  }

  useEffect(() => { loadAll(1); }, [filterLib]);

  async function deleteStudent(st: Student) {
    showConfirm(`Delete ${st.name} (${st.student_id})? This cannot be undone.`, async () => {
      startLoading("Deleting...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"deleteStudent",payload:{student_id:st.student_id}})});
        const d   = await res.json();
        if (d.ok) { showToast("Student deleted."); loadAll(page); }
        else showToast(d.error||"Delete failed.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading();
    });
  }

  async function saveEdit() {
    if (!editSt||isSubmitting.current) return;
    isSubmitting.current = true;
    startLoading("Saving...");
    try {
      const payload = { ...editSt, phone: normalizePhone(editSt.phone) };
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateStudent",payload})});
      const d   = await res.json();
      if (d.ok) { showToast("Student updated!"); setView("list"); loadAll(page); }
      else showToast(d.error||"Update failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading(); isSubmitting.current = false;
  }

  async function addStudent() {
    if (!form.library||!form.name||!form.phone) { showToast("Library, Name, and Phone are required.","error"); return; }
    if (isSubmitting.current) return; isSubmitting.current = true;
    startLoading("Adding student...");
    try {
      const payload = { ...form, phone: normalizePhone(form.phone), name: toU(form.name) };
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addStudent",payload})});
      const d   = await res.json();
      if (d.ok) { showToast("Student added!"); setView("list"); setForm(emptyForm); loadAll(1); }
      else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading(); isSubmitting.current = false;
  }

  async function addPastStudent() {
    if (!pastForm.student_id||!pastForm.library||!pastForm.name||!pastForm.phone) { showToast("ID, Library, Name, Phone required.","error"); return; }
    if (isSubmitting.current) return; isSubmitting.current = true;
    startLoading("Adding past student...");
    try {
      const payload = { ...pastForm, phone: normalizePhone(pastForm.phone), name: toU(pastForm.name) };
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addPastStudent",payload})});
      const d   = await res.json();
      if (d.ok) { showToast("Past student added!"); setView("list"); setPastForm(emptyPast); loadAll(1); }
      else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading(); isSubmitting.current = false;
  }

  function FormRow({ label, field, data, setData, isSelect=false, options=[], isPhone=false }: any) {
    return (
      <Field label={label}>
        {isSelect ? (
          <select value={data[field]||""} onChange={e=>setData((p:any)=>({...p,[field]:e.target.value}))} style={selS}>
            <option value="">Select</option>
            {options.map((o:any)=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
          </select>
        ) : (
          <input value={data[field]||""}
            onChange={e=>setData((p:any)=>({...p,[field]:isPhone?normalizePhone(e.target.value):e.target.value.toUpperCase()}))}
            style={inp} inputMode={isPhone?"numeric":undefined} />
        )}
      </Field>
    );
  }

  const libOptions = LIBRARIES.map(l=>({value:l.code,label:l.display}));
  const shiftOptions = (shifts as Shift[]).filter((s:Shift)=>s.active).map((s:Shift)=>({value:s.shift_key,label:s.shift_name}));

  if (view==="add") return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <button onClick={()=>setView("list")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
      <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:16 }}>Add New Student</div>
      <div style={card}>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          <FormRow label="Library *" field="library" data={form} setData={setForm} isSelect options={libOptions} />
          {form.library==="YAL" && <FormRow label="YAL Branch" field="yal_branch" data={form} setData={setForm} isSelect options={YAL_BRANCHES} />}
          <FormRow label="Name *" field="name" data={form} setData={setForm} />
          <FormRow label="Phone *" field="phone" data={form} setData={setForm} isPhone />
          <FormRow label="Seat No." field="seat_no" data={form} setData={setForm} />
          <FormRow label="Shift" field="shift" data={form} setData={setForm} isSelect options={shiftOptions} />
          <FormRow label="Payment Tag" field="payment_tag" data={form} setData={setForm} isSelect options={(activeTags as string[])} />
          <FormRow label="Address" field="address" data={form} setData={setForm} />
          <FormRow label="Preparing For" field="preparing_for" data={form} setData={setForm} />
          <FormRow label="Aadhaar Last 4" field="aadhaar_last4" data={form} setData={setForm} />
          <Field label="Date of Birth"><input type="date" value={dmyToISO(form.date_of_birth||"")} onChange={e=>setForm((p:any)=>({...p,date_of_birth:isoToDMY(e.target.value)}))} style={inp} /></Field>
        </div>
      </div>
      <button onClick={addStudent} style={{ ...primaryBtn,marginTop:4 }}>Add Student</button>
    </div>
  );

  if (view==="addPast") return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <button onClick={()=>setView("list")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
      <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:8 }}>Add Past Student</div>
      <div style={{ background:"#fffbeb",borderRadius:12,padding:"10px 14px",fontSize:13,color:"#92400e",marginBottom:12,border:"1px solid #fcd34d" }}>Enter original Student ID and last Receipt No. from existing records.</div>
      <div style={card}>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          <FormRow label="Student ID *" field="student_id" data={pastForm} setData={setPastForm} />
          <FormRow label="Library *" field="library" data={pastForm} setData={setPastForm} isSelect options={libOptions} />
          {pastForm.library==="YAL" && <FormRow label="YAL Branch" field="yal_branch" data={pastForm} setData={setPastForm} isSelect options={YAL_BRANCHES} />}
          <FormRow label="Name *" field="name" data={pastForm} setData={setPastForm} />
          <FormRow label="Phone *" field="phone" data={pastForm} setData={setPastForm} isPhone />
          <FormRow label="Seat No." field="seat_no" data={pastForm} setData={setPastForm} />
          <FormRow label="Shift" field="shift" data={pastForm} setData={setPastForm} isSelect options={shiftOptions} />
          <FormRow label="Payment Tag" field="payment_tag" data={pastForm} setData={setPastForm} isSelect options={(activeTags as string[])} />
          <FormRow label="Last Receipt No." field="last_receipt_no" data={pastForm} setData={setPastForm} />
        </div>
      </div>
      <button onClick={addPastStudent} style={{ ...primaryBtn,marginTop:4 }}>Add Past Student</button>
    </div>
  );

  if (view==="edit" && editSt) return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <button onClick={()=>setView("list")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
      <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:16 }}>Edit: {editSt.student_id}</div>
      <div style={card}>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {(["name","phone","seat_no","shift","payment_tag","yal_branch","library","address","preparing_for","aadhaar_last4","date_of_birth"] as (keyof Student)[]).map(key=>(
            key==="shift" ? (
              <Field key={key} label={String(key).replace(/_/g," ").toUpperCase()}>
                <select value={String(editSt[key]||"")} onChange={e=>setEditSt(s=>s?{...s,[key]:e.target.value}:s)} style={selS}>
                  <option value="">Select</option>
                  {(shifts as Shift[]).filter((s:Shift)=>s.active).map((s:Shift)=><option key={s.shift_key} value={s.shift_key}>{s.shift_name}</option>)}
                </select>
              </Field>
            ) : key==="library" ? (
              <Field key={key} label="LIBRARY">
                <select value={String(editSt[key]||"")} onChange={e=>setEditSt(s=>s?{...s,[key]:e.target.value}:s)} style={selS}>
                  {LIBRARIES.map(l=><option key={l.code} value={l.code}>{l.display}</option>)}
                </select>
              </Field>
            ) : key==="phone" ? (
              <Field key={key} label="PHONE">
                <input value={String(editSt[key]||"")} onChange={e=>setEditSt(s=>s?{...s,[key]:normalizePhone(e.target.value)}:s)} style={inp} inputMode="numeric" />
              </Field>
            ) : (
              <Field key={key} label={String(key).replace(/_/g," ").toUpperCase()}>
                <input value={String(editSt[key]||"")} onChange={e=>setEditSt(s=>s?{...s,[key]:e.target.value.toUpperCase()}:s)} style={inp} />
              </Field>
            )
          ))}
        </div>
      </div>
      <button onClick={saveEdit} style={{ ...primaryBtn,marginTop:4 }}>Save Changes</button>
    </div>
  );

  return (
    <div>
      <div style={{ display:"flex",gap:8,marginBottom:14 }}>
        <button onClick={()=>setView("add")} style={{ flex:1,padding:"11px",borderRadius:12,border:"2px dashed #6366f1",background:"#eff6ff",color:"#4f46e5",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>+ New Student</button>
        <button onClick={()=>setView("addPast")} style={{ flex:1,padding:"11px",borderRadius:12,border:"2px dashed #f59e0b",background:"#fffbeb",color:"#d97706",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>+ Past Student</button>
      </div>
      <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4,marginBottom:12 }}>
        <Pill text="All" active={filterLib===""} onClick={()=>setFilterLib("")} />
        {LIBRARIES.map(l=><Pill key={l.code} text={l.code} active={filterLib===l.code} onClick={()=>setFilterLib(l.code)} />)}
      </div>
      <div style={{ display:"flex",gap:8,marginBottom:14 }}>
        <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch(1)} placeholder="Name / Phone (any format) / ID" style={{ ...inp,flex:1 }} />
        <button onClick={()=>doSearch(1)} style={{ padding:"11px 16px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Go</button>
      </div>
      {searched && <div style={{ fontSize:12,color:"#94a3b8",marginBottom:10 }}>{total} students{filterLib&&` in ${filterLib}`}</div>}
      {students.map((st,i)=>(
        <StudentCard key={i} st={st}
          onEdit={st.is_past?undefined:()=>{setEditSt(st);setView("edit");}}
          onDelete={st.is_past?undefined:()=>deleteStudent(st)} />
      ))}
      {students.length===0 && searched && (
        <div style={{ textAlign:"center",padding:"40px 0",color:"#94a3b8" }}>
          <div style={{ fontSize:36,marginBottom:8 }}>👥</div>
          <div style={{ fontSize:14 }}>No students found.</div>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onChange={p=>loadAll(p)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BOARD TAB
// ═══════════════════════════════════════════════════════════════════
function BoardTab({ showToast, showConfirm, startLoading, stopLoading }: any) {
  const [view, setView]   = useState<"pending"|"history">("pending");
  const [pending, setPending] = useState<ReceiptEntry[]>([]);
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [filterLib, setFilterLib] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [page, setPage]   = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loaded, setLoaded] = useState(false);

  async function loadPending() {
    startLoading("Loading board...");
    try {
      const res = await fetch(`${API}?action=getPendingBoard&library=${filterLib}`);
      const d   = await res.json();
      if (d.ok) { setPending(d.pending||[]); setLoaded(true); }
    } catch { showToast("Failed to load.","error"); }
    stopLoading();
  }

  async function loadHistory(pg=1) {
    startLoading("Loading receipts...");
    try {
      const params = new URLSearchParams({action:"getReceiptLog",library:filterLib,q:normalizePhone(searchQ)||searchQ,page:String(pg),limit:"20"});
      const res = await fetch(`${API}?${params}`);
      const d   = await res.json();
      if (d.ok) { setReceipts(d.receipts||[]); setPage(d.page); setTotalPages(d.totalPages); }
    } catch { showToast("Failed.","error"); }
    stopLoading();
  }

  useEffect(() => { view==="pending"?loadPending():loadHistory(1); }, [filterLib, view]);

  async function markUpdated(receiptNo: string) {
    showConfirm(`Mark ${receiptNo} as updated to whiteboard?`, async () => {
      startLoading("Updating...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"markBoardUpdated",payload:{receipt_no:receiptNo}})});
        const d   = await res.json();
        if (d.ok) { showToast("Marked as updated!"); loadPending(); }
        else showToast(d.error||"Failed.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading();
    });
  }

  return (
    <div>
      <div style={{ display:"flex",gap:8,marginBottom:14 }}>
        <Pill text={`📋 Pending (${pending.length})`} active={view==="pending"} onClick={()=>setView("pending")} />
        <Pill text="📜 Receipt History" active={view==="history"} onClick={()=>setView("history")} />
      </div>
      <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4,marginBottom:12 }}>
        <Pill text="All" active={filterLib===""} onClick={()=>setFilterLib("")} />
        {LIBRARIES.map(l=><Pill key={l.code} text={l.code} active={filterLib===l.code} onClick={()=>setFilterLib(l.code)} />)}
      </div>

      {view==="pending" && (
        <>
          {loaded && pending.length===0 && (
            <div style={{ textAlign:"center",padding:"48px 0",color:"#94a3b8" }}>
              <div style={{ fontSize:48,marginBottom:10 }}>✅</div>
              <div style={{ fontSize:16,fontWeight:700,color:"#1e293b",marginBottom:4 }}>All Clear!</div>
              <div style={{ fontSize:13 }}>All receipts updated to whiteboard.</div>
            </div>
          )}
          {pending.map((entry,i)=>(
            <div key={i} style={{ ...card,marginBottom:10 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
                <div>
                  <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700,fontSize:15,color:"#1e293b" }}>{entry.name}</span>
                    <Badge text={entry.type} color={entry.type==="NEW"?"#10b981":"#6366f1"} />
                    {entry.is_cross_library==="YES" && <Badge text="CROSS" color="#f59e0b" />}
                  </div>
                  <div style={{ fontSize:12,color:"#64748b",marginTop:3 }}>{entry.receipt_no} · {entry.student_id}</div>
                  <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{entry.library}{entry.yal_branch?` (${entry.yal_branch})`:""} · Seat {entry.seat_no}</div>
                  <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{fmtDate(entry.booking_from)} → {fmtDate(entry.booking_to)}</div>
                  <div style={{ fontSize:11,color:"#cbd5e1",marginTop:3 }}>{entry.generated_at}</div>
                </div>
              </div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {entry.registration_text && <CopyBtn text={entry.registration_text} label="Group Copy" />}
                {entry.receipt_text && <CopyBtn text={entry.receipt_text} label="Receipt" accent="#10b981" />}
                <CopyBtn text={`${entry.name} ${entry.library} ${entry.student_id}`} label="Contact" accent="#f59e0b" />
                <button onClick={()=>markUpdated(entry.receipt_no)}
                  style={{ padding:"11px 14px",borderRadius:12,border:"none",background:"#1e293b",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",flex:1 }}>
                  ✓ Mark Updated
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {view==="history" && (
        <>
          <div style={{ display:"flex",gap:8,marginBottom:12 }}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loadHistory(1)} placeholder="Receipt / Student / Name / Phone" style={{ ...inp,flex:1 }} />
            <button onClick={()=>loadHistory(1)} style={{ padding:"11px 16px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Go</button>
          </div>
          {receipts.map((r,i)=><ReceiptCard key={i} r={r} />)}
          {receipts.length===0 && <div style={{ textAlign:"center",padding:"40px 0",color:"#94a3b8" }}><div style={{ fontSize:36,marginBottom:8 }}>📜</div><div style={{ fontSize:14 }}>No receipts found.</div></div>}
          <Pagination page={page} totalPages={totalPages} onChange={pg=>loadHistory(pg)} />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DUES TAB — Fee Due Management
// ═══════════════════════════════════════════════════════════════════
function DuesTab({ showToast, showConfirm, startLoading, stopLoading, activeTags, isSubmitting }: any) {
  const [pending, setPending]     = useState<ReceiptEntry[]>([]);
  const [filterLib, setFilterLib] = useState("");
  const [loaded, setLoaded]       = useState(false);
  const [expanded, setExpanded]   = useState<string|null>(null);
  const [payments, setPayments]   = useState<Record<string,DuePayment[]>>({});
  const [payForm, setPayForm]     = useState<Record<string,{mode:string;amount:string;notes:string}>>({});
  const [resultText, setResultText] = useState<{receiptNo:string;text:string}|null>(null);

  async function load() {
    startLoading("Loading dues...");
    try {
      const res = await fetch(`${API}?action=getPendingDues&library=${filterLib}`);
      const d   = await res.json();
      if (d.ok) { setPending(d.pending||[]); setLoaded(true); }
    } catch { showToast("Failed to load.","error"); }
    stopLoading();
  }

  useEffect(() => { load(); }, [filterLib]);

  async function loadPayments(receiptNo: string) {
    try {
      const res = await fetch(`${API}?action=getDuePayments&receipt_no=${encodeURIComponent(receiptNo)}`);
      const d   = await res.json();
      if (d.ok) setPayments(p=>({...p,[receiptNo]:d.payments||[]}));
    } catch {}
  }

  function toggleExpand(receiptNo: string) {
    if (expanded===receiptNo) { setExpanded(null); return; }
    setExpanded(receiptNo);
    loadPayments(receiptNo);
    if (!payForm[receiptNo]) setPayForm(f=>({...f,[receiptNo]:{mode:"",amount:"",notes:""}}));
  }

  async function submitPayment(entry: ReceiptEntry) {
    const pf = payForm[entry.receipt_no];
    if (!pf?.mode)   { showToast("Payment mode is required.","error"); return; }
    if (!pf?.amount) { showToast("Amount is required.","error"); return; }
    const amt = Number(pf.amount);
    if (amt<=0) { showToast("Amount must be greater than 0.","error"); return; }
    if (amt>(entry.fees_due_balance||0)) { showToast(`Amount exceeds outstanding balance of ₹${entry.fees_due_balance}.`,"error"); return; }

    showConfirm(`Record ₹${amt} received from ${entry.name} via ${pf.mode}?`, async () => {
      if (isSubmitting.current) return;
      isSubmitting.current = true;
      startLoading("Recording payment...");
      try {
        const payload = { receipt_no:entry.receipt_no, payment_mode:toU(pf.mode), amount_received:amt, notes:toU(pf.notes||"") };
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logFeePayment",payload})});
        const d   = await res.json();
        if (d.ok) {
          showToast("Payment recorded!");
          setResultText({receiptNo:entry.receipt_no,text:d.whatsapp_text});
          setPayForm(f=>({...f,[entry.receipt_no]:{mode:"",amount:"",notes:""}}));
          load();
          loadPayments(entry.receipt_no);
        } else showToast(d.error||"Failed to record payment.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading(); isSubmitting.current = false;
    });
  }

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div>
          <div style={{ fontSize:16,fontWeight:800,color:"#1e293b" }}>Fee Dues</div>
          <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{pending.length} receipts with outstanding balance</div>
        </div>
      </div>

      <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4,marginBottom:12 }}>
        <Pill text="All" active={filterLib===""} onClick={()=>setFilterLib("")} />
        {LIBRARIES.map(l=><Pill key={l.code} text={l.code} active={filterLib===l.code} onClick={()=>setFilterLib(l.code)} />)}
      </div>

      {/* WhatsApp result after payment */}
      {resultText && (
        <div style={{ ...card,background:"#ecfdf5",border:"1.5px solid #86efac",marginBottom:14 }}>
          <div style={{ fontSize:13,fontWeight:700,color:"#059669",marginBottom:10 }}>✓ Payment Recorded — {resultText.receiptNo}</div>
          <div style={{ display:"flex",gap:8,marginBottom:10 }}>
            <CopyBtn text={resultText.text} label="Copy WhatsApp Update" accent="#10b981" />
          </div>
          <pre style={{ fontSize:11,color:"#374151",whiteSpace:"pre-wrap",fontFamily:"'DM Mono',monospace",lineHeight:1.6,background:"#f0fdf4",borderRadius:8,padding:10,margin:0 }}>{resultText.text}</pre>
          <button onClick={()=>setResultText(null)} style={{ ...ghostBtn,marginTop:10,width:"100%",fontSize:13 }}>Dismiss</button>
        </div>
      )}

      {loaded && pending.length===0 && (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#94a3b8" }}>
          <div style={{ fontSize:48,marginBottom:10 }}>💰</div>
          <div style={{ fontSize:16,fontWeight:700,color:"#1e293b",marginBottom:4 }}>No Outstanding Dues!</div>
          <div style={{ fontSize:13 }}>All fee dues have been cleared.</div>
        </div>
      )}

      {pending.map((entry,i)=>{
        const isOpen = expanded===entry.receipt_no;
        const pf     = payForm[entry.receipt_no]||{mode:"",amount:"",notes:""};
        const entryPayments = payments[entry.receipt_no]||[];

        return (
          <div key={i} style={{ ...card,marginBottom:10,overflow:"hidden" }}>
            <div onClick={()=>toggleExpand(entry.receipt_no)} style={{ cursor:"pointer" }}>
              <div style={{ display:"flex",alignItems:"flex-start",gap:10 }}>
                <div style={{ width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#ef4444,#dc2626)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  <span style={{ fontSize:20 }}>💸</span>
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{entry.name}</span>
                    <Badge text={`DUE ₹${entry.fees_due_balance}`} color="#ef4444" />
                  </div>
                  <div style={{ fontSize:12,color:"#64748b",marginTop:3 }}>{entry.receipt_no} · {entry.student_id}</div>
                  <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{entry.library}{entry.yal_branch?` (${entry.yal_branch})`:""} · ₹{entry.fee} total</div>
                  <div style={{ fontSize:11,color:"#cbd5e1",marginTop:2 }}>{entry.generated_at}</div>
                </div>
                <span style={{ color:"#cbd5e1",fontSize:18,marginTop:2 }}>{isOpen?"▲":"▼"}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop:14,paddingTop:14,borderTop:"1px solid #f1f5f9" }}>
                {/* Payment history */}
                {entryPayments.length>0 && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8 }}>Payment History</div>
                    {entryPayments.map((pay,j)=>(
                      <div key={j} style={{ background:"#f8fafc",borderRadius:10,padding:"10px 12px",marginBottom:6 }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                          <div>
                            <span style={{ fontWeight:700,fontSize:13,color:"#1e293b" }}>₹{pay.amount_received}</span>
                            <span style={{ fontSize:12,color:"#64748b",marginLeft:6 }}>via {pay.payment_mode}</span>
                          </div>
                          <span style={{ fontSize:11,color:"#94a3b8" }}>Bal: ₹{pay.balance_after}</span>
                        </div>
                        <div style={{ fontSize:11,color:"#94a3b8",marginTop:4 }}>{pay.received_on}</div>
                        {pay.notes && <div style={{ fontSize:11,color:"#64748b",marginTop:2 }}>{pay.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Current balance */}
                <div style={{ background:"#fef2f2",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:13,fontWeight:700,color:"#dc2626" }}>Outstanding Balance</span>
                  <span style={{ fontSize:18,fontWeight:800,color:"#dc2626",fontFamily:"'DM Mono',monospace" }}>₹{entry.fees_due_balance}</span>
                </div>

                {/* Record payment form */}
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  <div style={{ fontSize:12,fontWeight:700,color:"#1e293b",textTransform:"uppercase",letterSpacing:"0.07em" }}>Record Payment</div>
                  <div style={{ display:"flex",gap:8 }}>
                    <select value={pf.mode} onChange={e=>setPayForm(f=>({...f,[entry.receipt_no]:{...pf,mode:e.target.value}}))} style={{ ...selS,flex:2,fontSize:13 }}>
                      <option value="">Payment Mode *</option>
                      {(activeTags as string[]).map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="number" value={pf.amount} onChange={e=>setPayForm(f=>({...f,[entry.receipt_no]:{...pf,amount:e.target.value}}))} placeholder="₹ Amount *" style={{ ...inp,flex:1,fontSize:13,fontFamily:"'DM Mono',monospace" }} />
                  </div>
                  <input value={pf.notes} onChange={e=>setPayForm(f=>({...f,[entry.receipt_no]:{...pf,notes:e.target.value.toUpperCase()}}))} placeholder="Notes (optional)" style={{ ...inp,fontSize:13 }} />
                  <button onClick={()=>submitPayment(entry)}
                    style={{ padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                    Record Payment ✓
                  </button>
                  {/* Copy original receipt */}
                  <div style={{ display:"flex",gap:8 }}>
                    {entry.receipt_text && <CopyBtn text={entry.receipt_text} label="Copy Receipt" accent="#6366f1" />}
                    <CopyBtn text={`${entry.name} ${entry.library} ${entry.student_id}`} label="Contact" accent="#f59e0b" />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PENDING OPTIONAL DATA TAB
// ═══════════════════════════════════════════════════════════════════
function PendingTab({ showToast, startLoading, stopLoading, isSubmitting }: any) {
  const [students, setStudents]   = useState<Student[]>([]);
  const [filterLib, setFilterLib] = useState("");
  const [loaded, setLoaded]       = useState(false);
  const [editing, setEditing]     = useState<Record<string,any>>({});

  async function load() {
    startLoading("Loading...");
    try {
      const res = await fetch(`${API}?action=getPendingOptional&library=${filterLib}`);
      const d   = await res.json();
      if (d.ok) { setStudents(d.students||[]); setLoaded(true); }
    } catch { showToast("Failed.","error"); }
    stopLoading();
  }

  useEffect(() => { load(); }, [filterLib]);

  async function save(studentId: string) {
    if (isSubmitting.current) return;
    const data = editing[studentId]; if (!data) return;
    isSubmitting.current = true; startLoading("Saving...");
    try {
      const payload = { student_id:studentId, ...Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v).toUpperCase()])) };
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateOptional",payload})});
      const d   = await res.json();
      if (d.ok) { showToast("Data saved!"); load(); setEditing(e=>{const ne={...e};delete ne[studentId];return ne;}); }
      else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading(); isSubmitting.current = false;
  }

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div>
          <div style={{ fontSize:16,fontWeight:800,color:"#1e293b" }}>Pending Details</div>
          <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{students.length} students with missing data</div>
        </div>
      </div>
      <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4,marginBottom:12 }}>
        <Pill text="All" active={filterLib===""} onClick={()=>setFilterLib("")} />
        {LIBRARIES.map(l=><Pill key={l.code} text={l.code} active={filterLib===l.code} onClick={()=>setFilterLib(l.code)} />)}
      </div>
      {loaded && students.length===0 && (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#94a3b8" }}>
          <div style={{ fontSize:48,marginBottom:10 }}>✅</div>
          <div style={{ fontSize:16,fontWeight:700,color:"#1e293b",marginBottom:4 }}>All Complete!</div>
          <div style={{ fontSize:13 }}>All student profiles fully filled.</div>
        </div>
      )}
      {students.map((st,i)=>{
        const isEditing = !!editing[st.student_id];
        const editData  = editing[st.student_id]||{};
        const missing: string[] = [];
        if (!st.address)       missing.push("Address");
        if (!st.preparing_for) missing.push("Preparing For");
        if (!st.aadhaar_last4) missing.push("Aadhaar Last 4");
        if (!st.date_of_birth) missing.push("Date of Birth");
        const lib = LIBRARIES.find(l=>l.code===st.library);
        return (
          <div key={i} style={{ ...card,marginBottom:8 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4 }}>
                  <span style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{st.name}</span>
                  <Badge text={st.library} color="#6366f1" />
                </div>
                <div style={{ fontSize:12,color:"#64748b" }}>{st.student_id} · {st.phone}</div>
                <div style={{ display:"flex",gap:4,flexWrap:"wrap",marginTop:6 }}>
                  {missing.map(m=><span key={m} style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99,background:"#fef3c7",color:"#92400e" }}>Missing: {m}</span>)}
                </div>
              </div>
              {!isEditing && (
                <button onClick={()=>setEditing(e=>({...e,[st.student_id]:{address:st.address||"",preparing_for:st.preparing_for||"",aadhaar_last4:st.aadhaar_last4||"",date_of_birth:st.date_of_birth||""}}))}
                  style={{ padding:"7px 14px",borderRadius:10,border:"1.5px solid #6366f1",background:"#eff6ff",color:"#4f46e5",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",flexShrink:0 }}>
                  Fill Now
                </button>
              )}
            </div>
            {isEditing && (
              <div style={{ marginTop:14,display:"flex",flexDirection:"column",gap:10 }}>
                {[["Address","address"],["Preparing For","preparing_for"],["Aadhaar Last 4","aadhaar_last4"],["Date of Birth","date_of_birth"]].map(([label,key])=>(
                  <Field key={key} label={label}>
                    <input value={editData[key]||""} onChange={e=>setEditing(ed=>({...ed,[st.student_id]:{...editData,[key]:e.target.value.toUpperCase()}}))} style={inp} />
                  </Field>
                ))}
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={()=>setEditing(ed=>{const ne={...ed};delete ne[st.student_id];return ne;})} style={{ ...ghostBtn,flex:1,fontSize:13 }}>Cancel</button>
                  <button onClick={()=>save(st.student_id)} style={{ flex:1,padding:"11px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Save</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════
function SettingsTab({ showToast, showConfirm, startLoading, stopLoading, allTags, activeTags, shifts, settings, loadInit, isSubmitting }: any) {
  const [section, setSection]   = useState<"tags"|"shifts"|"counters">("tags");
  const [newTag, setNewTag]     = useState("");
  const [editShift, setEditShift] = useState<Shift|null>(null);
  const [newShift, setNewShift] = useState({ shift_key:"",shift_name:"",shift_time:"",fee_KAL:0,fee_YAL1:0,fee_YAL2:0,fee_SL:0,fee_KL:0 });
  const [addingShift, setAddingShift] = useState(false);
  const [countersEdit, setCountersEdit] = useState<Record<string,any>>({});

  useEffect(() => {
    const ed: Record<string,any> = {};
    Object.keys(settings).forEach(lib=>{ ed[lib]={...settings[lib]}; });
    setCountersEdit(ed);
  }, [settings]);

  async function addTag() {
    if (!newTag.trim()) return;
    if (isSubmitting.current) return; isSubmitting.current = true;
    startLoading("Adding tag...");
    try {
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addPaymentTag",payload:{tag_name:newTag.toUpperCase()}})});
      const d   = await res.json();
      if (d.ok) { showToast("Tag added!"); setNewTag(""); loadInit(); }
      else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading(); isSubmitting.current = false;
  }

  async function toggleTag(tagName: string, current: boolean) {
    showConfirm(`${current?"Deactivate":"Activate"} tag "${tagName}"?`, async () => {
      startLoading("Updating...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"togglePaymentTag",payload:{tag_name:tagName,active:!current}})});
        const d   = await res.json();
        if (d.ok) { showToast(`Tag ${current?"deactivated":"activated"}!`); loadInit(); }
        else showToast(d.error||"Failed.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading();
    });
  }

  async function saveShift(s: Shift) {
    startLoading("Saving shift...");
    try {
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateShift",payload:s})});
      const d   = await res.json();
      if (d.ok) { showToast("Shift updated!"); setEditShift(null); loadInit(); }
      else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading();
  }

  async function toggleShift(sh: Shift) {
    showConfirm(`${sh.active?"Deactivate":"Activate"} "${sh.shift_name}"?`, async () => {
      startLoading("Updating...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"toggleShift",payload:{shift_key:sh.shift_key,active:!sh.active}})});
        const d   = await res.json();
        if (d.ok) { showToast(`Shift ${sh.active?"deactivated":"activated"}!`); loadInit(); }
        else showToast(d.error||"Failed.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading();
    });
  }

  async function addShiftFn() {
    if (!newShift.shift_key||!newShift.shift_name) { showToast("Shift key and name required.","error"); return; }
    startLoading("Adding shift...");
    try {
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addShift",payload:newShift})});
      const d   = await res.json();
      if (d.ok) { showToast("Shift added!"); setAddingShift(false); setNewShift({shift_key:"",shift_name:"",shift_time:"",fee_KAL:0,fee_YAL1:0,fee_YAL2:0,fee_SL:0,fee_KL:0}); loadInit(); }
      else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading();
  }

  async function saveCounters(lib: string) {
    showConfirm(`Save cutoff settings for ${lib}?`, async () => {
      startLoading("Saving...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateSettings",payload:{library:lib,...countersEdit[lib]}})});
        const d   = await res.json();
        if (d.ok) { showToast("Settings saved!"); loadInit(); }
        else showToast(d.error||"Failed.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading();
    });
  }

  return (
    <div>
      <div style={{ display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4 }}>
        <Pill text="💳 Tags" active={section==="tags"} onClick={()=>setSection("tags")} />
        <Pill text="⏰ Shifts" active={section==="shifts"} onClick={()=>setSection("shifts")} />
        <Pill text="🔢 Counters" active={section==="counters"} onClick={()=>setSection("counters")} />
      </div>

      {section==="tags" && (
        <div>
          <div style={{ fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:12 }}>Payment Tags</div>
          <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:14 }}>
            {(allTags as PaymentTag[]).map((tag,i)=>(
              <div key={i} style={{ ...card,marginBottom:0,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <span style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{tag.tag_name}</span>
                  <span style={{ fontSize:11,marginLeft:8,color:tag.active?"#10b981":"#94a3b8",fontWeight:700 }}>{tag.active?"● Active":"○ Inactive"}</span>
                  {tag.created_at && <div style={{ fontSize:10,color:"#cbd5e1",marginTop:2 }}>{tag.created_at}</div>}
                </div>
                <button onClick={()=>toggleTag(tag.tag_name,tag.active)}
                  style={{ padding:"6px 12px",borderRadius:8,border:`1.5px solid ${tag.active?"#fecaca":"#bbf7d0"}`,background:"#fff",cursor:"pointer",fontSize:12,fontWeight:700,color:tag.active?"#ef4444":"#10b981",fontFamily:"'DM Sans',sans-serif" }}>
                  {tag.active?"Deactivate":"Activate"}
                </button>
              </div>
            ))}
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <input value={newTag} onChange={e=>setNewTag(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addTag()} placeholder="NEW TAG NAME" style={{ ...inp,flex:1 }} />
            <button onClick={addTag} style={{ padding:"11px 18px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Add</button>
          </div>
        </div>
      )}

      {section==="shifts" && (
        <div>
          <div style={{ fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:12 }}>Shifts & Fees</div>
          {(shifts as Shift[]).map((sh,i)=>(
            <div key={i} style={{ ...card,marginBottom:8,opacity:sh.active?1:0.6 }}>
              {editShift?.shift_key===sh.shift_key ? (
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                    <Field label="Shift Name"><input value={editShift.shift_name} onChange={e=>setEditShift(s=>s?{...s,shift_name:e.target.value}:s)} style={{ ...inp,fontSize:13 }} /></Field>
                    <Field label="Time Period"><input value={editShift.shift_time} onChange={e=>setEditShift(s=>s?{...s,shift_time:e.target.value}:s)} style={{ ...inp,fontSize:13 }} /></Field>
                  </div>
                  <div style={{ fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em" }}>Fees per Library (₹)</div>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                    {([["KAL","Kiran"],["YAL1","Yuvika 1"],["YAL2","Yuvika 2"],["SL","Suraj"],["KL","Kirti"]] as [string,string][]).map(([key,label])=>(
                      <Field key={key} label={label}>
                        <input type="number" value={editShift.fees[key]||0} onChange={e=>setEditShift(s=>s?{...s,fees:{...s.fees,[key]:Number(e.target.value)}}:s)} style={{ ...inp,fontSize:13,fontFamily:"'DM Mono',monospace" }} />
                      </Field>
                    ))}
                  </div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button onClick={()=>setEditShift(null)} style={{ ...ghostBtn,flex:1,fontSize:13 }}>Cancel</button>
                    <button onClick={()=>saveShift(editShift)} style={{ flex:1,padding:"11px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{sh.shift_name}</div>
                    <div style={{ fontSize:12,color:"#64748b",marginTop:2 }}>{sh.shift_time}</div>
                    <div style={{ display:"flex",gap:6,marginTop:6,flexWrap:"wrap" }}>
                      {([["KAL",sh.fees.KAL],["YAL1",sh.fees.YAL1],["YAL2",sh.fees.YAL2],["SL",sh.fees.SL],["KL",sh.fees.KL]] as [string,number][]).map(([k,v])=>(
                        <span key={k} style={{ fontSize:11,fontWeight:600,color:"#64748b",background:"#f1f5f9",padding:"2px 8px",borderRadius:6 }}>{k}: ₹{v}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex",gap:6 }}>
                    <button onClick={()=>setEditShift({...sh})} style={{ ...ghostBtn,padding:"6px 10px",fontSize:12 }}>Edit</button>
                    <button onClick={()=>toggleShift(sh)} style={{ ...ghostBtn,padding:"6px 10px",fontSize:12,color:sh.active?"#ef4444":"#10b981",borderColor:sh.active?"#fecaca":"#bbf7d0" }}>{sh.active?"Off":"On"}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!addingShift ? (
            <button onClick={()=>setAddingShift(true)} style={{ width:"100%",padding:"13px",borderRadius:14,border:"2px dashed #6366f1",background:"#eff6ff",color:"#4f46e5",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginTop:4 }}>+ Add New Shift</button>
          ) : (
            <div style={{ ...card,marginTop:4 }}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>New Shift</div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                  <Field label="Shift Key *"><input value={newShift.shift_key} onChange={e=>setNewShift(p=>({...p,shift_key:e.target.value.toUpperCase()}))} placeholder="MORNING" style={{ ...inp,fontSize:13 }} /></Field>
                  <Field label="Name *"><input value={newShift.shift_name} onChange={e=>setNewShift(p=>({...p,shift_name:e.target.value}))} placeholder="Morning" style={{ ...inp,fontSize:13 }} /></Field>
                </div>
                <Field label="Time Period"><input value={newShift.shift_time} onChange={e=>setNewShift(p=>({...p,shift_time:e.target.value}))} placeholder="7AM to 2PM" style={inp} /></Field>
                <div style={{ fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em" }}>Fees per Library (₹)</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                  {([["fee_KAL","Kiran"],["fee_YAL1","Yuvika 1"],["fee_YAL2","Yuvika 2"],["fee_SL","Suraj"],["fee_KL","Kirti"]] as [string,string][]).map(([key,label])=>(
                    <Field key={key} label={label}>
                      <input type="number" value={newShift[key as keyof typeof newShift]} onChange={e=>setNewShift(p=>({...p,[key]:Number(e.target.value)}))} style={{ ...inp,fontSize:13,fontFamily:"'DM Mono',monospace" }} />
                    </Field>
                  ))}
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={()=>setAddingShift(false)} style={{ ...ghostBtn,flex:1,fontSize:13 }}>Cancel</button>
                  <button onClick={addShiftFn} style={{ flex:1,padding:"11px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Add Shift</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {section==="counters" && (
        <div>
          <div style={{ background:"#fffbeb",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#92400e",marginBottom:14,border:"1px solid #fcd34d" }}>
            Only set <strong>cutoff values</strong>. Running counters are auto-managed and shown read-only.
          </div>
          {LIBRARIES.map(lib=>{
            const libSet = countersEdit[lib.code]; if (!libSet) return null;
            return (
              <div key={lib.code} style={{ ...card,marginBottom:10 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
                  <span style={{ fontSize:22 }}>{lib.emoji}</span>
                  <div style={{ fontWeight:700,fontSize:15,color:"#1e293b" }}>{lib.display}</div>
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12 }}>
                  {[["last_student_id","Student Counter"],["last_receipt_no","Receipt Counter"]].map(([key,label])=>(
                    <div key={key} style={{ background:"#f8fafc",borderRadius:10,padding:"10px 12px" }}>
                      <div style={{ fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:18,fontWeight:800,color:"#1e293b",fontFamily:"'DM Mono',monospace" }}>
                        {key==="last_student_id"?"F":"R"}{libSet[key]||0}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12 }}>
                  {[["cutoff_student_id","Student Cutoff"],["cutoff_receipt_no","Receipt Cutoff"]].map(([key,label])=>(
                    <Field key={key} label={label}>
                      <input type="number" value={libSet[key]||0} onChange={e=>setCountersEdit(ce=>({...ce,[lib.code]:{...ce[lib.code],[key]:Number(e.target.value)}}))} style={{ ...inp,fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:700 }} />
                    </Field>
                  ))}
                </div>
                <button onClick={()=>saveCounters(lib.code)} style={{ ...primaryBtn,background:"#1e293b",boxShadow:"none",fontSize:14 }}>Save {lib.code} Settings</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}