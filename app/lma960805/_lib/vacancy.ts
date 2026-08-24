// ── SHARED VACANCY COMPUTER (B1) ─────────────────────────────────────
// ONE source of truth for "is this lane bookable". Honors the core rules:
// Morning+Evening=Full Day (anything on the FULL DAY lane takes both halves),
// blocks, and temp-holds (a held lane is reserved, NOT vacant).
// Consumers: board legend counts, board Vacant-list dialog, dashboard
// Vacant-seats card, and B4 occupancy rates. Never re-implement this rule.
export type VacPlan = "MORNING"|"EVENING"|"FULL DAY";
export interface VacCell {
  cell_type:string; display_label:string;
  morning:any; evening:any; fullday:any;
  block_info?:{ morning:any; evening:any; fullday:any };
  blocked?:{ morning:boolean; evening:boolean; fullday:boolean };
  temp_held?:{ morning:any; evening:any; fullday:any };
}
export interface VacBoard { sections:{ section_name:string; seats:VacCell[] }[]; floating?:any[]; unassigned?:any[]; otherShift?:any[]; }

export function laneFree(cell:VacCell, lane:"morning"|"evening"):boolean{
  const bi:any = cell.block_info || {};
  const th:any = cell.temp_held || {};
  const blk = (k:"morning"|"evening"|"fullday")=> bi[k] ? true : !!(cell.blocked&&cell.blocked[k]);
  if(cell.fullday || blk("fullday") || th.fullday) return false;
  return !cell[lane] && !blk(lane) && !th[lane];
}
export function planFree(cell:VacCell, plan:VacPlan):boolean{
  if(plan==="MORNING") return laneFree(cell,"morning");
  if(plan==="EVENING") return laneFree(cell,"evening");
  return laneFree(cell,"morning") && laneFree(cell,"evening");
}
// natural seat sort: numeric part first, then suffix (3 < 5 < 5A < 10A < 26A)
function seatKey(l:string):[number,string]{ const m=String(l).match(/^(\d+)(.*)$/); return m?[+m[1],m[2].toUpperCase()]:[Number.MAX_SAFE_INTEGER,String(l).toUpperCase()]; }
export function vacantSeats(board:VacBoard, plan:VacPlan):string[]{
  const out:string[]=[];
  board.sections.forEach(sec=>sec.seats.forEach(c=>{ if(c.cell_type==="DEAD") return; if(planFree(c,plan)) out.push(c.display_label); }));
  return out.sort((a,b)=>{ const ka=seatKey(a), kb=seatKey(b); return ka[0]-kb[0] || ka[1].localeCompare(kb[1]); });
}
export function buildVacancyText(libLabel:string, dateStr:string, board:VacBoard, plans:VacPlan[], sidePanel?:boolean):string{
  const L:string[]=["\u{1FA91} VACANT SEATS \u2014 "+libLabel, dateStr];
  plans.forEach(p=>{
    const s=vacantSeats(board,p);
    L.push("", p+" ("+s.length+(s.length===1?" SEAT":" SEATS")+"): "+(s.length?s.join(", "):"\u2014"));
  });
  if(sidePanel){
    const f=(board.floating||[]).length, u=(board.unassigned||[]).length, o=(board.otherShift||[]).length;
    const n=f+u+o;
    const parts=[f?f+" floating":"", u?u+" unassigned":"", o?o+" other-shift":""].filter(Boolean);
    L.push("", "SIDE PANEL ("+n+(n===1?" BOOKING":" BOOKINGS")+")"+(parts.length?": "+parts.join(", "):""));
  }
  return L.join("\n");
}

// ── B4: OCCUPANCY STATS — same rules as everything above, counts only ──
// LOCKED DEFINITION (owner-signed — do not change without sign-off):
//   A seat sells either as ONE full-day booking, or as TWO separate
//   bookings (morning + evening). A seat sold for one shift only is HALF
//   sold — the other shift is still on the shelf.
//     seats sold  = fdSeats + pairSeats + (morningOnly + eveningOnly)/2
//     occupancy % = seats sold ÷ seats          e.g. 208 / 280 = 74%
//   • BLOCKED seats stay in capacity, exactly like a free seat
//   • temp-held seats and off-chart bookings (floating / unassigned /
//     other-shift) are NOT occupancy — they are reported separately
// THE FIVE BUCKETS ALWAYS ADD UP TO `seats`:
//   fdSeats + pairSeats + morningOnlySeats + eveningOnlySeats + seatsEmpty
// `seats/lanes/occLanes/occPct/plan` are the ORIGINAL keys the seat chart
// reads: their maths is untouched. Everything else is additive reporting.
export function occupancyStats(board:VacBoard){
  let seats=0, mOcc=0, eOcc=0, fdOcc=0, mVac=0, eVac=0, fdVac=0;
  let blockedLanes=0, heldLanes=0, blockedSeats=0, heldSeats=0;
  let pairSeats=0, morningOnlySeats=0, eveningOnlySeats=0, seatsEmpty=0;
  board.sections.forEach(sec=>sec.seats.forEach(c=>{
    if(c.cell_type==="DEAD") return;
    seats++;
    if(c.fullday){ fdOcc++; } else { if(c.morning) mOcc++; if(c.evening) eOcc++; }
    if(laneFree(c,"morning")) mVac++;
    if(laneFree(c,"evening")) eVac++;
    if(planFree(c,"FULL DAY")) fdVac++;
    // ── the five buckets: every seat lands in exactly one of them ──
    if(c.fullday){ /* bucket a = fdOcc */ }
    else if(c.morning && c.evening) pairSeats++;        // b — two students sharing
    else if(c.morning)              morningOnlySeats++; // c — evening still on the shelf
    else if(c.evening)              eveningOnlySeats++; // d — morning still on the shelf
    else                            seatsEmpty++;       // e — nothing booked
    // blocked / held seats — REPORTED ONLY, never netted out of capacity
    const bi:any = c.block_info || {};
    const blk = (k:"morning"|"evening"|"fullday")=> bi[k] ? true : !!(c.blocked&&c.blocked[k]);
    blockedLanes += blk("fullday") ? 2 : ((blk("morning")?1:0)+(blk("evening")?1:0));
    if(blk("fullday")||blk("morning")||blk("evening")) blockedSeats++;
    const th:any = c.temp_held || {};
    heldLanes += th.fullday ? 2 : ((th.morning?1:0)+(th.evening?1:0));
    if(th.fullday||th.morning||th.evening) heldSeats++;
  }));
  const lanes=seats*2, occLanes=mOcc+eOcc+fdOcc*2;
  const pct=(n:number,d:number)=>d?Math.round((n/d)*100):0;
  return {
    seats, lanes, occLanes, occPct:pct(occLanes,lanes),
    soldSeats: occLanes/2,          // seats' worth sold (full = 1, half-booked = 0.5)
    freeSeats: seats - occLanes/2,  // the rest — soldSeats + freeSeats === seats
    bookings:mOcc+eOcc+fdOcc,       // live seat-bound bookings sitting on the chart
    fdSeats:fdOcc, pairSeats, morningOnlySeats, eveningOnlySeats, seatsEmpty,
    seatsFull:fdOcc+pairSeats, seatsHalf:morningOnlySeats+eveningOnlySeats,
    blockedLanes, heldLanes, blockedSeats, heldSeats,
    plan:{
      "MORNING":  { occ:mOcc+fdOcc, vac:mVac,  total:seats, pct:pct(mOcc+fdOcc,seats) },
      "EVENING":  { occ:eOcc+fdOcc, vac:eVac,  total:seats, pct:pct(eOcc+fdOcc,seats) },
      "FULL DAY": { occ:fdOcc,      vac:fdVac, total:seats, pct:pct(fdOcc,seats) },
    } as Record<VacPlan,{occ:number;vac:number;total:number;pct:number}>,
  };
}