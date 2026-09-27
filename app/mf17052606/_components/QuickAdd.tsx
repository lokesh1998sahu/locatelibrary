"use client";

// MF 2.0 — "+ New …" chip: add a head, sub-head or person right where you are
// entering money, without leaving for Set up. The new item is picked for you.
// If the name already exists at that level, the existing one is picked instead
// (no duplicates).

import { useState } from "react";
import { Sheet, Field, TextInput, Button } from "../_ui/kit";

export default function QuickAdd({ what, where, placeholder, withPhone, existing, onSave, onPickExisting }: {
  what: string;                                    // "head", "sub-head", "person" (already in your level names)
  where?: string;                                  // e.g. "in Personal · Spending", "under Food"
  placeholder?: string;
  withPhone?: boolean;                             // people only
  existing: { id: number; name: string }[];        // same-level items, to avoid duplicates
  onSave: (name: string, phone: string) => Promise<number | null>;   // returns the new id (null = failed)
  onPickExisting: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const same = existing.find(x => x.name.trim().toUpperCase() === name.trim().toUpperCase());

  const close = () => { setOpen(false); setName(""); setPhone(""); };
  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    if (same) { onPickExisting(same.id); close(); return; }   // already there → just pick it
    setBusy(true);
    const id = await onSave(n, phone.trim());
    setBusy(false);
    if (id) close();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="mf-btn inline-flex min-h-[40px] items-center rounded-full px-4 text-[14px] font-medium text-mf-ink-2 ring-1 ring-inset ring-dashed ring-mf-line active:bg-mf-bg">
        + New {what}
      </button>
      <Sheet open={open} onClose={close} title={`New ${what}${where ? " " + where : ""}`}>
        {open && (
          <div className="pb-2">
            <Field label="Name">
              <TextInput value={name} onChange={e => setName(e.target.value)} placeholder={placeholder} autoFocus
                onKeyDown={e => { if (e.key === "Enter") save(); }} />
            </Field>
            {same && <p className="-mt-1 mb-3 px-1 text-[12.5px] text-mf-ink-3">“{same.name}” is already there — saving just picks it.</p>}
            {withPhone && (
              <Field label="Phone (optional)">
                <TextInput value={phone} onChange={e => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="98xxxxxxxx" />
              </Field>
            )}
            <Button size="lg" full className="mt-2" disabled={!name.trim() || busy} loading={busy} loadingText="Saving…" onClick={save}>
              {same ? `Pick “${same.name}”` : `Add and pick`}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
