"use client";

// LMA — the vacant-seat list. Same shared vacancy computer as the seat chart,
// used both on Today and on its own screen (the bolt button), so the wording
// you send out is identical wherever you ask for it.

import { useState } from "react";
import { useLMA } from "./LMAProvider";
import { buildVacancyText, type VacPlan } from "../_lib/vacancy";
import { Card, Button, Chip, SectionTitle } from "../_ui/kit";

const API = "/api/lma960805";

// ── vacant seats — the same shared vacancy computer as the seat chart ──
export default function VacantSeats({ scope }: { scope: string }) {
  const { init, showToast } = useLMA();
  const ORDER: VacPlan[] = ["MORNING", "EVENING", "FULL DAY"];
  const [sel, setSel] = useState<VacPlan[]>([]);
  const [side, setSide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

  const toggle = (p: VacPlan) => { setText(""); setSel(c => c.includes(p) ? c.filter(x => x !== p) : [...c, p]); };
  const plans = ORDER.filter(p => sel.includes(p));
  const any = plans.length > 0 || side;

  const go = async () => {
    if (!scope) { showToast("Pick a library chip above first", "error"); return; }
    if (!any) { showToast("Tap a time plan first", "error"); return; }
    const b = ((init?.branches) || []).find((x: { branch_code: string }) => x.branch_code === scope);
    const lib = b ? b.library_code : scope, br = b ? scope : "";
    const libName = ((init?.libraries) || []).find((l: { library_code: string }) => l.library_code === lib)?.display_name || "";
    const libLabel = libName ? `${libName} (${scope})` : scope;
    setBusy(true); setText("");
    try {
      const p = new URLSearchParams({ action: "getBoardOccupancy", library_code: lib });
      if (br) p.set("branch_code", br);
      const r = await fetch(`${API}?${p}`).then(x => x.json());
      if (r && r.ok) { const d = new Date(); setText(buildVacancyText(libLabel, `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`, r, plans, side)); }
      else showToast((r && r.error) || "Could not load board", "error");
    } catch { showToast("Network error", "error"); }
    setBusy(false);
  };

  return (
    <>
      <SectionTitle action={<span className="text-[12px] font-semibold text-lma-ink-3">{scope || "pick a chip above"}</span>}>
        Vacant seats
      </SectionTitle>
      <Card>
        <div className="flex flex-wrap gap-2">
          {ORDER.map(p => <Chip key={p} on={sel.includes(p)} onClick={() => toggle(p)}>{p === "FULL DAY" ? "Full day" : p[0] + p.slice(1).toLowerCase()}</Chip>)}
          <Chip on={side} onClick={() => { setText(""); setSide(v => !v); }}>Side panel</Chip>
        </div>
        <Button full className="mt-3" disabled={!any} loading={busy} loadingText="Reading the board…" onClick={go}>Get the list</Button>
        {text && (
          <>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-[12px] bg-lma-bg p-3 text-[12px] leading-relaxed text-lma-ink-2">{text}</pre>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(text).then(() => showToast("Copied")).catch(() => showToast("Couldn’t copy on this device", "error")); }}>Copy</Button>
              <Button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")}>WhatsApp</Button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
