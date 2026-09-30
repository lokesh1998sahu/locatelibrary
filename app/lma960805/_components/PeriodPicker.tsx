"use client";
// Shared period picker — preset chips + a custom from/to. Used by the Dashboard and the
// Ledger. The presets and date maths live in ../_lib/period (single source).
import { useState } from "react";
import { PRESETS, periodOf, presetRange, isoOf, localFromIso, monthOf, pastMonths, monthPeriod, type Period } from "../_lib/period";
import { Chip, inputCls, cx, ACTIVE } from "../_ui/kit";
import { IconCalendar } from "../_ui/icons";
import { fmtDMY } from "../_lib/dates";

export default function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(value.preset === "custom");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pickDay = (v: string) => { const d = localFromIso(v); if (d) { setOpen(false); onChange({ preset: "day", from: d, to: d }); } };
  const isDay = value.preset === "day";
  const chosenMonth = monthOf(value);                       // set when "Other Month" (or an old Last Month link) is on
  const months = pastMonths(36);                            // last month back three years, newest first
  const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const setDate = (which: "from" | "to", v: string) => {
    const d = localFromIso(v);
    if (!d) return;
    onChange({ preset: "custom", from: which === "from" ? d : value.from, to: which === "to" ? d : value.to });
  };
  return (
    <>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {PRESETS.map(p => (
          <span key={p.k} className="contents">
            <Chip on={value.preset === p.k && !open} onClick={() => { setOpen(false); onChange(periodOf(p.k)); }}>{p.label}</Chip>
            {p.k === "month" && (
              // One tap opens the list of months (newest first, from last month): an invisible list sits over the chip.
              <label className={cx("lma-btn relative inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition",
                chosenMonth && !open ? ACTIVE : "bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg")}>
                <IconCalendar size={16} />
                <span className="whitespace-nowrap">{chosenMonth ? `${MON[chosenMonth.getMonth()]} ${chosenMonth.getFullYear()}` : "Other Month"}</span>
                <select aria-label="Pick a month" value={chosenMonth ? ymKey(chosenMonth) : ""}
                  onChange={e => { const m = months.find(d => ymKey(d) === e.target.value); if (m) { setOpen(false); onChange(monthPeriod(m)); } }}
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0">
                  <option value="" disabled>Pick a month</option>
                  {months.map(d => <option key={ymKey(d)} value={ymKey(d)}>{MON[d.getMonth()]} {d.getFullYear()}</option>)}
                </select>
              </label>
            )}
            {p.k === "yesterday" && (
              // One tap opens the calendar (as in MF): an invisible date box sits over the chip.
              <label className={cx("lma-btn relative inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition",
                isDay && !open ? ACTIVE : "bg-lma-surface text-lma-ink-2 ring-1 ring-inset ring-lma-line active:bg-lma-bg")}>
                <IconCalendar size={16} />
                <span className="whitespace-nowrap">{isDay ? `${value.from.getDate()} ${MON[value.from.getMonth()]}` : "Other date"}</span>
                <input type="date" aria-label="Pick a date" value={isDay ? isoOf(value.from) : ""}
                  onChange={e => e.target.value && pickDay(e.target.value)}
                  onClick={e => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* older browsers open it anyway */ } }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
            )}
          </span>
        ))}
        <Chip on={open || value.preset === "custom"} onClick={() => {
          // coming from All time, start the custom dates at this month rather than 2000–2099
          if (value.preset === "all" && !open) { const r = presetRange("month"); onChange({ preset: "custom", from: r.from, to: r.to }); }
          setOpen(v => !v);
        }}>Custom</Chip>
      </div>
      {value.preset === "all" && !open && (
        <p className="-mt-1 mb-3 px-1 text-[12px] font-medium text-lma-ink-3">Showing everything — every date, no range applied.</p>
      )}
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
