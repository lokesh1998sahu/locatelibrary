"use client";
// ── C4: SINGLE cancel/refund experience — one source of truth ──
// Replaces three byte-identical copies (board BoardCancelSheet, ReceiptModal
// CancelPanel, Renewals CancelSheet). Owns ALL logic, fields, validation and
// copy. Each caller passes `presentation` so its existing shell is preserved
// exactly — board = centered modal, receipt/renewals = bottom sheet — meaning
// zero visual change on any surface. A new cancel surface is one <CancelRefundSheet/>.
import { useState } from "react";
import { useLMA } from "./LMAProvider";

export interface CancelTarget {
  receipt_no: string;
  name?: string;
  student_id?: string;
  seat_no?: string;          // ReceiptModal / Renewals show "Seat X"
  seat_label?: string;       // board shows the tile label in the heading
  shift_name?: string;
  shift?: string;
  fees_due_balance?: number;
}

export interface CancelResult {
  refunded: boolean;
  whatsapp_text: string;     // cancel text, or refund text as fallback
}

export default function CancelRefundSheet({
  target, presentation="sheet", post, showToast, onClose, onDone,
}:{
  target: CancelTarget;
  presentation?: "sheet" | "modal";
  post: (a:string,p:any)=>Promise<any>;
  showToast: (m:string,t?:"success"|"error")=>void;
  onClose: ()=>void;
  onDone: (r:CancelResult)=>void;
}){
  const { init } = useLMA();
  const [withRefund,setWithRefund]=useState(false);
  const [remark,setRemark]=useState("");
  const [refundMode,setRefundMode]=useState("");
  const [refundAmount,setRefundAmount]=useState("");
  const [refundReason,setRefundReason]=useState("");
  const [busy,setBusy]=useState(false);

  const canSubmit = !busy && !(withRefund && (!refundMode || !refundAmount));

  const submit=async()=>{
    setBusy(true);
    if(withRefund){
      if(!refundMode||!refundAmount){ setBusy(false); return; }
      const r=await post("markReceiptCancelledWithRefund",{receipt_no:target.receipt_no,cancel_remark:remark,refund_mode:refundMode,refund_amount:Number(refundAmount),refund_reason:refundReason});
      setBusy(false);
      if(r&&r.cancelled){ showToast(`Receipt ${target.receipt_no} cancelled + refunded`); onDone({refunded:true,whatsapp_text:r.cancel_whatsapp_text||r.refund_whatsapp_text||""}); }
      else showToast((r&&r.error)||"Cancel failed","error");
    }else{
      const r=await post("markReceiptCancelled",{receipt_no:target.receipt_no,cancel_remark:remark});
      setBusy(false);
      if(r&&r.updated){ showToast(`Receipt ${target.receipt_no} cancelled`); onDone({refunded:false,whatsapp_text:r.cancel_whatsapp_text||""}); }
      else showToast((r&&r.error)||"Cancel failed","error");
    }
  };

  const heading = target.seat_label
    ? `Cancel booking on seat ${target.seat_label}?`
    : `Cancel ${target.receipt_no}`;
  const sub = target.seat_label
    ? `${target.student_id||""}${target.student_id?" · ":""}${target.name||""}'s receipt ${target.receipt_no} will be marked CANCELLED and the seat freed immediately. Nothing is carried forward.`
    : `${target.name||""} · Seat ${target.seat_no||"—"} · ${target.shift_name||target.shift||""}`;

  const modes=(init?.paymentTags||[]).filter((t:any)=>t.active);

  const inner = (
    <>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">{heading}</h3>
      <p className="text-[11px] text-lma-slate-500 mb-3">{sub}</p>
      {(target.fees_due_balance||0)>0 && <div className="text-[11px] font-bold text-lma-danger bg-lma-danger/10 rounded-lg p-2 mb-3">⚠ ₹{target.fees_due_balance} dues outstanding on this receipt.</div>}

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={withRefund} onChange={e=>setWithRefund(e.target.checked)} className="w-4 h-4 accent-lma-primary"/>
        <span className="text-sm font-semibold text-lma-slate-700">Issue a refund with this cancellation</span>
      </label>

      {withRefund&&(
        <div className="bg-lma-slate-50 rounded-xl p-3 mb-3 space-y-2">
          <div>
            <CLabel>Refund Mode</CLabel>
            <select value={refundMode} onChange={e=>setRefundMode(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-white text-sm font-medium">
              <option value="">Select…</option>
              {modes.map((t:any)=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
            </select>
          </div>
          <div><CLabel>Refund Amount (₹)</CLabel><CInput type="number" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)} placeholder="rupees handed back"/></div>
          <div><CLabel>Refund Reason</CLabel><CInput value={refundReason} onChange={e=>setRefundReason(e.target.value)} placeholder="optional"/></div>
        </div>
      )}

      <CLabel>Cancellation note (optional)</CLabel>
      <CInput value={remark} onChange={e=>setRemark(e.target.value)} placeholder="why cancelling"/>

      <div className="flex gap-2.5 mt-4">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">{presentation==="modal"?"Keep":"Back"}</button>
        <button onClick={submit} disabled={!canSubmit} className="flex-1 py-3 rounded-xl bg-lma-danger text-white font-bold shadow-md disabled:opacity-50">{busy?"…":withRefund?"Cancel + Refund":"Cancel Booking"}</button>
      </div>
    </>
  );

  // ── presentation shells (pixel-identical to what each surface had) ──
  if(presentation==="modal"){
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40"/>
        <div className="relative w-full max-w-xs bg-white rounded-2xl p-5 lma-slide-up max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>{inner}</div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>{inner}
      </div>
    </div>
  );
}

function CLabel({ children }:{ children:React.ReactNode }){ return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1 mt-2">{children}</label>; }
function CInput({className="",...props}:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className={`w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium ${className}`}/>; }