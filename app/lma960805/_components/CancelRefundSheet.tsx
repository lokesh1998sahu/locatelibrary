"use client";
// ── C4: SINGLE cancel/refund experience — one source of truth ──
// Replaces three byte-identical copies (board BoardCancelSheet, ReceiptModal
// CancelPanel, Renewals CancelSheet). Owns ALL logic, fields, validation and
// copy. Each caller passes `presentation` so its existing shell is preserved
// exactly — board = centered modal, receipt/renewals = bottom sheet — meaning
// zero visual change on any surface. A new cancel surface is one <CancelRefundSheet/>.
import { useState } from "react";
import { useLMA } from "./LMAProvider";
import { TagBankNote } from "./TagBank";

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
      <h3 className="mb-1 text-[18px] font-bold tracking-[-0.01em] text-lma-ink">{heading}</h3>
      <p className="mb-3 text-[13px] leading-relaxed text-lma-ink-3">{sub}</p>
      {(target.fees_due_balance||0)>0 && <div role="alert" className="mb-3 rounded-[12px] bg-lma-out-soft p-3 text-[12.5px] font-semibold text-lma-out">⚠ ₹{target.fees_due_balance} dues outstanding on this receipt.</div>}

      <label className="mb-3 flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] bg-lma-surface px-3.5 ring-1 ring-inset ring-lma-line">
        <input type="checkbox" checked={withRefund} onChange={e=>setWithRefund(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#4f46e5]"/>
        <span className="text-[14px] font-semibold text-lma-ink">Also refund money with this cancellation</span>
      </label>

      {withRefund&&(
        <div className="mb-3 space-y-1 rounded-[16px] bg-lma-surface p-3.5 ring-1 ring-inset ring-lma-line">
          <div>
            <CLabel>Refund Mode</CLabel>
            <select value={refundMode} onChange={e=>setRefundMode(e.target.value)} className="h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none placeholder:text-lma-ink-3 focus:border-lma-brand">
              <option value="">Select…</option>
              {modes.map((t:any)=><option key={t.tag_name} value={t.tag_name}>{t.tag_name}</option>)}
            </select>
            <TagBankNote tag={refundMode}/>
          </div>
          <div><CLabel>Refund Amount (₹)</CLabel><CInput type="number" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)} placeholder="rupees handed back"/></div>
          <div><CLabel>Refund Reason</CLabel><CInput value={refundReason} onChange={e=>setRefundReason(e.target.value)} placeholder="optional"/></div>
        </div>
      )}

      <CLabel>Cancellation note (optional)</CLabel>
      <CInput value={remark} onChange={e=>setRemark(e.target.value)} placeholder="why cancelling"/>

      <div className="flex gap-2.5 mt-4">
        <button onClick={onClose} className="h-12 flex-1 rounded-[14px] bg-lma-surface text-[15px] font-semibold text-lma-ink-2 ring-1 ring-inset ring-lma-line">{presentation==="modal"?"Keep":"Back"}</button>
        <button onClick={submit} disabled={!canSubmit} className="h-12 flex-1 rounded-[14px] bg-lma-out text-[15px] font-bold text-white disabled:opacity-50">{busy?"…":withRefund?"Cancel + Refund":"Cancel Booking"}</button>
      </div>
    </>
  );

  // ── presentation shells (pixel-identical to what each surface had) ──
  if(presentation==="modal"){
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" onClick={onClose}>
        <div className="absolute inset-0 bg-[rgb(15_23_42/0.45)]"/>
        <div role="dialog" aria-modal="true" className="lma-sheet-up relative w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-[20px] bg-lma-bg p-5 shadow-lma-float" onClick={e=>e.stopPropagation()}>{inner}</div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-[rgb(15_23_42/0.5)]"/>
      <div role="dialog" aria-modal="true" className="lma-sheet-up relative w-full max-w-[560px] max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-[24px] bg-lma-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-lma-float" onClick={e=>e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[#dfe1ee]"/>{inner}
      </div>
    </div>
  );
}

function CLabel({ children }:{ children:React.ReactNode }){ return <label className="mb-1.5 mt-3 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">{children}</label>; }
function CInput({className="",...props}:React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} className={`h-12 w-full rounded-[14px] border border-lma-line bg-lma-surface px-3.5 text-[15px] font-medium text-lma-ink outline-none placeholder:text-lma-ink-3 focus:border-lma-brand ${className}`}/>; }
