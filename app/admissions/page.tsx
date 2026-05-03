"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const API      = "/api/admissions";
const PASSWORD = process.env.NEXT_PUBLIC_ADMISSIONS_PASSWORD!;

// ── TYPES ─────────────────────────────────────────────────────────────────────
type Tab         = "receipt" | "students" | "board" | "dues" | "pending" | "settings";
type ReceiptStep = "library" | "type" | "search" | "form" | "result";
type EntryType   = "NEW" | "RENEWAL";

interface PhoneEntry  { number: string; tag: string; }
interface Library     { library_code: string; library_name: string; display_name: string; active: boolean; has_branches: boolean; emoji: string; }
interface Branch      { library_code: string; branch_code: string; branch_display: string; active: boolean; emoji: string; }
interface Shift       { shift_key: string; shift_name: string; shift_time: string; active: boolean; }
interface PaymentTag  { tag_name: string; active: boolean; created_at: string; }
interface LibSettings { library: string; last_student_id: number; last_receipt_no: number; cutoff_student_id: number; cutoff_receipt_no: number; }
interface Student     { student_id: string; library: string; yal_branch: string; name: string; phones: PhoneEntry[]; seat_no: string; shift: string; payment_tag: string; last_receipt_no?: string; address?: string; preparing_for?: string; aadhaar_last4?: string; date_of_birth?: string; added_on?: string; source?: string; is_past?: boolean; }
interface ReceiptEntry { s_no?: number; receipt_no: string; student_id: string; library: string; yal_branch: string; name: string; phones: PhoneEntry[]; seat_no: string; shift: string; booking_from: string; booking_to: string; receipt_date: string; fee: number; pay_mode_1: string; pay_amount_1: number; pay_mode_2: string; pay_amount_2: number; pay_mode_3: string; pay_amount_3: number; fees_due: number; fees_due_balance: number; type: string; is_cross_library: string; board_updated: string; generated_at: string; receipt_text: string; registration_text: string; }
interface ReceiptSearchResult { receipt_no: string; student_id: string; library: string; yal_branch: string; name: string; phones: PhoneEntry[]; seat_no: string; shift: string; booking_from: string; booking_to: string; fee: number; pay_mode_1: string; pay_amount_1: number; generated_at: string; result_type: "RECEIPT"; }
interface DuePayment  { payment_id: string; receipt_no: string; payment_mode: string; amount_received: number; balance_before: number; balance_after: number; received_on: string; notes: string; }
interface ReceiptResult { receipt_no: string; student_id: string; receipt_text: string; registration_text: string | null; contact_name: string; }

// ── PHONE HELPERS ─────────────────────────────────────────────────────────────
function normalizePhone(input: string): string {
  if (!input) return "";
  let c = input.replace(/[\s\-\.\(\)]/g, "");
  if (c.startsWith("+91")) c = c.slice(3);
  else if (c.startsWith("91") && c.length > 10) c = c.slice(2);
  c = c.replace(/\D/g, "");
  if (c.length > 10) c = c.slice(-10);
  return c;
}

function emptyPhones(): PhoneEntry[] {
  return [{ number: "", tag: "" }, { number: "", tag: "" }, { number: "", tag: "" }, { number: "", tag: "" }];
}

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
function todayDMY(): string { const d = new Date(); return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`; }
function dmyToISO(dmy: string): string {
  if (!dmy) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dmy)) return dmy;
  const p = dmy.split("-"); if (p.length !== 3) return "";
  return `${p[2].padStart(4,"0")}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
}
function isoToDMY(iso: string): string {
  if (!iso) return "";
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(iso)) return iso;
  const p = iso.split("-"); if (p.length !== 3) return "";
  return `${parseInt(p[2])}-${parseInt(p[1])}-${p[0]}`;
}
function addOneMonth(dmy: string): string {
  if (!dmy) return "";
  const p = dmy.split("-"); if (p.length !== 3) return dmy;
  const d = new Date(Number(p[2]), Number(p[1])-1, Number(p[0]));
  const targetMonth = d.getMonth() + 1;
 d.setMonth(targetMonth);
  if (d.getMonth() !== targetMonth % 12) d.setDate(0);  // overflow case e.g. Jan 31 → Feb 28
  else d.setDate(d.getDate() - 1);                       // normal case e.g. Apr 30 → May 29
  return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`;
}
function addOneDayDMY(dmy: string): string {
  if (!dmy) return "";
  const p = dmy.split("-"); if (p.length !== 3) return dmy;
  const d = new Date(Number(p[2]), Number(p[1])-1, Number(p[0]));
  d.setDate(d.getDate()+1);
  return `${d.getDate()}-${d.getMonth()+1}-${d.getFullYear()}`;
}
function fmtDate(dmy: string): string {
  if (!dmy) return "—";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  // Apps Script timestamp like "5 May 2025 (05:30 PM)" — extract date only
  const asMatch = dmy.match(/^(\d{1,2}) (\w+) (\d{4})/);
  if (asMatch) return `${asMatch[1].padStart(2,"0")} ${asMatch[2]} ${asMatch[3]}`;
  // JS Date string from Sheet Date cells: "Thu Apr 30 2026 00:00:00 GMT+0530..."
  if (dmy.includes("GMT") || dmy.includes("IST") || /^\w{3} \w{3}/.test(dmy)) {
    try {
      const d = new Date(dmy);
      if (!isNaN(d.getTime()))
        return `${String(d.getDate()).padStart(2,"0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {}
  }
  // ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dmy)) {
    const p = dmy.split("-");
    return `${p[2].padStart(2,"0")} ${months[parseInt(p[1])-1]||""} ${p[0]}`;
  }
  // DMY format D-M-YYYY
  const p = dmy.split("-");
  if (p.length !== 3) return dmy;
  return `${p[0].padStart(2,"0")} ${months[parseInt(p[1])-1]||""} ${p[2]}`;
}

// FIX #9: fmtDateTime — for generated_at and received_on where time matters
// Handles Apps Script format "5 May 2025 (05:30 PM)" and ISO/GMT strings
function fmtDateTime(ts: string): string {
  if (!ts) return "—";
  // Strip "(EDITED)" suffix if present before parsing
  const clean = ts.replace(/\s*\(EDITED\)\s*$/, "").trim();
  // Apps Script format: "5 May 2025 (05:30 PM)"
  const asMatch = clean.match(/^(\d{1,2} \w+ \d{4}) \((\d{1,2}:\d{2} [AP]M)\)/i);
  if (asMatch) return `${asMatch[1]}, ${asMatch[2]}${ts.includes("(EDITED)") ? " (edited)" : ""}`;
  // ISO / GMT string
  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
           + ", "
           + d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true })
           + (ts.includes("(EDITED)") ? " (edited)" : "");
    }
  } catch {}
  return ts;
}

// FIX #9: fmtDateOnly — for added_on, created_at where time is noise
function fmtDateOnly(ts: string): string {
  if (!ts) return "—";
  const clean = ts.replace(/\s*\(EDITED\)\s*$/, "").trim();
  // Apps Script format: "5 May 2025 (05:30 PM)" — extract date part only
  const asMatch = clean.match(/^(\d{1,2}) (\w+) (\d{4})/);
  if (asMatch) return `${asMatch[1]} ${asMatch[2]} ${asMatch[3]}`;
  // ISO / GMT string
  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
    }
  } catch {}
  return fmtDate(ts);
}

function toU(v: string) { return (v || "").toUpperCase().trim(); }

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const inp:  React.CSSProperties = { padding:"11px 14px",borderRadius:12,border:"1.5px solid #e2e8f0",fontSize:14,background:"#f8fafc",color:"#1e293b",fontFamily:"'DM Sans',sans-serif",width:"100%",outline:"none",boxSizing:"border-box" };
const selS: React.CSSProperties = { ...inp,cursor:"pointer",appearance:"none" };
const card: React.CSSProperties = { background:"#fff",borderRadius:16,border:"1px solid #f1f5f9",padding:"16px",marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,0.05)" };
const primaryBtn: React.CSSProperties = { width:"100%",padding:"14px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 14px rgba(99,102,241,0.3)" };
const ghostBtn: React.CSSProperties = { padding:"10px 14px",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",fontSize:13,fontWeight:600,cursor:"pointer",color:"#64748b",fontFamily:"'DM Sans',sans-serif" };
const numInp: React.CSSProperties = { ...inp, fontFamily:"'DM Mono',monospace" };

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

function Toast({ msg, type, onDone }: { msg:string;type:"success"|"error";onDone:()=>void }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => { const t = setTimeout(()=>onDoneRef.current(), 3200); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position:"fixed",bottom:88,left:"50%",transform:"translateX(-50%)",background:type==="error"?"#ef4444":"#10b981",color:"#fff",padding:"12px 22px",borderRadius:50,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",fontSize:14,fontWeight:600,zIndex:9998,whiteSpace:"nowrap",maxWidth:"88vw",textAlign:"center",animation:"slideUp 0.25s ease" }}>
      {type==="success"?"✓  ":"✕  "}{msg}
    </div>
  );
}

function Confirm({ msg, onConfirm, onCancel }: { msg:string;onConfirm:()=>void;onCancel:()=>void }) {
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

function CopyBtn({ text, label, accent="#6366f1" }: { text:string;label:string;accent?:string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}); }}
      style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"11px 14px",borderRadius:12,border:`1.5px solid ${copied?"#10b981":accent+"33"}`,background:copied?"#ecfdf5":`${accent}0d`,color:copied?"#059669":accent,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.18s",flex:1 }}>
      {copied?"✓":"📋"} {copied?"Copied!":label}
    </button>
  );
}

function Badge({ text, color="#6366f1" }: { text:string;color?:string }) {
  return <span style={{ fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99,background:`${color}18`,color,letterSpacing:"0.05em" }}>{text}</span>;
}

function Pill({ text, active, onClick }: { text:string;active:boolean;onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{ padding:"7px 14px",borderRadius:99,border:"none",background:active?"#6366f1":"#f1f5f9",color:active?"#fff":"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",whiteSpace:"nowrap" }}>
      {text}
    </button>
  );
}

function Field({ label, children, required }: { label:string;children:React.ReactNode;required?:boolean }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
      <span style={{ fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em" }}>{label}{required&&<span style={{ color:"#f43f5e",marginLeft:2 }}>*</span>}</span>
      {children}
    </div>
  );
}

function DateInput({ value, onChange }: { value:string;onChange:(v:string)=>void }) {
  return (
    <input
      type="date"
      value={dmyToISO(value)}
      onChange={e => onChange(isoToDMY(e.target.value))}
      onClick={e => (e.target as HTMLInputElement).showPicker?.()}
      style={inp}
    />
  );
}

function Pagination({ page, totalPages, onChange }: { page:number;totalPages:number;onChange:(p:number)=>void }) {
  if (totalPages<=1) return null;
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 0" }}>
      <button onClick={()=>onChange(page-1)} disabled={page===1} style={{ ...ghostBtn,padding:"8px 14px",opacity:page===1?0.4:1 }}>← Prev</button>
      <span style={{ fontSize:13,fontWeight:600,color:"#64748b" }}>{page} / {totalPages}</span>
      <button onClick={()=>onChange(page+1)} disabled={page===totalPages} style={{ ...ghostBtn,padding:"8px 14px",opacity:page===totalPages?0.4:1 }}>Next →</button>
    </div>
  );
}

function NumInput({ value, onChange, placeholder, style: extraStyle }: { value:string|number;onChange:(v:string)=>void;placeholder?:string;style?:React.CSSProperties }) {
  return (
    <input
      type="number"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onWheel={e => (e.target as HTMLInputElement).blur()}
      style={{ ...numInp, ...extraStyle }}
    />
  );
}

// ── PHONE FIELDS COMPONENT ────────────────────────────────────────────────────
function PhoneFields({ phones, onChange, maxPhones=4 }: { phones:PhoneEntry[];onChange:(p:PhoneEntry[])=>void;maxPhones?:number }) {
  const [forceShow, setForceShow] = useState(false);
  const showExtra = forceShow || phones.filter(p=>p.number).length > 1;

  function updatePhone(idx: number, field: "number"|"tag", value: string) {
    const next = [...phones];
    next[idx] = { ...next[idx], [field]: field==="tag" ? value.toUpperCase() : value };
    onChange(next);
  }

  function blurPhone(idx: number) {
    const next = [...phones];
    next[idx] = { ...next[idx], number: normalizePhone(next[idx].number) };
    onChange(next);
  }

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
      <div style={{ display:"flex",gap:8,alignItems:"flex-end" }}>
        <div style={{ flex:2 }}>
          <Field label="Primary Number *">
            <input
              value={phones[0]?.number||""}
              onChange={e=>updatePhone(0,"number",e.target.value)}
              onBlur={()=>blurPhone(0)}
              placeholder="+91 or 10-digit"
              style={inp}
              inputMode="tel"
            />
          </Field>
        </div>
        <div style={{ flex:1 }}>
          <Field label="Tag">
            <input
              value={phones[0]?.tag||""}
              onChange={e=>updatePhone(0,"tag",e.target.value)}
              placeholder="SELF"
              style={{ ...inp,fontSize:12 }}
            />
          </Field>
        </div>
      </div>

      {showExtra && [1,2,3].slice(0,maxPhones-1).map(idx=>(
        <div key={idx} style={{ display:"flex",gap:8,alignItems:"flex-end" }}>
          <div style={{ flex:2 }}>
            <Field label={`Number ${idx+1}`}>
              <input
                value={phones[idx]?.number||""}
                onChange={e=>updatePhone(idx,"number",e.target.value)}
                onBlur={()=>blurPhone(idx)}
                placeholder="+91 or 10-digit"
                style={inp}
                inputMode="tel"
              />
            </Field>
          </div>
          <div style={{ flex:1 }}>
            <Field label="Tag">
              <input
                value={phones[idx]?.tag||""}
                onChange={e=>updatePhone(idx,"tag",e.target.value)}
                placeholder="MOTHER'S"
                style={{ ...inp,fontSize:12 }}
              />
            </Field>
          </div>
        </div>
      ))}

      {!showExtra && (
        <button onClick={()=>setForceShow(true)}
          style={{ ...ghostBtn,fontSize:12,width:"fit-content",color:"#6366f1",borderColor:"#6366f1",padding:"6px 12px" }}>
          + Add More Numbers
        </button>
      )}
    </div>
  );
}

// ── RECEIPT CARD ──────────────────────────────────────────────────────────────
function ReceiptCard({ r, showCopy=true, libraries=[], onEditReceipt, shifts=[], activeTags=[] }: { r:ReceiptEntry;showCopy?:boolean;libraries:Library[];onEditReceipt?:(r:ReceiptEntry)=>void;shifts?:Shift[];activeTags?:string[] }) {
  const [open, setOpen] = useState(false);
  const lib = libraries.find(l=>l.library_code===r.library);
  const hasDue = (r.fees_due_balance||0) > 0;
  const primaryPhone = r.phones?.[0]?.number || "";
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
            <div style={{ fontSize:12,color:"#64748b",marginTop:3 }}>{r.student_id} · {primaryPhone}</div>
            <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{lib?.display_name||r.library}{r.yal_branch?` (${r.yal_branch})`:""} · {fmtDate(r.booking_from)} → {fmtDate(r.booking_to)}</div>
            {/* FIX #9: use fmtDateTime for generated_at */}
            <div style={{ fontSize:11,color:"#cbd5e1",marginTop:2 }}>{fmtDateTime(r.generated_at)}</div>
          </div>
          <span style={{ color:"#cbd5e1",fontSize:18,marginTop:2 }}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open && (
        <div style={{ marginTop:14,paddingTop:14,borderTop:"1px solid #f1f5f9" }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12 }}>
            {[["Seat",r.seat_no],["Shift",r.shift],["Fee","₹"+r.fee],["Receipt Date",fmtDate(r.receipt_date)]].map(([k,v])=>(
              <div key={k} style={{ background:"#f8fafc",borderRadius:10,padding:"8px 10px" }}>
                <div style={{ fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:13,fontWeight:600,color:"#1e293b" }}>{v||"—"}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            {showCopy && r.registration_text && <CopyBtn text={r.registration_text} label="Group Copy" />}
            {showCopy && r.receipt_text && <CopyBtn text={r.receipt_text} label="Student Copy" accent="#10b981" />}
            {showCopy && <CopyBtn text={`${r.name} ${r.library} ${r.student_id}`} label="Contact" accent="#f59e0b" />}
            {onEditReceipt && (
              <button onClick={()=>onEditReceipt(r)}
                style={{ padding:"11px 14px",borderRadius:12,border:"1.5px solid #6366f133",background:"#eff6ff",color:"#4f46e5",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",flex:1 }}>
                ✏️ Edit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── STUDENT CARD ──────────────────────────────────────────────────────────────
function StudentCard({ st, onEdit, onDelete, libraries=[] }: { st:Student;onEdit?:()=>void;onDelete?:()=>void;libraries:Library[] }) {
  const lib = libraries.find(l=>l.library_code===st.library);
  const primaryPhone = st.phones?.[0]?.number||"";
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
          <div style={{ fontSize:12,color:"#64748b",marginTop:3 }}>{st.student_id} · {primaryPhone}</div>
          <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{lib?.display_name||st.library} · Seat {st.seat_no||"—"} · {st.shift||"—"}</div>
          {/* FIX #9: use fmtDateOnly for added_on — time is irrelevant */}
          {st.added_on && <div style={{ fontSize:11,color:"#cbd5e1",marginTop:3 }}>{fmtDateOnly(st.added_on)}</div>}
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
  const [authed, setAuthed]     = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pwInput, setPwInput]   = useState("");
  const [pwError, setPwError]   = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("receipt");
  const [loading, setLoading]   = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Loading...");
  const [toast, setToast]       = useState<{msg:string;type:"success"|"error"}|null>(null);
  const [confirm, setConfirm]   = useState<{msg:string;onConfirm:()=>void}|null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [fees, setFees]         = useState<Record<string,Record<string,number>>>({});
  const [shifts, setShifts]     = useState<Shift[]>([]);
  const [allTags, setAllTags]   = useState<PaymentTag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [settings, setSettings] = useState<Record<string,LibSettings>>({});
  const isSubmitting = useRef(false);
  const [initLoading, setInitLoading] = useState(false);

  useEffect(() => { setHydrated(true); if (localStorage.getItem("admissionsAuth")==="true") setAuthed(true); }, []);
  useEffect(() => { if (authed) loadInit(); }, [authed]);

  async function loadInit() {
    setInitLoading(true);
    try {
      const res = await fetch(`${API}?action=getInitData`);
      const d   = await res.json();
      if (d.ok) {
        setLibraries(d.libraries||[]); setBranches(d.branches||[]);
        setFees(d.fees||{}); setShifts(d.shifts||[]);
        setAllTags(d.allTags||[]); setActiveTags(d.activeTags||[]);
        setSettings(d.settings||{});
      }
    } catch {}
    setInitLoading(false);
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
              autoFocus style={{ padding:"13px 16px",borderRadius:12,border:`1.5px solid ${pwError?"#ef4444":"rgba(255,255,255,0.15)"}`,background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",outline:"none",width:"100%",boxSizing:"border-box",marginBottom:8 }} />
            {pwError && <p style={{ color:"#f87171",fontSize:13,textAlign:"center",margin:"0 0 10px" }}>Incorrect password.</p>}
            <button onClick={()=>{if(pwInput===PASSWORD){localStorage.setItem("admissionsAuth","true");setAuthed(true);}else{setPwError(true);setPwInput("");}}}
              disabled={!pwInput} style={{ width:"100%",padding:14,borderRadius:12,border:"none",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
              Access Portal →
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const tabProps = { showToast,showConfirm,startLoading,stopLoading,libraries,branches,fees,shifts,allTags,activeTags,settings,loadInit,isSubmitting };

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        input:focus,select:focus{border-color:#6366f1!important;box-shadow:0 0 0 3px rgba(99,102,241,0.1)}
        ::-webkit-scrollbar{display:none}
        input[type="date"]{cursor:pointer}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        input[type=number]{-moz-appearance:textfield}
      `}</style>
      <div style={{ minHeight:"100vh",background:"#f8fafc",fontFamily:"'DM Sans',sans-serif",paddingBottom:80 }}>
        <div style={{ background:"linear-gradient(135deg,#1e293b,#0f172a)",padding:"16px 16px 0",position:"sticky",top:0,zIndex:100 }}>
          <div style={{ maxWidth:480,margin:"0 auto" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:14 }}>
              <div>
                <div style={{ fontSize:10,color:"#475569",letterSpacing:2,textTransform:"uppercase" }}>Locate Library</div>
                <div style={{ fontSize:20,fontWeight:800,color:"#fff",marginTop:2 }}>Library Admissions</div>
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
          {initLoading ? (
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",padding:"60px 0",gap:16 }}>
              <div style={{ width:32,height:32,border:"3px solid #e2e8f0",borderTop:"3px solid #6366f1",borderRadius:"50%",animation:"spin 0.7s linear infinite" }} />
              <div style={{ fontSize:13,color:"#94a3b8" }}>Loading data…</div>
            </div>
          ) : (
            <>
              {activeTab==="receipt"  && <ReceiptTab  {...tabProps} />}
              {activeTab==="students" && <StudentsTab {...tabProps} />}
              {activeTab==="board"    && <BoardTab    {...tabProps} />}
              {activeTab==="dues"     && <DuesTab     {...tabProps} />}
              {activeTab==="pending"  && <PendingTab  {...tabProps} />}
              {activeTab==="settings" && <SettingsTab {...tabProps} />}
            </>
          )}
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
function ReceiptTab({ showToast,showConfirm,startLoading,stopLoading,libraries,branches,fees,shifts,activeTags,isSubmitting }:any) {
  const [step, setStep]           = useState<ReceiptStep>("library");
  const [library, setLibrary]     = useState("");
  const [branch, setBranch]       = useState("");
  const [entryType, setEntryType] = useState<EntryType>("NEW");
  const [selectedStudent, setSelectedStudent] = useState<Student|null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptSearchResult|null>(null);
  const [isCrossLib, setIsCrossLib] = useState(false);
  const [searchQ, setSearchQ]     = useState("");
  const [searchStudents, setSearchStudents] = useState<Student[]>([]);
  const [searchReceipts, setSearchReceipts] = useState<ReceiptSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult]       = useState<ReceiptResult|null>(null);
  const [multiPay, setMultiPay]   = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [phones, setPhones]       = useState<PhoneEntry[]>(emptyPhones());
  // FIX #3: editReceipt state for edit button on result screen
  const [editReceipt, setEditReceipt] = useState<ReceiptEntry|null>(null);

  const libData      = (libraries as Library[]).find(l=>l.library_code===library);
  const libBranches  = (branches as Branch[]).filter((b:Branch)=>b.library_code===library&&b.active);
  const activeShifts = (shifts as Shift[]).filter((s:Shift)=>s.active);
  const feeKey = libData?.has_branches ? branch : library;

  const [f, setF] = useState({
    studentId:"", name:"", seatNo:"", shift:"",
    customShiftName:"", customShiftTime:"",
    bookingFrom:todayDMY(), bookingTo:addOneMonth(todayDMY()), receiptDate:todayDMY(),
    fee:"", payMode1:"", payAmount1:"", payMode2:"", payAmount2:"", payMode3:"", payAmount3:"",
    feesDue:"0", manualReceiptNo:"", manualStudentId:"",
    address:"", preparingFor:"", aadhaarLast4:"", dob:"",
  });

  const [bookingToEdited, setBookingToEdited] = useState(false);
  // FIX #4: feeEdited flag — prevent shift selection from overwriting a manually typed fee
  const [feeEdited, setFeeEdited] = useState(false);

  useEffect(() => {
    if (f.shift && feeKey) {
      const sh = (shifts as Shift[]).find((s:Shift)=>s.shift_key===f.shift);
      const fee = (fees as any)[feeKey]?.[f.shift];
      setF(p=>({
        ...p,
        // FIX #4: only auto-fill fee when user hasn't manually edited it
        fee: (!feeEdited && fee !== undefined) ? String(fee) : p.fee,
        customShiftName: sh?.shift_name||"",
        customShiftTime: sh?.shift_time||"",
      }));
    }
  }, [f.shift, library, branch]);

  useEffect(() => {
    if (f.bookingFrom && !bookingToEdited) {
      setF(p=>({...p, bookingTo:addOneMonth(p.bookingFrom)}));
    }
  }, [f.bookingFrom]);

  useEffect(() => {
    if (multiPay) {
      const paid=(Number(f.payAmount1)||0)+(Number(f.payAmount2)||0)+(Number(f.payAmount3)||0);
      setF(p=>({...p,feesDue:String(Math.max(0,Number(p.fee)-paid))}));
    } else { setF(p=>({...p,feesDue:"0"})); }
  }, [f.fee,f.payAmount1,f.payAmount2,f.payAmount3,multiPay]);

  async function doSearch() {
    if (searchQ.trim().length<2) return;
    setSearching(true);
    try {
      const q = normalizePhone(searchQ)||searchQ;
      const res = await fetch(`${API}?action=searchForRenewal&q=${encodeURIComponent(q)}&library=${library}`);
      const d   = await res.json();
      if (d.ok) { setSearchStudents(d.students||[]); setSearchReceipts(d.receipts||[]); }
    } catch { showToast("Search failed.","error"); }
    setSearching(false);
  }

  function pickStudent(st: Student) {
    setSelectedStudent(st); setSelectedReceipt(null);
    const filledPhones = [...(st.phones||[]), ...emptyPhones()].slice(0,4);
    setPhones(filledPhones);
    setF(p=>({...p,studentId:st.student_id,name:st.name,seatNo:st.seat_no,shift:st.shift,payMode1:st.payment_tag}));
    setIsCrossLib(toU(st.library)!==toU(library));
    setBookingToEdited(false);
    setFeeEdited(false);
    setStep("form");
  }

  function pickReceipt(r: ReceiptSearchResult) {
    setSelectedReceipt(r); setSelectedStudent(null);
    const filledPhones = [...(r.phones||[]), ...emptyPhones()].slice(0,4);
    setPhones(filledPhones);
    const newFrom = addOneDayDMY(r.booking_to);
    setBookingToEdited(false);
    setFeeEdited(false);
    setF(p=>({...p,
      studentId:r.student_id, name:r.name, seatNo:r.seat_no, shift:r.shift,
      bookingFrom:newFrom, bookingTo:addOneMonth(newFrom), receiptDate:todayDMY(),
      fee:String(r.fee), payMode1:r.pay_mode_1,
    }));
    setIsCrossLib(toU(r.library)!==toU(library));
    if (r.yal_branch) setBranch(r.yal_branch);
    setStep("form");
  }

  async function submit() {
    if (isSubmitting.current) return;
    if (!f.name.trim())  { showToast("Name is required.","error"); return; }
    const validPhones = phones.filter(p=>p.number);
    if (!validPhones.length) { showToast("At least one phone number is required.","error"); return; }
    if (!f.shift) { showToast("Please select a shift.","error"); return; }
    if (f.fee===""||f.fee===null||f.fee===undefined) { showToast("Fee amount is required.","error"); return; }
    if (!f.bookingFrom||!f.bookingTo) { showToast("Booking period is required.","error"); return; }
    if (dmyToISO(f.bookingTo) < dmyToISO(f.bookingFrom)) { showToast("Booking 'To' date cannot be before 'From' date.","error"); return; }

    const sh = (shifts as Shift[]).find((s:Shift)=>s.shift_key===f.shift);
    const shName = f.customShiftName||sh?.shift_name||f.shift;
    const shTime = f.customShiftTime||sh?.shift_time||"";
    const shiftFull = shTime ? `${toU(shName)} (${toU(shTime)})` : toU(shName);

    showConfirm("Generate and save this receipt permanently?", async () => {
      isSubmitting.current = true;
      startLoading("Generating receipt...");
      try {
        const payload = {
          type:entryType, library, yal_branch:branch,
          has_branches:libData?.has_branches||false,
          student_id:f.manualStudentId||f.studentId,
          name:toU(f.name),
          phones:validPhones.map(p=>({number:normalizePhone(p.number),tag:toU(p.tag)})),
          seat_no:toU(f.seatNo), shift:f.shift, shift_full:shiftFull,
          booking_from:f.bookingFrom, booking_to:f.bookingTo, receipt_date:f.receiptDate,
          fee:Number(f.fee),
          pay_mode_1:toU(f.payMode1), pay_amount_1:multiPay?(Number(f.payAmount1)||0):Number(f.fee),
          pay_mode_2:multiPay?toU(f.payMode2):"", pay_amount_2:multiPay?(Number(f.payAmount2)||0):0,
          pay_mode_3:multiPay?toU(f.payMode3):"", pay_amount_3:multiPay?(Number(f.payAmount3)||0):0,
          fees_due:Number(f.feesDue)||0,
          manual_receipt_no:f.manualReceiptNo||undefined, manual_student_id:f.manualStudentId||undefined,
          is_cross_library:isCrossLib, is_past_student:selectedStudent?.is_past||false,
          address:toU(f.address), preparing_for:toU(f.preparingFor),
          aadhaar_last4:f.aadhaarLast4, date_of_birth:f.dob,
        };
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"createReceipt",payload})});
        const d   = await res.json();
        if (d.ok) { setResult(d); setStep("result"); showToast("Receipt generated!"); }
        else showToast(d.error||"Failed to generate receipt.","error");
      } catch { showToast("Network error. Please retry.","error"); }
      finally { stopLoading(); isSubmitting.current = false; }
    });
  }

  function reset() {
    setStep("library"); setLibrary(""); setBranch(""); setEntryType("NEW");
    setSelectedStudent(null); setSelectedReceipt(null);
    setSearchQ(""); setSearchStudents([]); setSearchReceipts([]);
    setResult(null); setMultiPay(false); setShowOptional(false); setPhones(emptyPhones());
    setBookingToEdited(false); setFeeEdited(false); setEditReceipt(null);
    setF({ studentId:"",name:"",seatNo:"",shift:"",customShiftName:"",customShiftTime:"",bookingFrom:todayDMY(),bookingTo:addOneMonth(todayDMY()),receiptDate:todayDMY(),fee:"",payMode1:"",payAmount1:"",payMode2:"",payAmount2:"",payMode3:"",payAmount3:"",feesDue:"0",manualReceiptNo:"",manualStudentId:"",address:"",preparingFor:"",aadhaarLast4:"",dob:"" });
  }

  const steps: ReceiptStep[] = ["library","type","search","form","result"];
  const stepIdx = steps.indexOf(step);

  // FIX #3: Edit receipt overlay (accessible from result screen too)
  if (editReceipt) {
    return <EditReceiptForm
      receipt={editReceipt}
      shifts={shifts}
      activeTags={activeTags}
      libraries={libraries}
      branches={branches}
      onClose={()=>setEditReceipt(null)}
      showToast={showToast}
      showConfirm={showConfirm}
      startLoading={startLoading}
      stopLoading={stopLoading}
      isSubmitting={isSubmitting}
    />;
  }

  // RESULT
  if (step==="result"&&result) {
    // FIX #3: build a minimal ReceiptEntry from the result + current form state
    // so Edit button works immediately without a network fetch
    const resultAsEntry: ReceiptEntry = {
      receipt_no:        result.receipt_no,
      student_id:        result.student_id,
      library:           library,
      yal_branch:        branch,
      name:              toU(f.name),
      phones:            phones.filter(p=>p.number),
      seat_no:           toU(f.seatNo),
      shift:             f.shift,
      booking_from:      f.bookingFrom,
      booking_to:        f.bookingTo,
      receipt_date:      f.receiptDate,
      fee:               Number(f.fee),
      pay_mode_1:        toU(f.payMode1),
      pay_amount_1:      multiPay?(Number(f.payAmount1)||0):Number(f.fee),
      pay_mode_2:        multiPay?toU(f.payMode2):"",
      pay_amount_2:      multiPay?(Number(f.payAmount2)||0):0,
      pay_mode_3:        multiPay?toU(f.payMode3):"",
      pay_amount_3:      multiPay?(Number(f.payAmount3)||0):0,
      fees_due:          Number(f.feesDue)||0,
      fees_due_balance:  Number(f.feesDue)||0,
      type:              entryType,
      is_cross_library:  isCrossLib?"YES":"NO",
      board_updated:     "NO",
      generated_at:      "",
      receipt_text:      result.receipt_text,
      registration_text: result.registration_text||"",
    };
    return (
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
        {/* FIX #3: Edit button on result screen */}
        <button onClick={()=>setEditReceipt(resultAsEntry)}
          style={{ ...ghostBtn,width:"100%",marginBottom:10,color:"#4f46e5",borderColor:"#6366f133",background:"#eff6ff",fontSize:14,fontWeight:700 }}>
          ✏️ Found a mistake? Edit this receipt
        </button>
        <div style={{ ...card,background:"#f8fafc" }}>
          <div style={{ fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:8,textTransform:"uppercase" }}>Preview</div>
          <pre style={{ fontSize:12,color:"#374151",whiteSpace:"pre-wrap",fontFamily:"'DM Mono',monospace",lineHeight:1.7,margin:0 }}>{result.receipt_text}</pre>
        </div>
        <button onClick={reset} style={{ ...primaryBtn,marginTop:12 }}>+ New Receipt</button>
      </div>
    );
  }

  return (
    <div>
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
            {(libraries as Library[]).filter(l=>l.active).map(lib=>(
              <button key={lib.library_code} onClick={()=>{setLibrary(lib.library_code);setBranch("");if(!lib.has_branches)setStep("type");}}
                style={{ display:"flex",alignItems:"center",gap:14,padding:"16px",borderRadius:14,border:`2px solid ${library===lib.library_code?"#6366f1":"#e2e8f0"}`,background:library===lib.library_code?"#eff6ff":"#fff",cursor:"pointer",textAlign:"left",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s" }}>
                <span style={{ fontSize:28 }}>{lib.emoji}</span>
                <div>
                  <div style={{ fontWeight:700,fontSize:15,color:library===lib.library_code?"#4f46e5":"#1e293b" }}>{lib.display_name}</div>
                  <div style={{ fontSize:12,color:"#94a3b8",marginTop:1 }}>{lib.library_code}</div>
                </div>
                {library===lib.library_code && <span style={{ marginLeft:"auto",color:"#6366f1",fontSize:18 }}>✓</span>}
              </button>
            ))}
          </div>
          {library && libData?.has_branches && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:10 }}>Select Branch</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                {libBranches.map((b:Branch)=>(
                  <button key={b.branch_code} onClick={()=>{setBranch(b.branch_code);setStep("type");}}
                    style={{ padding:"18px 12px",borderRadius:14,border:`2px solid ${branch===b.branch_code?"#6366f1":"#e2e8f0"}`,background:branch===b.branch_code?"#eff6ff":"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",color:branch===b.branch_code?"#4f46e5":"#1e293b",transition:"all 0.15s",textAlign:"center" }}>
                    <div>{b.emoji} {b.branch_code}</div>
                    <div style={{ fontSize:11,color:"#94a3b8",fontWeight:500,marginTop:4 }}>{b.branch_display}</div>
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
              <div style={{ fontSize:16,fontWeight:800,color:"#1e293b" }}>{libData?.display_name}</div>
              {branch && <div style={{ fontSize:12,color:"#6366f1",fontWeight:600 }}>{branch}</div>}
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
          <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:4 }}>Search Student or Receipt</div>
          <div style={{ fontSize:13,color:"#94a3b8",marginBottom:14 }}>Search by name, phone, student ID, or receipt number</div>
          <div style={{ display:"flex",gap:8,marginBottom:14 }}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
              placeholder="Name / Phone / Student ID / Receipt No." style={{ ...inp,flex:1 }} />
            <button onClick={doSearch} style={{ padding:"11px 18px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>
              {searching?"...":"Search"}
            </button>
          </div>

          {searchReceipts.length>0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8 }}>🧾 Receipts (tap to auto-fill)</div>
              {searchReceipts.map((r,i)=>(
                <div key={i} onClick={()=>pickReceipt(r)} style={{ ...card,cursor:"pointer",border:"1.5px solid #818cf833",background:"#eff6ff",marginBottom:8 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <div style={{ width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>🧾</div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{r.name}</span>
                        <Badge text={r.receipt_no} color="#6366f1" />
                      </div>
                      <div style={{ fontSize:12,color:"#64748b",marginTop:2 }}>{r.student_id} · {r.library}{r.yal_branch?` (${r.yal_branch})`:""}</div>
                      <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{fmtDate(r.booking_from)} → {fmtDate(r.booking_to)} · ₹{r.fee}</div>
                      <div style={{ fontSize:11,color:"#818cf8",marginTop:2,fontWeight:600 }}>📅 New from: {addOneDayDMY(r.booking_to)}</div>
                    </div>
                    <span style={{ color:"#818cf8",fontSize:18 }}>→</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchStudents.length>0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8 }}>👤 Students</div>
              {searchStudents.map((st,i)=>(
                <div key={i} onClick={()=>pickStudent(st)} style={{ ...card,cursor:"pointer",border:`1.5px solid ${toU(st.library)!==toU(library)?"#a78bfa33":"#e2e8f0"}`,marginBottom:8 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <div style={{ width:40,height:40,borderRadius:10,background:st.is_past?"linear-gradient(135deg,#f59e0b,#d97706)":"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>
                      {st.is_past?"📁":"👤"}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{st.name}</div>
                      <div style={{ fontSize:12,color:"#64748b",marginTop:2 }}>{st.student_id} · {st.phones?.[0]?.number||""}</div>
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
            </div>
          )}

          {searchQ.length>=2&&!searching&&!searchStudents.length&&!searchReceipts.length && (
            <div style={{ textAlign:"center",padding:"32px 0",color:"#94a3b8" }}>
              <div style={{ fontSize:36,marginBottom:8 }}>🔍</div>
              <div style={{ fontSize:14,marginBottom:12 }}>No results found.</div>
              <button onClick={()=>{setEntryType("NEW");setStep("form");}} style={{ ...ghostBtn,color:"#6366f1",borderColor:"#6366f1" }}>
                Create as New Admission →
              </button>
            </div>
          )}

          <div style={{ marginTop:12,paddingTop:12,borderTop:"1px solid #f1f5f9" }}>
            <button onClick={()=>setStep("form")} style={{ ...ghostBtn,width:"100%",fontSize:13 }}>
              Skip Search — Fill Manually
            </button>
          </div>
        </div>
      )}

      {/* FORM */}
      {step==="form" && (
        <div style={{ animation:"slideUp 0.25s ease" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
            <button onClick={()=>setStep(entryType==="RENEWAL"?"search":"type")} style={ghostBtn}>← Back</button>
            <div style={{ display:"flex",gap:6 }}>
              <Badge text={entryType==="NEW"?"NEW":"RENEWAL"} color={entryType==="NEW"?"#10b981":"#6366f1"} />
              <Badge text={branch||libData?.library_code||""} color="#64748b" />
              {isCrossLib && <Badge text="CROSS" color="#f59e0b" />}
              {selectedReceipt && <Badge text="FROM RECEIPT" color="#8b5cf6" />}
            </div>
          </div>

          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>👤 Student Details</div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <Field label="Full Name" required>
                  <input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value.toUpperCase()}))} placeholder="FULL NAME" style={inp} />
                </Field>
                <PhoneFields phones={phones} onChange={setPhones} />
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

            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>⏰ Shift <span style={{ color:"#f43f5e" }}>*</span></div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:12 }}>
                {activeShifts.map((sh:Shift)=>{
                  const fee = (fees as any)[feeKey]?.[sh.shift_key];
                  const isActive = f.shift===sh.shift_key;
                  return (
                    <button key={sh.shift_key} onClick={()=>{setFeeEdited(false);setF(p=>({...p,shift:sh.shift_key}));}}
                      style={{ flex:1,minWidth:90,padding:"12px 8px",borderRadius:12,border:`2px solid ${isActive?"#6366f1":"#e2e8f0"}`,background:isActive?"#eff6ff":"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textAlign:"center",transition:"all 0.15s" }}>
                      <div style={{ fontWeight:700,fontSize:13,color:isActive?"#4f46e5":"#1e293b" }}>{sh.shift_name}</div>
                      <div style={{ fontSize:10,color:"#94a3b8",marginTop:2 }}>{sh.shift_time}</div>
                      <div style={{ fontSize:12,fontWeight:700,color:isActive?"#6366f1":"#64748b",marginTop:4 }}>₹{fee!==undefined?fee:"—"}</div>
                    </button>
                  );
                })}
              </div>
              {f.shift && (
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:10,borderTop:"1px solid #f1f5f9" }}>
                  <Field label="Shift Name (editable)">
                    <input value={f.customShiftName} onChange={e=>setF(p=>({...p,customShiftName:e.target.value.toUpperCase()}))} placeholder="MORNING" style={{ ...inp,fontSize:13 }} />
                  </Field>
                  <Field label="Time (editable)">
                    <input value={f.customShiftTime} onChange={e=>setF(p=>({...p,customShiftTime:e.target.value.toUpperCase()}))} placeholder="7AM TO 2PM" style={{ ...inp,fontSize:13 }} />
                  </Field>
                </div>
              )}
            </div>

            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>📅 Booking Period <span style={{ color:"#f43f5e" }}>*</span></div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                  <Field label="From"><DateInput value={f.bookingFrom} onChange={v=>{setBookingToEdited(false);setF(p=>({...p,bookingFrom:v}));}} /></Field>
                  <Field label="To"><DateInput value={f.bookingTo} onChange={v=>{setBookingToEdited(true);setF(p=>({...p,bookingTo:v}));}} /></Field>
                </div>
                <Field label="Receipt Date"><DateInput value={f.receiptDate} onChange={v=>setF(p=>({...p,receiptDate:v}))} /></Field>
              </div>
            </div>

            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>💰 Fees <span style={{ color:"#f43f5e" }}>*</span></div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <Field label="Total Fee (₹)">
                  {/* FIX #4: mark fee as manually edited when user types */}
                  <NumInput value={f.fee} onChange={v=>{setFeeEdited(true);setF(p=>({...p,fee:v}));}} placeholder="0" style={{ fontSize:18,fontWeight:700 }} />
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
                      <span style={{ fontSize:12,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em" }}>Split / Refund Payments</span>
                      <button onClick={()=>{setMultiPay(false);setF(p=>({...p,payAmount1:"",payAmount2:"",payAmount3:"",payMode2:"",payMode3:"",feesDue:"0"}));}}
                        style={{ fontSize:11,color:"#ef4444",background:"none",border:"none",cursor:"pointer",fontWeight:600,fontFamily:"'DM Sans',sans-serif" }}>Remove Split</button>
                    </div>
                    <div style={{ background:"#fffbeb",borderRadius:8,padding:"8px 10px",fontSize:11,color:"#92400e" }}>
                      💡 Negative amount = refund (e.g. -100). Receipt will show <strong>REFUND-CASH-100</strong>.
                    </div>
                    {([[f.payMode1,f.payAmount1,"payMode1","payAmount1"],[f.payMode2,f.payAmount2,"payMode2","payAmount2"],[f.payMode3,f.payAmount3,"payMode3","payAmount3"]] as [string,string,string,string][]).map(([mode,amt,mKey,aKey],i)=>(
                      <div key={i} style={{ display:"flex",gap:8 }}>
                        <select value={mode} onChange={e=>setF(p=>({...p,[mKey]:e.target.value}))} style={{ ...selS,flex:2,fontSize:13 }}>
                          <option value="">Mode {i+1}</option>
                          {(activeTags as string[]).map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                        <NumInput value={amt} onChange={v=>setF(p=>({...p,[aKey]:v}))} placeholder="₹" style={{ flex:1,fontSize:12,color:Number(amt)<0?"#ef4444":"#1e293b" }} />
                      </div>
                    ))}
                    <div style={{ background:"#f8fafc",borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",fontSize:13 }}>
                      <span style={{ color:"#64748b" }}>Net Paid</span>
                      <span style={{ fontWeight:700,color:(Number(f.payAmount1)||0)+(Number(f.payAmount2)||0)+(Number(f.payAmount3)||0)<0?"#ef4444":"#1e293b" }}>
                        ₹{(Number(f.payAmount1)||0)+(Number(f.payAmount2)||0)+(Number(f.payAmount3)||0)}
                      </span>
                    </div>
                    <Field label="Fees Due (₹)">
                      <NumInput value={f.feesDue} onChange={v=>setF(p=>({...p,feesDue:v}))} style={{ color:Number(f.feesDue)>0?"#ef4444":"#1e293b" }} />
                    </Field>
                  </div>
                )}
              </div>
            </div>

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
                    <Field label="Aadhaar Last 4"><input value={f.aadhaarLast4} onChange={e=>setF(p=>({...p,aadhaarLast4:e.target.value.slice(0,4)}))} placeholder="XXXX" maxLength={4} style={inp} inputMode="numeric" /></Field>
                    <Field label="Date of Birth"><DateInput value={f.dob} onChange={v=>setF(p=>({...p,dob:v}))} /></Field>
                  </div>
                )}
              </div>
            )}

            <div style={card}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:10 }}>🔧 Advanced (Optional)</div>
              <Field label="Manual Receipt No.">
                <input value={f.manualReceiptNo} onChange={e=>setF(p=>({...p,manualReceiptNo:e.target.value.toUpperCase()}))} placeholder="Leave blank for auto" style={inp} />
              </Field>
            </div>

            <button onClick={submit} style={primaryBtn}>Generate Receipt →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EDIT RECEIPT FORM ─────────────────────────────────────────────────────────
// FIX #1: all incoming dates normalised via isoToDMY(dmyToISO(v)) in useState
// FIX #7: yal_branch field added with branch selector
function EditReceiptForm({ receipt, shifts, activeTags, libraries, branches, onClose, showToast, showConfirm, startLoading, stopLoading, isSubmitting }: any) {
  const r: ReceiptEntry = receipt;

  const libData = (libraries as Library[]).find((l:Library)=>l.library_code===r.library);
  const libBranches = (branches as Branch[]).filter((b:Branch)=>b.library_code===r.library&&b.active);

  const [phones, setPhones] = useState<PhoneEntry[]>([
    ...(r.phones||[]), ...emptyPhones()
  ].slice(0,4));

  const [multiPay, setMultiPay] = useState(!!(r.pay_mode_2||r.pay_mode_3||(r.pay_amount_1!==r.fee)));

  // FIX #1: normalise all incoming date strings so date pickers never show empty
  const normDate = (v: string) => isoToDMY(dmyToISO(v || ""));

  const [f, setF] = useState({
    name:            r.name||"",
    seatNo:          r.seat_no||"",
    shift:           r.shift||"",
    customShiftName: "",
    customShiftTime: "",
    bookingFrom:     normDate(r.booking_from),
    bookingTo:       normDate(r.booking_to),
    receiptDate:     normDate(r.receipt_date),
    fee:             String(r.fee||0),
    payMode1:        r.pay_mode_1||"",
    payAmount1:      r.pay_amount_1!==undefined?String(r.pay_amount_1):"",
    payMode2:        r.pay_mode_2||"",
    payAmount2:      r.pay_amount_2!==undefined&&r.pay_amount_2!==0?String(r.pay_amount_2):"",
    payMode3:        r.pay_mode_3||"",
    payAmount3:      r.pay_amount_3!==undefined&&r.pay_amount_3!==0?String(r.pay_amount_3):"",
    feesDue:         String(r.fees_due||0),
  });

  // FIX #7: yal_branch state
  const [yalBranch, setYalBranch] = useState(r.yal_branch||"");

  useEffect(() => {
    if (multiPay) {
      const paid=(Number(f.payAmount1)||0)+(Number(f.payAmount2)||0)+(Number(f.payAmount3)||0);
      setF(p=>({...p,feesDue:String(Math.max(0,Number(p.fee)-paid))}));
    } else {
      setF(p=>({...p,feesDue:"0"}));
    }
  }, [f.fee,f.payAmount1,f.payAmount2,f.payAmount3,multiPay]);

  async function save() {
    if (isSubmitting.current) return;
    if (!f.name.trim()) { showToast("Name required.","error"); return; }
    const validPhones = phones.filter(p=>p.number);
    if (!validPhones.length) { showToast("At least one phone required.","error"); return; }
    if (f.fee===""||f.fee===null) { showToast("Fee required.","error"); return; }
    if (dmyToISO(f.bookingTo) < dmyToISO(f.bookingFrom)) { showToast("'To' date cannot be before 'From'.","error"); return; }

    const sh = (shifts as Shift[]).find((s:Shift)=>s.shift_key===f.shift);
    const shName = f.customShiftName||sh?.shift_name||f.shift;
    const shTime = f.customShiftTime||sh?.shift_time||"";
    const shiftFull = shTime ? `${toU(shName)} (${toU(shTime)})` : toU(shName);

    showConfirm(`Save edits to ${r.receipt_no}? This overwrites the existing record.`, async () => {
      isSubmitting.current = true;
      startLoading("Saving receipt edits...");
      try {
        const payload = {
          receipt_no:  r.receipt_no,
          name:        toU(f.name),
          yal_branch:  toU(yalBranch),   // FIX #7
          phones:      validPhones.map(p=>({number:normalizePhone(p.number),tag:toU(p.tag)})),
          seat_no:     toU(f.seatNo),
          shift:       f.shift,
          shift_full:  shiftFull,
          booking_from: f.bookingFrom,
          booking_to:   f.bookingTo,
          receipt_date: f.receiptDate,
          fee:          Number(f.fee),
          pay_mode_1:   toU(f.payMode1),
          pay_amount_1: multiPay?(Number(f.payAmount1)||0):Number(f.fee),
          pay_mode_2:   multiPay?toU(f.payMode2):"",
          pay_amount_2: multiPay?(Number(f.payAmount2)||0):0,
          pay_mode_3:   multiPay?toU(f.payMode3):"",
          pay_amount_3: multiPay?(Number(f.payAmount3)||0):0,
        };
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateReceipt",payload})});
        const d = await res.json();
        if (d.ok) { showToast("Receipt updated!"); onClose(); }
        else showToast(d.error||"Failed to update.","error");
      } catch { showToast("Network error.","error"); }
      finally { stopLoading(); isSubmitting.current = false; }
    });
  }

  return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
        <button onClick={onClose} style={ghostBtn}>← Cancel</button>
        <div>
          <div style={{ fontSize:16,fontWeight:800,color:"#1e293b" }}>Edit Receipt</div>
          <div style={{ fontSize:12,color:"#6366f1",fontWeight:600 }}>{r.receipt_no} · {r.student_id}</div>
        </div>
      </div>
      <div style={{ background:"#fffbeb",borderRadius:12,padding:"10px 14px",fontSize:12,color:"#92400e",marginBottom:12,border:"1px solid #fcd34d" }}>
        ⚠️ Editing overwrites the stored receipt. Board status resets to pending.
      </div>

      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        <div style={card}>
          <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>👤 Student Details</div>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            <Field label="Name *">
              <input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value.toUpperCase()}))} style={inp} />
            </Field>
            <PhoneFields phones={phones} onChange={setPhones} />
            <Field label="Seat No.">
              <input value={f.seatNo} onChange={e=>setF(p=>({...p,seatNo:e.target.value.toUpperCase()}))} style={inp} />
            </Field>
            {/* FIX #7: branch selector shown when library has branches */}
            {libData?.has_branches && libBranches.length > 0 && (
              <Field label="Branch">
                <select value={yalBranch} onChange={e=>setYalBranch(e.target.value)} style={selS}>
                  <option value="">— No Branch —</option>
                  {libBranches.map((b:Branch)=>(
                    <option key={b.branch_code} value={b.branch_code}>{b.branch_code} — {b.branch_display}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>⏰ Shift</div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:8 }}>
            {(shifts as Shift[]).filter((s:Shift)=>s.active).map((sh:Shift)=>(
              <button key={sh.shift_key} onClick={()=>setF(p=>({...p,shift:sh.shift_key,customShiftName:sh.shift_name,customShiftTime:sh.shift_time}))}
                style={{ flex:1,minWidth:80,padding:"10px 6px",borderRadius:10,border:`2px solid ${f.shift===sh.shift_key?"#6366f1":"#e2e8f0"}`,background:f.shift===sh.shift_key?"#eff6ff":"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textAlign:"center",transition:"all 0.15s",fontSize:12,fontWeight:700,color:f.shift===sh.shift_key?"#4f46e5":"#1e293b" }}>
                {sh.shift_name}
              </button>
            ))}
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            <Field label="Shift Name">
              <input value={f.customShiftName} onChange={e=>setF(p=>({...p,customShiftName:e.target.value.toUpperCase()}))} style={{ ...inp,fontSize:13 }} />
            </Field>
            <Field label="Time">
              <input value={f.customShiftTime} onChange={e=>setF(p=>({...p,customShiftTime:e.target.value.toUpperCase()}))} style={{ ...inp,fontSize:13 }} />
            </Field>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>📅 Booking Period</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10 }}>
            <Field label="From"><DateInput value={f.bookingFrom} onChange={v=>setF(p=>({...p,bookingFrom:v}))} /></Field>
            <Field label="To"><DateInput value={f.bookingTo} onChange={v=>setF(p=>({...p,bookingTo:v}))} /></Field>
          </div>
          <Field label="Receipt Date"><DateInput value={f.receiptDate} onChange={v=>setF(p=>({...p,receiptDate:v}))} /></Field>
        </div>

        <div style={card}>
          <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>💰 Fees</div>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            <Field label="Total Fee (₹)">
              <NumInput value={f.fee} onChange={v=>setF(p=>({...p,fee:v}))} style={{ fontSize:18,fontWeight:700 }} />
            </Field>
            {!multiPay ? (
              <div style={{ display:"flex",gap:8 }}>
                <div style={{ flex:2 }}>
                  <Field label="Payment Mode">
                    <select value={f.payMode1} onChange={e=>setF(p=>({...p,payMode1:e.target.value}))} style={selS}>
                      <option value="">Select</option>
                      {(activeTags as string[]).map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </div>
                <button onClick={()=>setMultiPay(true)} style={{ marginTop:22,padding:"11px 14px",borderRadius:12,border:"1.5px dashed #6366f1",background:"#eff6ff",color:"#6366f1",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>+ Split</button>
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:12,fontWeight:700,color:"#64748b" }}>Split / Refund</span>
                  <button onClick={()=>{setMultiPay(false);setF(p=>({...p,payAmount1:"",payAmount2:"",payAmount3:"",payMode2:"",payMode3:"",feesDue:"0"}));}} style={{ fontSize:11,color:"#ef4444",background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Remove</button>
                </div>
                <div style={{ background:"#fffbeb",borderRadius:8,padding:"8px 10px",fontSize:11,color:"#92400e" }}>
                  💡 Negative = refund. Shows as <strong>REFUND-CASH-100</strong> in receipt.
                </div>
                {([[f.payMode1,f.payAmount1,"payMode1","payAmount1"],[f.payMode2,f.payAmount2,"payMode2","payAmount2"],[f.payMode3,f.payAmount3,"payMode3","payAmount3"]] as [string,string,string,string][]).map(([mode,amt,mKey,aKey],i)=>(
                  <div key={i} style={{ display:"flex",gap:8 }}>
                    <select value={mode} onChange={e=>setF(p=>({...p,[mKey]:e.target.value}))} style={{ ...selS,flex:2,fontSize:13 }}>
                      <option value="">Mode {i+1}</option>
                      {(activeTags as string[]).map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <NumInput value={amt} onChange={v=>setF(p=>({...p,[aKey]:v}))} placeholder="₹" style={{ flex:1,fontSize:12,color:Number(amt)<0?"#ef4444":"#1e293b" }} />
                  </div>
                ))}
                <Field label="Fees Due (₹)">
                  <NumInput value={f.feesDue} onChange={v=>setF(p=>({...p,feesDue:v}))} style={{ color:Number(f.feesDue)>0?"#ef4444":"#1e293b" }} />
                </Field>
              </div>
            )}
          </div>
        </div>

        <button onClick={save} style={primaryBtn}>Save Receipt Changes →</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STUDENTS TAB
// ═══════════════════════════════════════════════════════════════════
function StudentsTab({ showToast,showConfirm,startLoading,stopLoading,libraries,branches,shifts,activeTags,isSubmitting }:any) {
  const [view, setView]         = useState<"list"|"add"|"addPast"|"edit"|"editPast">("list");
  const [searchQ, setSearchQ]   = useState("");
  const [filterLib, setFilterLib] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal]       = useState(0);
  const [searched, setSearched] = useState(false);
  const [editSt, setEditSt]     = useState<Student|null>(null);
  const [editPhones, setEditPhones] = useState<PhoneEntry[]>(emptyPhones());
  const [formLib, setFormLib]   = useState("");
  const [formBranch, setFormBranch] = useState("");
  const [formPhones, setFormPhones] = useState<PhoneEntry[]>(emptyPhones());
  const [form, setForm]         = useState<any>({ name:"",seat_no:"",shift:"",payment_tag:"",address:"",preparing_for:"",aadhaar_last4:"",date_of_birth:"",student_id:"" });
  const [pastStudentId, setPastStudentId] = useState("");
  const [pastLastReceipt, setPastLastReceipt] = useState("");

  const formLibData = (libraries as Library[]).find((l:Library)=>l.library_code===formLib);
  const formBranches = (branches as Branch[]).filter((b:Branch)=>b.library_code===formLib&&b.active);

  async function loadAll(pg=1) {
    startLoading("Loading students...");
    try {
      const params = new URLSearchParams({action:"getAllStudents",library:filterLib,page:String(pg),limit:"20"});
      const res = await fetch(`${API}?${params}`);
      const d   = await res.json();
      if (d.ok) { setStudents(d.students||[]); setPage(d.page); setTotalPages(d.totalPages); setTotal(d.total); setSearched(true); }
    } catch { showToast("Failed to load.","error"); }
    stopLoading();
  }

  async function doSearch(pg=1) {
    if (!searchQ.trim()) { loadAll(pg); return; }
    startLoading("Searching...");
    try {
      const q = normalizePhone(searchQ)||searchQ;
      const params = new URLSearchParams({action:"searchStudents",q,library:filterLib});
      const res = await fetch(`${API}?${params}`);
      const d   = await res.json();
      if (d.ok) { setStudents(d.results||[]); setPage(1); setTotalPages(1); setTotal(d.results?.length||0); setSearched(true); }
    } catch { showToast("Search failed.","error"); }
    stopLoading();
  }

  useEffect(() => { loadAll(1); }, [filterLib]);

  async function deleteStudent(st: Student) {
    showConfirm(`Delete ${st.name} (${st.student_id})? Cannot be undone.`, async () => {
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
    isSubmitting.current = true; startLoading("Saving...");
    try {
      const libData = (libraries as Library[]).find((l:Library)=>l.library_code===editSt.library);
      const payload = { ...editSt, phones: editPhones.filter(p=>p.number).map(p=>({number:normalizePhone(p.number),tag:toU(p.tag)})), has_branches: libData?.has_branches||false };
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateStudent",payload})});
      const d   = await res.json();
      if (d.ok) { showToast("Student updated!"); setView("list"); loadAll(page); }
      else showToast(d.error||"Update failed.","error");
    } catch { showToast("Network error.","error"); }
    finally { stopLoading(); isSubmitting.current = false; }
  }

  async function saveEditPast() {
    if (!editSt||isSubmitting.current) return;
    isSubmitting.current = true; startLoading("Saving...");
    try {
      const payload = { student_id:editSt.student_id, name:toU(editSt.name||""), seat_no:toU(editSt.seat_no||""), shift:editSt.shift||"", payment_tag:toU(editSt.payment_tag||""), last_receipt_no:toU(editSt.last_receipt_no||""), phones:editPhones.filter(p=>p.number).map(p=>({number:normalizePhone(p.number),tag:toU(p.tag)})) };
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updatePastStudent",payload})});
      const d   = await res.json();
      if (d.ok) { showToast("Past student updated!"); setView("list"); loadAll(page); }
      else showToast(d.error||"Update failed.","error");
    } catch { showToast("Network error.","error"); }
    finally { stopLoading(); isSubmitting.current = false; }
  }

  async function addStudent() {
    if (!formLib||!form.name||!formPhones.filter((p:PhoneEntry)=>p.number).length) { showToast("Library, Name, and Phone required.","error"); return; }
    if (!form.student_id.trim()) { showToast("Student ID is required.","error"); return; }
    if (isSubmitting.current) return; isSubmitting.current = true;
    startLoading("Adding student...");
    try {
      const payload = { ...form, library:formLib, yal_branch:formBranch, has_branches:formLibData?.has_branches||false, phones:formPhones.filter((p:PhoneEntry)=>p.number).map((p:PhoneEntry)=>({number:normalizePhone(p.number),tag:toU(p.tag)})), name:toU(form.name), student_id:toU(form.student_id) };
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addStudent",payload})});
      const d   = await res.json();
      if (d.ok) { showToast("Student added!"); setView("list"); setFormLib(""); setFormBranch(""); setFormPhones(emptyPhones()); setForm({name:"",seat_no:"",shift:"",payment_tag:"",address:"",preparing_for:"",aadhaar_last4:"",date_of_birth:"",student_id:""}); loadAll(1); }
      else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    finally { stopLoading(); isSubmitting.current = false; }
  }

  async function addPastStudent() {
    if (!pastStudentId||!formLib||!form.name||!formPhones.filter((p:PhoneEntry)=>p.number).length) { showToast("ID, Library, Name, Phone required.","error"); return; }
    if (isSubmitting.current) return; isSubmitting.current = true;
    startLoading("Adding past student...");
    try {
      const payload = { student_id:toU(pastStudentId), library:formLib, yal_branch:formBranch, has_branches:formLibData?.has_branches||false, name:toU(form.name), phones:formPhones.filter((p:PhoneEntry)=>p.number).map((p:PhoneEntry)=>({number:normalizePhone(p.number),tag:toU(p.tag)})), seat_no:toU(form.seat_no||""), shift:form.shift||"", payment_tag:toU(form.payment_tag||""), last_receipt_no:toU(pastLastReceipt||"") };
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addPastStudent",payload})});
      const d   = await res.json();
      if (d.ok) { showToast("Past student added!"); setView("list"); setPastStudentId(""); setPastLastReceipt(""); setFormLib(""); setFormBranch(""); setFormPhones(emptyPhones()); setForm({name:"",seat_no:"",shift:"",payment_tag:"",address:"",preparing_for:"",aadhaar_last4:"",date_of_birth:"",student_id:""}); loadAll(1); }
      else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    finally { stopLoading(); isSubmitting.current = false; }
  }

  function SharedFormBody({ isPast=false }: { isPast?:boolean }) {
    return (
      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        {!isPast && (
          <Field label="Student ID *">
            <input value={form.student_id||""} onChange={e=>setForm((p:any)=>({...p,student_id:e.target.value.toUpperCase()}))} placeholder="e.g. F200" style={inp} />
          </Field>
        )}
        {isPast && (
          <Field label="Student ID *">
            <input value={pastStudentId} onChange={e=>setPastStudentId(e.target.value.toUpperCase())} placeholder="e.g. F116" style={inp} />
          </Field>
        )}
        <Field label="Library *">
          <select value={formLib} onChange={e=>{setFormLib(e.target.value);setFormBranch("");}} style={selS}>
            <option value="">Select</option>
            {(libraries as Library[]).filter((l:Library)=>l.active).map((l:Library)=><option key={l.library_code} value={l.library_code}>{l.display_name}</option>)}
          </select>
        </Field>
        {formLib && formLibData?.has_branches && (
          <Field label="Branch">
            <select value={formBranch} onChange={e=>setFormBranch(e.target.value)} style={selS}>
              <option value="">Select</option>
              {formBranches.map((b:Branch)=><option key={b.branch_code} value={b.branch_code}>{b.branch_display}</option>)}
            </select>
          </Field>
        )}
        <Field label="Name *">
          <input value={form.name} onChange={e=>setForm((p:any)=>({...p,name:e.target.value.toUpperCase()}))} style={inp} />
        </Field>
        <PhoneFields phones={formPhones} onChange={setFormPhones} />
        <Field label="Seat No.">
          <input value={form.seat_no||""} onChange={e=>setForm((p:any)=>({...p,seat_no:e.target.value.toUpperCase()}))} style={inp} />
        </Field>
        <Field label="Shift">
          <select value={form.shift||""} onChange={e=>setForm((p:any)=>({...p,shift:e.target.value}))} style={selS}>
            <option value="">Select</option>
            {(shifts as Shift[]).filter((s:Shift)=>s.active).map((s:Shift)=><option key={s.shift_key} value={s.shift_key}>{s.shift_name}</option>)}
          </select>
        </Field>
        <Field label="Payment Tag">
          <select value={form.payment_tag||""} onChange={e=>setForm((p:any)=>({...p,payment_tag:e.target.value}))} style={selS}>
            <option value="">Select</option>
            {(activeTags as string[]).map((t:string)=><option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        {isPast && (
          <Field label="Last Receipt No.">
            <input value={pastLastReceipt} onChange={e=>setPastLastReceipt(e.target.value.toUpperCase())} placeholder="e.g. R1586" style={inp} />
          </Field>
        )}
        {!isPast && (
          <>
            <Field label="Address"><input value={form.address||""} onChange={e=>setForm((p:any)=>({...p,address:e.target.value.toUpperCase()}))} style={inp} /></Field>
            <Field label="Preparing For"><input value={form.preparing_for||""} onChange={e=>setForm((p:any)=>({...p,preparing_for:e.target.value.toUpperCase()}))} style={inp} /></Field>
            <Field label="Aadhaar Last 4"><input value={form.aadhaar_last4||""} onChange={e=>setForm((p:any)=>({...p,aadhaar_last4:e.target.value.slice(0,4)}))} maxLength={4} style={inp} inputMode="numeric" /></Field>
            <Field label="Date of Birth"><DateInput value={form.date_of_birth||""} onChange={v=>setForm((p:any)=>({...p,date_of_birth:v}))} /></Field>
          </>
        )}
      </div>
    );
  }

  if (view==="add") return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <button onClick={()=>setView("list")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
      <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:16 }}>Add New Student</div>
      <div style={card}><SharedFormBody /></div>
      <button onClick={addStudent} style={{ ...primaryBtn,marginTop:4 }}>Add Student</button>
    </div>
  );

  if (view==="addPast") return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <button onClick={()=>setView("list")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
      <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:8 }}>Add Past Student</div>
      <div style={{ background:"#fffbeb",borderRadius:12,padding:"10px 14px",fontSize:13,color:"#92400e",marginBottom:12,border:"1px solid #fcd34d" }}>Enter original Student ID and last Receipt No. from existing records.</div>
      <div style={card}><SharedFormBody isPast /></div>
      <button onClick={addPastStudent} style={{ ...primaryBtn,marginTop:4 }}>Add Past Student</button>
    </div>
  );

  if (view==="editPast"&&editSt) return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <button onClick={()=>setView("list")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
      <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:4 }}>Edit Past Student</div>
      <div style={{ fontSize:12,color:"#f59e0b",fontWeight:600,marginBottom:16 }}>{editSt.student_id} · PAST</div>
      <div style={card}>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          <Field label="Name"><input value={editSt.name||""} onChange={e=>setEditSt(s=>s?{...s,name:e.target.value.toUpperCase()}:s)} style={inp} /></Field>
          <PhoneFields phones={editPhones} onChange={setEditPhones} />
          <Field label="Seat No."><input value={editSt.seat_no||""} onChange={e=>setEditSt(s=>s?{...s,seat_no:e.target.value.toUpperCase()}:s)} style={inp} /></Field>
          <Field label="Shift">
            <select value={editSt.shift||""} onChange={e=>setEditSt(s=>s?{...s,shift:e.target.value}:s)} style={selS}>
              <option value="">Select</option>
              {(shifts as Shift[]).filter((s:Shift)=>s.active).map((s:Shift)=><option key={s.shift_key} value={s.shift_key}>{s.shift_name}</option>)}
            </select>
          </Field>
          <Field label="Payment Tag">
            <select value={editSt.payment_tag||""} onChange={e=>setEditSt(s=>s?{...s,payment_tag:e.target.value}:s)} style={selS}>
              <option value="">Select</option>
              {(activeTags as string[]).map((t:string)=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Last Receipt No.">
            <input value={editSt.last_receipt_no||""} onChange={e=>setEditSt(s=>s?{...s,last_receipt_no:e.target.value.toUpperCase()}:s)} style={inp} />
          </Field>
        </div>
      </div>
      <button onClick={saveEditPast} style={{ ...primaryBtn,marginTop:4 }}>Save Changes</button>
    </div>
  );

  if (view==="edit"&&editSt) return (
    <div style={{ animation:"slideUp 0.25s ease" }}>
      <button onClick={()=>setView("list")} style={{ ...ghostBtn,marginBottom:16 }}>← Back</button>
      <div style={{ fontSize:16,fontWeight:800,color:"#1e293b",marginBottom:16 }}>Edit: {editSt.student_id}</div>
      <div style={card}>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          <Field label="Name"><input value={editSt.name||""} onChange={e=>setEditSt(s=>s?{...s,name:e.target.value.toUpperCase()}:s)} style={inp} /></Field>
          <PhoneFields phones={editPhones} onChange={setEditPhones} />
          <Field label="Seat No."><input value={editSt.seat_no||""} onChange={e=>setEditSt(s=>s?{...s,seat_no:e.target.value.toUpperCase()}:s)} style={inp} /></Field>
          <Field label="Shift">
            <select value={editSt.shift||""} onChange={e=>setEditSt(s=>s?{...s,shift:e.target.value}:s)} style={selS}>
              <option value="">Select</option>
              {(shifts as Shift[]).filter((s:Shift)=>s.active).map((s:Shift)=><option key={s.shift_key} value={s.shift_key}>{s.shift_name}</option>)}
            </select>
          </Field>
          <Field label="Library">
            <select value={editSt.library||""} onChange={e=>setEditSt(s=>s?{...s,library:e.target.value}:s)} style={selS}>
              {(libraries as Library[]).filter((l:Library)=>l.active).map((l:Library)=><option key={l.library_code} value={l.library_code}>{l.display_name}</option>)}
            </select>
          </Field>
          <Field label="Address"><input value={editSt.address||""} onChange={e=>setEditSt(s=>s?{...s,address:e.target.value.toUpperCase()}:s)} style={inp} /></Field>
          <Field label="Preparing For"><input value={editSt.preparing_for||""} onChange={e=>setEditSt(s=>s?{...s,preparing_for:e.target.value.toUpperCase()}:s)} style={inp} /></Field>
          <Field label="Aadhaar Last 4"><input value={editSt.aadhaar_last4||""} onChange={e=>setEditSt(s=>s?{...s,aadhaar_last4:e.target.value.slice(0,4)}:s)} maxLength={4} style={inp} inputMode="numeric" /></Field>
          <Field label="Date of Birth"><DateInput value={editSt.date_of_birth||""} onChange={v=>setEditSt(s=>s?{...s,date_of_birth:v}:s)} /></Field>
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
        {(libraries as Library[]).filter((l:Library)=>l.active).map((l:Library)=><Pill key={l.library_code} text={l.library_code} active={filterLib===l.library_code} onClick={()=>setFilterLib(l.library_code)} />)}
      </div>
      <div style={{ display:"flex",gap:8,marginBottom:14 }}>
        <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Name / Phone / ID" style={{ ...inp,flex:1 }} />
        <button onClick={()=>doSearch(1)} style={{ padding:"11px 16px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Go</button>
      </div>
      {searched && <div style={{ fontSize:12,color:"#94a3b8",marginBottom:10 }}>{total} students{filterLib&&` in ${filterLib}`}</div>}
      {students.map((st,i)=>(
        <StudentCard key={i} st={st} libraries={libraries}
          onEdit={()=>{
            setEditSt(st);
            setEditPhones([...(st.phones||[]),{number:"",tag:""},{number:"",tag:""},{number:"",tag:""}].slice(0,4));
            setView(st.is_past?"editPast":"edit");
          }}
          onDelete={st.is_past?undefined:()=>deleteStudent(st)} />
      ))}
      {students.length===0&&searched && (
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
function BoardTab({ showToast,showConfirm,startLoading,stopLoading,libraries,shifts,activeTags,branches }:any) {
  const [view, setView]   = useState<"pending"|"history">("pending");
  const [pending, setPending] = useState<ReceiptEntry[]>([]);
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [filterLib, setFilterLib] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [page, setPage]   = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [editReceipt, setEditReceipt] = useState<ReceiptEntry|null>(null);
  const isSubmitting = useRef(false);

  async function loadPending() {
    startLoading("Loading board...");
    try {
      const res = await fetch(`${API}?action=getPendingBoard&library=${filterLib}`);
      const d   = await res.json();
      if (d.ok) { setPending(d.pending||[]); setLoaded(true); }
    } catch { showToast("Failed.","error"); }
    stopLoading();
  }

  async function loadHistory(pg=1) {
    startLoading("Loading receipts...");
    try {
      const q = normalizePhone(searchQ)||searchQ;
      const params = new URLSearchParams({action:"getReceiptLog",library:filterLib,q,page:String(pg),limit:"20"});
      const res = await fetch(`${API}?${params}`);
      const d   = await res.json();
      if (d.ok) { setReceipts(d.receipts||[]); setPage(d.page); setTotalPages(d.totalPages); }
    } catch { showToast("Failed.","error"); }
    stopLoading();
  }

  useEffect(() => { view==="pending"?loadPending():loadHistory(1); }, [filterLib,view]);

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

  if (editReceipt) {
    return <EditReceiptForm
      receipt={editReceipt}
      shifts={shifts}
      activeTags={activeTags}
      libraries={libraries}
      branches={branches}
      onClose={()=>{setEditReceipt(null);view==="pending"?loadPending():loadHistory(page);}}
      showToast={showToast}
      showConfirm={showConfirm}
      startLoading={startLoading}
      stopLoading={stopLoading}
      isSubmitting={isSubmitting}
    />;
  }

  return (
    <div>
      <div style={{ display:"flex",gap:8,marginBottom:14 }}>
        <Pill text={`📋 Pending (${pending.length})`} active={view==="pending"} onClick={()=>setView("pending")} />
        <Pill text="📜 History" active={view==="history"} onClick={()=>setView("history")} />
      </div>
      <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4,marginBottom:12 }}>
        <Pill text="All" active={filterLib===""} onClick={()=>setFilterLib("")} />
        {(libraries as Library[]).filter((l:Library)=>l.active).map((l:Library)=><Pill key={l.library_code} text={l.library_code} active={filterLib===l.library_code} onClick={()=>setFilterLib(l.library_code)} />)}
      </div>
      {view==="pending" && (
        <>
          {loaded&&pending.length===0 && (
            <div style={{ textAlign:"center",padding:"48px 0",color:"#94a3b8" }}>
              <div style={{ fontSize:48,marginBottom:10 }}>✅</div>
              <div style={{ fontSize:16,fontWeight:700,color:"#1e293b",marginBottom:4 }}>All Clear!</div>
            </div>
          )}
          {pending.map((entry,i)=>(
            <div key={i} style={{ ...card,marginBottom:10 }}>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
                  <span style={{ fontWeight:700,fontSize:15,color:"#1e293b" }}>{entry.name}</span>
                  <Badge text={entry.type} color={entry.type==="NEW"?"#10b981":"#6366f1"} />
                  {entry.is_cross_library==="YES"&&<Badge text="CROSS" color="#f59e0b" />}
                </div>
                <div style={{ fontSize:12,color:"#64748b",marginTop:3 }}>{entry.receipt_no} · {entry.student_id}</div>
                <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{entry.library}{entry.yal_branch?` (${entry.yal_branch})`:""} · Seat {entry.seat_no}</div>
                <div style={{ fontSize:12,color:"#94a3b8",marginTop:2 }}>{fmtDate(entry.booking_from)} → {fmtDate(entry.booking_to)}</div>
                {/* FIX #9: fmtDateTime for generated_at */}
                <div style={{ fontSize:11,color:"#cbd5e1",marginTop:2 }}>{fmtDateTime(entry.generated_at)}</div>
              </div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {entry.registration_text&&<CopyBtn text={entry.registration_text} label="Group Copy" />}
                {entry.receipt_text&&<CopyBtn text={entry.receipt_text} label="Receipt" accent="#10b981" />}
                <CopyBtn text={`${entry.name} ${entry.library} ${entry.student_id}`} label="Contact" accent="#f59e0b" />
                <button onClick={()=>setEditReceipt(entry)} style={{ padding:"11px 14px",borderRadius:12,border:"1.5px solid #6366f133",background:"#eff6ff",color:"#4f46e5",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>✏️ Edit</button>
                <button onClick={()=>markUpdated(entry.receipt_no)} style={{ padding:"11px 14px",borderRadius:12,border:"none",background:"#1e293b",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",flex:1 }}>✓ Mark Updated</button>
              </div>
            </div>
          ))}
        </>
      )}
      {view==="history" && (
        <>
          <div style={{ display:"flex",gap:8,marginBottom:12 }}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Receipt / Student / Name / Phone" style={{ ...inp,flex:1 }} />
            <button onClick={()=>loadHistory(1)} style={{ padding:"11px 16px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Go</button>
          </div>
          {receipts.map((r,i)=><ReceiptCard key={i} r={r} libraries={libraries} shifts={shifts} activeTags={activeTags} onEditReceipt={setEditReceipt} />)}
          {receipts.length===0&&<div style={{ textAlign:"center",padding:"40px 0",color:"#94a3b8" }}><div style={{ fontSize:36,marginBottom:8 }}>📜</div><div style={{ fontSize:14 }}>No receipts found.</div></div>}
          <Pagination page={page} totalPages={totalPages} onChange={pg=>loadHistory(pg)} />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DUES TAB
// ═══════════════════════════════════════════════════════════════════
function DuesTab({ showToast,showConfirm,startLoading,stopLoading,activeTags,libraries,isSubmitting }:any) {
  const [pending, setPending]   = useState<ReceiptEntry[]>([]);
  const [filterLib, setFilterLib] = useState("");
  const [loaded, setLoaded]     = useState(false);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [payments, setPayments] = useState<Record<string,DuePayment[]>>({});
  const [payForm, setPayForm]   = useState<Record<string,{mode:string;amount:string;notes:string}>>({});
  const [resultText, setResultText] = useState<{receiptNo:string;text:string}|null>(null);

  // FIX #6: auto-dismiss result text after 10 seconds
  useEffect(() => {
    if (!resultText) return;
    const t = setTimeout(() => setResultText(null), 10000);
    return () => clearTimeout(t);
  }, [resultText]);

  async function load() {
    startLoading("Loading dues...");
    try {
      const res = await fetch(`${API}?action=getPendingDues&library=${filterLib}`);
      const d   = await res.json();
      if (d.ok) { setPending(d.pending||[]); setLoaded(true); }
    } catch { showToast("Failed.","error"); }
    stopLoading();
  }

  useEffect(() => { load(); }, [filterLib]);

  // FIX #6: also clear result text when library filter changes
  useEffect(() => { setResultText(null); }, [filterLib]);

  async function loadPayments(receiptNo: string) {
    try {
      const res = await fetch(`${API}?action=getDuePayments&receipt_no=${encodeURIComponent(receiptNo)}`);
      const d   = await res.json();
      if (d.ok) setPayments(p=>({...p,[receiptNo]:d.payments||[]}));
    } catch {}
  }

  function toggleExpand(receiptNo: string) {
    if (expanded===receiptNo) { setExpanded(null); return; }
    setExpanded(receiptNo); loadPayments(receiptNo);
    if (!payForm[receiptNo]) setPayForm(f=>({...f,[receiptNo]:{mode:"",amount:"",notes:""}}));
  }

  async function submitPayment(entry: ReceiptEntry) {
    const pf = payForm[entry.receipt_no];
    if (!pf?.mode)   { showToast("Payment mode required.","error"); return; }
    if (!pf?.amount) { showToast("Amount required.","error"); return; }
    const amt = Number(pf.amount);
    if (amt<=0) { showToast("Amount must be > 0.","error"); return; }
    if (amt>(entry.fees_due_balance||0)) { showToast(`Exceeds balance of ₹${entry.fees_due_balance}.`,"error"); return; }
    showConfirm(`Record ₹${amt} from ${entry.name} via ${pf.mode}?`, async () => {
      if (isSubmitting.current) return; isSubmitting.current = true;
      startLoading("Recording payment...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logFeePayment",payload:{receipt_no:entry.receipt_no,payment_mode:toU(pf.mode),amount_received:amt,notes:toU(pf.notes||"")}})});
        const d   = await res.json();
        if (d.ok) {
          showToast("Payment recorded!");
          setResultText({receiptNo:entry.receipt_no,text:d.whatsapp_text});
          setPayForm(f=>({...f,[entry.receipt_no]:{mode:"",amount:"",notes:""}}));
          load();
          loadPayments(entry.receipt_no);
        } else showToast(d.error||"Failed.","error");
      } catch { showToast("Network error.","error"); }
      finally { stopLoading(); isSubmitting.current = false; }
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
        {(libraries as Library[]).filter((l:Library)=>l.active).map((l:Library)=><Pill key={l.library_code} text={l.library_code} active={filterLib===l.library_code} onClick={()=>setFilterLib(l.library_code)} />)}
      </div>
      {resultText && (
        <div style={{ ...card,background:"#ecfdf5",border:"1.5px solid #86efac",marginBottom:14 }}>
          <div style={{ fontSize:13,fontWeight:700,color:"#059669",marginBottom:10 }}>✓ Payment Recorded — {resultText.receiptNo}</div>
          <div style={{ display:"flex",gap:8,marginBottom:10 }}><CopyBtn text={resultText.text} label="Copy WhatsApp Update" accent="#10b981" /></div>
          <pre style={{ fontSize:11,color:"#374151",whiteSpace:"pre-wrap",fontFamily:"'DM Mono',monospace",lineHeight:1.6,background:"#f0fdf4",borderRadius:8,padding:10,margin:0 }}>{resultText.text}</pre>
          <button onClick={()=>setResultText(null)} style={{ ...ghostBtn,marginTop:10,width:"100%",fontSize:13 }}>Dismiss</button>
        </div>
      )}
      {loaded&&pending.length===0 && (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#94a3b8" }}>
          <div style={{ fontSize:48,marginBottom:10 }}>💰</div>
          <div style={{ fontSize:16,fontWeight:700,color:"#1e293b",marginBottom:4 }}>No Outstanding Dues!</div>
        </div>
      )}
      {pending.map((entry,i)=>{
        const isOpen=expanded===entry.receipt_no;
        const pf=payForm[entry.receipt_no]||{mode:"",amount:"",notes:""};
        const entryPayments=payments[entry.receipt_no]||[];
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
                  {/* FIX #9: fmtDateTime for generated_at */}
                  <div style={{ fontSize:11,color:"#cbd5e1",marginTop:2 }}>{fmtDateTime(entry.generated_at)}</div>
                </div>
                <span style={{ color:"#cbd5e1",fontSize:18,marginTop:2 }}>{isOpen?"▲":"▼"}</span>
              </div>
            </div>
            {isOpen && (
              <div style={{ marginTop:14,paddingTop:14,borderTop:"1px solid #f1f5f9" }}>
                {entryPayments.length>0 && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8 }}>Payment History</div>
                    {entryPayments.map((pay,j)=>(
                      <div key={j} style={{ background:"#f8fafc",borderRadius:10,padding:"10px 12px",marginBottom:6 }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                          <div><span style={{ fontWeight:700,fontSize:13,color:"#1e293b" }}>₹{pay.amount_received}</span><span style={{ fontSize:12,color:"#64748b",marginLeft:6 }}>via {pay.payment_mode}</span></div>
                          <span style={{ fontSize:11,color:"#94a3b8" }}>Bal: ₹{pay.balance_after}</span>
                        </div>
                        {/* FIX #9: fmtDateTime for received_on */}
                        <div style={{ fontSize:11,color:"#94a3b8",marginTop:4 }}>{fmtDateTime(pay.received_on)}</div>
                        {pay.notes&&<div style={{ fontSize:11,color:"#64748b",marginTop:2 }}>{pay.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ background:"#fef2f2",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:13,fontWeight:700,color:"#dc2626" }}>Outstanding Balance</span>
                  <span style={{ fontSize:18,fontWeight:800,color:"#dc2626",fontFamily:"'DM Mono',monospace" }}>₹{entry.fees_due_balance}</span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  <div style={{ fontSize:12,fontWeight:700,color:"#1e293b",textTransform:"uppercase",letterSpacing:"0.07em" }}>Record Payment</div>
                  <div style={{ display:"flex",gap:8 }}>
                    <select value={pf.mode} onChange={e=>setPayForm(f=>({...f,[entry.receipt_no]:{...pf,mode:e.target.value}}))} style={{ ...selS,flex:2,fontSize:13 }}>
                      <option value="">Payment Mode *</option>
                      {(activeTags as string[]).map((t:string)=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <NumInput value={pf.amount} onChange={v=>setPayForm(f=>({...f,[entry.receipt_no]:{...pf,amount:v}}))} placeholder="₹ *" style={{ flex:1,fontSize:13 }} />
                  </div>
                  <input value={pf.notes} onChange={e=>setPayForm(f=>({...f,[entry.receipt_no]:{...pf,notes:e.target.value.toUpperCase()}}))} placeholder="Notes (optional)" style={{ ...inp,fontSize:13 }} />
                  <button onClick={()=>submitPayment(entry)} style={{ padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                    Record Payment ✓
                  </button>
                  <div style={{ display:"flex",gap:8 }}>
                    {entry.receipt_text&&<CopyBtn text={entry.receipt_text} label="Copy Receipt" accent="#6366f1" />}
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
// PENDING OPTIONAL TAB
// ═══════════════════════════════════════════════════════════════════
function PendingTab({ showToast,startLoading,stopLoading,libraries,isSubmitting }:any) {
  const [students, setStudents] = useState<Student[]>([]);
  const [filterLib, setFilterLib] = useState("");
  const [loaded, setLoaded]     = useState(false);
  const [editing, setEditing]   = useState<Record<string,any>>({});

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
    finally { stopLoading(); isSubmitting.current = false; }
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
        {(libraries as Library[]).filter((l:Library)=>l.active).map((l:Library)=><Pill key={l.library_code} text={l.library_code} active={filterLib===l.library_code} onClick={()=>setFilterLib(l.library_code)} />)}
      </div>
      {loaded&&students.length===0 && (
        <div style={{ textAlign:"center",padding:"48px 0",color:"#94a3b8" }}>
          <div style={{ fontSize:48,marginBottom:10 }}>✅</div>
          <div style={{ fontSize:16,fontWeight:700,color:"#1e293b",marginBottom:4 }}>All Complete!</div>
        </div>
      )}
      {students.map((st,i)=>{
        const isEditing=!!editing[st.student_id];
        const editData=editing[st.student_id]||{};
        const missing:string[]=[];
        if(!st.address)missing.push("Address");
        if(!st.preparing_for)missing.push("Preparing For");
        if(!st.aadhaar_last4)missing.push("Aadhaar Last 4");
        if(!st.date_of_birth)missing.push("Date of Birth");
        return (
          <div key={i} style={{ ...card,marginBottom:8 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4 }}>
                  <span style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{st.name}</span>
                  <Badge text={st.library} color="#6366f1" />
                </div>
                <div style={{ fontSize:12,color:"#64748b" }}>{st.student_id} · {st.phones?.[0]?.number||""}</div>
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
                <Field label="Address"><input value={editData.address||""} onChange={e=>setEditing(ed=>({...ed,[st.student_id]:{...editData,address:e.target.value.toUpperCase()}}))} style={inp} /></Field>
                <Field label="Preparing For"><input value={editData.preparing_for||""} onChange={e=>setEditing(ed=>({...ed,[st.student_id]:{...editData,preparing_for:e.target.value.toUpperCase()}}))} style={inp} /></Field>
                <Field label="Aadhaar Last 4"><input value={editData.aadhaar_last4||""} onChange={e=>setEditing(ed=>({...ed,[st.student_id]:{...editData,aadhaar_last4:e.target.value.slice(0,4)}}))} maxLength={4} style={inp} inputMode="numeric" /></Field>
                <Field label="Date of Birth"><DateInput value={editData.date_of_birth||""} onChange={v=>setEditing(ed=>({...ed,[st.student_id]:{...editData,date_of_birth:v}}))} /></Field>
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
function SettingsTab({ showToast,showConfirm,startLoading,stopLoading,libraries,branches,fees,shifts,allTags,activeTags,settings,loadInit,isSubmitting }:any) {
  const [section, setSection] = useState<"tags"|"shifts"|"libraries"|"counters">("tags");
  const [newTag, setNewTag]   = useState("");
  const [editShift, setEditShift] = useState<Shift|null>(null);
  const [addingShift, setAddingShift] = useState(false);
  const [newShift, setNewShift] = useState({ shift_key:"",shift_name:"",shift_time:"" });
  const [countersEdit, setCountersEdit] = useState<Record<string,any>>({});
  const [addingLib, setAddingLib] = useState(false);
  const [newLib, setNewLib]   = useState({ library_code:"",library_name:"",display_name:"",emoji:"📚",has_branches:false });
  // FIX #8: state for inline branch adding after library creation
  const [pendingBranchesForLib, setPendingBranchesForLib] = useState<string|null>(null);
  const [newBranches, setNewBranches] = useState<{branch_code:string;branch_display:string;emoji:string}[]>([{branch_code:"",branch_display:"",emoji:""}]);
  const [editingFees, setEditingFees] = useState<string|null>(null);
  const [feeEdits, setFeeEdits] = useState<Record<string,Record<string,number>>>({});
  const [feesDirty, setFeesDirty] = useState(false);

  useEffect(() => {
    const ed: Record<string,any> = {};
    Object.keys(settings).forEach(lib=>{ ed[lib]={...settings[lib]}; });
    setCountersEdit(ed);
  }, [settings]);

  useEffect(() => {
    if (feesDirty) return;
    const fe: Record<string,Record<string,number>> = {};
    Object.keys(fees).forEach(fk=>{ fe[fk]={...fees[fk]}; });
    setFeeEdits(fe);
  }, [fees]);

  const feeKeys = [
    ...(libraries as Library[]).filter((l:Library)=>l.active&&!l.has_branches).map((l:Library)=>({ key:l.library_code, label:l.display_name, emoji:l.emoji })),
    ...(branches as Branch[]).filter((b:Branch)=>b.active).map((b:Branch)=>({ key:b.branch_code, label:b.branch_display, emoji:b.emoji||"" })),
  ];

  async function addTag() {
    if (!newTag.trim()) return;
    if (isSubmitting.current) return; isSubmitting.current = true;
    startLoading("Adding tag...");
    try {
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addPaymentTag",payload:{tag_name:newTag.toUpperCase()}})});
      const d   = await res.json();
      if (d.ok) { showToast("Tag added!"); setNewTag(""); loadInit(); } else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    finally { stopLoading(); isSubmitting.current = false; }
  }

  async function toggleTag(tagName:string, current:boolean) {
    showConfirm(`${current?"Deactivate":"Activate"} tag "${tagName}"?`, async () => {
      startLoading("Updating...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"togglePaymentTag",payload:{tag_name:tagName,active:!current}})});
        const d   = await res.json();
        if (d.ok) { showToast("Tag updated!"); loadInit(); } else showToast(d.error||"Failed.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading();
    });
  }

  async function saveShift(s: Shift) {
    startLoading("Saving shift...");
    try {
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateShift",payload:s})});
      const d   = await res.json();
      if (d.ok) { showToast("Shift updated!"); setEditShift(null); loadInit(); } else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading();
  }

  async function toggleShift(sh: Shift) {
    showConfirm(`${sh.active?"Deactivate":"Activate"} "${sh.shift_name}"?`, async () => {
      startLoading("Updating...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"toggleShift",payload:{shift_key:sh.shift_key,active:!sh.active}})});
        const d   = await res.json();
        if (d.ok) { showToast("Shift updated!"); loadInit(); } else showToast(d.error||"Failed.","error");
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
      if (d.ok) { showToast("Shift added!"); setAddingShift(false); setNewShift({shift_key:"",shift_name:"",shift_time:""}); loadInit(); } else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading();
  }

  async function saveFees(feeKey: string) {
    startLoading("Saving fees...");
    try {
      const shiftFees = feeEdits[feeKey]||{};
      for (const shiftKey of Object.keys(shiftFees)) {
        await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateFee",payload:{fee_key:feeKey,shift_key:shiftKey,fee_amount:shiftFees[shiftKey]}})});
      }
      showToast("Fees saved!"); setEditingFees(null); setFeesDirty(false); loadInit();
    } catch { showToast("Network error.","error"); }
    stopLoading();
  }

  // FIX #8: add library, then if has_branches show branch entry form inline
  async function addLibraryFn() {
    if (!newLib.library_code||!newLib.library_name) { showToast("Code and name required.","error"); return; }
    startLoading("Adding library...");
    try {
      const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addLibrary",payload:newLib})});
      const d   = await res.json();
      if (d.ok) {
        showToast("Library added!");
        if (newLib.has_branches) {
          // FIX #8: show branch entry form for this newly created library
          setPendingBranchesForLib(newLib.library_code.toUpperCase());
          setNewBranches([{branch_code:"",branch_display:"",emoji:""}]);
        }
        setAddingLib(false);
        setNewLib({library_code:"",library_name:"",display_name:"",emoji:"📚",has_branches:false});
       } else showToast(d.error||"Failed.","error");
    } catch { showToast("Network error.","error"); }
    stopLoading();
  }

  // FIX #8: save all branches entered for the newly created library
  async function savePendingBranches() {
    if (!pendingBranchesForLib) return;
    const valid = newBranches.filter(b=>b.branch_code.trim());
    if (!valid.length) { showToast("Enter at least one branch code.","error"); return; }
    startLoading("Adding branches...");
    let added = 0;
    for (const b of valid) {
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"addBranch",payload:{library_code:pendingBranchesForLib,branch_code:b.branch_code.toUpperCase(),branch_display:b.branch_display,emoji:b.emoji}})});
        const d = await res.json();
        if (d.ok) added++;
        else showToast(`Branch ${b.branch_code}: ${d.error}`,"error");
      } catch { showToast("Network error.","error"); }
    }
    stopLoading();
    if (added > 0) { showToast(`${added} branch(es) added!`); setPendingBranchesForLib(null); setNewBranches([{branch_code:"",branch_display:"",emoji:""}]); loadInit(); }
  }

  async function toggleLibrary(lib: Library) {
    showConfirm(`${lib.active?"Deactivate":"Activate"} "${lib.display_name}"?`, async () => {
      startLoading("Updating...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"toggleLibrary",payload:{library_code:lib.library_code,active:!lib.active}})});
        const d   = await res.json();
        if (d.ok) { showToast("Library updated!"); loadInit(); } else showToast(d.error||"Failed.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading();
    });
  }

  async function saveCounters(lib:string) {
    showConfirm(`Save cutoff settings for ${lib}?`, async () => {
      startLoading("Saving...");
      try {
        const res = await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateSettings",payload:{library:lib,...countersEdit[lib]}})});
        const d   = await res.json();
        if (d.ok) { showToast("Settings saved!"); loadInit(); } else showToast(d.error||"Failed.","error");
      } catch { showToast("Network error.","error"); }
      stopLoading();
    });
  }

  return (
    <div>
      <div style={{ display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4 }}>
        <Pill text="💳 Tags" active={section==="tags"} onClick={()=>setSection("tags")} />
        <Pill text="⏰ Shifts" active={section==="shifts"} onClick={()=>setSection("shifts")} />
        <Pill text="🏛️ Libraries" active={section==="libraries"} onClick={()=>setSection("libraries")} />
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
                </div>
                <button onClick={()=>toggleTag(tag.tag_name,tag.active)}
                  style={{ padding:"6px 12px",borderRadius:8,border:`1.5px solid ${tag.active?"#fecaca":"#bbf7d0"}`,background:"#fff",cursor:"pointer",fontSize:12,fontWeight:700,color:tag.active?"#ef4444":"#10b981",fontFamily:"'DM Sans',sans-serif" }}>
                  {tag.active?"Deactivate":"Activate"}
                </button>
              </div>
            ))}
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <input value={newTag} onChange={e=>setNewTag(e.target.value.toUpperCase())} placeholder="NEW TAG NAME" style={{ ...inp,flex:1 }} />
            <button onClick={addTag} style={{ padding:"11px 18px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14 }}>Add</button>
          </div>
        </div>
      )}

      {section==="shifts" && (
        <div>
          <div style={{ fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:12 }}>Shifts</div>
          {(shifts as Shift[]).map((sh,i)=>(
            <div key={i} style={{ ...card,marginBottom:8,opacity:sh.active?1:0.6 }}>
              {editShift?.shift_key===sh.shift_key ? (
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                    <Field label="Shift Name"><input value={editShift.shift_name} onChange={e=>setEditShift(s=>s?{...s,shift_name:e.target.value}:s)} style={{ ...inp,fontSize:13 }} /></Field>
                    <Field label="Time Period"><input value={editShift.shift_time} onChange={e=>setEditShift(s=>s?{...s,shift_time:e.target.value}:s)} style={{ ...inp,fontSize:13 }} /></Field>
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
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={()=>setAddingShift(false)} style={{ ...ghostBtn,flex:1,fontSize:13 }}>Cancel</button>
                  <button onClick={addShiftFn} style={{ flex:1,padding:"11px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Add Shift</button>
                </div>
              </div>
            </div>
          )}

          {feeKeys.length>0 && (
            <div style={{ marginTop:20 }}>
              <div style={{ fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:12 }}>Fees per Library / Branch</div>
              {feeKeys.map(({key,label,emoji})=>(
                <div key={key} style={{ ...card,marginBottom:8 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:editingFees===key?12:0 }}>
                    <div style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{emoji} {label} <span style={{ fontSize:11,color:"#94a3b8" }}>({key})</span></div>
                    <button onClick={()=>{
                      if(editingFees===key){setEditingFees(null);setFeesDirty(false);}
                      else{setEditingFees(key);setFeesDirty(true);}
                    }} style={{ ...ghostBtn,padding:"6px 10px",fontSize:12 }}>{editingFees===key?"Cancel":"Edit Fees"}</button>
                  </div>
                  {editingFees===key ? (
                    <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                      {(shifts as Shift[]).filter((s:Shift)=>s.active).map((sh:Shift)=>(
                        <div key={sh.shift_key} style={{ display:"flex",alignItems:"center",gap:10 }}>
                          <span style={{ flex:1,fontSize:13,color:"#1e293b" }}>{sh.shift_name}</span>
                          <NumInput value={(feeEdits[key]||{})[sh.shift_key]||0}
                            onChange={v=>setFeeEdits(fe=>({...fe,[key]:{...(fe[key]||{}),[sh.shift_key]:Number(v)}}))}
                            style={{ width:100,textAlign:"right",fontSize:14,fontWeight:700 }} />
                        </div>
                      ))}
                      <button onClick={()=>saveFees(key)} style={{ ...primaryBtn,marginTop:4,fontSize:14 }}>Save Fees</button>
                    </div>
                  ) : (
                    <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:8 }}>
                      {(shifts as Shift[]).filter((s:Shift)=>s.active).map((sh:Shift)=>(
                        <span key={sh.shift_key} style={{ fontSize:11,fontWeight:600,color:"#64748b",background:"#f1f5f9",padding:"3px 10px",borderRadius:8 }}>
                          {sh.shift_name}: ₹{(fees[key]||{})[sh.shift_key]||0}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section==="libraries" && (
        <div>
          <div style={{ fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:12 }}>Libraries</div>

          {/* FIX #8: Branch entry panel shown right after a "has branches" library is created */}
          {pendingBranchesForLib && (
            <div style={{ ...card,border:"2px solid #6366f1",marginBottom:16 }}>
              <div style={{ fontSize:14,fontWeight:800,color:"#4f46e5",marginBottom:4 }}>
                ➕ Add Branches for {pendingBranchesForLib}
              </div>
              <div style={{ fontSize:12,color:"#94a3b8",marginBottom:12 }}>
                Library created. Now add branches (e.g. YAL-1, YAL-2). You can add more later.
              </div>
              {newBranches.map((b,idx)=>(
                <div key={idx} style={{ display:"grid",gridTemplateColumns:"2fr 2fr 1fr",gap:8,marginBottom:8 }}>
                  <Field label={`Code *`}>
                    <input value={b.branch_code} onChange={e=>{const n=[...newBranches];n[idx]={...n[idx],branch_code:e.target.value.toUpperCase()};setNewBranches(n);}} placeholder="YAL-1" style={{ ...inp,fontSize:13 }} />
                  </Field>
                  <Field label="Display Name">
                    <input value={b.branch_display} onChange={e=>{const n=[...newBranches];n[idx]={...n[idx],branch_display:e.target.value};setNewBranches(n);}} placeholder="Branch 1" style={{ ...inp,fontSize:13 }} />
                  </Field>
                  <Field label="Emoji">
                    <input value={b.emoji} onChange={e=>{const n=[...newBranches];n[idx]={...n[idx],emoji:e.target.value};setNewBranches(n);}} placeholder="🏢" style={{ ...inp,fontSize:13 }} />
                  </Field>
                </div>
              ))}
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                <button onClick={()=>setNewBranches(b=>[...b,{branch_code:"",branch_display:"",emoji:""}])}
                  style={{ ...ghostBtn,fontSize:12,color:"#6366f1",borderColor:"#6366f1",padding:"8px 12px" }}>+ Add Row</button>
                <button onClick={()=>{setPendingBranchesForLib(null);
  setNewBranches([{branch_code:"",branch_display:"",emoji:""}]);
  loadInit();
}}
                  style={{ ...ghostBtn,fontSize:12 }}>Skip</button>
                <button onClick={savePendingBranches}
                  style={{ flex:1,padding:"10px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                  Save Branches
                </button>
              </div>
            </div>
          )}

          {(libraries as Library[]).map((lib,i)=>(
            <div key={i} style={{ ...card,marginBottom:8,opacity:lib.active?1:0.6 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                <div>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ fontSize:22 }}>{lib.emoji}</span>
                    <div>
                      <div style={{ fontWeight:700,fontSize:14,color:"#1e293b" }}>{lib.display_name}</div>
                      <div style={{ fontSize:11,color:"#94a3b8" }}>{lib.library_code} {lib.has_branches?"· Has Branches":""}</div>
                    </div>
                  </div>
                  {lib.has_branches && (
                    <div style={{ marginTop:8,display:"flex",gap:6,flexWrap:"wrap" }}>
                      {(branches as Branch[]).filter((b:Branch)=>b.library_code===lib.library_code).map((b:Branch)=>(
                        <span key={b.branch_code} style={{ fontSize:11,fontWeight:600,background:b.active?"#eff6ff":"#f1f5f9",color:b.active?"#4f46e5":"#94a3b8",padding:"3px 10px",borderRadius:8 }}>
                          {b.emoji} {b.branch_code}
                        </span>
                      ))}
                       <button
                        onClick={()=>{
                          setPendingBranchesForLib(lib.library_code);
                          setNewBranches([{branch_code:"",branch_display:"",emoji:""}]);
                        }}
                        style={{ fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:8,border:"1.5px dashed #6366f1",background:"#eff6ff",color:"#4f46e5",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                        + Add Branch
                      </button>                    
                    </div>
                  )}
                </div>
                <button onClick={()=>toggleLibrary(lib)} style={{ ...ghostBtn,padding:"6px 10px",fontSize:12,color:lib.active?"#ef4444":"#10b981",borderColor:lib.active?"#fecaca":"#bbf7d0" }}>
                  {lib.active?"Deactivate":"Activate"}
                </button>
              </div>
            </div>
          ))}
          {!addingLib && !pendingBranchesForLib ? (
            <button onClick={()=>setAddingLib(true)} style={{ width:"100%",padding:"13px",borderRadius:14,border:"2px dashed #6366f1",background:"#eff6ff",color:"#4f46e5",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginTop:4 }}>+ Add New Library</button>
          ) : addingLib ? (
            <div style={{ ...card,marginTop:4 }}>
              <div style={{ fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12 }}>New Library</div>
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                  <Field label="Code *"><input value={newLib.library_code} onChange={e=>setNewLib(p=>({...p,library_code:e.target.value.toUpperCase()}))} placeholder="KAL" style={{ ...inp,fontSize:13 }} /></Field>
                  <Field label="Emoji"><input value={newLib.emoji} onChange={e=>setNewLib(p=>({...p,emoji:e.target.value}))} placeholder="📚" style={{ ...inp,fontSize:13 }} /></Field>
                </div>
                <Field label="Library Name *"><input value={newLib.library_name} onChange={e=>setNewLib(p=>({...p,library_name:e.target.value,display_name:e.target.value}))} placeholder="Kiran AC Library" style={inp} /></Field>
                <Field label="Display Name"><input value={newLib.display_name} onChange={e=>setNewLib(p=>({...p,display_name:e.target.value}))} placeholder="Kiran AC Library" style={inp} /></Field>
                <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#f8fafc",borderRadius:10 }}>
                  <input type="checkbox" checked={newLib.has_branches} onChange={e=>setNewLib(p=>({...p,has_branches:e.target.checked}))} style={{ width:18,height:18,cursor:"pointer" }} />
                  <span style={{ fontSize:13,fontWeight:600,color:"#1e293b" }}>Has Branches (like YAL-1/YAL-2)</span>
                </div>
                <div style={{ background:"#eff6ff",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#4f46e5" }}>
                  ✅ Settings row, fee rows, and counters will be created automatically.
                  {newLib.has_branches && <span style={{ display:"block",marginTop:4,color:"#6366f1" }}>➕ You'll be asked to add branches right after.</span>}
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={()=>setAddingLib(false)} style={{ ...ghostBtn,flex:1,fontSize:13 }}>Cancel</button>
                  <button onClick={addLibraryFn} style={{ flex:1,padding:"11px",borderRadius:12,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Add Library</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {section==="counters" && (
        <div>
          <div style={{ background:"#fffbeb",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#92400e",marginBottom:14,border:"1px solid #fcd34d" }}>
            Only set <strong>cutoff values</strong>. Running counters are auto-managed and shown read-only.
          </div>
          {(libraries as Library[]).filter((l:Library)=>l.active).map(lib=>{
            const libSet=countersEdit[lib.library_code]; if(!libSet) return null;
            return (
              <div key={lib.library_code} style={{ ...card,marginBottom:10 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
                  <span style={{ fontSize:22 }}>{lib.emoji}</span>
                  <div style={{ fontWeight:700,fontSize:15,color:"#1e293b" }}>{lib.display_name}</div>
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
                      <NumInput value={libSet[key]||0} onChange={v=>setCountersEdit(ce=>({...ce,[lib.library_code]:{...ce[lib.library_code],[key]:Number(v)}}))} style={{ fontSize:15,fontWeight:700 }} />
                    </Field>
                  ))}
                </div>
                <button onClick={()=>saveCounters(lib.library_code)} style={{ ...primaryBtn,background:"#1e293b",boxShadow:"none",fontSize:14 }}>Save {lib.library_code} Settings</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}