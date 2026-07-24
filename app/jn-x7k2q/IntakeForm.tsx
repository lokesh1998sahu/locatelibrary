"use client";
// B6 — public admission intake form.
//
// CONTEXT THAT DRIVES THIS DESIGN: the student has already seen the library's
// poster and already agreed to join — a code is only issued after that. So this
// page does NOT re-sell facilities or fees. Its job is confirm + complete:
// prove they're at the right branch, then get six fields filled fast.
//
// SELF-CONTAINED BY DESIGN: renders OUTSIDE LMAProvider, so the `.lma-app`
// scope and every lma-* colour are unavailable. All styling is inline so it
// cannot break from Tailwind config or theme-scope changes. Inputs are 16px to
// stop iOS auto-zoom on focus.
import { useState } from "react";

const API = "/api/lma960805";

// Poster-derived brand + app gender palette (see _lib/genderTheme.ts: M blue, F pink).
const C = {
  brand:"#1454b8", brandDeep:"#0b357e", navy:"#17202e", gold:"#ffd23d",
  male:"#1454b8", female:"#db2777",
  teal:"#0e8a72", wa:"#25d366", waDeep:"#128c7e",
  ink:"#0f172a", body:"#334155", muted:"#64748b",
  line:"#cbd5e1", field:"#f8fafc", err:"#dc2626", errBg:"#fef2f2",
};

const S: Record<string, React.CSSProperties> = {
  page:  { minHeight:"100vh", background:"linear-gradient(180deg,#e8edf6 0%,#f4f6fa 38%,#f4f6fa 100%)", display:"flex", justifyContent:"center", alignItems:"flex-start", padding:"22px 14px 56px", fontFamily:"system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", color:C.ink, WebkitTextSizeAdjust:"100%", boxSizing:"border-box" },
  card:  { width:"100%", maxWidth:420, background:"#ffffff", borderRadius:20, overflow:"hidden", boxShadow:"0 10px 34px rgba(15,23,42,.13), 0 2px 6px rgba(15,23,42,.06)" },
  head:  { position:"relative", background:`radial-gradient(120% 120% at 88% -10%, #2f6fd6 0%, ${C.brand} 42%, ${C.brandDeep} 100%)`, color:"#ffffff", padding:"22px 20px 24px" },
  body:  { padding:"20px 18px 22px" },
  label: { display:"block", fontSize:11.5, fontWeight:800, color:C.body, letterSpacing:".05em", textTransform:"uppercase", margin:"18px 0 6px" },
  input: { width:"100%", padding:"13px 14px", fontSize:16, fontWeight:500, color:C.ink, background:C.field, border:`1.5px solid ${C.line}`, borderRadius:12, outline:"none", boxSizing:"border-box", fontFamily:"inherit", WebkitAppearance:"none" as const },
  code:  { width:"100%", padding:"16px 14px", fontSize:23, fontWeight:800, color:C.ink, background:C.field, border:`1.5px solid ${C.line}`, borderRadius:12, outline:"none", boxSizing:"border-box", textAlign:"center", letterSpacing:".14em", fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace", WebkitAppearance:"none" as const },
  btn:   { width:"100%", marginTop:22, padding:"15px", fontSize:16, fontWeight:700, color:"#ffffff", background:C.brand, border:"none", borderRadius:12, cursor:"pointer", fontFamily:"inherit" },
  btnOff:{ opacity:.4, cursor:"not-allowed" },
  err:   { fontSize:13.5, fontWeight:600, color:C.err, background:C.errBg, border:"1px solid #fecaca", borderRadius:10, padding:"10px 12px", lineHeight:1.45 },
  note:  { fontSize:12.5, color:C.muted, textAlign:"center", margin:"14px 0 0", lineHeight:1.55 },
  eyebrow:{ fontSize:10.5, fontWeight:800, letterSpacing:".14em", color:C.gold, lineHeight:1.45 },
};

function gBtn(on:boolean, tone:string): React.CSSProperties {
  return { padding:"13px 0", fontSize:15, fontWeight:700, borderRadius:12, cursor:"pointer", fontFamily:"inherit",
    color: on?"#ffffff":C.body, background: on?tone:C.field, border:`1.5px solid ${on?tone:C.line}`,
    boxShadow: on?`0 2px 10px ${tone}44`:"none", transition:"all .15s ease" };
}

// Open the native date picker from anywhere on the field, not just the tiny icon.
function openPicker(e: React.SyntheticEvent<HTMLInputElement>){
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try { el.showPicker?.(); } catch { /* unsupported browser — native icon still works */ }
}

type Info = { code:string; name:string; address:string; contact:string };
const wa10 = (n:string) => { const d=String(n||"").replace(/\D/g,""); return d.length===12&&d.startsWith("91")?d.slice(2):d; };

// ── Documents step: photo + ID go to the library's WhatsApp, one tap ──
function Docs({ info, code }:{ info:Info|null; code:string }){
  const num = wa10(info?.contact||"");
  const msg = `Hi${info?.name?` ${info.name}`:""}, I have submitted my admission details.\nEnquiry code: ${code}\nSending my passport-size photo and Aadhaar card.`;
  return (
    <div style={{ marginTop:20, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:14, padding:"14px 15px" }}>
      <div style={{ fontSize:10.5, fontWeight:800, color:C.waDeep, letterSpacing:".08em", marginBottom:6 }}>ONE LAST STEP</div>
      <div style={{ fontSize:14, fontWeight:700, color:"#14532d", marginBottom:6, lineHeight:1.4 }}>Send your documents on WhatsApp</div>
      <div style={{ fontSize:13, color:"#166534", lineHeight:1.7, marginBottom:12 }}>
        <div>📷&nbsp; 1 passport-size photo</div>
        <div>🪪&nbsp; Aadhaar card (ID proof)</div>
      </div>
      {num ? (
        <a href={`https://wa.me/91${num}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"
          style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"13px", fontSize:15, fontWeight:700, color:"#ffffff", background:C.wa, borderRadius:12, textDecoration:"none", boxShadow:`0 2px 12px ${C.wa}55` }}>
          Send on WhatsApp to {num}
        </a>
      ) : (
        <div style={{ fontSize:12.5, color:"#166534", fontWeight:600, lineHeight:1.5 }}>Send both to your library&rsquo;s WhatsApp number.</div>
      )}
    </div>
  );
}

export default function IntakeForm(){
  const [step,setStep]=useState<"CODE"|"FORM"|"DONE">("CODE");
  const [code,setCode]=useState("");
  const [info,setInfo]=useState<Info|null>(null);
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [doneCode,setDoneCode]=useState("");
  const [f,setF]=useState({ name:"", gender:"", whatsapp_no:"", date_of_birth:"", address:"", preparing_for:"" });
  const set=(k:keyof typeof f,v:string)=>setF(s=>({...s,[k]:v}));

  const checkCode=async()=>{
    setErr(""); setBusy(true);
    try{
      const r=await fetch(`${API}?action=intakeCheck&code=${encodeURIComponent(code)}`).then(x=>x.json());
      if(r&&r.ok){
        const i=r.info||{};
        setInfo({ code:String(i.code||r.library||""), name:String(i.name||""), address:String(i.address||""), contact:String(i.contact||"") });
        setStep("FORM");
      } else setErr((r&&r.error)||"Get your code from your library.");
    }catch{ setErr("Network problem — please check your connection and try again."); }
    setBusy(false);
  };

  const submit=async()=>{
    setErr(""); setBusy(true);
    try{
      const r=await fetch(API,{ method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify({ action:"intakeSubmit", payload:{ code, ...f } }) }).then(x=>x.json());
      if(r&&r.ok){ setDoneCode(r.code||code); setStep("DONE"); }
      else setErr((r&&r.error)||"Could not submit — please try again.");
    }catch{ setErr("Network problem — please check your connection and try again."); }
    setBusy(false);
  };

  const ready = f.name.trim() && f.gender && f.whatsapp_no.length===10 && f.date_of_birth && f.address.trim() && f.preparing_for.trim();
  const today = new Date().toISOString().slice(0,10);

  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* ── HEADER: one piece with the card, never a floating slab ── */}
        <div style={S.head}>
          {step==="CODE" ? (
            <>
              {/* TIER 1 — the identity line. Single row at every width via clamp(). */}
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ width:34, height:34, borderRadius:10, background:"rgba(255,255,255,.17)", border:"1px solid rgba(255,255,255,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>📚</span>
                <span style={{ fontSize:"clamp(13.5px,4.2vw,18px)", fontWeight:800, letterSpacing:".075em", color:C.gold, whiteSpace:"nowrap", lineHeight:1.1 }}>STUDY LIBRARY ADMISSION</span>
              </div>
              <div style={{ height:1, background:"rgba(255,255,255,.2)", margin:"14px 0 13px" }}/>
              {/* TIER 2 — supports the identity, deliberately quieter than it */}
              <h1 style={{ fontSize:17, fontWeight:700, margin:"0 0 7px", letterSpacing:"-.01em", lineHeight:1.32, opacity:.97 }}>Complete your library admission</h1>
              {/* TIER 3 */}
              <p style={{ fontSize:13, margin:0, opacity:.82, lineHeight:1.6 }}>Enter the enquiry code your library gave you, fill your details, then show the code at the desk to get your seat.</p>
            </>
          ) : (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:11 }}>
                <span style={{ fontSize:10.5, fontWeight:800, letterSpacing:".05em", background:C.gold, color:C.navy, padding:"4px 10px", borderRadius:20 }}>{info?.code}</span>
                {step==="DONE" && <span style={{ fontSize:10.5, fontWeight:800, letterSpacing:".05em", background:"rgba(255,255,255,.2)", border:"1px solid rgba(255,255,255,.3)", padding:"3px 10px", borderRadius:20 }}>SUBMITTED</span>}
              </div>
              <div style={{ ...S.eyebrow, marginBottom:4 }}>ADMISSION AT</div>
              <h1 style={{ fontSize:23, fontWeight:800, margin:"0 0 12px", letterSpacing:"-.025em", lineHeight:1.2 }}>{info?.name || "Your library"}</h1>
              {info?.address && (
                <div style={{ display:"flex", gap:8, fontSize:12.5, lineHeight:1.55, opacity:.92, marginBottom:info?.contact?11:0 }}>
                  <span style={{ flexShrink:0 }}>📍</span><span>{info.address}</span>
                </div>
              )}
              {info?.contact && (
                <a href={`tel:${info.contact}`} style={{ display:"inline-flex", alignItems:"center", gap:7, fontSize:13.5, fontWeight:700, color:"#ffffff", textDecoration:"none", background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", padding:"8px 14px", borderRadius:22 }}>
                  📞 {info.contact}
                </a>
              )}
            </>
          )}
        </div>

        {/* ── BODY ── */}
        <div style={S.body}>

          {step==="CODE" && (<>
            {err && <div style={{...S.err, marginBottom:16}}>{err}</div>}
            <label style={{...S.label, marginTop:0}}>Enquiry code</label>
            <input value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setErr("");}}
              onKeyDown={e=>{ if(e.key==="Enter"&&code.trim()&&!busy) checkCode(); }}
              placeholder="XXXXX-XXXXX" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
              style={S.code}/>
            <button onClick={checkCode} disabled={busy||!code.trim()} style={{...S.btn, ...((busy||!code.trim())?S.btnOff:{})}}>
              {busy?"Checking…":"Continue"}
            </button>
            <p style={S.note}>Don&rsquo;t have a code? Contact your library &mdash; codes are given after your enquiry.</p>
          </>)}

          {step==="FORM" && (<>
            <p style={{ fontSize:14.5, fontWeight:700, color:C.ink, margin:"0 0 2px" }}>Welcome aboard 👋</p>
            <p style={{ fontSize:13, color:C.muted, margin:"0 0 4px", lineHeight:1.5 }}>Six details to register you as a member. All are required.</p>
            {err && <div style={{...S.err, marginTop:14}}>{err}</div>}

            <label style={S.label}>Full name</label>
            <input value={f.name} onChange={e=>set("name",e.target.value)} autoComplete="name" placeholder="Your full name" style={S.input}/>

            <label style={S.label}>Gender</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <button type="button" onClick={()=>set("gender","M")} style={gBtn(f.gender==="M", C.male)}>Male</button>
              <button type="button" onClick={()=>set("gender","F")} style={gBtn(f.gender==="F", C.female)}>Female</button>
            </div>

            <label style={S.label}>WhatsApp number</label>
            <input value={f.whatsapp_no} onChange={e=>set("whatsapp_no",e.target.value.replace(/[^\d]/g,"").slice(0,10))}
              inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile number" style={S.input}/>

            <label style={S.label}>Date of birth</label>
            <input type="date" value={f.date_of_birth} onChange={e=>set("date_of_birth",e.target.value)} max={today}
              onClick={openPicker} onFocus={openPicker}
              style={{...S.input, cursor:"pointer", minHeight:48}}/>

            <label style={S.label}>Current address</label>
            <textarea value={f.address} onChange={e=>set("address",e.target.value)} rows={3}
              placeholder="Where you currently stay" style={{...S.input, resize:"vertical", lineHeight:1.5}}/>

            <label style={S.label}>Studying / preparing for</label>
            <input value={f.preparing_for} onChange={e=>set("preparing_for",e.target.value)}
              placeholder="e.g. NEET, RAS, B.Com" style={S.input}/>

            <button onClick={submit} disabled={busy||!ready} style={{...S.btn, ...((busy||!ready)?S.btnOff:{})}}>
              {busy?"Submitting…":"Submit details"}
            </button>
            {!ready && <p style={S.note}>Fill all six fields to continue.</p>}
          </>)}

          {step==="DONE" && (
            <div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:44, lineHeight:1, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:18, fontWeight:800, color:C.teal, marginBottom:6 }}>Details received</div>
                <p style={{ fontSize:13.5, color:C.body, margin:"0 0 16px", lineHeight:1.55 }}>Show this code at the library desk to finish your admission and get your seat.</p>
                <div style={{ fontSize:25, fontWeight:800, color:C.ink, letterSpacing:".14em", fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace", background:C.field, border:`1.5px solid ${C.line}`, borderRadius:12, padding:"15px 10px" }}>{doneCode}</div>
              </div>
              <Docs info={info} code={doneCode}/>
              <p style={S.note}>You can close this page once your documents are sent.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}