"use client";
// Shared period picker — preset chips + a custom from/to. Used by Today and the
// Ledger. The presets and date maths live in ../_lib/period (single source).
import { useState } from "react";
import { PRESETS, periodOf, isoOf, localFromIso, type Period } from "../_lib/period";
import { Chip, inputCls, cx } from "../_ui/kit";
import { fmtDMY } from "../_lib/dates";

export default function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(value.preset === "custom");
  const setDate = (which: "from" | "to", v: string) => {
    const d = localFromIso(v);
    if (!d) return;
    onChange({ preset: "custom", from: which === "from" ? d : value.from, to: which === "to" ? d : value.to });
  };
  return (
    <>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {PRESETS.map(p => (
          <Chip key={p.k} on={value.preset === p.k && !open} onClick={() => { setOpen(false); onChange(periodOf(p.k)); }}>{p.label}</Chip>
        ))}
        <Chip on={open || value.preset === "custom"} onClick={() => setOpen(v => !v)}>Custom</Chip>
      </div>
      {open && (
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-lma border border-lma-line bg-lma-surface p-3 shadow-lma-card">
          <label className="block">
            <span className="mb-1.5 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">From</span>
            <input type="date" value={isoOf(value.from)} onChange={e => setDate("from", e.target.value)} className={cx(inputCls, "h-11")} />
            <span className="mt-1 block px-1 text-[11.5px] font-medium text-lma-ink-3">{fmtDMY(isoOf(value.from))}</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-lma-ink-3">To</span>
            <input type="date" value={isoOf(value.to)} onChange={e => setDate("to", e.target.value)} className={cx(inputCls, "h-11")} />
            <span className="mt-1 block px-1 text-[11.5px] font-medium text-lma-ink-3">{fmtDMY(isoOf(value.to))}</span>
          </label>
        </div>
      )}
    </>
  );
}
