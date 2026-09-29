"use client";

// LMA — round Call and WhatsApp icons for a student (seat card, next to the name).
// One number → straight to the call / chat. Several → pick which number.
// (The WhatsApp icon is a plain chat bubble in WhatsApp green.)

import { useState } from "react";
import { type ContactPhone } from "../_lib/contact";
import { parsePhone10 } from "../_lib/phone";
import WhatsAppButton from "./WhatsAppButton";
import { Sheet, cx } from "../_ui/kit";

const ROUND = "grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-inset transition active:scale-95 disabled:opacity-40";

export default function ContactIcons({ phones, name, className }: { phones?: ContactPhone[]; name?: string; className?: string }) {
  const list = (phones || []).filter(p => p && p.number && parsePhone10(p.number));
  const [pick, setPick] = useState(false);
  if (!list.length) return null;
  const tel = (n: string) => `tel:+91${parsePhone10(n)}`;
  const who = name ? ` ${name}` : "";

  return (
    <div className={cx("flex shrink-0 items-center gap-1.5", className)}>
      {list.length === 1 ? (
        <a href={tel(list[0].number)} aria-label={`Call${who}`} className={cx(ROUND, "bg-lma-brand-soft text-lma-brand ring-[#dcdffb]")}>
          <PhoneGlyph />
        </a>
      ) : (
        <button type="button" onClick={() => setPick(true)} aria-label={`Call${who} — pick a number`} className={cx(ROUND, "bg-lma-brand-soft text-lma-brand ring-[#dcdffb]")}>
          <PhoneGlyph />
        </button>
      )}
      <WhatsAppButton phones={list} chat ariaLabel={`WhatsApp${who}`} icon={<ChatGlyph />}
        className={cx(ROUND, "bg-[#e3f6ec] text-[#0b7a52] ring-[#c6ecd8]")} />

      <Sheet open={pick} onClose={() => setPick(false)} title={`Call${who}`}>
        <div className="divide-y divide-lma-line overflow-hidden rounded-[16px] border border-lma-line bg-lma-surface">
          {list.map((p, i) => (
            <a key={i} href={tel(p.number)} onClick={() => setPick(false)}
              className="flex min-h-[56px] items-center gap-3 px-3.5 py-2 active:bg-lma-bg">
              <span className="min-w-0 flex-1">
                <span className="block font-lma-mono text-[15px] font-semibold text-lma-ink">{p.number}</span>
                {p.tag && <span className="block text-[11px] font-bold uppercase tracking-wide text-lma-ink-3">{p.tag}</span>}
              </span>
              <span className={cx(ROUND, "bg-lma-brand-soft text-lma-brand ring-[#dcdffb]")}><PhoneGlyph /></span>
            </a>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function PhoneGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" />
    </svg>
  );
}
function ChatGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5z" />
    </svg>
  );
}
