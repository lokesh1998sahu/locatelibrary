  import sql from "./_db";

  // ── ACTION TOGGLE ────────────────────────────────────────────────────
  // Actions listed here are served by Postgres. EVERY action NOT listed here
  // still transparently proxies to Apps Script (GAS). To roll an action back
  // to GAS, delete it from this set and redeploy. That's the whole safety switch.
  export const PG_ACTIONS = new Set<string>([
    // 03_Init
    "getInitData",
    // 04_Students (reads)
    "getStudentById",
    "searchStudents",
    "searchForRenewal",
    "getAllStudents",
    "getStudentCounts",
    "getPendingOptional",
    // 13_SeatLayouts + 14_SeatBlocks (reads)
    "getSeatLayout",
    "getAllSeatLayouts",
    "getSeatBlocks",
    // 15_SeatBoard (reads)
    "getBoardOccupancy",
    "getVacantSeats",
    "getSeatHistory",
    // 05_Receipts (reads)
    "getReceiptLog",
    "getStudentBookingHistory",
    // 06_Dues (reads)
    "getPendingDues",
    "getDuePayments",
    "getDuePaymentLog",
    "getIrrecoverableDues",
    // 07_MiscIncome / 08_Refunds / 10_Renewals (reads)
    "getMiscIncome",
    "getRefundLog",
    "getRenewalsQueue",
    "getCancellationsQueue",
    // 16_ReceiptEdits / 05_Receipts (reads)
    "getReceiptEditHistory",
    "getReceiptMoneyTrail",
    // 11_Dashboard / health
    "getDashboard",
    "ping",
    // ══ CUTOVER: writes enabled ══
    // 05_Receipts (writes)
    "createReceipt",
    "updateReceipt",
    "resetReceiptStatus",
    // 10_Renewals (writes)
    "markReceiptRenewed",
    "markReceiptDoNotRenew",
    "markReceiptCancelled",
    "markReceiptCancelledWithRefund",
    // 06_Dues (writes)
    "logFeePayment",
    "updateDuePayment",
    "markDuesIrrecoverable",
    "unmarkDuesIrrecoverable",
    // 08_Refunds (writes)
    "issueRefund",
    "updateRefund",
    "deleteRefund",
    // 14_SeatBlocks (writes)
    "addSeatBlock",
    "removeSeatBlock",
    "updateSeatBlock",
    "tempVacateSeat",
    "reAllotSeat",
    // 13_SeatLayouts (writes)
    "saveSeatSection",
    "deleteSeatSection",
    "addOrUpdateSeat",
    "removeSeat",
    // 04_Students (writes)
    "addStudent",
    "updateStudent",
    "updateOptional",
    "deleteStudent",
    // 07_MiscIncome (writes)
    "addMiscIncome",
    "updateMiscIncome",
    "deleteMiscIncome",
    "restoreMiscIncome",
    // 09_Admin (writes)
    "addLibrary",
    "updateLibrary",
    "toggleLibrary",
    "addBranch",
    "updateBranch",
    "toggleBranch",
    "addShift",
    "updateShift",
    "toggleShift",
    "addPaymentTag",
    "updatePaymentTag",
    "togglePaymentTag",
    "updateFee",
    "updateSettings",
    // 17_Intake (reads + writes)
    "intakeCheck",
    "intakeFetch",
    "intakeList",
    "intakeSubmit",
    "intakeMarkUsed",
    "intakeGenerateCode",
    "intakeVoid",
  ]);

  // ── shared helpers (mirror GAS toUpper / toBool / toNum / normalizePhone) ──
  const up = (v: unknown) => (v === null || v === undefined ? "" : String(v).toUpperCase().trim());
  const num = (v: unknown) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };
  const tobool = (v: unknown) =>
    v === true || v === 1 || ["TRUE", "YES", "1"].includes(String(v ?? "").toUpperCase().trim());

  // compose a display student_id with cross-library suffix (F129 or F129-KAL)
  function composeSid(studentId: unknown, isCrossLibrary: unknown) {
    const sid = up(studentId || "");
    const cl = String(isCrossLibrary || "").trim().toUpperCase();
    if (!cl || cl === "NO") return sid;
    if (sid.indexOf("-" + cl) >= 0) return sid;
    return sid + "-" + cl;
  }
  function normShift(s: unknown) {
    const u = up(s || "").trim();
    if (u === "MORNING" || u === "M") return "MORNING";
    if (u === "EVENING" || u === "E") return "EVENING";
    if (u === "FULL DAY" || u === "FULLDAY" || u === "FD" || u === "FULL_DAY") return "FULL DAY";
    return "OTHER";
  }
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // YYYY-MM-DD → "d-MMM-yyyy" (matches GAS formatDateForReceipt); blank → ""
  function fmtDate(ymd: unknown): string {
    if (!ymd) return "";
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(ymd).trim();
    return +m[3] + "-" + MON[+m[2] - 1] + "-" + m[1];
  }
  function epochDays(y: number, mo: number, d: number) {
    return Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
  }
  // whole days from today (IST) to a YYYY-MM-DD string; null if blank/unparseable (matches GAS daysFromToday)
  function daysFromYmd(ymd: unknown): number | null {
    if (!ymd) return null;
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const target = epochDays(+m[1], +m[2], +m[3]);
    const nd = new Date(Date.now() + 5.5 * 3600 * 1000); // IST wall-clock
    const today = epochDays(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate());
    return target - today;
  }
  function normalizePhone(input: unknown): string {
    if (!input) return "";
    let c = String(input).replace(/[\s\-.()]/g, "");
    if (c.startsWith("+91")) c = c.slice(3);
    else if (c.startsWith("91") && c.length > 10) c = c.slice(2);
    c = c.replace(/\D/g, "");
    if (c.length > 10) c = c.slice(-10);
    return c;
  }
  function extractPhones(r: any) {
    return [
      { number: normalizePhone(String(r.phone ?? "")), tag: up(r.phone_tag ?? "") },
      { number: normalizePhone(String(r.phone2 ?? "")), tag: up(r.phone2_tag ?? "") },
      { number: normalizePhone(String(r.phone3 ?? "")), tag: up(r.phone3_tag ?? "") },
      { number: normalizePhone(String(r.phone4 ?? "")), tag: up(r.phone4_tag ?? "") },
    ].filter((p) => p.number);
  }

  // ════════════════════════════════════════════════════════════════════
  // 03_Init.gs → getInitData
  // Returns { libraries, branches, fees, shifts, paymentTags, activeTags, settings }
  // ════════════════════════════════════════════════════════════════════
  function buildFees(rows: any[]) {
    const f: Record<string, Record<string, number | null>> = {};
    for (const r of rows) {
      const fk = up(r.fee_key);
      const sk = up(r.shift_key);
      if (!fk || !sk) continue;
      (f[fk] ??= {})[sk] = r.fee_amount == null ? null : Number(r.fee_amount);
    }
    return f;
  }
  function buildSettings(rows: any[]) {
    const s: Record<string, any> = {};
    for (const r of rows) {
      const lib = up(r.library);
      if (!lib) continue;
      s[lib] = { ...r };
    }
    return s;
  }

  async function getInitData() {
    // Sequential on purpose: six tiny tables. Firing them in parallel grabbed six
    // pooled connections at once, which starved the pool under real page load.
    const libs         = (await sql`select * from libraries        order by s_no`) as any[];
    const branches     = (await sql`select * from library_branches order by s_no`) as any[];
    const fees         = (await sql`select * from library_fees`) as any[];
    const shifts       = (await sql`select * from shifts           order by s_no`) as any[];
    const tags         = (await sql`select r.display_code as tag_name, r.bank_code as fees_mode, r.settlement_days, (r.active_lma and a.active) as active, to_char(r.created_at,'YYYY-MM-DD HH24:MI:SS') as created_at from fin.routes r join fin.accounts a on a.bank_code = r.bank_code order by r.id`) as any[];
    const settingsRows = (await sql`select * from settings`) as any[];
    const finAccounts  = (await sql`select bank_code, bank_name, owner_name, acct_type from fin.accounts where active order by bank_name nulls last, bank_code`) as any[];

    return {
      libraries: (libs as any[]).map((r) => ({
        library_code: up(r.library_code),
        library_name: r.library_name ?? "",
        display_name: r.display_name || r.library_name || "",
        active: !!r.active,
        has_branches: !!r.has_branches,
        emoji: r.emoji || "📚",
        color: r.color ?? "",
        address: r.address ?? "",
        contact: r.contact ?? "",
      })),
      branches: (branches as any[]).map((r) => ({
        library_code: up(r.library_code),
        branch_code: up(r.branch_code),
        branch_display: r.branch_display ?? "",
        active: !!r.active,
        emoji: r.emoji ?? "",
        color: r.color ?? "",
        address: r.address ?? "",
        contact: r.contact ?? "",
      })),
      fees: buildFees(fees as any[]),
      shifts: (shifts as any[]).map((r) => ({
        shift_key: up(r.shift_key),
        shift_name: r.shift_name ?? "",
        shift_time: r.shift_time ?? "",
        active: !!r.active,
      })),
      paymentTags: (tags as any[]).map((r) => ({
        tag_name: up(r.tag_name),
        fees_mode: (r.fees_mode ?? "").trim(),
        settlement_days: Number(r.settlement_days ?? 0),
        active: !!r.active,
        created_at: r.created_at ?? "",
      })),
      activeTags: (tags as any[]).filter((r) => !!r.active).map((r) => up(r.tag_name)),
      accounts: (finAccounts as any[]).map((r) => ({
        bank_code: up(r.bank_code),
        bank_name: r.bank_name ?? r.bank_code,
        owner_name: r.owner_name ?? "",
        acct_type: r.acct_type ?? "BANK",
      })),
      settings: buildSettings(settingsRows as any[]),
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // 04_Students.gs → reads   (matching rule: student_id + library, multi-lib safe)
  // ════════════════════════════════════════════════════════════════════
  function mapStudentRow(r: any) {
    return {
      s_no: num(r.s_no),
      student_id: up(r.student_id),
      library: up(r.library),
      branch: up(r.branch ?? ""),
      name: up(r.name ?? ""),
      phones: extractPhones(r),
      added_on: String(r.added_on ?? ""),
      address: String(r.address ?? ""),
      preparing_for: String(r.preparing_for ?? ""),
      aadhaar_last4: String(r.aadhaar_last4 ?? ""),
      date_of_birth: String(r.date_of_birth ?? ""),
      gender: up(r.gender ?? ""),
      is_past: r.is_past === true,
    };
  }

  // one small helper — the whole students table (filtering is done in JS to
  // match the GAS logic byte-for-byte; 1.7k rows is trivial)
  const allStudents = () => sql`select * from students` as unknown as Promise<any[]>;

  // library param matches a library OR a branch code (cross-library safe)
  function libMatch(r: any, targetLib: string) {
    if (!targetLib) return true;
    return up(r.library) === targetLib || up(r.branch ?? "") === targetLib;
  }

  async function getStudentById(p: any) {
    const id = up(p.student_id ?? "").split("-")[0]; // strip cross-lib suffix e.g. F316-KAL → F316
    const targetLib = up(p.library ?? "");
    if (!id) return { student: null };
    for (const r of await allStudents()) {
      if (up(r.student_id) !== id) continue;
      if (!libMatch(r, targetLib)) continue;
      return { student: mapStudentRow(r) };
    }
    return { student: null };
  }

  async function searchStudents(p: any) {
    const query = up(p.q ?? "");
    const targetLib = up(p.library ?? "");
    const searchType = up(p.search_type ?? "NAME");
    const phoneQ = normalizePhone(p.q ?? "");
    const isPastFilter = up(p.is_past ?? "ANY");
    if (!query || query.length < 2) return { results: [] };

    const results: any[] = [];
    for (const r of await allStudents()) {
      if (!r.student_id) continue;
      if (!libMatch(r, targetLib)) continue;
      if (isPastFilter !== "ANY") {
        if ((r.is_past === true) !== (isPastFilter === "TRUE")) continue;
      }
      let match = false;
      if (searchType === "NAME") match = up(r.name ?? "").indexOf(query) >= 0;
      else if (searchType === "PHONE" && phoneQ.length >= 3)
        match = extractPhones(r).some((x) => x.number.indexOf(phoneQ) >= 0);
      else if (searchType === "STUDENT_ID") match = up(r.student_id ?? "").indexOf(query) >= 0;
      else match = up(r.name ?? "").indexOf(query) >= 0;
      if (match) results.push(mapStudentRow(r));
    }
    results.sort((a, b) => (b.s_no || 0) - (a.s_no || 0));
    return { results };
  }

  async function searchForRenewal(p: any) {
    if (!p.library) return { results: [] };
    return searchStudents(p);
  }

  async function getAllStudents(p: any) {
    const targetLib = up(p.library ?? "");
    const isPastFilter = up(p.is_past ?? "ANY");
    const page = Math.max(1, parseInt(p.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(p.limit) || 50));

    const filtered: any[] = [];
    for (const r of await allStudents()) {
      if (!r.student_id) continue;
      if (!libMatch(r, targetLib)) continue;
      if (isPastFilter !== "ANY") {
        if ((r.is_past === true) !== (isPastFilter === "TRUE")) continue;
      }
      filtered.push(r);
    }
    filtered.sort((a, b) => (num(b.s_no) || 0) - (num(a.s_no) || 0));
    const total = filtered.length;

    if (String(p.all ?? "") === "1") {
      return { students: filtered.map(mapStudentRow), total, page: 1, totalPages: 1, limit: total };
    }
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    return { students: filtered.slice(start, start + limit).map(mapStudentRow), total, page, totalPages, limit };
  }

  async function getStudentCounts() {
    let active = 0,
      past = 0;
    const byLibrary: Record<string, { total: number; active: number; past: number }> = {};
    for (const r of await allStudents()) {
      if (!r.student_id) continue;
      const lib = up(r.library);
      const isPast = r.is_past === true;
      if (isPast) past++;
      else active++;
      if (!byLibrary[lib]) byLibrary[lib] = { total: 0, active: 0, past: 0 };
      byLibrary[lib].total++;
      if (isPast) byLibrary[lib].past++;
      else byLibrary[lib].active++;
    }
    return { total: active + past, active, past, byLibrary };
  }

  async function getPendingOptional(p: any) {
    const targetLib = up(p.library ?? "");
    const students: any[] = [];
    for (const r of await allStudents()) {
      if (!r.student_id) continue;
      if (!libMatch(r, targetLib)) continue;
      if (r.is_past === true) continue; // past students skipped from the nag list
      const missing = !r.address || !r.preparing_for || !r.aadhaar_last4 || !r.date_of_birth;
      if (missing) students.push(mapStudentRow(r));
    }
    return { students };
  }

  // ════════════════════════════════════════════════════════════════════
  // 13_SeatLayouts.gs + 14_SeatBlocks.gs → reads
  // ════════════════════════════════════════════════════════════════════
  async function getSeatLayout(p: any) {
    const targetLib = up(p.library_code);
    const targetBranch = up(p.branch_code ?? "");
    if (!targetLib) throw new Error("library_code is required.");
    const rows = (await sql`select * from seat_layouts`) as unknown as any[];
    const sectionMap: Record<string, any> = {};
    for (const r of rows) {
      if (up(r.library_code) !== targetLib) continue;
      if (up(r.branch_code ?? "") !== targetBranch) continue;
      if (r.active !== true) continue;
      const sn = String(r.section_name ?? "DEFAULT");
      if (!sectionMap[sn]) sectionMap[sn] = { section_name: sn, section_order: num(r.section_order) || 1, seats: [] };
      sectionMap[sn].seats.push({
        s_no: num(r.s_no),
        row_in_section: num(r.row_in_section),
        col_in_section: num(r.col_in_section),
        seat_no: num(r.seat_no),
        display_label: String(r.display_label ?? ""),
        notes: String(r.notes ?? ""),
        cell_type: up(r.cell_type || "SEAT"),
      });
    }
    const sections = Object.values(sectionMap).sort((a: any, b: any) => a.section_order - b.section_order);
    sections.forEach((sec: any) => {
      let maxRow = 0,
        maxCol = 0;
      sec.seats.forEach((s: any) => {
        if (s.row_in_section > maxRow) maxRow = s.row_in_section;
        if (s.col_in_section > maxCol) maxCol = s.col_in_section;
      });
      sec.rows = maxRow;
      sec.cols = maxCol;
    });
    return { library_code: targetLib, branch_code: targetBranch, sections };
  }

  async function getAllSeatLayouts() {
    const rows = (await sql`select * from seat_layouts`) as unknown as any[];
    const layouts: Record<string, any> = {};
    for (const r of rows) {
      const lib = up(r.library_code),
        br = up(r.branch_code ?? "");
      if (!lib) continue;
      if (r.active !== true) continue;
      const key = lib + "|" + br;
      if (!layouts[key]) layouts[key] = { library_code: lib, branch_code: br, seat_count: 0, dead_count: 0, sections: {} };
      const isDead = up(r.cell_type || "SEAT") === "DEAD";
      if (isDead) layouts[key].dead_count++;
      else layouts[key].seat_count++;
      const secName = String(r.section_name ?? "DEFAULT");
      if (!isDead) layouts[key].sections[secName] = (layouts[key].sections[secName] || 0) + 1;
    }
    const list = Object.values(layouts).map((l: any) => ({
      library_code: l.library_code,
      branch_code: l.branch_code,
      seat_count: l.seat_count,
      dead_count: l.dead_count,
      section_count: Object.keys(l.sections).length,
      sections: l.sections,
    }));
    return { layouts: list };
  }

  async function getSeatBlocks(p: any) {
    const targetLib = up(p.library_code);
    const targetBranch = up(p.branch_code ?? "");
    if (!targetLib) throw new Error("library_code is required.");
    const includeInactive = tobool(p.include_inactive);
    const rows = (await sql`
      select s_no, block_id, library_code, branch_code, seat_display_label, shift_blocked,
            to_char(block_from,'YYYY-MM-DD') as block_from, to_char(block_to,'YYYY-MM-DD') as block_to,
            reason, created_at, active
      from seat_blocks`) as unknown as any[];
    const blocks: any[] = [];
    for (const r of rows) {
      if (!r.block_id) continue;
      if (up(r.library_code) !== targetLib) continue;
      if (up(r.branch_code ?? "") !== targetBranch) continue;
      const active = r.active === true;
      if (!includeInactive && !active) continue;
      blocks.push({
        s_no: num(r.s_no),
        block_id: String(r.block_id ?? ""),
        library_code: up(r.library_code ?? ""),
        branch_code: up(r.branch_code ?? ""),
        seat_display_label: String(r.seat_display_label ?? ""),
        shift_blocked: up(r.shift_blocked || "FULL DAY"),
        block_from: String(r.block_from ?? ""),
        block_to: String(r.block_to ?? ""),
        reason: String(r.reason ?? ""),
        gender: "",
        created_at: String(r.created_at ?? ""),
        active,
        // hold-specific fields (those columns don't exist yet → GAS returns these defaults)
        hold_type: "BLOCK",
        hold_admit_type: "",
        student_id: "",
        student_name: "",
        student_phone: "",
        proposed_fee: "",
        proposed_booking_from: "",
        proposed_booking_to: "",
      });
    }
    return { ok: true, blocks, total: blocks.length };
  }

  // ════════════════════════════════════════════════════════════════════
  // 15_SeatBoard.gs → board / vacancy / history
  // Occupancy = LIVE receipts only (status blank); NO date math for occupancy.
  // Dates drive expiry COLOR only. Seat identity = display label (case-sensitive
  // trim, exactly like GAS). temporary_seat set => not occupying (floating).
  // ════════════════════════════════════════════════════════════════════
  function buildOccupancy(rows: any[], library_code: string, branch_code: string, ignore?: string) {
    const tl = up(library_code),
      tb = up(branch_code ?? "");
    const occ: Record<string, any> = {},
      floating: any[] = [],
      unassigned: any[] = [],
      otherShift: any[] = [],
      tempHeld: Record<string, any> = {};
    for (const row of rows) {
      if (!row.receipt_no) continue;
      if (up(row.status || "")) continue; // live only
      if (ignore && up(row.receipt_no || "") === up(ignore)) continue;
      if (up(row.library) !== tl) continue;
      if (up(row.branch ?? "") !== tb) continue;
      const raw = row.booking_to_ymd || "";
      const lite: any = {
        receipt_no: String(row.receipt_no ?? ""),
        student_id: composeSid(String(row.student_id ?? ""), row.is_cross_library),
        name: String(row.name ?? ""),
        shift: String(row.shift ?? ""),
        shift_name: String(row.shift_name ?? ""),
        booking_to: fmtDate(raw),
        phones: extractPhones(row),
        phone: normalizePhone(String(row.phone ?? "")),
        fees_due_balance: num(row.fees_due_balance),
        dues_status: up(row.dues_status || ""),
        remark: String(row.remark ?? ""),
        is_cross_library: up(row.is_cross_library || ""),
        seat_label: String(row.seat_no ?? "").trim(),
        temporary_seat: String(row.temporary_seat ?? "").trim(),
        gender: String(row.gender ?? ""),
        receipt_type: up(row.type || ""),
        __days: daysFromYmd(raw),
      };
      const shift = normShift(lite.shift);
      if (lite.temporary_seat) {
        floating.push(lite);
        const tlab = lite.temporary_seat;
        if (!tempHeld[tlab]) tempHeld[tlab] = { morning: null, evening: null, fullday: null };
        if (shift === "MORNING") tempHeld[tlab].morning = lite;
        else if (shift === "EVENING") tempHeld[tlab].evening = lite;
        else if (shift === "FULL DAY") tempHeld[tlab].fullday = lite;
        continue;
      }
      if (shift === "OTHER") {
        otherShift.push(lite);
        continue;
      }
      if (!lite.seat_label) {
        unassigned.push(lite);
        continue;
      }
      const label = lite.seat_label;
      if (!occ[label]) occ[label] = { morning: null, evening: null, fullday: null };
      if (shift === "MORNING") occ[label].morning = lite;
      else if (shift === "EVENING") occ[label].evening = lite;
      else if (shift === "FULL DAY") occ[label].fullday = lite;
    }
    return { occ, floating, unassigned, otherShift, tempHeld };
  }

  async function buildBlocks(library_code: string, branch_code: string) {
    const tl = up(library_code),
      tb = up(branch_code ?? "");
    const blocks: Record<string, any> = {};
    const rows = (await sql`
      select *, to_char(block_to,'YYYY-MM-DD') as block_to_ymd, to_char(block_from,'YYYY-MM-DD') as block_from_ymd
      from seat_blocks`) as unknown as any[];
    for (const row of rows) {
      if (!tobool(row.active)) continue;
      if (up(row.library_code) !== tl) continue;
      if (up(row.branch_code ?? "") !== tb) continue;
      const label = String(row.seat_display_label ?? "").trim();
      if (!label) continue;
      const sh = up(row.shift_blocked || "FULL DAY");
      const bd = daysFromYmd(row.block_to_ymd || "");
      const expired = bd !== null && bd < 0;
      if (!blocks[label]) blocks[label] = {};
      blocks[label][sh] = {
        block_id: String(row.block_id ?? ""),
        reason: String(row.reason ?? ""),
        shift: sh,
        block_from: fmtDate(row.block_from_ymd || ""),
        block_to: fmtDate(row.block_to_ymd || ""),
        expired,
        gender: "",
      };
    }
    return blocks;
  }

  function pickBlockInfo(blocks: any, label: string, inc: string) {
    const b = blocks[label];
    if (!b) return null;
    if (b["FULL DAY"]) return b["FULL DAY"];
    if (inc === "FULL DAY") return b["MORNING"] || b["EVENING"] || null;
    return b[inc] || null;
  }
  function isBlockedFor(blocks: any, label: string, inc: string) {
    const b = blocks[label];
    if (!b) return false;
    if (b["FULL DAY"]) return true;
    if (inc === "FULL DAY") return !!(b["MORNING"] || b["EVENING"]);
    return !!b[inc];
  }

  async function getBoardOccupancy(params: any) {
    const library_code = up(params.library_code);
    if (!library_code) throw new Error("library_code is required.");
    const branch_code = up(params.branch_code ?? "");
    const layout = await getSeatLayout({ library_code, branch_code });
    const rows = (await sql`select *, to_char(booking_to,'YYYY-MM-DD') as booking_to_ymd from receipt_log`) as any[];
    const srow = (await sql`select * from settings where upper(library)=${library_code} limit 1`) as any[];
    const { occ, floating, unassigned, otherShift, tempHeld } = buildOccupancy(rows, library_code, branch_code);
    const blocks = await buildBlocks(library_code, branch_code);
    const s = srow[0] || {};
    const alertDays = num(s.renewal_alert_days) > 0 ? num(s.renewal_alert_days) : 5;
    let alertPrim = num(s.renewal_alert_days_primary) > 0 ? num(s.renewal_alert_days_primary) : 3;
    if (alertPrim > alertDays) alertPrim = alertDays;

    const withStatus = (o: any) => {
      if (!o) return null;
      const d = o.__days;
      const color = d === null ? "OK" : d < 0 ? "EXPIRED" : d <= alertDays ? "EXPIRING" : "OK";
      const urgent = d !== null && d >= 0 && d <= alertPrim;
      const has_dues = !!(o.fees_due_balance > 0 && o.dues_status === "PENDING");
      const { __days, ...rest } = o;
      return { ...rest, color, urgent, has_dues };
    };

    const sections = layout.sections.map((sec: any) => {
      const cells = sec.seats.map((cell: any) => {
        if (cell.cell_type === "DEAD") return { ...cell, state: "DEAD" };
        const label = cell.display_label;
        const o = occ[label] || { morning: null, evening: null, fullday: null };
        const b = blocks[label] || {};
        const th = tempHeld[label] || {};
        return {
          row_in_section: cell.row_in_section,
          col_in_section: cell.col_in_section,
          seat_no: cell.seat_no,
          display_label: label,
          notes: cell.notes,
          cell_type: "SEAT",
          morning: withStatus(o.morning),
          evening: withStatus(o.evening),
          fullday: withStatus(o.fullday),
          blocked: {
            morning: !!(b["FULL DAY"] || b["MORNING"]),
            evening: !!(b["FULL DAY"] || b["EVENING"]),
            fullday: !!b["FULL DAY"],
          },
          block_info: {
            morning: pickBlockInfo(blocks, label, "MORNING"),
            evening: pickBlockInfo(blocks, label, "EVENING"),
            fullday: b["FULL DAY"] || null,
          },
          temp_held: {
            morning: th.morning && !o.morning && !o.fullday ? { receipt_no: th.morning.receipt_no, student_id: th.morning.student_id, name: th.morning.name } : null,
            evening: th.evening && !o.evening && !o.fullday ? { receipt_no: th.evening.receipt_no, student_id: th.evening.student_id, name: th.evening.name } : null,
            fullday: th.fullday && !o.fullday && !o.morning && !o.evening ? { receipt_no: th.fullday.receipt_no, student_id: th.fullday.student_id, name: th.fullday.name } : null,
          },
        };
      });
      return { section_name: sec.section_name, section_order: sec.section_order, rows: sec.rows, cols: sec.cols, seats: cells };
    });

    const colorList = (arr: any[]) => arr.map(withStatus);
    return {
      library_code,
      branch_code,
      sections,
      floating: colorList(floating),
      unassigned: colorList(unassigned),
      otherShift: colorList(otherShift),
      counts: { floating: floating.length, unassigned: unassigned.length, other: otherShift.length },
    };
  }

  async function getVacantSeats(params: any) {
    const library_code = up(params.library_code);
    if (!library_code) throw new Error("library_code is required.");
    const branch_code = up(params.branch_code ?? "");
    const inc = normShift(params.shift);
    if (inc === "OTHER") return { library_code, branch_code, shift: "OTHER", needs_seat: false, sections: [] };
    const ignore = up(params.ignore_receipt_no ?? "");
    const layout = await getSeatLayout({ library_code, branch_code });
    const rows = (await sql`select *, to_char(booking_to,'YYYY-MM-DD') as booking_to_ymd from receipt_log`) as any[];
    const { occ, tempHeld } = buildOccupancy(rows, library_code, branch_code, ignore);
    const blocks = await buildBlocks(library_code, branch_code);

    const sections = layout.sections.map((sec: any) => {
      const cells = sec.seats.map((cell: any) => {
        if (cell.cell_type === "DEAD") return { ...cell, state: "DEAD" };
        const label = cell.display_label;
        const o = occ[label] || { morning: null, evening: null, fullday: null };
        const blocked = isBlockedFor(blocks, label, inc);
        let state: string,
          occupant: any = null,
          shareNote: string | null = null;
        if (blocked) state = "BLOCKED";
        else if (o.fullday) {
          state = "OCCUPIED";
          occupant = o.fullday;
        } else if (inc === "FULL DAY") {
          if (o.morning || o.evening) {
            state = "OCCUPIED";
            occupant = o.morning || o.evening;
          } else state = "VACANT";
        } else if (inc === "MORNING") {
          if (o.morning) {
            state = "OCCUPIED";
            occupant = o.morning;
          } else {
            state = "VACANT";
            if (o.evening) shareNote = "Evening: " + o.evening.name;
          }
        } else if (inc === "EVENING") {
          if (o.evening) {
            state = "OCCUPIED";
            occupant = o.evening;
          } else {
            state = "VACANT";
            if (o.morning) shareNote = "Morning: " + o.morning.name;
          }
        } else state = "VACANT";
        return {
          row_in_section: cell.row_in_section,
          col_in_section: cell.col_in_section,
          seat_no: cell.seat_no,
          display_label: label,
          notes: cell.notes,
          cell_type: "SEAT",
          state,
          occupant: occupant ? { receipt_no: occupant.receipt_no, student_id: occupant.student_id, name: occupant.name, shift: occupant.shift } : null,
          temp_held: (() => {
            if (state !== "VACANT") return null;
            const th = tempHeld[label] || {};
            let h: any = null;
            if (inc === "FULL DAY") h = th.fullday || th.morning || th.evening;
            else if (inc === "MORNING") h = th.fullday || th.morning;
            else if (inc === "EVENING") h = th.fullday || th.evening;
            return h ? { receipt_no: h.receipt_no, student_id: h.student_id, name: h.name, shift: h.shift } : null;
          })(),
          share_note: shareNote,
        };
      });
      return { section_name: sec.section_name, section_order: sec.section_order, rows: sec.rows, cols: sec.cols, seats: cells };
    });
    return { library_code, branch_code, shift: inc, needs_seat: true, sections };
  }

  function b3Shift(v: unknown) {
    const s = up(String(v || "").trim());
    return s === "FULLDAY" || s === "FD" ? "FULL DAY" : s;
  }
  async function getSeatHistory(params: any) {
    const lib = up(params.library_code || params.library || "");
    const br = up(params.branch_code || params.branch || "");
    const seat = up(String(params.seat_no || "").trim());
    const plan = b3Shift(params.shift || "");
    if (!lib || !seat || !plan) return { ok: false, error: "library_code, seat_no and shift are required" };
    const rows = (await sql`
      select *, to_char(booking_to,'YYYY-MM-DD') as booking_to_ymd, to_char(booking_from,'YYYY-MM-DD') as booking_from_ymd
      from receipt_log`) as unknown as any[];
    const nd = new Date(Date.now() + 5.5 * 3600 * 1000);
    const today = nd.getUTCFullYear() * 10000 + (nd.getUTCMonth() + 1) * 100 + nd.getUTCDate();
    const scope = br || lib;
    const items: any[] = [];
    for (const row of rows) {
      if (up(String(row.seat_no || "").trim()) !== seat) continue;
      const rScope = up(row.branch || "") || up(row.library || "");
      if (rScope !== scope) continue;
      if (b3Shift(row.shift) !== plan) continue;
      const ymd = row.booking_to_ymd || "";
      const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
      const toI = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
      if (!toI || toI >= today) continue; // past bookings only
      items.push({
        receipt_no: up(row.receipt_no || ""),
        student_id: up(row.student_id || ""),
        name: String(row.name || ""),
        booking_from: fmtDate(row.booking_from_ymd || ""),
        booking_to: fmtDate(row.booking_to_ymd || ""),
        status: up(row.status || ""),
        _s: toI,
      });
    }
    items.sort((a, b) => b._s - a._s);
    const out = items.slice(0, 5);
    out.forEach((o) => delete o._s);
    return { ok: true, seat_no: seat, shift: plan, items: out };
  }

  // ════════════════════════════════════════════════════════════════════
  // 05_Receipts.gs → reads
  // ════════════════════════════════════════════════════════════════════
  function resolveOrigin(library: unknown, branch: unknown, isCrossLibrary: unknown) {
    const cl = String(isCrossLibrary || "").trim().toUpperCase();
    if (cl && cl !== "NO") return cl;
    return String(branch || "").trim().toUpperCase() || String(library || "").trim().toUpperCase();
  }

  // full receipt object (matches GAS mapReceiptRow). booking dates come in as
  // booking_from_ymd / booking_to_ymd (to_char'd in the query). cancelled_on
  // is "" — that column doesn't exist (GAS returns "" for it too).
  function mapReceiptRow(r: any) {
    return {
      s_no: num(r.s_no),
      receipt_no: up(r.receipt_no),
      student_id: composeSid(up(r.student_id), r.is_cross_library),
      library: up(r.library),
      branch: up(r.branch ?? ""),
      name: up(r.name ?? ""),
      phones: extractPhones(r),
      phone: normalizePhone(String(r.phone ?? "")),
      seat_no: String(r.seat_no ?? ""),
      shift: up(r.shift ?? ""),
      shift_name: up(r.shift_name ?? ""),
      shift_time: up(r.shift_time ?? ""),
      booking_from: String(r.booking_from_ymd ?? ""),
      booking_to: String(r.booking_to_ymd ?? ""),
      receipt_date: String(r.receipt_date ?? ""),
      fee: num(r.fee),
      pay_mode_1: up(r.pay_mode_1 ?? ""),
      pay_amount_1: num(r.pay_amount_1),
      pay_fees_mode_1: String(r.pay_fees_mode_1 ?? ""),
      pay_mode_2: up(r.pay_mode_2 ?? ""),
      pay_amount_2: num(r.pay_amount_2),
      pay_fees_mode_2: String(r.pay_fees_mode_2 ?? ""),
      pay_mode_3: up(r.pay_mode_3 ?? ""),
      pay_amount_3: num(r.pay_amount_3),
      pay_fees_mode_3: String(r.pay_fees_mode_3 ?? ""),
      pay_mode_1_date: String(r.pay_mode_1_date ?? ""),
      pay_mode_1_s_date: String(r.pay_mode_1_s_date ?? ""),
      pay_mode_2_date: String(r.pay_mode_2_date ?? ""),
      pay_mode_2_s_date: String(r.pay_mode_2_s_date ?? ""),
      pay_mode_3_date: String(r.pay_mode_3_date ?? ""),
      pay_mode_3_s_date: String(r.pay_mode_3_s_date ?? ""),
      fees_due: num(r.fees_due),
      fees_due_balance: num(r.fees_due_balance),
      type: up(r.type ?? ""),
      is_cross_library: up(r.is_cross_library || "NO"),
      gender: up(r.gender ?? ""),
      generated_at: String(r.generated_at ?? ""),
      receipt_text: String(r.receipt_text ?? ""),
      registration_text: String(r.registration_text ?? ""),
      status: up(r.status ?? ""),
      dues_status: up(r.dues_status ?? ""),
      renewed_from: up(r.renewed_from ?? ""),
      cancelled_on: "",
      irrecoverable_remark: String(r.irrecoverable_remark ?? ""),
      remark: String(r.remark ?? ""),
      cancel_whatsapp_text: String(r.cancel_whatsapp_text ?? ""),
      irrecoverable_whatsapp_text: String(r.irrecoverable_whatsapp_text ?? ""),
    };
  }

  // receipt_log with booking dates as YYYY-MM-DD, oldest→newest (reversed to newest-first in JS, matching GAS)
  const allReceipts = () =>
    sql`select *, to_char(booking_from,'YYYY-MM-DD') as booking_from_ymd, to_char(booking_to,'YYYY-MM-DD') as booking_to_ymd
        from receipt_log order by s_no` as unknown as Promise<any[]>;

  async function getReceiptLog(p: any) {
    const targetLib = up(p.library || "");
    const query = up(p.q || "");
    const searchType = up(p.search_type || "NAME");
    const exactMatch = String(p.exact || "") === "1";
    const phoneQ = normalizePhone(p.q || "");
    const page = Math.max(1, parseInt(p.page) || 1);
    const limit = String(p.all) === "1" ? 1000000000 : Math.min(100, Math.max(1, parseInt(p.limit) || 20));

    let rows = (await allReceipts()).filter((r) => {
      if (!r.receipt_no) return false;
      if (targetLib) {
        const rowLib = up(r.library),
          rowBranch = up(r.branch || "");
        if (rowLib !== targetLib && rowBranch !== targetLib) return false;
      }
      if (query) {
        if (searchType === "NAME") {
          if (up(r.name || "").indexOf(query) < 0) return false;
        } else if (searchType === "PHONE" && phoneQ.length >= 3) {
          if (normalizePhone(String(r.phone || "")).indexOf(phoneQ) < 0) return false;
        } else if (searchType === "STUDENT_ID") {
          if (up(r.student_id || "").indexOf(query) < 0) return false;
        } else if (searchType === "RECEIPT_NO") {
          if (exactMatch) {
            if (up(r.receipt_no || "") !== query) return false;
          } else if (up(r.receipt_no || "").indexOf(query) < 0) return false;
        } else {
          if (up(r.name || "").indexOf(query) < 0) return false;
        }
      }
      return true;
    });
    rows.reverse(); // newest first
    const total = rows.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const receipts = rows.slice(start, start + limit).map(mapReceiptRow);
    return { receipts, total, page, totalPages, limit };
  }

  async function getStudentBookingHistory(p: any) {
    const studentId = up(p.student_id || "").split("-")[0];
    const homeLib = up(p.home_library || "");
    if (!studentId || !homeLib) return { receipts: [], home_library: homeLib, total: 0 };
    const rows = (await allReceipts()).filter((r) => {
      if (!r.receipt_no) return false;
      if (up(r.student_id || "").split("-")[0] !== studentId) return false;
      return resolveOrigin(r.library, r.branch, r.is_cross_library) === homeLib;
    });
    rows.reverse();
    const receipts = rows.map(mapReceiptRow);
    return { receipts, home_library: homeLib, total: receipts.length };
  }

  // ════════════════════════════════════════════════════════════════════
  // 06_Dues.gs → reads
  // ════════════════════════════════════════════════════════════════════
  function mapDuePaymentRow(r: any) {
    return {
      s_no: num(r.s_no),
      payment_id: up(r.payment_id),
      receipt_no: up(r.receipt_no),
      student_id: up(r.student_id ?? ""),
      library: up(r.library ?? ""),
      branch: up(r.branch ?? ""),
      name: up(r.name ?? ""),
      phone: normalizePhone(String(r.phone ?? "")),
      gender: up(r.gender ?? ""),
      payment_mode: up(r.payment_mode ?? ""),
      payment_fees_mode: String(r.payment_fees_mode ?? ""),
      amount_received: num(r.amount_received),
      balance_before: num(r.balance_before),
      balance_after: num(r.balance_after),
      received_on: String(r.received_on ?? ""),
      settlement_date: String(r.settlement_date ?? ""),
      notes: up(r.notes ?? ""),
      whatsapp_text: String(r.whatsapp_text ?? ""),
    };
  }

  async function getDuePayments(p: any) {
    const target = up(p.receipt_no || "");
    if (!target) return { payments: [] };
    const rows = (await sql`select * from fees_due_log order by s_no`) as unknown as any[];
    const out: any[] = [];
    for (const r of rows) {
      if (up(r.receipt_no) !== target) continue;
      out.push(mapDuePaymentRow(r));
    }
    return { payments: out };
  }

  async function getPendingDues(p: any) {
    const targetLib = up(p.library || "");
    const rows = await allReceipts();
    const pending: any[] = [];
    for (const r of rows) {
      if (!r.receipt_no) continue;
      if (num(r.fees_due_balance) <= 0) continue;
      if (up(r.dues_status || "") === "IRRECOVERABLE") continue; // separate queue
      if (targetLib) {
        const rowLib = up(r.library),
          rowBranch = up(r.branch || "");
        if (rowLib !== targetLib && rowBranch !== targetLib) continue;
      }
      pending.push(mapReceiptRow(r));
    }
    pending.reverse();
    return { pending, total: pending.length };
  }

  async function getDuePaymentLog(p: any) {
    const targetLib = up(p.library || "");
    const q = up(p.q || "");
    const searchType = String(p.search_type || "name").toLowerCase();
    const page = Math.max(1, parseInt(p.page) || 1);
    const limit = String(p.all) === "1" ? 1000000000 : Math.min(100, Math.max(1, parseInt(p.limit) || 20));

    const data = (await sql`select * from fees_due_log order by s_no`) as unknown as any[];
    let rows = data.map((r, idx) => ({ ...mapDuePaymentRow(r), row_idx: idx + 2 })).filter((r) => !!r.payment_id);

    if (targetLib) rows = rows.filter((r) => r.library === targetLib || r.branch === targetLib);

    if (q.length >= 2) {
      if (searchType === "phone") {
        const qP = q.replace(/\D/g, "");
        rows = rows.filter((r) => String(r.phone || "").indexOf(qP) >= 0);
      } else if (searchType === "student_id") {
        rows = rows.filter((r) => r.student_id.indexOf(q) >= 0);
      } else if (searchType === "receipt_no") {
        rows = rows.filter((r) => r.receipt_no.indexOf(q) >= 0);
      } else {
        rows = rows.filter((r) => r.name.indexOf(q) >= 0);
      }
    }

    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      if (r.library) counts[r.library] = (counts[r.library] || 0) + 1;
      if (r.branch) counts[r.branch] = (counts[r.branch] || 0) + 1;
    });

    rows.reverse();
    const total = rows.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    return { ok: true, payments: rows.slice(start, start + limit), total, totalPages, page, counts };
  }

  async function getIrrecoverableDues(p: any) {
    const targetLib = up(p.library || "");
    const rows = await allReceipts();
    const items: any[] = [];
    let sum = 0;
    for (const r of rows) {
      if (!r.receipt_no) continue;
      if (up(r.dues_status || "") !== "IRRECOVERABLE") continue;
      if (targetLib) {
        const rowLib = up(r.library),
          rowBranch = up(r.branch || "");
        if (rowLib !== targetLib && rowBranch !== targetLib) continue;
      }
      items.push(mapReceiptRow(r));
      sum += num(r.fees_due_balance);
    }
    items.reverse();
    return { items, total: items.length, sum };
  }

  // Faithful replica of GAS parseFlexibleDate. Handles: Date objects, a trailing
  // "(…)" note, ISO date/datetime, d-M-yyyy, and "d MMMM yyyy" (full/3-letter month).
  // Used by Misc date filters AND the dashboard — every stored text-date format.
  function parseDateFlexible(s: unknown): Date {
    if (s === null || s === undefined || s === "") return new Date(NaN);
    if (Object.prototype.toString.call(s) === "[object Date]") return s as Date;
    let str = String(s).trim();
    if (!str) return new Date(NaN);
    str = str.replace(/\s*\([^)]*\)\s*$/, "").trim(); // drop trailing "(11:42 PM)"
    let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const M = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      const key = m[2].toLowerCase();
      let mi = M.indexOf(key);
      if (mi < 0) mi = M.findIndex((n) => n.slice(0, 3) === key.slice(0, 3));
      if (mi >= 0) return new Date(+m[3], mi, +m[1]);
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date(NaN) : d;
  }

  // ════════════════════════════════════════════════════════════════════
  // 07_MiscIncome.gs → getMiscIncome
  // ════════════════════════════════════════════════════════════════════
  function mapMiscIncomeRow(r: any) {
    return {
      s_no: num(r.s_no),
      timestamp: String(r.timestamp ?? ""),
      date: String(r.date ?? ""),
      month: String(r.month ?? ""),
      library: up(r.library ?? ""),
      branch: up(r.branch ?? ""),
      amount: num(r.amount),
      payment_tag: up(r.payment_tag ?? ""),
      fees_mode: String(r.fees_mode ?? ""),
      settlement_date: String(r.settlement_date ?? ""),
      category: up(r.category ?? ""),
      remark: String(r.remark ?? ""),
      status: up(r.status ?? ""),
      delete_reason: String(r.delete_reason ?? ""),
      deleted_on: String(r.deleted_on ?? ""),
    };
  }
  async function getMiscIncome(p: any) {
    const targetLib = up(p.library || ""),
      targetBranch = up(p.branch || ""),
      targetCat = up(p.category || ""),
      targetTag = up(p.payment_tag || ""),
      targetMode = up(p.fees_mode || "");
    const q = up(p.q || "");
    const wantDeleted = String(p.deleted) === "1";
    const dateFrom = p.date_from ? parseDateFlexible(p.date_from) : null;
    const dateTo = p.date_to ? parseDateFlexible(p.date_to) : null;
    const page = Math.max(1, parseInt(p.page) || 1);
    const limit = String(p.all) === "1" ? 1000000000 : Math.min(200, Math.max(1, parseInt(p.limit) || 50));

    const data = (await sql`select * from misc_income order by s_no`) as unknown as any[];
    let rows: any[] = [];
    for (const row of data) {
      if (row.s_no === "" || row.s_no === null) continue;
      const st = up(row.status || "");
      if (wantDeleted ? st !== "DELETED" : st === "DELETED") continue;
      if (targetLib && up(row.library) !== targetLib) continue;
      if (targetBranch && up(row.branch) !== targetBranch) continue;
      if (targetCat && up(row.category) !== targetCat) continue;
      if (targetTag && up(row.payment_tag) !== targetTag) continue;
      if (targetMode && up(row.fees_mode) !== targetMode) continue;
      if (dateFrom || dateTo) {
        const rd = parseDateFlexible(row.date);
        if (dateFrom && rd < dateFrom) continue;
        if (dateTo) {
          const de = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59);
          if (rd > de) continue;
        }
      }
      if (q.length >= 2) {
        if (up(row.remark || "").indexOf(q) < 0) continue;
      }
      rows.push(row);
    }
    let sum = 0;
    const counts: any = { byLibrary: {}, byCategory: {}, byFeesMode: {} };
    rows.forEach((r) => {
      const amt = num(r.amount);
      sum += amt;
      const lib = up(r.library || ""),
        cat = up(r.category || ""),
        mode = String(r.fees_mode || "");
      if (lib) counts.byLibrary[lib] = (counts.byLibrary[lib] || 0) + amt;
      if (cat) counts.byCategory[cat] = (counts.byCategory[cat] || 0) + amt;
      if (mode) counts.byFeesMode[mode] = (counts.byFeesMode[mode] || 0) + amt;
    });
    rows.reverse();
    const total = rows.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    return { entries: rows.slice(start, start + limit).map(mapMiscIncomeRow), total, page, totalPages, limit, sum, counts };
  }

  // ════════════════════════════════════════════════════════════════════
  // 08_Refunds.gs → getRefundLog
  // ════════════════════════════════════════════════════════════════════
  function mapRefundRow(r: any) {
    return {
      s_no: num(r.s_no),
      refund_id: up(r.refund_id),
      original_receipt_no: up(r.original_receipt_no ?? ""),
      student_id: up(r.student_id ?? ""),
      library: up(r.library ?? ""),
      branch: up(r.branch ?? ""),
      is_cross_library: up(r.is_cross_library || "NO"),
      name: up(r.name ?? ""),
      phone: normalizePhone(String(r.phone ?? "")),
      refund_mode: up(r.refund_mode ?? ""),
      refund_fees_mode: String(r.refund_fees_mode ?? ""),
      amount: num(r.amount),
      refund_date: String(r.refund_date ?? ""),
      refund_reason: String(r.refund_reason ?? ""),
      linked_to_cancellation: up(r.linked_to_cancellation) === "TRUE",
      gender: up(r.gender ?? ""),
      timestamp: String(r.timestamp ?? ""),
      refund_whatsapp_text: String(r.refund_whatsapp_text ?? ""),
    };
  }
  async function getRefundLog(p: any) {
    const targetLib = up(p.library || ""),
      targetReceipt = up(p.receipt_no || ""),
      linkFilter = up(p.linked_to_cancellation || "ANY"),
      q = up(p.q || ""),
      searchType = up(p.search_type || "NAME"),
      phoneQ = normalizePhone(p.q || "");
    const page = Math.max(1, parseInt(p.page) || 1);
    const limit = String(p.all) === "1" ? 1000000000 : Math.min(100, Math.max(1, parseInt(p.limit) || 20));

    const data = (await sql`select * from refund_log order by s_no`) as unknown as any[];
    let rows: any[] = [];
    for (const row of data) {
      if (!row.refund_id) continue;
      if (targetLib) {
        const L = up(row.library),
          B = up(row.branch || "");
        if (L !== targetLib && B !== targetLib) continue;
      }
      if (targetReceipt && up(row.original_receipt_no) !== targetReceipt) continue;
      if (linkFilter !== "ANY") {
        const rl = up(row.linked_to_cancellation) === "TRUE";
        if ((linkFilter === "TRUE") !== rl) continue;
      }
      if (q.length >= 2) {
        if (searchType === "NAME") {
          if (up(row.name || "").indexOf(q) < 0) continue;
        } else if (searchType === "PHONE" && phoneQ.length >= 3) {
          if (String(row.phone || "").indexOf(phoneQ) < 0) continue;
        } else if (searchType === "RECEIPT_NO") {
          if (up(row.original_receipt_no || "").indexOf(q) < 0) continue;
        } else if (searchType === "REFUND_ID") {
          if (up(row.refund_id || "").indexOf(q) < 0) continue;
        } else {
          if (up(row.name || "").indexOf(q) < 0) continue;
        }
      }
      rows.push(row);
    }
    let sum = 0;
    const counts: any = { byLibrary: {}, byFeesMode: {}, linkedToCancel: 0, standalone: 0 };
    rows.forEach((r) => {
      const amt = num(r.amount);
      sum += amt;
      const lib = up(r.library || ""),
        mode = String(r.refund_fees_mode || "");
      if (lib) counts.byLibrary[lib] = (counts.byLibrary[lib] || 0) + amt;
      if (mode) counts.byFeesMode[mode] = (counts.byFeesMode[mode] || 0) + amt;
      if (up(r.linked_to_cancellation) === "TRUE") counts.linkedToCancel++;
      else counts.standalone++;
    });
    rows.reverse();
    const total = rows.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    // attach seat_no from RECEIPT_LOG (refund rows don't store it)
    const seatByRno: Record<string, string> = {};
    const rl = (await sql`select receipt_no, seat_no from receipt_log`) as unknown as any[];
    for (const rr of rl) {
      const rn = up(rr.receipt_no || "");
      if (rn) seatByRno[rn] = String(rr.seat_no || "");
    }
    const paged = rows.slice(start, start + limit).map((r) => {
      const o: any = mapRefundRow(r);
      o.seat_no = seatByRno[up(r.original_receipt_no || "")] || "";
      return o;
    });
    return { refunds: paged, total, sum, page, totalPages, limit, counts };
  }

  // ════════════════════════════════════════════════════════════════════
  // 10_Renewals.gs → queues (lifecycle status, Rule-C aware)
  // ════════════════════════════════════════════════════════════════════
  function buildRenewedFromSet(rows: any[]) {
    const set: Record<string, boolean> = {};
    for (const r of rows) {
      const rf = up(r.renewed_from || "");
      if (rf) set[rf] = true;
    }
    return set;
  }
  function computeLifecycle(r: any, alertDays: number, renewedSet: Record<string, boolean>) {
    const explicit = up(r.status || "");
    if (explicit) return explicit;
    const rno = up(r.receipt_no || "");
    if (rno && renewedSet[rno]) return "RENEWED"; // Rule C
    const days = daysFromYmd(r.booking_to_ymd || "");
    if (days === null) return "";
    if (days < 0) return "EXPIRED";
    if (days <= alertDays) return "EXPIRING_SOON";
    return "CURRENT";
  }
  async function getRenewalsQueue(p: any) {
    const targetLib = up(p.library || "");
    const overrideDays = parseInt(p.alert_days);
    const rows  = await allReceipts();
    const srows = (await sql`select * from settings`) as any[];
    const renewedSet = buildRenewedFromSet(rows);
    const cache: Record<string, number> = {};
    const alertDaysFor = (library: string) => {
      if (!isNaN(overrideDays) && overrideDays > 0) return overrideDays;
      if (cache[library] === undefined) {
        const s = srows.find((x: any) => up(x.library) === library);
        const v = s ? num(s.renewal_alert_days) : 0;
        cache[library] = v > 0 ? v : 5;
      }
      return cache[library];
    };
    const expiring: any[] = [],
      expired: any[] = [];
    for (const r of rows) {
      if (!r.receipt_no) continue;
      if (targetLib) {
        const L = up(r.library),
          B = up(r.branch || "");
        if (L !== targetLib && B !== targetLib) continue;
      }
      const days = alertDaysFor(up(r.library));
      const lc = computeLifecycle(r, days, renewedSet);
      if (lc === "EXPIRING_SOON") {
        const m: any = mapReceiptRow(r);
        m.lifecycle = lc;
        m.days_until_expiry = daysFromYmd(r.booking_to_ymd || "");
        expiring.push(m);
      } else if (lc === "EXPIRED") {
        const m: any = mapReceiptRow(r);
        m.lifecycle = lc;
        m.days_until_expiry = daysFromYmd(r.booking_to_ymd || "");
        expired.push(m);
      }
    }
    expiring.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
    expired.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
    return { expiring, expired, total: expiring.length + expired.length };
  }
  async function getCancellationsQueue(p: any) {
    const targetLib = up(p.library || "");
    const rows = await allReceipts();
    const items: any[] = [];
    for (const r of rows) {
      if (!r.receipt_no) continue;
      if (up(r.status || "") !== "CANCELLED") continue;
      if (targetLib) {
        const L = up(r.library),
          B = up(r.branch || "");
        if (L !== targetLib && B !== targetLib) continue;
      }
      items.push(mapReceiptRow(r));
    }
    items.reverse();
    return { items, total: items.length };
  }

  // ════════════════════════════════════════════════════════════════════
  // 16_ReceiptEdits.gs → getReceiptEditHistory  |  05_Receipts.gs → getReceiptMoneyTrail
  // ════════════════════════════════════════════════════════════════════
  async function getReceiptEditHistory(p: any) {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    // snapshot_json is JSONB → cast to text so the frontend still gets a JSON string (matches GAS)
    const data = (await sql`select *, snapshot_json::text as snapshot_json_text from receipt_edits`) as unknown as any[];
    const rows: any[] = [];
    for (const r of data) {
      if (up(r.original_receipt_no) !== target) continue;
      rows.push({
        edit_id: String(r.edit_id || ""),
        edit_letter: String(r.edit_letter || ""),
        snapshot_role: String(r.snapshot_role || ""),
        edited_at: String(r.edited_at || ""),
        editor_remark: String(r.editor_remark || ""),
        changed_fields: String(r.changed_fields || ""),
        snapshot_json: String(r.snapshot_json_text || ""),
        event_whatsapp_text: "", // column doesn't exist (GAS returns "" too)
      });
    }
    const events: Record<string, any> = {};
    rows.forEach((r) => {
      if (!events[r.edit_letter])
        events[r.edit_letter] = { letter: r.edit_letter, edited_at: r.edited_at, remark: r.editor_remark, changed_fields: r.changed_fields, before: null, after: null, whatsapp_text: "" };
      if (r.snapshot_role === "BEFORE") events[r.edit_letter].before = r.snapshot_json;
      else {
        events[r.edit_letter].after = r.snapshot_json;
        events[r.edit_letter].whatsapp_text = r.event_whatsapp_text || "";
      }
    });
    const list = Object.values(events).sort((a: any, b: any) => a.letter.localeCompare(b.letter));
    return { receipt_no: target, edits: list, count: list.length };
  }

  async function getReceiptMoneyTrail(p: any) {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    const rr = (await sql`select * from receipt_log where upper(receipt_no)=${target} order by s_no limit 1`) as unknown as any[];
    if (!rr.length) return { ok: false, error: "Receipt not found: " + target };
    const rRow = rr[0];
    const fee = num(rRow.fee),
      feesDue = num(rRow.fees_due),
      balance = num(rRow.fees_due_balance);

    const initialPayments: any[] = [];
    for (let n = 1; n <= 3; n++) {
      const amt = num(rRow["pay_amount_" + n]),
        mode = up(rRow["pay_mode_" + n] || "");
      if (mode || amt)
        initialPayments.push({
          slot: n,
          mode,
          amount: amt,
          fees_mode: String(rRow["pay_fees_mode_" + n] || ""),
          date: rRow["pay_mode_" + n + "_date"] ? String(rRow["pay_mode_" + n + "_date"]) : String(rRow.receipt_date || ""),
        });
    }

    const dues: any[] = [];
    const dd = (await sql`select * from fees_due_log where upper(receipt_no)=${target}`) as unknown as any[];
    for (const d of dd) {
      dues.push({
        payment_id: String(d.payment_id || ""),
        amount: num(d.amount_received),
        mode: up(d.payment_mode || ""),
        fees_mode: String(d.payment_fees_mode || ""),
        received_on: String(d.received_on || ""),
        balance_after: num(d.balance_after),
      });
    }

    const refunds: any[] = [];
    const ff = (await sql`select * from refund_log where upper(original_receipt_no)=${target}`) as unknown as any[];
    for (const f of ff) {
      refunds.push({
        refund_id: String(f.refund_id || ""),
        amount: Math.abs(num(f.amount)),
        mode: up(f.refund_mode || ""),
        fees_mode: String(f.refund_fees_mode || ""),
        refund_date: String(f.refund_date || ""),
        reason: String(f.refund_reason || ""),
        linked_to_cancellation: tobool(f.linked_to_cancellation),
      });
    }

    const initialPaid = initialPayments.reduce((a, x) => a + (x.amount || 0), 0);
    const duesReceived = dues.reduce((a, x) => a + (x.amount || 0), 0);
    const refundsTotal = refunds.reduce((a, x) => a + (x.amount || 0), 0);

    return {
      ok: true,
      receipt_no: target,
      fee,
      fees_due: feesDue,
      fees_due_balance: balance,
      initial_payments: initialPayments,
      dues_payments: dues,
      refunds,
      totals: {
        initial_paid: Math.round(initialPaid),
        dues_received: Math.round(duesReceived),
        refunds_total: Math.round(refundsTotal),
        net_collected: Math.round(initialPaid + duesReceived - refundsTotal),
      },
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // 11_Dashboard.gs → getDashboard  (4 money flows over a date range, scoped)
  // Dates parsed from text columns via parseDateFlexible; _ymd/_ymdKeyStr use
  // LOCAL date methods on locally-constructed dates, so there's no TZ drift.
  // ════════════════════════════════════════════════════════════════════
  function _ymd(v: unknown): number | null {
    if (!v && v !== 0) return null;
    const d = parseDateFlexible(v);
    if (!d || isNaN(d.getTime())) return null;
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function _ymdKeyStr(v: unknown): string | null {
    const d = parseDateFlexible(v);
    if (!d || isNaN(d.getTime())) return null;
    const mm = ("0" + (d.getMonth() + 1)).slice(-2);
    const dd = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + mm + "-" + dd;
  }
  function todayMidnightIST(): Date {
    const nd = new Date(Date.now() + 5.5 * 3600 * 1000);
    return new Date(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate());
  }
  function branchesOfLibrary(branchRows: any[], libCode: string) {
    const out: Record<string, boolean> = {};
    const target = up(libCode);
    for (const r of branchRows) if (up(r.library_code) === target) out[up(r.branch_code)] = true;
    return out;
  }
  function makeScopeMatcher(branchRows: any[], filter: string) {
    const f = up(filter || "");
    if (!f) return () => true;
    const childBranches = branchesOfLibrary(branchRows, f);
    return (rowLib: unknown, rowBranch: unknown) => {
      const L = up(rowLib || ""),
        B = up(rowBranch || "");
      if (L === f || B === f) return true;
      if (childBranches[B]) return true;
      if (childBranches[L]) return true;
      return false;
    };
  }
  function _mkAgg(): any {
    return {
      gross: 0,
      refund: 0,
      byLibrary: {},
      byFeesMode: {},
      byTag: {},
      bySource: { RECEIPTS: 0, DUES: 0, MISC: 0, REFUNDS: 0 },
      byDay: {},
      counts: { receipts: 0, dues_payments: 0, misc_entries: 0, refunds: 0 },
    };
  }
  function _bump(obj: any, key: string, field: string, amt: number) {
    const k = key || "—";
    if (!obj[k]) obj[k] = { gross: 0, refund: 0 };
    obj[k][field] += amt;
  }
  function _addInflow(A: any, amt: number, libKey: string, feesMode: unknown, tag: unknown, dayKey: string | null, source: string) {
    if (!amt) return;
    A.gross += amt;
    _bump(A.byLibrary, libKey, "gross", amt);
    _bump(A.byFeesMode, up(feesMode), "gross", amt);
    _bump(A.byTag, up(tag), "gross", amt);
    A.bySource[source] = (A.bySource[source] || 0) + amt;
    if (dayKey) {
      if (!A.byDay[dayKey]) A.byDay[dayKey] = { gross: 0, refund: 0 };
      A.byDay[dayKey].gross += amt;
    }
  }
  function _addOutflow(A: any, amt: number, libKey: string, feesMode: unknown, tag: unknown, dayKey: string | null) {
    if (!amt) return;
    A.refund += amt;
    _bump(A.byLibrary, libKey, "refund", amt);
    _bump(A.byFeesMode, up(feesMode), "refund", amt);
    _bump(A.byTag, up(tag), "refund", amt);
    A.bySource.REFUNDS += amt;
    if (dayKey) {
      if (!A.byDay[dayKey]) A.byDay[dayKey] = { gross: 0, refund: 0 };
      A.byDay[dayKey].refund += amt;
    }
  }
  function _libKeyFor(rowLib: unknown, rowBranch: unknown) {
    const b = up(rowBranch || "");
    return b || up(rowLib || "");
  }
  function _finalizeBreakdown(obj: any) {
    return Object.keys(obj)
      .map((k) => ({ key: k, gross: Math.round(obj[k].gross), refund: Math.round(obj[k].refund), net: Math.round(obj[k].gross - obj[k].refund) }))
      .filter((r) => r.gross !== 0 || r.refund !== 0)
      .sort((a, b) => b.net - a.net);
  }
  function _isoToDmy(ymd: number) {
    if (!ymd) return "";
    const y = Math.floor(ymd / 10000),
      m = Math.floor((ymd % 10000) / 100),
      d = ymd % 100;
    return d + "-" + m + "-" + y;
  }

  async function getDashboard(params: any) {
    params = params || {};
    let fromYmd = params.from ? _ymd(params.from) : null;
    let toYmd = params.to ? _ymd(params.to) : null;
    if (!fromYmd || !toYmd) {
      const now = todayMidnightIST();
      const y = now.getFullYear(),
        m = now.getMonth();
      fromYmd = y * 10000 + (m + 1) * 100 + 1;
      toYmd = _ymd(now);
    }
    if (fromYmd! > toYmd!) {
      const t = fromYmd;
      fromYmd = toYmd;
      toYmd = t;
    }
    const scope = up(params.library || "");

    // Sequential on purpose (see getInitData): avoids grabbing six connections at once.
    const rcpts    = (await sql`select * from receipt_log`) as any[];
    const dues     = (await sql`select * from fees_due_log`) as any[];
    const misc     = (await sql`select * from misc_income`) as any[];
    const refunds  = (await sql`select * from refund_log`) as any[];
    const students = (await sql`select * from students`) as any[];
    const branches = (await sql`select * from library_branches`) as any[];
    const inScope = makeScopeMatcher(branches, scope);
    const inRange = (ymd: number | null) => ymd !== null && ymd >= fromYmd! && ymd <= toYmd!;
    const A = _mkAgg();

    // 1) RECEIPT payments
    for (const row of rcpts) {
      if (!row.receipt_no) continue;
      if (!inScope(row.library, row.branch)) continue;
      const rcptDate = row.receipt_date;
      const libKey = _libKeyFor(row.library, row.branch);
      let touched = false;
      for (let n = 1; n <= 3; n++) {
        const amt = num(row["pay_amount_" + n]);
        if (!amt) continue;
        const md = row["pay_mode_" + n + "_date"];
        const payDate = md ? md : rcptDate;
        if (!inRange(_ymd(payDate))) continue;
        _addInflow(A, amt, libKey, row["pay_fees_mode_" + n], row["pay_mode_" + n], _ymdKeyStr(payDate), "RECEIPTS");
        touched = true;
      }
      if (touched) A.counts.receipts++;
    }
    // 2) DUES payments
    for (const row of dues) {
      const amt = num(row.amount_received);
      if (!amt) continue;
      if (!inScope(row.library, row.branch)) continue;
      if (!inRange(_ymd(row.received_on))) continue;
      _addInflow(A, amt, _libKeyFor(row.library, row.branch), row.payment_fees_mode, row.payment_mode, _ymdKeyStr(row.received_on), "DUES");
      A.counts.dues_payments++;
    }
    // 3) MISC income
    for (const row of misc) {
      const amt = num(row.amount);
      if (!amt) continue;
      if (!inScope(row.library, row.branch)) continue;
      if (!inRange(_ymd(row.date))) continue;
      if (up(row.status || "") === "DELETED") continue;
      _addInflow(A, amt, _libKeyFor(row.library, row.branch), row.fees_mode, row.payment_tag, _ymdKeyStr(row.date), "MISC");
      A.counts.misc_entries++;
    }
    // 4) REFUNDS (outflow)
    for (const row of refunds) {
      const amt = Math.abs(num(row.amount));
      if (!amt) continue;
      if (!inScope(row.library, row.branch)) continue;
      if (!inRange(_ymd(row.refund_date))) continue;
      _addOutflow(A, amt, _libKeyFor(row.library, row.branch), row.refund_fees_mode, row.refund_mode, _ymdKeyStr(row.refund_date));
      A.counts.refunds++;
    }

    // live (not date-bound)
    let outstanding = 0;
    for (const row of rcpts) {
      if (!row.receipt_no) continue;
      if (!inScope(row.library, row.branch)) continue;
      if (up(row.dues_status || "") === "IRRECOVERABLE") continue;
      const bal = num(row.fees_due_balance);
      if (bal > 0) outstanding += bal;
    }
    outstanding = Math.round(outstanding);
    let activeStudents = 0;
    for (const row of students) {
      if (!row.student_id) continue;
      if (row.is_past === true) continue;
      if (!inScope(row.library, row.branch)) continue;
      activeStudents++;
    }

    const daily = Object.keys(A.byDay)
      .sort()
      .map((d) => ({ date: d, gross: Math.round(A.byDay[d].gross), refund: Math.round(A.byDay[d].refund), net: Math.round(A.byDay[d].gross - A.byDay[d].refund) }));
    const gross = Math.round(A.gross),
      refund = Math.round(A.refund);

    return {
      ok: true,
      range: { from: _isoToDmy(fromYmd!), to: _isoToDmy(toYmd!), from_ymd: fromYmd, to_ymd: toYmd },
      scope: scope || "ALL",
      headline: { net: gross - refund, gross_in: gross, refund_out: refund, outstanding_dues: outstanding, active_students: activeStudents },
      counts: A.counts,
      by_source: {
        RECEIPTS: Math.round(A.bySource.RECEIPTS),
        DUES: Math.round(A.bySource.DUES),
        MISC: Math.round(A.bySource.MISC),
        REFUNDS: Math.round(A.bySource.REFUNDS),
      },
      by_library: _finalizeBreakdown(A.byLibrary),
      by_fees_mode: _finalizeBreakdown(A.byFeesMode),
      by_tag: _finalizeBreakdown(A.byTag),
      daily,
    };
  }

  // ── health ping (matches lmaPing) ─────────────────────────────────────
  function lmaPing() {
    const nd = new Date(Date.now() + 5.5 * 3600 * 1000); // IST
    const p2 = (n: number) => ("0" + n).slice(-2);
    const server_time =
      nd.getUTCFullYear() + "-" + p2(nd.getUTCMonth() + 1) + "-" + p2(nd.getUTCDate()) + " " + p2(nd.getUTCHours()) + ":" + p2(nd.getUTCMinutes()) + ":" + p2(nd.getUTCSeconds());
    return { ok: true, app: "LMA Backend", version: "1.0.0", timezone: "Asia/Kolkata", server_time };
  }

  // ── dispatcher ───────────────────────────────────────────────────────
  // Returns each action's native payload shape (matching GAS). Throws on error;
  // the route wraps thrown errors as { ok:false, error } just like GAS does.
  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  05_Receipts.gs → createReceipt   +   10_Renewals.gs → markReceiptRenewed
  // STAGED ONLY: neither action is added to PG_ACTIONS yet. Both stay dormant
  // (frontend still routes them to GAS) until the final cutover enables all writes.
  // ════════════════════════════════════════════════════════════════════

  // ── write-time date / time (IST) — mirror GAS nowTs / todayDmy / toIsoDate / formatDateForReceipt ──
  function _istNow(): { date: string; time: string } {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date());
    const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
    return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}:${g("second")}` };
  }
  function nowTsIst(): string { const n = _istNow(); return `${n.date} ${n.time}`; }
  function todayIsoIst(): string { return _istNow().date; }

  // empty → NULL (safe for a DATE column AND for a nullable TEXT column; reads coalesce to "")
  function toIsoDateW(v: unknown): string | null {
    if (v === null || v === undefined || v === "") return null;
    const d = parseDateFlexible(v);
    if (isNaN(d.getTime())) return String(v).trim();
    const mm = ("0" + (d.getMonth() + 1)).slice(-2);
    const dd = ("0" + d.getDate()).slice(-2);
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  const _MON_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function formatForReceiptW(v: unknown): string {
    if (v === null || v === undefined || v === "") return "";
    const d = parseDateFlexible(v);
    if (isNaN(d.getTime())) return String(v).trim();
    return `${d.getDate()}-${_MON_ABBR[d.getMonth()]}-${d.getFullYear()}`;
  }

  // ── receipt / registration WhatsApp text — mirror 05_Receipts buildReceiptText + 02_Helpers ──
  const RECEIPT_TC_W = [
    "1.Fee is neither refundable nor transferrable under any circumstances.",
    "2.Fees paid for the period as per the receipt will not be carried forward for any other period.",
    "3.Members are solely responsible for their personal belongings. The library management shall not be held liable for any loss, theft, or damage to items left in the library, whether attended or unattended.",
  ];
  function _buildPhoneLinesW(phones: any[]): string[] {
    return (phones || []).filter((p) => p && p.number).map((p) => {
      const tag = up(p.tag || "");
      return tag && tag !== "SELF" ? `*${p.number}* (${tag})` : `*${p.number}*`;
    });
  }
  function _buildPayLineW(mode: unknown, amount: unknown): string | null {
    if (!mode || amount === undefined || amount === null || amount === "") return null;
    const amt = Number(amount);
    if (isNaN(amt) || amt === 0) return null;
    return (amt < 0 ? "REFUND-" : "") + up(mode) + "-" + Math.abs(amt);
  }
  function _buildReceiptTextW(d: any): string {
    const validPhones = (d.phones || []).filter((p: any) => p && p.number);
    const phoneLines = _buildPhoneLinesW(validPhones);
    let seatLine = "Seat No.: *" + up(d.seat_no) + "*";
    if (d.branch) seatLine = "Seat No.: *" + up(d.seat_no) + " IN " + up(d.branch) + "*";
    const lines: string[] = [
      "*_" + d.library_name + "_*",
      "{" + d.title + "}",
      "",
      "*" + up(d.student_id) + "*",
      "*" + up(d.name) + "*",
      ...phoneLines,
      "",
      seatLine,
      "*" + up(d.shift_full) + "*",
      "",
      "Booking Period:",
      "*" + d.booking_from + " to " + d.booking_to + "*",
      "",
      "*" + d.receipt_date + "*",
      "Fees: *Rs. " + d.fee + "/-*",
      ...(((d.payLines as string[]) || [])),
      "",
      "*" + up(d.receipt_no) + "*",
      "",
      ...RECEIPT_TC_W,
    ];
    if (num(d.fees_due) > 0) { lines.push(""); lines.push("Fees Due: *Rs. " + d.fees_due + "/-*"); }
    if (d.history && d.history.length) { for (const h of d.history) lines.push(String(h)); }
    if (d.show_balance) { lines.push("Balance: *Rs. " + num(d.balance) + "/-*"); }
    if (d.remark) { lines.push(""); lines.push(String(d.remark)); }
    return lines.join("\n");
  }

  // ── reference-data loaders (read-only; run before the write txn) ──
  type TagInfo = { fees_mode: string; settlement_days: number };
  async function _loadTagMap(): Promise<Map<string, TagInfo>> {
    const rows = (await sql`select r.display_code as tag_name, r.bank_code as fees_mode, r.settlement_days from fin.routes r`) as any[];
    const m = new Map<string, TagInfo>();
    for (const r of rows) {
      m.set(up(r.tag_name), { fees_mode: String(r.fees_mode ?? "").trim(), settlement_days: Math.max(0, num(r.settlement_days)) });
    }
    return m;
  }
  function _feesModeForTag(tag: unknown, tagMap: Map<string, TagInfo>): string {
    if (!tag) return "";
    return tagMap.get(up(tag))?.fees_mode ?? "";
  }
  function _addSettlementDaysW(iso: string | null, tag: unknown, tagMap: Map<string, TagInfo>): string | null {
    if (!iso) return null;
    const d = parseDateFlexible(iso);
    if (isNaN(d.getTime())) return iso;
    const days = tagMap.get(up(tag))?.settlement_days ?? 0;
    d.setDate(d.getDate() + days);
    const mm = ("0" + (d.getMonth() + 1)).slice(-2);
    const dd = ("0" + d.getDate()).slice(-2);
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  async function _lookupLibraryNameW(libraryCode: string): Promise<string> {
    if (!libraryCode) return "";
    const rows = (await sql`select library_name from libraries where upper(library_code)=${up(libraryCode)} limit 1`) as any[];
    return rows.length ? up(rows[0].library_name || libraryCode) : libraryCode;
  }

  // origin code for student lookup — mirror 02_Helpers resolveStudentOriginCode
  function _resolveOriginCodeW(library: string, branch: string, isCrossLibrary: string): string {
    const cl = String(isCrossLibrary || "").trim().toUpperCase();
    if (cl && cl !== "NO") return cl;
    const br = String(branch || "").trim().toUpperCase();
    const lb = String(library || "").trim().toUpperCase();
    return br || lb;
  }

  // ── friendly seat pre-check — mirror 15_SeatBoard isSeatAvailable (DB exclusion constraint is the true guard) ──
  async function _isSeatAvailableW(
    targetLib: string, targetBranch: string, seatLabel: string, shiftKey: string, ignoreReceiptNo: string
  ): Promise<{ available: boolean; reason?: string }> {
    const inc = normShift(shiftKey);
    if (inc === "OTHER") return { available: true };
    const label = String(seatLabel || "").trim();
    if (!label) return { available: true };
    const rows = (await sql`
      select *, to_char(booking_to,'YYYY-MM-DD') as booking_to_ymd
      from receipt_log where upper(library)=${up(targetLib)}`) as any[];
    const { occ } = buildOccupancy(rows, targetLib, targetBranch, ignoreReceiptNo);
    const blocks = await buildBlocks(targetLib, targetBranch);
    if (isBlockedFor(blocks, label, inc)) return { available: false, reason: `Seat ${label} is blocked for ${inc}.` };
    const o = occ[label] || { morning: null, evening: null, fullday: null };
    if (o.fullday) return { available: false, reason: `Seat ${label} is taken full-day by ${o.fullday.name}.` };
    if (inc === "FULL DAY") {
      if (o.morning) return { available: false, reason: `Seat ${label} morning is taken by ${o.morning.name}.` };
      if (o.evening) return { available: false, reason: `Seat ${label} evening is taken by ${o.evening.name}.` };
      return { available: true };
    }
    if (inc === "MORNING" && o.morning) return { available: false, reason: `Seat ${label} morning is taken by ${o.morning.name}.` };
    if (inc === "EVENING" && o.evening) return { available: false, reason: `Seat ${label} evening is taken by ${o.evening.name}.` };
    return { available: true };
  }

  // ── atomic per-library counter (replaces GAS getNextCounter + LockService; race-free) ──
  async function _nextCounterTx(tx: any, library: string, field: "last_student_id" | "last_receipt_no"): Promise<number> {
    if (field !== "last_student_id" && field !== "last_receipt_no") throw new Error("Illegal counter field.");
    const r = (await tx`
      update settings set ${tx(field)} = coalesce(${tx(field)}, 0) + 1
      where upper(library) = ${up(library)}
      returning ${tx(field)} as val`) as any[];
    if (!r.length) throw new Error("Library not found in SETTINGS: " + library);
    return num(r[0].val);
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: createReceipt  (new-admission + renewal, one atomic transaction)
  // ════════════════════════════════════════════════════════════════════
  async function createReceipt(p: any): Promise<any> {
    if (!p) throw new Error("Payload required.");
    if (!p.library) throw new Error("library is required.");
    if (!p.name) throw new Error("name is required.");
    if (!p.shift) throw new Error("shift is required.");
    if (!p.booking_from || !p.booking_to) throw new Error("booking_from and booking_to are required.");
    if (p.fee === undefined || p.fee === null) throw new Error("fee is required.");

    const targetLib = up(p.library);
    const targetBranch = up(p.branch || "");
    const isCross = String(p.is_cross_library || "").trim().toUpperCase();
    const seatLabel = up(p.seat_no || "");
    const shiftKey = up(p.shift);
    const renewedFrom = up(p.renewed_from || "");
    const isNewType = up(p.type || "NEW") === "NEW";

    // seat pre-check (ignore predecessor on renewal — its hold belongs to the same student)
    const seatCheck = await _isSeatAvailableW(targetLib, targetBranch, seatLabel, shiftKey, renewedFrom);
    if (!seatCheck.available) throw new Error(seatCheck.reason || `Seat ${seatLabel} is not available for ${shiftKey}.`);

    // resolve student (existing → validate under origin; else auto-generate for NEW admission)
    let studentId = up(p.student_id || "");
    let resolvedPhones: any[];
    let genderVal: string;
    let needStudentInsert = false;

    if (studentId) {
      const originCode = _resolveOriginCodeW(targetLib, targetBranch, isCross);
      const studentLookup = await getStudentById({ student_id: studentId, library: originCode });
      if (!studentLookup.student) {
        throw new Error("Student " + studentId + " not found under origin " + originCode + ". If cross-library, ensure correct origin code is provided.");
      }
      resolvedPhones = (p.phones && p.phones.length) ? p.phones : (studentLookup.student.phones || []);
      genderVal = up(studentLookup.student.gender || "");
    } else {
      if (!isNewType) throw new Error("student_id is required for non-NEW receipts.");
      if (isCross && isCross !== "NO") throw new Error("Cross-library is only for existing students (Renewal). Cannot auto-generate a cross-library student.");
      resolvedPhones = (p.phones && p.phones.length) ? p.phones : [];
      genderVal = up(p.gender || "");
      needStudentInsert = true;
    }

    const tagMap = await _loadTagMap();
    const libName = await _lookupLibraryNameW(targetLib);

    const pm: any[] = p.pay_modes || [];
    const pm1 = pm[0] || {}, pm2 = pm[1] || {}, pm3 = pm[2] || {};
    const feesDue = num(p.fees_due);
    const receiptIso = toIsoDateW(p.receipt_date || todayIsoIst());

    return await sql.begin(async (tx: any) => {
      // (1) RENEWAL — set predecessor RENEWED FIRST so its occupancy is freed (trigger) before the insert
      if (renewedFrom) {
        const pre = (await tx`select status from receipt_log where upper(receipt_no)=${renewedFrom} limit 1`) as any[];
        if (!pre.length) throw new Error("Predecessor receipt not found: " + renewedFrom);
        const cur = up(pre[0].status || "");
        if (cur && cur !== "RENEWED" && cur !== "DO_NOT_RENEW") {
          throw new Error("Receipt " + renewedFrom + " has status=" + cur + "; cannot renew.");
        }
        if (cur !== "RENEWED") {
          await tx`update receipt_log set status='RENEWED' where upper(receipt_no)=${renewedFrom}`;
        }
      }

      // (2) NEW admission — generate student_id from counter + create the student row
      if (needStudentInsert) {
        const n = await _nextCounterTx(tx, targetLib, "last_student_id");
        studentId = "F" + n;
        const srow: Record<string, any> = {
          student_id: studentId,
          library: targetLib,
          branch: targetBranch,
          name: up(p.name),
          phone: normalizePhone(resolvedPhones[0]?.number || ""),
          phone_tag: up(resolvedPhones[0]?.tag || ""),
          phone2: normalizePhone(resolvedPhones[1]?.number || ""),
          phone2_tag: up(resolvedPhones[1]?.tag || ""),
          phone3: normalizePhone(resolvedPhones[2]?.number || ""),
          phone3_tag: up(resolvedPhones[2]?.tag || ""),
          phone4: normalizePhone(resolvedPhones[3]?.number || ""),
          phone4_tag: up(resolvedPhones[3]?.tag || ""),
          added_on: nowTsIst(),
          address: up(p.address || ""),
          preparing_for: up(p.preparing_for || ""),
          aadhaar_last4: String(p.aadhaar_last4 || "").replace(/\D/g, "").slice(0, 4),
          date_of_birth: p.date_of_birth ? toIsoDateW(p.date_of_birth) : null,
          gender: up(p.gender || ""),
          is_past: false,
        };
        await tx`insert into students ${tx(srow)}`;
      }

      // (3) receipt_no via atomic counter
      const rn = await _nextCounterTx(tx, targetLib, "last_receipt_no");
      const receiptNo = "R" + rn;

      // (4) assemble receipt_log row (empty date/number cells → NULL; empty text → "")
      const row: Record<string, any> = {
        receipt_no: receiptNo,
        student_id: studentId,
        library: targetLib,
        branch: targetBranch,
        name: up(p.name),
        gender: genderVal,
        phone: normalizePhone(resolvedPhones[0]?.number || ""),
        phone_tag: up(resolvedPhones[0]?.tag || ""),
        phone2: normalizePhone(resolvedPhones[1]?.number || ""),
        phone2_tag: up(resolvedPhones[1]?.tag || ""),
        phone3: normalizePhone(resolvedPhones[2]?.number || ""),
        phone3_tag: up(resolvedPhones[2]?.tag || ""),
        phone4: normalizePhone(resolvedPhones[3]?.number || ""),
        phone4_tag: up(resolvedPhones[3]?.tag || ""),
        seat_no: seatLabel,
        shift: shiftKey,
        shift_name: up(p.shift_name || ""),
        shift_time: up(p.shift_time || ""),
        booking_from: toIsoDateW(p.booking_from),
        booking_to: toIsoDateW(p.booking_to),
        receipt_date: receiptIso,
        fee: num(p.fee),
        pay_mode_1: up(pm1.mode || ""),
        pay_amount_1: pm1.amount !== undefined ? num(pm1.amount) : null,
        pay_fees_mode_1: pm1.mode ? _feesModeForTag(pm1.mode, tagMap) : "",
        pay_mode_2: up(pm2.mode || ""),
        pay_amount_2: pm2.amount !== undefined ? num(pm2.amount) : null,
        pay_fees_mode_2: pm2.mode ? _feesModeForTag(pm2.mode, tagMap) : "",
        pay_mode_3: up(pm3.mode || ""),
        pay_amount_3: pm3.amount !== undefined ? num(pm3.amount) : null,
        pay_fees_mode_3: pm3.mode ? _feesModeForTag(pm3.mode, tagMap) : "",
        pay_mode_1_date: null, pay_mode_1_s_date: null,
        pay_mode_2_date: null, pay_mode_2_s_date: null,
        pay_mode_3_date: null, pay_mode_3_s_date: null,
        fees_due: feesDue,
        fees_due_balance: feesDue,
        type: up(p.type || "NEW"),
        is_cross_library: isCross || "NO",
        generated_at: nowTsIst(),
        status: "",
        dues_status: feesDue > 0 ? "PENDING" : "",
        renewed_from: renewedFrom,
        remark: String(p.remark || ""),
        temporary_seat: "",
        receipt_text: "",
        registration_text: "",
      };
      [pm1, pm2, pm3].forEach((pmx, idx) => {
        if (!pmx.mode) return;
        const k = idx + 1;
        const modeIso = pmx.date ? toIsoDateW(pmx.date) : receiptIso;
        row["pay_mode_" + k + "_date"] = modeIso;
        row["pay_mode_" + k + "_s_date"] = _addSettlementDaysW(modeIso, pmx.mode, tagMap);
      });

      // (5) WhatsApp receipt + registration text
      const payLines: string[] = [];
      [pm1, pm2, pm3].forEach((pmx) => {
        const l = _buildPayLineW(pmx.mode, pmx.amount);
        if (l) payLines.push("*" + l + "*");
      });
      const shiftFull = up(p.shift_name || "") + (up(p.shift_time || "") ? " (" + up(p.shift_time || "") + ")" : "");
      const receiptCtx = {
        remark: String(p.remark || ""),
        library_name: libName,
        branch: targetBranch,
        student_id: composeSid(studentId, isCross),
        name: up(p.name),
        phones: resolvedPhones,
        seat_no: seatLabel,
        shift_full: shiftFull,
        booking_from: formatForReceiptW(p.booking_from),
        booking_to: formatForReceiptW(p.booking_to),
        receipt_date: formatForReceiptW(p.receipt_date || todayIsoIst()),
        fee: num(p.fee),
        payLines,
        fees_due: feesDue,
        receipt_no: receiptNo,
      };
      row.receipt_text = _buildReceiptTextW({ ...receiptCtx, title: "Receipt" });
      row.registration_text = up(p.type || "NEW") === "NEW"
        ? _buildReceiptTextW({ ...receiptCtx, title: "Registration Form" })
        : "";

      // (6) INSERT — trigger writes seat_occupancy (both halves for FULL DAY); exclusion constraint = hard guarantee
      await tx`insert into receipt_log ${tx(row)}`;

      return {
        created: true,
        receipt_no: receiptNo,
        student_id: studentId,
        seat_no: seatLabel,
        receipt_text: row.receipt_text,
        registration_text: row.registration_text,
      };
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: markReceiptRenewed  (idempotent follow-up — createReceipt already set predecessor RENEWED)
  // ════════════════════════════════════════════════════════════════════
  async function markReceiptRenewed(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    const rows = (await sql`select status from receipt_log where upper(receipt_no)=${target} limit 1`) as any[];
    if (!rows.length) return { ok: false, error: "Receipt not found: " + p.receipt_no };
    const cur = up(rows[0].status || "");
    if (cur === "RENEWED") return { ok: true, already: true, status: "RENEWED" };
    if (cur && cur !== "DO_NOT_RENEW") {
      return { ok: false, error: "Receipt " + target + " has status=" + cur + "; cannot mark RENEWED." };
    }
    await sql`update receipt_log set status='RENEWED' where upper(receipt_no)=${target}`;
    return { ok: true, updated: true, status: "RENEWED", successor: up(p.successor || "") };
  }


  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  06_Dues.gs  → logFeePayment / updateDuePayment /
  //                markDuesIrrecoverable / unmarkDuesIrrecoverable
  // STAGED ONLY: none added to PG_ACTIONS yet (dormant until cutover).
  // ════════════════════════════════════════════════════════════════════

  // received_on = <custom date's day> + <current IST time>  (mirror 02_Helpers buildReceivedOn)
  function buildReceivedOnW(customDate: unknown): string {
    if (!customDate) return nowTsIst();
    const d = parseDateFlexible(customDate);
    if (isNaN(d.getTime())) return nowTsIst();
    const mm = ("0" + (d.getMonth() + 1)).slice(-2);
    const dd = ("0" + d.getDate()).slice(-2);
    return `${d.getFullYear()}-${mm}-${dd} ${_istNow().time}`;
  }

  // format a received_on / refund date for WhatsApp (strip "(EDITED)") — mirror 06_Dues _fmtDueDate
  function _fmtDueDateW(v: unknown): string {
    const s = String(v ?? "").replace(" (EDITED)", "");
    const d = parseDateFlexible(s);
    return !isNaN(d.getTime()) ? formatForReceiptW(d) : s;
  }

  // dated dues + refunds for ONE receipt, chronological — mirror 05_Receipts _buildReceiptHistoryLines
  async function _buildReceiptHistoryLinesW(tx: any, receiptNo: string): Promise<string[]> {
    const target = up(receiptNo);
    const out: string[] = [];
    if (!target) return out;
    const events: Array<{ kind: string; amount: number; mode: string; raw: unknown; t: number }> = [];

    const dd = (await tx`select amount_received, payment_mode, received_on from fees_due_log where upper(receipt_no)=${target}`) as any[];
    for (const d of dd) events.push({ kind: "DUE", amount: num(d.amount_received), mode: up(d.payment_mode ?? ""), raw: d.received_on, t: 0 });

    const ff = (await tx`select amount, refund_mode, refund_date from refund_log where upper(original_receipt_no)=${target}`) as any[];
    for (const f of ff) events.push({ kind: "REFUND", amount: Math.abs(num(f.amount)), mode: up(f.refund_mode ?? ""), raw: f.refund_date, t: 0 });

    if (!events.length) return out;
    for (const e of events) { const d = parseDateFlexible(e.raw); e.t = !isNaN(d.getTime()) ? d.getTime() : 0; }
    events.sort((a, b) => a.t - b.t);

    out.push("");
    out.push("--- Payments & Refunds ---");
    for (const e of events) {
      const when = e.t ? formatForReceiptW(new Date(e.t)) : String(e.raw ?? "");
      const tag = e.mode ? " (" + e.mode + ")" : "";
      const head = e.kind === "DUE" ? "Due Paid: *Rs. " : "Refund: *Rs. ";
      out.push(head + e.amount + "/-*" + tag + " on *" + when + "*");
    }
    return out;
  }

  // rebuild BOTH texts from a receipt_log row (+ history + balance) — mirror 05_Receipts _regenerateReceiptTexts
  async function _regenerateReceiptTextsW(tx: any, r: any): Promise<{ receipt_text: string; registration_text: string }> {
    const library = up(r.library ?? "");
    const isCross = up(r.is_cross_library ?? "");
    const type = up(r.type ?? "NEW");
    const phones = extractPhones(r);
    const shiftFull = up(r.shift_name ?? "") + (up(r.shift_time ?? "") ? " (" + up(r.shift_time ?? "") + ")" : "");
    const libRows = (await tx`select library_name from libraries where upper(library_code)=${library} limit 1`) as any[];
    const libName = libRows.length ? up(libRows[0].library_name || library) : library;

    const payLines: string[] = [];
    ([[r.pay_mode_1, r.pay_amount_1], [r.pay_mode_2, r.pay_amount_2], [r.pay_mode_3, r.pay_amount_3]] as Array<[unknown, unknown]>)
      .forEach(([m, a]) => { const l = _buildPayLineW(m, a); if (l) payLines.push("*" + l + "*"); });

    const histLines = await _buildReceiptHistoryLinesW(tx, up(r.receipt_no ?? ""));
    const ctx = {
      history: histLines,
      balance: num(r.fees_due_balance),
      show_balance: histLines.length > 0 || num(r.fees_due) > 0,
      library_name: libName,
      branch: up(r.branch ?? ""),
      student_id: composeSid(up(r.student_id ?? ""), isCross),
      name: up(r.name ?? ""),
      phones,
      seat_no: up(r.seat_no ?? ""),
      shift_full: shiftFull,
      booking_from: formatForReceiptW(r.booking_from),
      booking_to: formatForReceiptW(r.booking_to),
      receipt_date: formatForReceiptW(r.receipt_date),
      fee: num(r.fee),
      payLines,
      fees_due: num(r.fees_due),
      receipt_no: up(r.receipt_no ?? ""),
      remark: String(r.remark ?? ""),
    };
    return {
      receipt_text: _buildReceiptTextW({ ...ctx, title: "Receipt" }),
      registration_text: type === "NEW" ? _buildReceiptTextW({ ...ctx, title: "Registration Form" }) : "",
    };
  }

  // re-persist BOTH texts for one receipt (inside the caller's txn) — mirror 05_Receipts _refreshReceiptTexts
  async function _refreshReceiptTextsW(tx: any, receiptNo: string): Promise<void> {
    const target = up(receiptNo);
    if (!target) return;
    const rows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1`) as any[];
    if (!rows.length) return;
    const regen = await _regenerateReceiptTextsW(tx, rows[0]);
    await tx`update receipt_log set receipt_text=${regen.receipt_text}, registration_text=${regen.registration_text} where upper(receipt_no)=${target}`;
  }

  // due-payment WhatsApp (receipt format + payment-history section) — mirror 06_Dues buildDuePaymentWhatsApp
  function buildDuePaymentWhatsAppW(
    r: any, libName: string, allPayments: any[],
    balBefore: number, amtReceived: number, balAfter: number, payMode: string, receivedOn: unknown
  ): string {
    const branch = up(r.branch ?? "");
    const displayStudentId = composeSid(up(r.student_id ?? ""), up(r.is_cross_library ?? ""));
    const name = up(r.name ?? "");
    const seatNo = up(r.seat_no ?? "");
    let seatLine = "Seat No.: *" + seatNo + "*";
    if (branch) seatLine = "Seat No.: *" + seatNo + " IN " + branch + "*";
    const shiftName = up(r.shift_name ?? r.shift ?? "");
    const shiftTime = up(r.shift_time ?? "");
    const shiftFull = shiftTime ? shiftName + " (" + shiftTime + ")" : shiftName;
    const phoneLines = _buildPhoneLinesW(extractPhones(r));

    const origPayLines: string[] = [];
    ([[r.pay_mode_1, r.pay_amount_1], [r.pay_mode_2, r.pay_amount_2], [r.pay_mode_3, r.pay_amount_3]] as Array<[unknown, unknown]>)
      .forEach(([m, a]) => { const l = _buildPayLineW(m, a); if (l) origPayLines.push("*" + l + "*"); });

    const lines: string[] = [
      "*_" + libName + "_*",
      "{Due Payment Receipt}",
      "",
      "*" + displayStudentId + "*",
      "*" + name + "*",
      ...phoneLines,
      "",
      seatLine,
      "*" + shiftFull + "*",
      "",
      "Booking Period:",
      "*" + formatForReceiptW(r.booking_from) + " to " + formatForReceiptW(r.booking_to) + "*",
      "",
      "Original Receipt: *" + up(r.receipt_no ?? "") + "*",
      "Original Fee: *Rs. " + num(r.fee) + "/-*",
      ...origPayLines,
      "",
      "─── Payment History ───",
    ];
    (allPayments || []).forEach((pay, idx) => {
      lines.push((idx + 1) + ". *" + up(pay.payment_mode) + "-" + num(pay.amount_received) + "*  on  *" + _fmtDueDateW(pay.received_on) + "*");
    });
    lines.push("");
    lines.push("Balance Before: *Rs. " + balBefore + "/-*");
    lines.push("This Payment: *" + up(payMode) + "-" + amtReceived + "*  on  *" + _fmtDueDateW(receivedOn) + "*");
    lines.push("Balance After: *Rs. " + balAfter + "/-*");
    if (balAfter <= 0) { lines.push(""); lines.push("*✅ FULLY PAID*"); }
    return lines.join("\n");
  }

  // irrecoverable-dues WhatsApp — mirror 06_Dues _buildIrrecoverableWhatsApp
  function _buildIrrecoverableWhatsAppW(r: any, libName: string, balance: number, remark: string): string {
    const displayStudentId = composeSid(up(r.student_id ?? ""), up(r.is_cross_library ?? ""));
    const name = up(r.name ?? "");
    const receiptNo = up(r.receipt_no ?? "");
    const phoneLines = _buildPhoneLinesW(extractPhones(r));
    const lines: string[] = [
      "*_" + libName + "_*",
      "{Dues Settlement Notice}",
      "",
      "*" + displayStudentId + "*",
      "*" + name + "*",
      ...phoneLines,
      "",
      "Receipt: *" + receiptNo + "*",
      "Outstanding Dues: *Rs. " + balance + "/-*",
      "",
      "Dear " + name + ",",
      "After our records review, the outstanding dues of *Rs. " + balance + "/-* against the above receipt have been written off from our books.",
      "",
      "You are no longer required to pay this amount.",
    ];
    if (remark) { lines.push(""); lines.push("Note: " + remark); }
    lines.push("");
    lines.push("Thank you for being part of " + libName + ".");
    return lines.join("\n");
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: logFeePayment
  // ════════════════════════════════════════════════════════════════════
  async function logFeePayment(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    if (!p.payment_mode) throw new Error("payment_mode is required.");
    if (p.amount_received === undefined || p.amount_received === null || p.amount_received === "")
      throw new Error("amount_received is required.");

    const target = up(p.receipt_no);
    const tagMap = await _loadTagMap();

    return await sql.begin(async (tx: any) => {
      const rec = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1 for update`) as any[];
      if (!rec.length) throw new Error("Receipt not found: " + p.receipt_no);
      const recRow = rec[0];

      const balanceBefore = num(recRow.fees_due_balance);
      const amtReceived = num(p.amount_received);
      if (amtReceived <= 0) throw new Error("amount_received must be greater than 0.");
      if (amtReceived > balanceBefore) throw new Error("Amount exceeds remaining balance of Rs." + balanceBefore);
      const balanceAfter = balanceBefore - amtReceived;
      const receivedOn = p.receipt_date ? buildReceivedOnW(p.receipt_date) : nowTsIst();

      // 1. receipt_log balance (+ dues_status when fully settled)
      if (balanceAfter <= 0) {
        await tx`update receipt_log set fees_due_balance=${balanceAfter}, dues_status='SETTLED' where upper(receipt_no)=${target}`;
      } else {
        await tx`update receipt_log set fees_due_balance=${balanceAfter} where upper(receipt_no)=${target}`;
      }

      // 2. fees_due_log row (whatsapp from full history + this new entry)
      const existing = (await tx`select payment_mode, amount_received, received_on from fees_due_log where upper(receipt_no)=${target} order by s_no`) as any[];
      const allPayments = existing.map((d) => ({ payment_mode: up(d.payment_mode ?? ""), amount_received: num(d.amount_received), received_on: d.received_on }));
      allPayments.push({ payment_mode: up(p.payment_mode), amount_received: amtReceived, received_on: receivedOn });
      const libName = await _lookupLibraryNameW(up(recRow.library ?? ""));
      const whatsappText = buildDuePaymentWhatsAppW(recRow, libName, allPayments, balanceBefore, amtReceived, balanceAfter, up(p.payment_mode), receivedOn);

      const drow: Record<string, any> = {
        receipt_no: target,
        student_id: up(recRow.student_id ?? ""),
        library: up(recRow.library ?? ""),
        branch: up(recRow.branch ?? ""),
        name: up(recRow.name ?? ""),
        phone: normalizePhone(String(recRow.phone ?? "")),
        gender: up(recRow.gender ?? ""),
        payment_mode: up(p.payment_mode),
        payment_fees_mode: _feesModeForTag(p.payment_mode, tagMap),
        amount_received: amtReceived,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        received_on: receivedOn,
        settlement_date: _addSettlementDaysW(receivedOn, p.payment_mode, tagMap),
        notes: up(p.notes ?? ""),
        whatsapp_text: whatsappText,
      };
      // payment_id is NOT NULL and s_no is GENERATED ALWAYS: take the next s_no from its
      // identity sequence, build payment_id from it, insert both with OVERRIDING SYSTEM VALUE.
      const seq = (await tx`select nextval(pg_get_serial_sequence('fees_due_log','s_no')) as sno`) as any[];
      const sno = num(seq[0].sno);
      const paymentId = "DUE" + String(sno).padStart(5, "0");
      await tx`insert into fees_due_log
        (s_no, payment_id, receipt_no, student_id, library, branch, name, phone, gender,
        payment_mode, payment_fees_mode, amount_received, balance_before, balance_after,
        received_on, settlement_date, notes, whatsapp_text)
        overriding system value values
        (${sno}, ${paymentId}, ${drow.receipt_no}, ${drow.student_id}, ${drow.library}, ${drow.branch}, ${drow.name}, ${drow.phone}, ${drow.gender},
        ${drow.payment_mode}, ${drow.payment_fees_mode}, ${drow.amount_received}, ${drow.balance_before}, ${drow.balance_after},
        ${drow.received_on}, ${drow.settlement_date}, ${drow.notes}, ${drow.whatsapp_text})`;

      // 3. rebuild the receipt's stored WhatsApp texts (now shows this payment + balance)
      await _refreshReceiptTextsW(tx, target);

      return { logged: true, payment_id: paymentId, balance_before: balanceBefore, balance_after: balanceAfter, whatsapp_text: whatsappText };
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: updateDuePayment  (edit mode/amount/notes/date; re-derive fees_mode + whatsapp)
  // NOTE: does NOT recompute prior/subsequent balances (matches GAS — corrections are rare)
  // ════════════════════════════════════════════════════════════════════
  async function updateDuePayment(p: any): Promise<any> {
    if (!p || !p.payment_id) throw new Error("payment_id is required.");
    if (!p.receipt_no) throw new Error("receipt_no is required.");
    const targetPid = up(p.payment_id);
    const target = up(p.receipt_no);
    const tagMap = await _loadTagMap();

    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select * from fees_due_log where upper(payment_id)=${targetPid} and upper(receipt_no)=${target} limit 1`) as any[];
      if (!rows.length) return { ok: false, error: "Payment not found." };
      const cur = rows[0];

      // field updates (mode/amount/notes/received_on)
      const upd: Record<string, any> = {};
      if (p.payment_mode !== undefined) { upd.payment_mode = up(p.payment_mode); upd.payment_fees_mode = _feesModeForTag(p.payment_mode, tagMap); }
      if (p.amount_received !== undefined) upd.amount_received = num(p.amount_received);
      if (p.notes !== undefined) upd.notes = up(p.notes);
      if (p.received_on !== undefined) upd.received_on = String(p.received_on);
      if (Object.keys(upd).length) {
        await tx`update fees_due_log set ${tx(upd)} where upper(payment_id)=${targetPid} and upper(receipt_no)=${target}`;
      }

      // recompute derived from the now-updated row
      const freshRows = (await tx`select * from fees_due_log where upper(payment_id)=${targetPid} and upper(receipt_no)=${target} limit 1`) as any[];
      const fresh = freshRows[0];
      const payMode = up(fresh.payment_mode ?? "");
      const cleanReceivedOn = String(fresh.received_on ?? "");
      const settlementDate = _addSettlementDaysW(cleanReceivedOn, payMode, tagMap);

      // whatsapp from full (updated) history
      const recRows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1`) as any[];
      let whatsappText: string | null = null;
      if (recRows.length) {
        const allPayments = ((await tx`select payment_mode, amount_received, received_on from fees_due_log where upper(receipt_no)=${target} order by s_no`) as any[])
          .map((d) => ({ payment_mode: up(d.payment_mode ?? ""), amount_received: num(d.amount_received), received_on: d.received_on }));
        const libName = await _lookupLibraryNameW(up(recRows[0].library ?? ""));
        whatsappText = buildDuePaymentWhatsAppW(
          recRows[0], libName, allPayments,
          num(fresh.balance_before), num(fresh.amount_received), num(fresh.balance_after),
          payMode, cleanReceivedOn
        );
      }

      // (EDITED) marker (append once), settlement sync, whatsapp — one final update
      const storedReceivedOn = cleanReceivedOn && cleanReceivedOn.indexOf("(EDITED)") < 0 ? cleanReceivedOn + " (EDITED)" : cleanReceivedOn;
      const finalUpd: Record<string, any> = { received_on: storedReceivedOn, settlement_date: settlementDate };
      if (whatsappText !== null) finalUpd.whatsapp_text = whatsappText;
      await tx`update fees_due_log set ${tx(finalUpd)} where upper(payment_id)=${targetPid} and upper(receipt_no)=${target}`;

      await _refreshReceiptTextsW(tx, target);
      return { updated: true };
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: markDuesIrrecoverable
  // ════════════════════════════════════════════════════════════════════
  async function markDuesIrrecoverable(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Receipt not found: " + p.receipt_no };
      const r = rows[0];
      const balance = num(r.fees_due_balance);
      if (balance <= 0) return { ok: false, error: "No outstanding dues to mark irrecoverable (balance=0)." };
      if (up(r.dues_status ?? "") === "IRRECOVERABLE") return { ok: false, error: "Already marked irrecoverable." };

      const remark = String(p.remark ?? "");
      const libName = await _lookupLibraryNameW(up(r.library ?? ""));
      const whatsappText = _buildIrrecoverableWhatsAppW(r, libName, balance, remark);
      await tx`update receipt_log set dues_status='IRRECOVERABLE', irrecoverable_remark=${remark}, irrecoverable_whatsapp_text=${whatsappText} where upper(receipt_no)=${target}`;
      return { marked: true, irrecoverable_whatsapp_text: whatsappText };
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: unmarkDuesIrrecoverable
  // ════════════════════════════════════════════════════════════════════
  async function unmarkDuesIrrecoverable(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select dues_status from receipt_log where upper(receipt_no)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Receipt not found: " + p.receipt_no };
      if (up(rows[0].dues_status ?? "") !== "IRRECOVERABLE") return { ok: false, error: "Not currently irrecoverable. Nothing to unmark." };
      await tx`update receipt_log set dues_status='PENDING', irrecoverable_remark='', irrecoverable_whatsapp_text='' where upper(receipt_no)=${target}`;
      return { unmarked: true };
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  10_Renewals.gs  → markReceiptDoNotRenew / markReceiptCancelled
  //                / resetReceiptStatus  (status-only; seat frees via the trigger)
  // STAGED ONLY: none added to PG_ACTIONS yet (dormant until cutover).
  // NOTE: receipt_log has no `cancelled_on` column (per live schema) — so, exactly
  //       like GAS's guarded set, we do NOT write it.
  // ════════════════════════════════════════════════════════════════════

  // find any receipt whose renewed_from == receiptNo — mirror 10_Renewals _findSuccessor
  async function _findSuccessorW(tx: any, receiptNo: string): Promise<string | null> {
    const target = up(receiptNo);
    const rows = (await tx`select receipt_no from receipt_log where upper(renewed_from)=${target} limit 1`) as any[];
    return rows.length ? up(rows[0].receipt_no) : null;
  }

  // cancellation WhatsApp (with / without refund flavour) — mirror 10_Renewals _buildCancelWhatsApp
  function _buildCancelWhatsAppW(r: any, libName: string, cancelRemark: string, refundCtx: any): string {
    const displayStudentId = composeSid(up(r.student_id ?? ""), up(r.is_cross_library ?? ""));
    const name = up(r.name ?? "");
    const receiptNo = up(r.receipt_no ?? "");
    const phoneLines = _buildPhoneLinesW(extractPhones(r));
    const title = refundCtx ? "Cancellation with Refund" : "Booking Cancellation";
    const lines: string[] = [
      "*_" + libName + "_*",
      "{" + title + "}",
      "",
      "*" + displayStudentId + "*",
      "*" + name + "*",
      ...phoneLines,
      "",
      "Receipt: *" + receiptNo + "*",
      "Original Booking Period:",
      "*" + formatForReceiptW(r.booking_from) + " to " + formatForReceiptW(r.booking_to) + "*",
      "",
      "Dear " + name + ",",
      "Your booking *" + receiptNo + "* has been cancelled effective " + formatForReceiptW(todayIsoIst()) + ".",
    ];
    if (refundCtx) {
      lines.push("");
      lines.push("─── Refund Details ───");
      lines.push("Refund ID: *" + refundCtx.refundId + "*");
      lines.push("Refund Amount: *Rs. " + refundCtx.refundAmount + "/-*");
      lines.push("Refund Mode: *" + refundCtx.refundMode + "*");
    } else {
      lines.push("");
      lines.push("No refund applicable.");
    }
    if (cancelRemark) { lines.push(""); lines.push("Note: " + cancelRemark); }
    const balance = num(r.fees_due_balance);
    if (balance > 0 && up(r.dues_status ?? "") !== "IRRECOVERABLE") {
      lines.push("");
      lines.push("⚠️ Outstanding Dues: *Rs. " + balance + "/-* remain on this receipt.");
    }
    lines.push("");
    lines.push("Thank you,");
    lines.push("*" + libName + "*");
    return lines.join("\n");
  }

  // core status setter — mirror 10_Renewals _setReceiptStatus
  // opts: { generateCancelWhatsApp?, cancelRemark?, refundCtx? }
  async function _setReceiptStatusW(tx: any, receiptNo: string, newStatus: string, opts: any): Promise<any> {
    opts = opts || {};
    const target = up(receiptNo);
    const rows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1 for update`) as any[];
    if (!rows.length) return { ok: false, error: "Receipt not found: " + receiptNo };
    const r = rows[0];
    const cur = up(r.status ?? "");
    if (cur === newStatus) return { ok: false, error: "Receipt is already " + newStatus + "." };
    if (cur && cur !== newStatus) return { ok: false, error: "Receipt already has status=" + cur + ". Reset first if you want to change it." };

    await tx`update receipt_log set status=${newStatus} where upper(receipt_no)=${target}`;

    let cancelText = "";
    if (newStatus === "CANCELLED" && opts.generateCancelWhatsApp) {
      const libName = await _lookupLibraryNameW(up(r.library ?? ""));
      cancelText = _buildCancelWhatsAppW(r, libName, opts.cancelRemark || "", opts.refundCtx || null);
      await tx`update receipt_log set cancel_whatsapp_text=${cancelText} where upper(receipt_no)=${target}`;
    }
    return { updated: true, new_status: newStatus, cancel_whatsapp_text: cancelText };
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: markReceiptDoNotRenew
  // ════════════════════════════════════════════════════════════════════
  async function markReceiptDoNotRenew(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    return await sql.begin(async (tx: any) => _setReceiptStatusW(tx, p.receipt_no, "DO_NOT_RENEW", {}));
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: markReceiptCancelled  (no refund; seat frees via trigger)
  // ════════════════════════════════════════════════════════════════════
  async function markReceiptCancelled(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    return await sql.begin(async (tx: any) =>
      _setReceiptStatusW(tx, p.receipt_no, "CANCELLED", {
        generateCancelWhatsApp: true,
        cancelRemark: String(p.cancel_remark || ""),
        refundCtx: null,
      })
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: resetReceiptStatus  (undo a decision; re-occupies seat via trigger)
  // Guards: blank / booking_to frozen / RENEWED-with-successor.
  // If the freed seat was rebooked meanwhile, the trigger's unique key rejects
  // the re-occupancy (23505) → friendly error instead of a raw failure.
  // ════════════════════════════════════════════════════════════════════
  async function resetReceiptStatus(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    try {
      return await sql.begin(async (tx: any) => {
        const rows = (await tx`
          select status, renewed_from, (booking_to - current_date) as days_to
          from receipt_log where upper(receipt_no)=${target} limit 1 for update`) as any[];
        if (!rows.length) return { ok: false, error: "Receipt not found: " + p.receipt_no };
        const cur = up(rows[0].status ?? "");
        if (!cur) return { ok: false, error: "Status is already blank — nothing to reset." };
        const daysTo = rows[0].days_to;
        if (daysTo === null || daysTo === undefined) return { ok: false, error: "booking_to is invalid or missing." };
        if (num(daysTo) < 0) return { ok: false, error: "Cannot reset status — booking_to has passed (status is frozen)." };
        if (cur === "RENEWED") {
          const successor = await _findSuccessorW(tx, target);
          if (successor) return { ok: false, error: "Cannot reset — receipt " + successor + " has renewed_from=" + target + ". Delete successor first." };
        }
        await tx`update receipt_log set status='', cancel_whatsapp_text='' where upper(receipt_no)=${target}`;
        return { reset: true, previous_status: cur };
      });
    } catch (e: any) {
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      if (code === "23505" || /seat_occupancy/i.test(msg)) {
        return { ok: false, error: "Cannot reset — the seat has since been booked by another receipt." };
      }
      throw e;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  08_Refunds.gs → issueRefund   +   10_Renewals.gs →
  //                markReceiptCancelledWithRefund  (atomic: refund + cancel)
  // STAGED ONLY: neither added to PG_ACTIONS yet (dormant until cutover).
  // refund_id is NOT NULL + s_no GENERATED ALWAYS → sequence + OVERRIDING SYSTEM VALUE.
  // linked_to_cancellation is TEXT → stored "TRUE"/"FALSE" (matches GAS).
  // ════════════════════════════════════════════════════════════════════

  // refund WhatsApp — mirror 08_Refunds _buildRefundWhatsApp
  function _buildRefundWhatsAppW(r: any, libName: string, refundCtx: any): string {
    const displayStudentId = composeSid(up(r.student_id ?? ""), up(r.is_cross_library ?? ""));
    const name = up(r.name ?? "");
    const receiptNo = up(r.receipt_no ?? "");
    const phoneLines = _buildPhoneLinesW(extractPhones(r));
    const title = refundCtx.linkedToCancellation ? "Cancellation Refund Confirmation" : "Refund Confirmation";
    const lines: string[] = [
      "*_" + libName + "_*",
      "{" + title + "}",
      "",
      "*" + displayStudentId + "*",
      "*" + name + "*",
      ...phoneLines,
      "",
      "Refund: *" + refundCtx.refundId + "*",
      "Against Receipt: *" + receiptNo + "*",
      "",
      "Refund Amount: *Rs. " + refundCtx.amount + "/-*",
      "Refund Mode: *" + refundCtx.refundMode + "*",
      "Refunded On: *" + refundCtx.refundDate + "*",
    ];
    if (refundCtx.refundReason) { lines.push(""); lines.push("Reason: " + refundCtx.refundReason); }
    lines.push("");
    lines.push("Thank you,");
    lines.push("*" + libName + "*");
    return lines.join("\n");
  }

  // core refund insert (no txn open, no receipt-text refresh) — caller controls both.
  // Mirror 08_Refunds issueRefund body.
  async function _issueRefundTx(tx: any, p: any, tagMap: Map<string, { fees_mode: string; settlement_days: number }>): Promise<any> {
    if (!p || !p.original_receipt_no) throw new Error("original_receipt_no is required.");
    if (!p.refund_mode) throw new Error("refund_mode is required.");
    if (p.amount === undefined || p.amount === null || p.amount === "") throw new Error("amount is required.");
    const amount = num(p.amount);
    if (amount <= 0) throw new Error("Refund amount must be positive (the rupees handed back).");

    const target = up(p.original_receipt_no);
    const recRows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1`) as any[];
    if (!recRows.length) throw new Error("Original receipt not found: " + p.original_receipt_no);
    const recRow = recRows[0];

    // refund_id NOT NULL + s_no GENERATED ALWAYS → pull next s_no from its sequence, set both explicitly
    const seq = (await tx`select nextval(pg_get_serial_sequence('refund_log','s_no')) as sno`) as any[];
    const sno = num(seq[0].sno);
    const refundId = "REF" + String(sno).padStart(5, "0");
    const refundDate = p.refund_date ? buildReceivedOnW(p.refund_date) : nowTsIst();
    const linked = tobool(p.linked_to_cancellation);
    const libName = await _lookupLibraryNameW(up(recRow.library ?? ""));
    const whatsappText = _buildRefundWhatsAppW(recRow, libName, {
      refundId, amount, refundMode: up(p.refund_mode), refundDate,
      refundReason: String(p.refund_reason ?? ""), linkedToCancellation: linked,
    });

    await tx`insert into refund_log
      (s_no, refund_id, original_receipt_no, student_id, library, branch, is_cross_library, name, phone,
      refund_mode, refund_fees_mode, amount, refund_date, refund_reason, linked_to_cancellation, timestamp, refund_whatsapp_text)
      overriding system value values
      (${sno}, ${refundId}, ${target}, ${up(recRow.student_id ?? "")}, ${up(recRow.library ?? "")}, ${up(recRow.branch ?? "")}, ${up(recRow.is_cross_library ?? "NO")}, ${up(recRow.name ?? "")}, ${normalizePhone(String(recRow.phone ?? ""))},
      ${up(p.refund_mode)}, ${_feesModeForTag(p.refund_mode, tagMap)}, ${amount}, ${refundDate}, ${String(p.refund_reason ?? "")}, ${linked ? "TRUE" : "FALSE"}, ${nowTsIst()}, ${whatsappText})`;

    return { refund_id: refundId, amount, refund_whatsapp_text: whatsappText, original_receipt: target };
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: issueRefund  (standalone; booking continues unless linked to a cancellation)
  // ════════════════════════════════════════════════════════════════════
  async function issueRefund(p: any): Promise<any> {
    const tagMap = await _loadTagMap();
    return await sql.begin(async (tx: any) => {
      const r = await _issueRefundTx(tx, p, tagMap);
      await _refreshReceiptTextsW(tx, r.original_receipt); // refunds appear in the receipt's history
      return { issued: true, refund_id: r.refund_id, amount: r.amount, refund_whatsapp_text: r.refund_whatsapp_text };
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: markReceiptCancelledWithRefund  (ATOMIC — both or neither)
  // ════════════════════════════════════════════════════════════════════
  async function markReceiptCancelledWithRefund(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    if (!p.refund_mode) throw new Error("refund_mode is required for Cancel+Refund.");
    if (p.refund_amount === undefined || p.refund_amount === null || p.refund_amount === "")
      throw new Error("refund_amount is required for Cancel+Refund.");

    const tagMap = await _loadTagMap();
    return await sql.begin(async (tx: any) => {
      // 1. issue refund first (linked to cancellation)
      const refundResult = await _issueRefundTx(tx, {
        original_receipt_no: p.receipt_no,
        amount: p.refund_amount,
        refund_mode: p.refund_mode,
        refund_date: p.refund_date,
        refund_reason: p.refund_reason,
        linked_to_cancellation: true,
      }, tagMap);

      // 2. mark CANCELLED with refund context — if the guard rejects, throw so the refund rolls back too
      const statusResult = await _setReceiptStatusW(tx, p.receipt_no, "CANCELLED", {
        generateCancelWhatsApp: true,
        cancelRemark: String(p.cancel_remark ?? ""),
        refundCtx: { refundId: refundResult.refund_id, refundAmount: num(p.refund_amount), refundMode: up(p.refund_mode) },
      });
      if (statusResult && statusResult.ok === false) throw new Error(statusResult.error || "Could not cancel the receipt.");

      // 3. refresh receipt texts (refund now in history; seat already freed by the status trigger)
      await _refreshReceiptTextsW(tx, p.receipt_no);

      return {
        cancelled: true,
        refund_id: refundResult.refund_id,
        refund_amount: refundResult.amount,
        refund_whatsapp_text: refundResult.refund_whatsapp_text,
        cancel_whatsapp_text: statusResult.cancel_whatsapp_text,
      };
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  05_Receipts.gs → updateReceipt   +   16_ReceiptEdits.gs →
  //                logReceiptEdit  (+ _sumDuesReceived, buildEventWhatsApp)
  // STAGED ONLY: not added to PG_ACTIONS yet (dormant until cutover).
  // ════════════════════════════════════════════════════════════════════

  // sum of dues collected against a receipt — mirror 05_Receipts _sumDuesReceived
  async function _sumDuesReceivedW(tx: any, receiptNo: string): Promise<number> {
    const rows = (await tx`select coalesce(sum(amount_received),0) as s from fees_due_log where upper(receipt_no)=${up(receiptNo)}`) as any[];
    return Math.round(num(rows[0].s));
  }

  // generic event WhatsApp (SEAT_CHANGED / TEMP_VACATED / RECEIPT_UPDATED) — mirror 14_SeatBlocks buildEventWhatsApp
  async function buildEventWhatsAppW(r: any, eventType: string, detail: any): Promise<string> {
    detail = detail || {};
    const libName = await _lookupLibraryNameW(up(r.library ?? ""));
    const displayStudentId = composeSid(up(r.student_id ?? ""), up(r.is_cross_library ?? ""));
    const name = up(r.name ?? "");
    const receiptNo = up(r.receipt_no ?? "");
    const phoneLines = _buildPhoneLinesW(extractPhones(r));
    const branch = up(r.branch ?? "");
    const seatSuffix = branch ? " IN " + branch : "";
    const titles: Record<string, string> = { SEAT_CHANGED: "Seat Changed", TEMP_VACATED: "Seat Temporarily Vacated", RECEIPT_UPDATED: "Receipt Updated" };
    const lines: string[] = [
      "*_" + libName + "_*",
      "{" + (titles[eventType] || "Update") + "}",
      "",
      "*" + displayStudentId + "*",
      "*" + name + "*",
      ...phoneLines,
      "",
      "Receipt: *" + receiptNo + "*",
    ];
    if (eventType === "SEAT_CHANGED") {
      lines.push("");
      lines.push("Your seat has been changed.");
      if (detail.fromSeat) lines.push("From Seat: *" + up(detail.fromSeat) + "*");
      lines.push("New Seat: *" + up(detail.toSeat || "") + seatSuffix + "*");
      lines.push("");
      lines.push("Booking & fees remain unchanged.");
    } else if (eventType === "TEMP_VACATED") {
      lines.push("");
      lines.push("Your seat *" + up(detail.fromSeat || "") + "* has been temporarily vacated and is being held for you.");
      lines.push("Please contact us to resume your seat.");
    } else if (eventType === "RECEIPT_UPDATED") {
      lines.push("");
      lines.push("Your receipt details have been updated:");
      const ch = detail.changes || [];
      if (!ch.length) lines.push("(details revised)");
      else ch.forEach((c: any) => lines.push(c.label + ": *" + (c.from === "" || c.from == null ? "—" : c.from) + "* → *" + (c.to === "" || c.to == null ? "—" : c.to) + "*"));
    }
    lines.push("");
    lines.push("Thank you,");
    lines.push("*" + libName + "*");
    return lines.join("\n");
  }

  // ── receipt-edit audit (16_ReceiptEdits) ──
  const _EDIT_SKIP_COLS = new Set(["receipt_text", "registration_text", "generated_at"]);
  function _diffFieldsW(before: any, after: any): string[] {
    const changed: string[] = [];
    for (const col of Object.keys(after)) {
      if (_EDIT_SKIP_COLS.has(col)) continue;
      const b = before[col], a = after[col];
      if (String(b === undefined || b === null ? "" : b) !== String(a === undefined || a === null ? "" : a)) changed.push(col);
    }
    return changed;
  }
  async function _nextEditLetterW(tx: any, originalReceiptNo: string): Promise<string> {
    const target = up(originalReceiptNo);
    const rows = (await tx`select edit_letter from receipt_edits where upper(original_receipt_no)=${target}`) as any[];
    const seen: Record<string, boolean> = {};
    for (const r of rows) { const l = String(r.edit_letter || "").toUpperCase(); if (l) seen[l] = true; }
    const seq: string[] = [];
    for (let c = 65; c <= 90; c++) seq.push(String.fromCharCode(c));
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) seq.push(String.fromCharCode(a) + String.fromCharCode(b));
    for (const s of seq) if (!seen[s]) return s;
    return "Z" + Date.now();
  }
  // plain snapshot: Date columns → yyyy-MM-dd (matches how GAS stored ISO dates)
  function _snapshotForJsonW(row: any): any {
    const o: Record<string, any> = {};
    for (const k of Object.keys(row)) {
      const v = row[k];
      if (v instanceof Date) { const mm = ("0" + (v.getMonth() + 1)).slice(-2); const dd = ("0" + v.getDate()).slice(-2); o[k] = v.getFullYear() + "-" + mm + "-" + dd; }
      else o[k] = v;
    }
    return o;
  }
  // BEFORE/AFTER snapshot pair — mirror 16_ReceiptEdits logReceiptEdit (own txn; best-effort caller)
  async function logReceiptEditW(p: any): Promise<any> {
    if (!p || !p.receipt_no || !p.before || !p.after) return { logged: false, error: "logReceiptEdit requires receipt_no, before, after." };
    const original = up(p.receipt_no);
    const changed = _diffFieldsW(p.before, p.after);
    if (!changed.length) return { logged: false, reason: "no changes" };
    return await sql.begin(async (tx: any) => {
      const letter = await _nextEditLetterW(tx, original);
      const ts = nowTsIst();
      const changedStr = changed.join(",");
      for (const role of ["BEFORE", "AFTER"]) {
        const snap = _snapshotForJsonW(role === "BEFORE" ? p.before : p.after);
        const seq = (await tx`select nextval(pg_get_serial_sequence('receipt_edits','s_no')) as sno`) as any[];
        const sno = num(seq[0].sno);
        const editId = original + "-" + letter + "-" + (role === "BEFORE" ? "1" : "2");
        const eventWa = role === "AFTER" ? String(p.whatsapp_text || "") : "";
        await tx`insert into receipt_edits
          (s_no, edit_id, original_receipt_no, edit_letter, snapshot_role, edited_at, editor_remark, changed_fields, snapshot_json, event_whatsapp_text)
          overriding system value values
          (${sno}, ${editId}, ${original}, ${letter}, ${role}, ${ts}, ${String(p.remark || "")}, ${changedStr}, ${tx.json(snap)}, ${eventWa})`;
      }
      return { logged: true, edit_letter: letter, changed_fields: changed };
    });
  }

  // human-readable change list for the RECEIPT_UPDATED WhatsApp — mirror updateReceipt's inline builder
  const _EDIT_LABELS: Record<string, string> = {
    seat_no: "Seat", shift: "Shift", shift_name: "Shift name", shift_time: "Shift time",
    booking_from: "Booking from", booking_to: "Booking to", receipt_date: "Receipt date",
    fee: "Fee", name: "Name", fees_due: "Fees due", fees_due_balance: "Dues balance",
    pay_mode_1: "Pay mode 1", pay_amount_1: "Pay amount 1", pay_mode_2: "Pay mode 2",
    pay_amount_2: "Pay amount 2", pay_mode_3: "Pay mode 3", pay_amount_3: "Pay amount 3",
    type: "Type", student_id: "Student ID", library: "Library", branch: "Branch", is_cross_library: "Cross-library",
  };
  const _EDIT_SHOWN = new Set(Object.keys(_EDIT_LABELS));
  const _EDIT_DATEFLD = new Set(["booking_from", "booking_to", "receipt_date"]);
  function _computeReceiptChanges(before: any, after: any): any[] {
    const fmt = (col: string, v: any) => (v === undefined || v === null || v === "") ? "" : (_EDIT_DATEFLD.has(col) ? formatForReceiptW(v) : String(v));
    const changes: any[] = [];
    for (const col of _EDIT_SHOWN) {
      const bs = fmt(col, before[col]);
      const as = fmt(col, after[col]);
      if (bs !== as) changes.push({ label: _EDIT_LABELS[col] || col, from: bs, to: as });
    }
    return changes;
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: updateReceipt
  // ════════════════════════════════════════════════════════════════════
  async function updateReceipt(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    const tagMap = await _loadTagMap();

    let main: any;
    try {
      main = await sql.begin(async (tx: any) => {
        const rows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1 for update`) as any[];
        if (!rows.length) return { ok: false, error: "Receipt not found: " + p.receipt_no };
        const existing = rows[0];

        const existingCross = String(existing.is_cross_library ?? "").trim().toUpperCase();
        const incomingCross = p.is_cross_library !== undefined ? String(p.is_cross_library ?? "").trim().toUpperCase() : existingCross;

        // RULE 2 — cross-library change requires re-selection + fresh student under new origin
        if (incomingCross !== existingCross) {
          if (!p.cross_library_reselected) return { ok: false, error: "is_cross_library changed. Frontend must set cross_library_reselected:true AND provide a fresh student_id under the new origin." };
          if (!p.student_id) return { ok: false, error: "Fresh student_id required when is_cross_library changes." };
          const newLib = p.library !== undefined ? up(p.library) : up(existing.library ?? "");
          const newBranch = p.branch !== undefined ? up(p.branch) : up(existing.branch ?? "");
          const newOrigin = _resolveOriginCodeW(newLib, newBranch, incomingCross);
          const lookup = await getStudentById({ student_id: up(p.student_id), library: newOrigin });
          if (!lookup.student) return { ok: false, error: "Re-selected student " + p.student_id + " not found under origin " + newOrigin + "." };
        }

        // SEAT guard — if seat context changes, the new seat must be free (ignoring THIS receipt)
        {
          const curSeat = up(existing.seat_no ?? ""), curShift = up(existing.shift ?? ""), curLib = up(existing.library ?? ""), curBranch = up(existing.branch ?? "");
          const newSeat = p.seat_no !== undefined ? up(p.seat_no) : curSeat;
          const newShift = p.shift !== undefined ? up(p.shift) : curShift;
          const newLib = p.library !== undefined ? up(p.library) : curLib;
          const newBranch = p.branch !== undefined ? up(p.branch) : curBranch;
          if ((newSeat !== curSeat || newShift !== curShift || newLib !== curLib || newBranch !== curBranch) && newSeat) {
            const chk = await _isSeatAvailableW(newLib, newBranch, newSeat, newShift, target);
            if (!chk.available) return { ok: false, error: chk.reason || ("Seat " + newSeat + " is not available for " + newShift + ".") };
          }
        }

        // build field updates
        const upd: Record<string, any> = {};
        if (p.student_id !== undefined) upd.student_id = up(p.student_id);
        if (p.library !== undefined) upd.library = up(p.library);
        if (p.branch !== undefined) upd.branch = up(p.branch);
        if (p.name !== undefined) upd.name = up(p.name);
        if (p.is_cross_library !== undefined) upd.is_cross_library = incomingCross || "NO";
        if (p.phones) {
          const pairs = [["phone", "phone_tag"], ["phone2", "phone2_tag"], ["phone3", "phone3_tag"], ["phone4", "phone4_tag"]];
          pairs.forEach((pair, j) => { const ph = p.phones[j] || { number: "", tag: "" }; upd[pair[0]] = normalizePhone(ph.number || ""); upd[pair[1]] = up(ph.tag || ""); });
        }
        if (p.seat_no !== undefined) upd.seat_no = up(p.seat_no);
        if (p.shift !== undefined) upd.shift = up(p.shift);
        if (p.shift_name !== undefined) upd.shift_name = up(p.shift_name);
        if (p.shift_time !== undefined) upd.shift_time = up(p.shift_time);
        if (p.booking_from !== undefined) upd.booking_from = toIsoDateW(p.booking_from);
        if (p.booking_to !== undefined) upd.booking_to = toIsoDateW(p.booking_to);
        if (p.receipt_date !== undefined) upd.receipt_date = toIsoDateW(p.receipt_date);
        if (p.fee !== undefined) upd.fee = num(p.fee);

        // pay_modes — array length authoritative; slots beyond it cleared; RULE 3 re-derive fees_mode
        if (p.pay_modes) {
          const arr = Array.isArray(p.pay_modes) ? p.pay_modes : [];
          for (let n = 0; n < 3; n++) {
            const slot = arr[n] || { mode: "", amount: "" };
            const k = n + 1;
            const modeVal = up(slot.mode || "");
            upd["pay_mode_" + k] = modeVal;
            upd["pay_amount_" + k] = (slot.amount === "" || slot.amount === undefined || slot.amount === null) ? null : num(slot.amount);
            upd["pay_fees_mode_" + k] = modeVal ? _feesModeForTag(modeVal, tagMap) : "";
            if (!modeVal) { upd["pay_mode_" + k + "_date"] = null; upd["pay_mode_" + k + "_s_date"] = null; }
            else if (slot.date) { const mi = toIsoDateW(slot.date); upd["pay_mode_" + k + "_date"] = mi; upd["pay_mode_" + k + "_s_date"] = _addSettlementDaysW(mi, modeVal, tagMap); }
          }
        }

        // dues-aware fee/balance (balance owned by the dues ledger)
        if (p.fees_due !== undefined) {
          const newFeesDue = num(p.fees_due);
          const alreadyReceived = await _sumDuesReceivedW(tx, target);
          if (alreadyReceived > 0) {
            const newBalance = newFeesDue - alreadyReceived;
            if (newBalance < 0) return { ok: false, error: "Fees due (₹" + newFeesDue + ") can't be below the ₹" + alreadyReceived + " already collected via dues. Adjust on the Dues page instead." };
            upd.fees_due = newFeesDue; upd.fees_due_balance = newBalance; upd.dues_status = newBalance > 0 ? "PENDING" : "";
          } else {
            upd.fees_due = newFeesDue; upd.fees_due_balance = newFeesDue; upd.dues_status = newFeesDue > 0 ? "PENDING" : "";
          }
        } else if (p.fees_due_balance !== undefined) {
          const alreadyReceived = await _sumDuesReceivedW(tx, target);
          if (alreadyReceived > 0) return { ok: false, error: "Balance is managed by the Dues ledger for this receipt (₹" + alreadyReceived + " already collected). Edit payments on the Dues page." };
          upd.fees_due_balance = num(p.fees_due_balance);
        } else if (p.fee !== undefined) {
          const newFee = num(p.fee);
          const effPaid = p.pay_modes
            ? [0, 1, 2].reduce((a, i) => { const s = (p.pay_modes as any[])[i]; return a + ((s && s.amount !== "" && s.amount != null) ? num(s.amount) : 0); }, 0)
            : [1, 2, 3].reduce((a, k) => a + num(existing["pay_amount_" + k]), 0);
          const alreadyReceived = await _sumDuesReceivedW(tx, target);
          const newFeesDue = Math.max(0, newFee - effPaid);
          const newBalance = Math.max(0, newFeesDue - alreadyReceived);
          upd.fees_due = newFeesDue; upd.fees_due_balance = newBalance; upd.dues_status = newBalance > 0 ? "PENDING" : "";
        }

        if (p.type !== undefined) upd.type = up(p.type);
        if (p.renewed_from !== undefined) upd.renewed_from = up(p.renewed_from);
        if (p.dues_status !== undefined) upd.dues_status = up(p.dues_status);
        if (p.irrecoverable_remark !== undefined) upd.irrecoverable_remark = String(p.irrecoverable_remark);
        if (p.remark !== undefined) upd.remark = String(p.remark);

        if (Object.keys(upd).length) {
          await tx`update receipt_log set ${tx(upd)} where upper(receipt_no)=${target}`;
        }

        // regenerate + persist receipt/registration texts from the updated row
        const afterRows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1`) as any[];
        const after = afterRows[0];
        const regen = await _regenerateReceiptTextsW(tx, after);
        await tx`update receipt_log set receipt_text=${regen.receipt_text}, registration_text=${regen.registration_text} where upper(receipt_no)=${target}`;
        after.receipt_text = regen.receipt_text; after.registration_text = regen.registration_text;

        // Item 14 — cascade name to the master students row (opt-in)
        let cascade_name_done = false;
        if (p.cascade_name_to_student === true && p.name !== undefined) {
          const oldName = String(existing.name ?? "").trim();
          const newName = up(p.name).trim();
          if (oldName !== newName) {
            const sid = up(existing.student_id ?? ""), slib = up(existing.library ?? "");
            if (sid && slib) {
              const cr = await tx`update students set name=${newName} where upper(student_id)=${sid} and upper(library)=${slib}`;
              cascade_name_done = (cr as any).count > 0;
            }
          }
        }
        return { ok: true, existing, after, regen, cascade_name_done };
      });
    } catch (e: any) {
      const code = String(e?.code || ""); const msg = String(e?.message || "");
      if (code === "23505" || /seat_occupancy/i.test(msg)) return { ok: false, error: "That seat/shift is already taken. Refresh and pick another." };
      throw e;
    }

    if (main.ok === false) return main;
    const { existing, after, regen, cascade_name_done } = main;

    // AUDIT + event WhatsApp — best-effort, never blocks the committed edit
    let eventWa = "";
    try {
      const changes = _computeReceiptChanges(existing, after);
      if (changes.length) eventWa = await buildEventWhatsAppW(after, "RECEIPT_UPDATED", { changes });
    } catch { /* ignore */ }
    try {
      await logReceiptEditW({ receipt_no: target, before: existing, after, remark: p.editor_remark || "", whatsapp_text: eventWa });
    } catch { /* audit must never block the edit */ }

    return { updated: true, receipt_text: regen.receipt_text, registration_text: regen.registration_text, whatsapp_text: eventWa, cascade_name_done };
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  14_SeatBlocks.gs → addSeatBlock / removeSeatBlock /
  //                tempVacateSeat / reAllotSeat
  // STAGED ONLY: none added to PG_ACTIONS yet (dormant until cutover).
  // seat_blocks: block_id is scan-based (not s_no) → plain insert, identity
  //   auto-generates s_no. Only the 11 live columns are written (HOLD-specific
  //   columns aren't in the migrated schema — matches GAS's guarded skip).
  // ════════════════════════════════════════════════════════════════════

  // next block id: max numeric suffix + 1 → "BLK<n>" — mirror 14_SeatBlocks _nextBlockId
  async function _nextBlockIdW(tx: any): Promise<string> {
    const rows = (await tx`select block_id from seat_blocks`) as any[];
    let max = 0;
    for (const r of rows) { const m = String(r.block_id ?? "").match(/(\d+)/); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    return "BLK" + (max + 1);
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: addSeatBlock  (BLOCK walls off a seat; HOLD is a soft reserve)
  // ════════════════════════════════════════════════════════════════════
  async function addSeatBlock(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    if (!p.seat_display_label) throw new Error("seat_display_label is required.");
    const shiftBlocked = normShift(p.shift_blocked || "FULL DAY");
    const holdType = up(p.hold_type || "BLOCK");
    if (holdType !== "BLOCK" && holdType !== "HOLD") throw new Error("hold_type must be BLOCK or HOLD.");
    const holdAdmitType = up(p.hold_admit_type || "");
    if (holdType === "HOLD" && holdAdmitType && holdAdmitType !== "NEW" && holdAdmitType !== "RENEWAL") throw new Error("hold_admit_type must be NEW or RENEWAL.");

    const lib = up(p.library_code);
    const branch = up(p.branch_code || "");
    const label = up(String(p.seat_display_label).trim());

    // collision guard (BLOCK only) — refuse if the shift is already booked/blocked
    if (holdType === "BLOCK") {
      const avail = await _isSeatAvailableW(lib, branch, label, shiftBlocked, "");
      if (!avail.available) return { ok: false, error: avail.reason || ("Seat " + p.seat_display_label + " is not free for " + shiftBlocked + ".") };
    }

    try {
      return await sql.begin(async (tx: any) => {
        const blockId = await _nextBlockIdW(tx);
        await tx`insert into seat_blocks
          (block_id, library_code, branch_code, seat_display_label, shift_blocked, block_from, block_to, reason, created_at, active)
          values (${blockId}, ${lib}, ${branch}, ${label}, ${shiftBlocked}, ${toIsoDateW(p.block_from)}, ${toIsoDateW(p.block_to)}, ${String(p.reason || "")}, ${nowTsIst()}, ${true})`;
        return { added: true, block_id: blockId, hold_type: holdType };
      });
    } catch (e: any) {
      const code = String(e?.code || ""); const msg = String(e?.message || "");
      if (code === "23505" || /seat_occupancy|seat_blocks/i.test(msg)) return { ok: false, error: "Seat " + p.seat_display_label + " is already taken/blocked for " + shiftBlocked + "." };
      throw e;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: removeSeatBlock  (SOFT delete — active=false, history kept)
  // ════════════════════════════════════════════════════════════════════
  async function removeSeatBlock(p: any): Promise<any> {
    if (!p || !p.block_id) throw new Error("block_id is required.");
    const target = up(p.block_id);
    const r = (await sql`update seat_blocks set active=false where upper(block_id)=${target}`) as any;
    if (!r.count) return { ok: false, error: "Block not found: " + p.block_id };
    return { removed: true, block_id: target };
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: tempVacateSeat  (park a live receipt off its seat; seat frees via trigger)
  // ════════════════════════════════════════════════════════════════════
  async function tempVacateSeat(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    const main = await sql.begin(async (tx: any) => {
      const rows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Receipt not found: " + p.receipt_no };
      const before = rows[0];
      const status = up(before.status ?? "");
      const seatNo = String(before.seat_no ?? "").trim();
      const tempSeat = String(before.temporary_seat ?? "").trim();
      if (status) return { ok: false, error: "Receipt " + p.receipt_no + " is not live (status=" + status + "). Only active receipts can be temp-vacated." };
      if (tempSeat) return { ok: false, error: "Receipt " + p.receipt_no + " is already temp-vacated (held seat " + tempSeat + ")." };
      if (!seatNo) return { ok: false, error: "Receipt " + p.receipt_no + " has no seat to vacate." };
      await tx`update receipt_log set temporary_seat=${seatNo}, seat_no='' where upper(receipt_no)=${target}`;
      const afterRows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1`) as any[];
      return { ok: true, before, after: afterRows[0], seatNo };
    });
    if (main.ok === false) return main;
    const { before, after, seatNo } = main;
    let waText = "";
    try { waText = await buildEventWhatsAppW(after, "TEMP_VACATED", { fromSeat: seatNo }); } catch { /* ignore */ }
    try { await logReceiptEditW({ receipt_no: target, before, after, remark: p.editor_remark || ("Temp-vacate (seat " + seatNo + " parked)"), whatsapp_text: waText }); } catch { /* audit best-effort */ }
    return { vacated: true, receipt_no: target, original_seat: seatNo, whatsapp_text: waText };
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLER: reAllotSeat  (RESTORE a floating receipt, or MOVE a seated one)
  // ════════════════════════════════════════════════════════════════════
  async function reAllotSeat(p: any): Promise<any> {
    if (!p || !p.receipt_no) throw new Error("receipt_no is required.");
    const target = up(p.receipt_no);
    let main: any;
    try {
      main = await sql.begin(async (tx: any) => {
        const rows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1 for update`) as any[];
        if (!rows.length) return { ok: false, error: "Receipt not found: " + p.receipt_no };
        const before = rows[0];
        const status = up(before.status ?? "");
        if (status) return { ok: false, error: "Receipt " + p.receipt_no + " is not live (status=" + status + ")." };
        const library = up(before.library ?? ""), branch = up(before.branch ?? ""), shift = String(before.shift ?? "");
        const seatNo = String(before.seat_no ?? "").trim();
        const tempSeat = String(before.temporary_seat ?? "").trim();
        const wanted = up(String(p.seat_no ?? "").trim());

        let tgt: string;
        if (tempSeat) {
          tgt = wanted || tempSeat; // RESTORE (default to original)
        } else {
          if (!seatNo) return { ok: false, error: "Receipt " + p.receipt_no + " has no seat and is not temp-vacated — nothing to re-allot." };
          if (!wanted) return { ok: false, error: "A target seat_no is required to move a seated student." };
          tgt = wanted; // MOVE
        }

        const chk = await _isSeatAvailableW(library, branch, tgt, shift, target);
        if (!chk.available) return { ok: false, error: chk.reason || ("Seat " + tgt + " is not available for " + shift + ".") };

        await tx`update receipt_log set seat_no=${tgt}, temporary_seat='' where upper(receipt_no)=${target}`;
        const afterRows = (await tx`select * from receipt_log where upper(receipt_no)=${target} limit 1`) as any[];
        const after = afterRows[0];
        const regen = await _regenerateReceiptTextsW(tx, after);
        await tx`update receipt_log set receipt_text=${regen.receipt_text}, registration_text=${regen.registration_text} where upper(receipt_no)=${target}`;
        after.receipt_text = regen.receipt_text; after.registration_text = regen.registration_text;
        return { ok: true, before, after, mode: tempSeat ? "RESTORE" : "MOVE", fromSeat: tempSeat || seatNo, tgt };
      });
    } catch (e: any) {
      const code = String(e?.code || ""); const msg = String(e?.message || "");
      if (code === "23505" || /seat_occupancy/i.test(msg)) return { ok: false, error: "That seat/shift is already taken. Refresh and pick another." };
      throw e;
    }
    if (main.ok === false) return main;
    const { before, after, mode, fromSeat, tgt } = main;
    let waText = "";
    try { waText = await buildEventWhatsAppW(after, "SEAT_CHANGED", { fromSeat, toSeat: tgt }); } catch { /* ignore */ }
    try { await logReceiptEditW({ receipt_no: target, before, after, remark: p.editor_remark || ("Re-allot (" + (mode === "RESTORE" ? "restore" : "move") + " \u2192 seat " + tgt + ")"), whatsapp_text: waText }); } catch { /* audit best-effort */ }
    return { reallotted: true, receipt_no: target, seat_no: tgt, mode, from_seat: fromSeat, whatsapp_text: waText };
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  CRUD sweep:
  //   04_Students.gs   → addStudent, updateStudent
  //   07_MiscIncome.gs → addMiscIncome, updateMiscIncome, deleteMiscIncome, restoreMiscIncome
  //   08_Refunds.gs    → updateRefund, deleteRefund
  //   14_SeatBlocks.gs → updateSeatBlock
  // STAGED ONLY: none added to PG_ACTIONS yet (dormant until cutover).
  // s_no is GENERATED ALWAYS everywhere → never set on insert (identity auto).
  // ════════════════════════════════════════════════════════════════════

  // month label "MMMM yyyy" (e.g. "August 2026") — mirror 02_Helpers fmtMonth
  const _MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function fmtMonthW(d: Date): string {
    if (!d || isNaN(d.getTime())) return "";
    return _MONTHS_FULL[d.getMonth()] + " " + d.getFullYear();
  }

  // ── STUDENTS ─────────────────────────────────────────────────────────
  async function addStudent(p: any): Promise<any> {
    if (!p || !p.name) throw new Error("Student name is required.");
    if (!p.library) throw new Error("Library is required.");
    const targetLib = up(p.library);
    const phones = p.phones || [];
    try {
      return await sql.begin(async (tx: any) => {
        let studentId = up(p.student_id || "");
        if (!studentId) { const n = await _nextCounterTx(tx, targetLib, "last_student_id"); studentId = "F" + n; }
        const srow: Record<string, any> = {
          student_id: studentId,
          library: targetLib,
          branch: p.has_branches ? up(p.branch || "") : "",
          name: up(p.name),
          phone: normalizePhone(phones[0]?.number || ""), phone_tag: up(phones[0]?.tag || ""),
          phone2: normalizePhone(phones[1]?.number || ""), phone2_tag: up(phones[1]?.tag || ""),
          phone3: normalizePhone(phones[2]?.number || ""), phone3_tag: up(phones[2]?.tag || ""),
          phone4: normalizePhone(phones[3]?.number || ""), phone4_tag: up(phones[3]?.tag || ""),
          added_on: nowTsIst(),
          address: up(p.address || ""),
          preparing_for: up(p.preparing_for || ""),
          aadhaar_last4: String(p.aadhaar_last4 || "").replace(/\D/g, "").slice(0, 4),
          date_of_birth: p.date_of_birth ? toIsoDateW(p.date_of_birth) : null,
          gender: up(p.gender || ""),
          is_past: tobool(p.is_past),
        };
        await tx`insert into students ${tx(srow)}`;
        return { added: true, student_id: studentId };
      });
    } catch (e: any) {
      const code = String(e?.code || ""); const msg = String(e?.message || "");
      if (code === "23505" || /students/i.test(msg)) return { ok: false, error: "Student ID already exists in " + targetLib + "." };
      throw e;
    }
  }

  async function updateStudent(p: any): Promise<any> {
    if (!p || !p.student_id) throw new Error("student_id is required.");
    if (!p.library) throw new Error("library is required for safe matching.");
    const targetId = up(p.student_id), targetLib = up(p.library);
    const upd: Record<string, any> = {};
    for (const f of ["name", "address", "preparing_for", "aadhaar_last4", "gender"]) if (p[f] !== undefined) upd[f] = up(p[f]);
    if (p.date_of_birth !== undefined) upd.date_of_birth = p.date_of_birth ? toIsoDateW(p.date_of_birth) : null;
    if (p.phones) {
      const pf = [["phone", "phone_tag"], ["phone2", "phone2_tag"], ["phone3", "phone3_tag"], ["phone4", "phone4_tag"]];
      pf.forEach((pair, j) => { const ph = p.phones[j] || { number: "", tag: "" }; upd[pair[0]] = normalizePhone(ph.number || ""); upd[pair[1]] = up(ph.tag || ""); });
    }
    if (p.branch !== undefined) upd.branch = (p.has_branches === false) ? "" : up(p.branch || "");
    // is_past is IMMUTABLE — silently ignored
    if (!Object.keys(upd).length) return { updated: true };
    const r = (await sql`update students set ${sql(upd)} where upper(student_id)=${targetId} and upper(library)=${targetLib}`) as any;
    if (!r.count) return { ok: false, error: "Student not found: " + targetId + " in " + targetLib };
    return { updated: true };
  }

  // ── MISC INCOME ──────────────────────────────────────────────────────
  async function addMiscIncome(p: any): Promise<any> {
    if (!p) throw new Error("Payload required.");
    if (!p.library) throw new Error("library is required.");
    if (!p.payment_tag) throw new Error("payment_tag is required.");
    if (p.amount === undefined || p.amount === null || p.amount === "") throw new Error("amount is required.");
    const tagMap = await _loadTagMap();
    const dateObj = p.date ? parseDateFlexible(p.date) : parseDateFlexible(todayIsoIst());
    const dateStr = toIsoDateW(dateObj);
    const monthStr = fmtMonthW(dateObj);
    const ins = (await sql`insert into misc_income
      (timestamp, date, month, library, branch, amount, payment_tag, fees_mode, settlement_date, category, remark)
      values (${nowTsIst()}, ${dateStr}, ${monthStr}, ${up(p.library)}, ${up(p.branch || "")}, ${num(p.amount)}, ${up(p.payment_tag)}, ${_feesModeForTag(p.payment_tag, tagMap)}, ${_addSettlementDaysW(dateStr, p.payment_tag, tagMap)}, ${up(p.category || "OTHER")}, ${String(p.remark || "")})
      returning s_no`) as any[];
    return { added: true, s_no: num(ins[0].s_no) };
  }

  async function updateMiscIncome(p: any): Promise<any> {
    if (!p || p.s_no === undefined || p.s_no === null) throw new Error("s_no is required.");
    const targetSno = num(p.s_no);
    const tagMap = await _loadTagMap();
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select * from misc_income where s_no=${targetSno} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Misc income entry not found: s_no=" + targetSno };
      const cur = rows[0];
      const upd: Record<string, any> = {};
      let effDate = String(cur.date ?? "");
      if (p.date !== undefined) { const d = parseDateFlexible(p.date); upd.date = toIsoDateW(d); upd.month = fmtMonthW(d); effDate = String(upd.date ?? ""); }
      if (p.library !== undefined) upd.library = up(p.library);
      if (p.branch !== undefined) upd.branch = up(p.branch);
      if (p.amount !== undefined) upd.amount = num(p.amount);
      let effTag = up(cur.payment_tag ?? "");
      if (p.payment_tag !== undefined) { upd.payment_tag = up(p.payment_tag); upd.fees_mode = _feesModeForTag(p.payment_tag, tagMap); effTag = up(p.payment_tag); }
      if (p.category !== undefined) upd.category = up(p.category);
      if (p.remark !== undefined) upd.remark = String(p.remark);
      upd.settlement_date = _addSettlementDaysW(effDate, effTag, tagMap);
      const ts = String(cur.timestamp ?? "");
      if (ts && ts.indexOf("(EDITED)") < 0) upd.timestamp = ts + " (EDITED)";
      await tx`update misc_income set ${tx(upd)} where s_no=${targetSno}`;
      return { updated: true };
    });
  }

  async function deleteMiscIncome(p: any): Promise<any> {
    if (!p || p.s_no === undefined || p.s_no === null) throw new Error("s_no is required.");
    const targetSno = num(p.s_no);
    const r = (await sql`update misc_income set status='DELETED', delete_reason=${String(p.reason || "")}, deleted_on=${todayIsoIst()} where s_no=${targetSno}`) as any;
    if (!r.count) return { ok: false, error: "Misc income entry not found: s_no=" + targetSno };
    return { deleted: true, soft: true };
  }

  async function restoreMiscIncome(p: any): Promise<any> {
    if (!p || p.s_no === undefined || p.s_no === null) throw new Error("s_no is required.");
    const targetSno = num(p.s_no);
    const r = (await sql`update misc_income set status='', delete_reason='', deleted_on=${null} where s_no=${targetSno}`) as any;
    if (!r.count) return { ok: false, error: "Misc income entry not found: s_no=" + targetSno };
    return { restored: true };
  }

  // ── REFUND edits ─────────────────────────────────────────────────────
  async function updateRefund(p: any): Promise<any> {
    if (!p || !p.refund_id) throw new Error("refund_id is required.");
    const target = up(p.refund_id);
    const tagMap = await _loadTagMap();
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select * from refund_log where upper(refund_id)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Refund not found: " + p.refund_id };
      const upd: Record<string, any> = {};
      if (p.refund_mode !== undefined) { upd.refund_mode = up(p.refund_mode); upd.refund_fees_mode = _feesModeForTag(p.refund_mode, tagMap); }
      if (p.amount !== undefined) upd.amount = num(p.amount);
      if (p.refund_date !== undefined) upd.refund_date = String(p.refund_date);
      if (p.refund_reason !== undefined) upd.refund_reason = String(p.refund_reason);
      if (Object.keys(upd).length) await tx`update refund_log set ${tx(upd)} where upper(refund_id)=${target}`;

      const fresh = ((await tx`select * from refund_log where upper(refund_id)=${target} limit 1`) as any[])[0];
      const originalReceipt = up(fresh.original_receipt_no ?? "");
      const recRows = (await tx`select * from receipt_log where upper(receipt_no)=${originalReceipt} limit 1`) as any[];
      if (recRows.length) {
        const libName = await _lookupLibraryNameW(up(recRows[0].library ?? ""));
        const whatsappText = _buildRefundWhatsAppW(recRows[0], libName, {
          refundId: up(fresh.refund_id ?? ""), amount: num(fresh.amount), refundMode: up(fresh.refund_mode ?? ""),
          refundDate: String(fresh.refund_date ?? ""), refundReason: String(fresh.refund_reason ?? ""),
          linkedToCancellation: tobool(fresh.linked_to_cancellation),
        });
        await tx`update refund_log set refund_whatsapp_text=${whatsappText} where upper(refund_id)=${target}`;
      }
      const ts = String(fresh.timestamp ?? "");
      if (ts && ts.indexOf("(EDITED)") < 0) await tx`update refund_log set timestamp=${ts + " (EDITED)"} where upper(refund_id)=${target}`;
      if (originalReceipt) await _refreshReceiptTextsW(tx, originalReceipt);
      return { updated: true };
    });
  }

  async function deleteRefund(p: any): Promise<any> {
    if (!p || !p.refund_id) throw new Error("refund_id is required.");
    const target = up(p.refund_id);
    return await sql.begin(async (tx: any) => {
      const del = (await tx`delete from refund_log where upper(refund_id)=${target} returning original_receipt_no`) as any[];
      if (!del.length) return { ok: false, error: "Refund not found: " + p.refund_id };
      const affected = up(del[0].original_receipt_no ?? "");
      if (affected) await _refreshReceiptTextsW(tx, affected);
      return { deleted: true };
    });
  }

  // ── SEAT BLOCK edit ──────────────────────────────────────────────────
  async function updateSeatBlock(p: any): Promise<any> {
    if (!p || !p.block_id) throw new Error("block_id is required.");
    const target = up(p.block_id);
    const upd: Record<string, any> = {};
    if (p.seat_display_label !== undefined) upd.seat_display_label = up(String(p.seat_display_label).trim());
    if (p.shift_blocked !== undefined) upd.shift_blocked = normShift(p.shift_blocked);
    if (p.block_from !== undefined) upd.block_from = toIsoDateW(p.block_from);
    if (p.block_to !== undefined) upd.block_to = toIsoDateW(p.block_to);
    if (p.reason !== undefined) upd.reason = String(p.reason);
    if (p.active !== undefined) upd.active = tobool(p.active);
    if (!Object.keys(upd).length) return { updated: true, block_id: target };
    try {
      const r = (await sql`update seat_blocks set ${sql(upd)} where upper(block_id)=${target}`) as any;
      if (!r.count) return { ok: false, error: "Block not found: " + p.block_id };
      return { updated: true, block_id: target };
    } catch (e: any) {
      const code = String(e?.code || ""); const msg = String(e?.message || "");
      if (code === "23505" || /seat_occupancy|seat_blocks/i.test(msg)) return { ok: false, error: "That seat/shift is already taken/blocked." };
      throw e;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  13_SeatLayouts.gs → saveSeatSection / deleteSeatSection /
  //                addOrUpdateSeat / removeSeat   +   04_Students.gs →
  //                updateOptional / deleteStudent
  // STAGED ONLY: none added to PG_ACTIONS yet (dormant until cutover).
  // seat_layouts: s_no auto (identity), active is BOOLEAN, cell_type exists.
  // ════════════════════════════════════════════════════════════════════

  // ── SEAT LAYOUTS ─────────────────────────────────────────────────────
  async function saveSeatSection(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    if (!p.section_name) throw new Error("section_name is required.");
    if (!Array.isArray(p.seats)) throw new Error("seats array is required.");
    const lib = up(p.library_code), branch = up(p.branch_code || ""), sec = String(p.section_name).trim();
    const secOrder = num(p.section_order) || 1;

    // in-payload label uniqueness (SEAT cells only; DEAD cells skip labels)
    const labelSet: Record<string, boolean> = {};
    p.seats.forEach((s: any, idx: number) => {
      if (up(s.cell_type || "SEAT") === "DEAD") return;
      const label = String(s.display_label || "").trim();
      if (!label) throw new Error("Seat #" + (idx + 1) + " has no display_label.");
      if (labelSet[label]) throw new Error("Duplicate display_label '" + label + "' within section.");
      labelSet[label] = true;
    });

    return await sql.begin(async (tx: any) => {
      // 1. wipe this section
      await tx`delete from seat_layouts where upper(library_code)=${lib} and upper(coalesce(branch_code,''))=${branch} and trim(section_name)=${sec}`;
      // 2. collision vs OTHER sections (remaining rows)
      if (Object.keys(labelSet).length) {
        const others = (await tx`select display_label from seat_layouts where upper(library_code)=${lib} and upper(coalesce(branch_code,''))=${branch} and upper(coalesce(cell_type,'SEAT'))<>'DEAD'`) as any[];
        for (const o of others) { const ol = String(o.display_label ?? "").trim(); if (ol && labelSet[ol]) throw new Error("display_label '" + ol + "' already exists in another section of this library."); }
      }
      // 3. insert fresh (s_no auto)
      for (const s of p.seats) {
        const cellType = up(s.cell_type || "SEAT");
        await tx`insert into seat_layouts
          (library_code, branch_code, section_name, section_order, row_in_section, col_in_section, seat_no, display_label, active, notes, cell_type)
          values (${lib}, ${branch}, ${sec}, ${secOrder}, ${num(s.row_in_section)}, ${num(s.col_in_section)}, ${cellType === "DEAD" ? null : num(s.seat_no)}, ${cellType === "DEAD" ? "" : String(s.display_label || "").trim()}, ${true}, ${String(s.notes || "")}, ${cellType})`;
      }
      return { saved: true, section_name: sec, seat_count: p.seats.length };
    });
  }

  async function deleteSeatSection(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    if (!p.section_name) throw new Error("section_name is required.");
    const lib = up(p.library_code), branch = up(p.branch_code || ""), sec = String(p.section_name).trim();
    const r = (await sql`delete from seat_layouts where upper(library_code)=${lib} and upper(coalesce(branch_code,''))=${branch} and trim(section_name)=${sec}`) as any;
    return { deleted: r.count };
  }

  async function addOrUpdateSeat(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    if (!p.section_name) throw new Error("section_name is required.");
    if (p.row_in_section === undefined || p.col_in_section === undefined) throw new Error("row_in_section and col_in_section are required.");
    const cellType = up(p.cell_type || "SEAT");
    if (cellType === "SEAT" && !p.display_label) throw new Error("display_label is required for seat cells.");
    const lib = up(p.library_code), branch = up(p.branch_code || ""), sec = String(p.section_name).trim();
    const tRow = num(p.row_in_section), tCol = num(p.col_in_section);
    const newLabel = cellType === "DEAD" ? "" : String(p.display_label || "").trim();
    const secOrder = num(p.section_order) || 1;

    return await sql.begin(async (tx: any) => {
      if (cellType === "SEAT" && newLabel) {
        const clash = (await tx`select 1 from seat_layouts
          where upper(library_code)=${lib} and upper(coalesce(branch_code,''))=${branch}
            and upper(coalesce(cell_type,'SEAT'))='SEAT' and trim(display_label)=${newLabel}
            and not (trim(section_name)=${sec} and row_in_section=${tRow} and col_in_section=${tCol}) limit 1`) as any[];
        if (clash.length) throw new Error("display_label '" + newLabel + "' is already used elsewhere in this library.");
      }
      const ex = (await tx`select s_no from seat_layouts where upper(library_code)=${lib} and upper(coalesce(branch_code,''))=${branch} and trim(section_name)=${sec} and row_in_section=${tRow} and col_in_section=${tCol} limit 1`) as any[];
      if (ex.length) {
        await tx`update seat_layouts set section_order=${secOrder}, seat_no=${cellType === "DEAD" ? null : num(p.seat_no)}, display_label=${newLabel}, notes=${String(p.notes || "")}, active=${true}, cell_type=${cellType} where s_no=${num(ex[0].s_no)}`;
        return { updated: true, display_label: newLabel, cell_type: cellType };
      }
      await tx`insert into seat_layouts
        (library_code, branch_code, section_name, section_order, row_in_section, col_in_section, seat_no, display_label, active, notes, cell_type)
        values (${lib}, ${branch}, ${sec}, ${secOrder}, ${tRow}, ${tCol}, ${cellType === "DEAD" ? null : num(p.seat_no)}, ${newLabel}, ${true}, ${String(p.notes || "")}, ${cellType})`;
      return { added: true, display_label: newLabel, cell_type: cellType };
    });
  }

  async function removeSeat(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    if (!p.section_name) throw new Error("section_name is required.");
    if (p.row_in_section === undefined || p.col_in_section === undefined) throw new Error("row_in_section and col_in_section are required.");
    const lib = up(p.library_code), branch = up(p.branch_code || ""), sec = String(p.section_name).trim();
    const r = (await sql`delete from seat_layouts where upper(library_code)=${lib} and upper(coalesce(branch_code,''))=${branch} and trim(section_name)=${sec} and row_in_section=${num(p.row_in_section)} and col_in_section=${num(p.col_in_section)}`) as any;
    if (!r.count) return { removed: false, error: "Seat not found at that cell." };
    return { removed: true };
  }

  // ── STUDENTS (minor) ─────────────────────────────────────────────────
  async function updateOptional(p: any): Promise<any> {
    if (!p || !p.student_id) throw new Error("student_id is required.");
    if (!p.library) throw new Error("library is required.");
    const targetId = up(p.student_id), targetLib = up(p.library);
    const upd: Record<string, any> = {};
    for (const f of ["address", "preparing_for", "aadhaar_last4"]) if (p[f] !== undefined) upd[f] = up(p[f]);
    if (p.date_of_birth !== undefined) upd.date_of_birth = p.date_of_birth ? toIsoDateW(p.date_of_birth) : null;
    if (!Object.keys(upd).length) return { updated: true };
    const r = (await sql`update students set ${sql(upd)} where upper(student_id)=${targetId} and upper(library)=${targetLib}`) as any;
    if (!r.count) return { ok: false, error: "Student not found." };
    return { updated: true };
  }

  async function deleteStudent(p: any): Promise<any> {
    if (!p || !p.student_id) throw new Error("student_id is required.");
    if (!p.library) throw new Error("library is required.");
    const targetId = up(p.student_id), targetLib = up(p.library);
    const r = (await sql`delete from students where upper(student_id)=${targetId} and upper(library)=${targetLib}`) as any;
    if (!r.count) return { ok: false, error: "Student not found." };
    return { deleted: true };
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  09_Admin.gs  (config CRUD): libraries / branches /
  //   shifts / payment_tags / fees / settings  (14 writes + helpers)
  // STAGED ONLY: none added to PG_ACTIONS yet (dormant until cutover).
  // active / has_branches are BOOLEAN. Dependency counts are advisory only.
  // ════════════════════════════════════════════════════════════════════

  // seed a settings row (zero counters) if missing — mirror 09_Admin _ensureSettingsRow
  async function _ensureSettingsRowTx(tx: any, libraryCode: string): Promise<void> {
    const code = up(libraryCode);
    await tx`insert into settings (library, last_student_id, last_receipt_no, cutoff_student_id, cutoff_receipt_no)
      select ${code}, 0, 0, 0, 0 where not exists (select 1 from settings where upper(library)=${code})`;
  }

  // advisory dependency counters — mirror 09_Admin _count* helpers
  async function _countLibraryDepsW(tx: any, code: string): Promise<number> {
    const c = up(code);
    const a = (await tx`select count(*)::int n from students where upper(library)=${c}`) as any[];
    const b = (await tx`select count(*)::int n from receipt_log where upper(library)=${c} or upper(coalesce(branch,''))=${c} or upper(coalesce(is_cross_library,''))=${c}`) as any[];
    const d = (await tx`select count(*)::int n from fees_due_log where upper(library)=${c} or upper(coalesce(branch,''))=${c}`) as any[];
    const e = (await tx`select count(*)::int n from misc_income where upper(library)=${c} or upper(coalesce(branch,''))=${c}`) as any[];
    return a[0].n + b[0].n + d[0].n + e[0].n;
  }
  async function _countBranchDepsW(tx: any, code: string): Promise<number> {
    const c = up(code);
    const a = (await tx`select count(*)::int n from students where upper(coalesce(branch,''))=${c}`) as any[];
    const b = (await tx`select count(*)::int n from receipt_log where upper(coalesce(branch,''))=${c} or upper(coalesce(is_cross_library,''))=${c}`) as any[];
    const d = (await tx`select count(*)::int n from fees_due_log where upper(coalesce(branch,''))=${c}`) as any[];
    const e = (await tx`select count(*)::int n from misc_income where upper(coalesce(branch,''))=${c}`) as any[];
    return a[0].n + b[0].n + d[0].n + e[0].n;
  }
  async function _countShiftDepsW(tx: any, key: string): Promise<number> {
    const k = up(key);
    const r = (await tx`select count(*)::int n from receipt_log where upper(coalesce(shift,''))=${k}`) as any[];
    return r[0].n;
  }
  async function _countBranchOrphansW(tx: any, libraryCode: string, newHasBranches: boolean): Promise<number> {
    const lib = up(libraryCode);
    const cond = newHasBranches
      ? tx`(branch is null or trim(branch)='')`
      : tx`(trim(coalesce(branch,''))<>'')`;
    const a = (await tx`select count(*)::int n from students where upper(library)=${lib} and ${cond}`) as any[];
    const b = (await tx`select count(*)::int n from receipt_log where upper(library)=${lib} and ${cond}`) as any[];
    const d = (await tx`select count(*)::int n from fees_due_log where upper(library)=${lib} and ${cond}`) as any[];
    return a[0].n + b[0].n + d[0].n;
  }

  // ── LIBRARIES ────────────────────────────────────────────────────────
  async function addLibrary(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    if (!p.library_name) throw new Error("library_name is required.");
    const code = String(p.library_code).toUpperCase().trim();
    if (/\s/.test(code)) throw new Error("library_code cannot contain spaces.");
    if (!/^[A-Z0-9_\-]+$/.test(code)) throw new Error("library_code: only A-Z, 0-9, _, - allowed.");
    return await sql.begin(async (tx: any) => {
      const dup = (await tx`select 1 from libraries where upper(library_code)=${code} limit 1`) as any[];
      if (dup.length) return { ok: false, error: "library_code already exists: " + code };
      await tx`insert into libraries (library_code, library_name, display_name, active, has_branches, emoji, address, contact, color)
        values (${code}, ${String(p.library_name).toUpperCase().trim()}, ${String(p.display_name || p.library_name).toUpperCase().trim()}, ${p.active === false ? false : true}, ${tobool(p.has_branches)}, ${String(p.emoji || "\uD83D\uDCDA")}, ${String(p.address || "").trim()}, ${String(p.contact || "").trim()}, ${String(p.color || "")})`;
      await _ensureSettingsRowTx(tx, code);
      return { added: true, library_code: code };
    });
  }
  async function updateLibrary(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    const target = up(p.library_code);
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select * from libraries where upper(library_code)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Library not found: " + target };
      const cur = rows[0];
      const upd: Record<string, any> = {};
      if (p.library_name !== undefined) upd.library_name = String(p.library_name).toUpperCase().trim();
      if (p.display_name !== undefined) upd.display_name = String(p.display_name).toUpperCase().trim();
      if (p.emoji !== undefined) upd.emoji = String(p.emoji);
      if (p.address !== undefined) upd.address = String(p.address).trim();
      if (p.contact !== undefined) upd.contact = String(p.contact).trim();
      if (p.color !== undefined) upd.color = String(p.color);
      let orphan_count = 0;
      if (p.has_branches !== undefined) {
        const currentVal = !!cur.has_branches, newVal = tobool(p.has_branches);
        if (currentVal !== newVal) { orphan_count = await _countBranchOrphansW(tx, target, newVal); upd.has_branches = newVal; }
      }
      if (Object.keys(upd).length) await tx`update libraries set ${tx(upd)} where upper(library_code)=${target}`;
      return { updated: true, orphan_count };
    });
  }
  async function toggleLibrary(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    const target = up(p.library_code);
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select active from libraries where upper(library_code)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Library not found: " + target };
      const newVal = !rows[0].active;
      let dependency_count = 0;
      if (!newVal) dependency_count = await _countLibraryDepsW(tx, target);
      await tx`update libraries set active=${newVal} where upper(library_code)=${target}`;
      return { toggled: true, active: newVal, dependency_count };
    });
  }

  // ── BRANCHES ─────────────────────────────────────────────────────────
  async function addBranch(p: any): Promise<any> {
    if (!p || !p.library_code) throw new Error("library_code is required.");
    if (!p.branch_code) throw new Error("branch_code is required.");
    if (!p.branch_display) throw new Error("branch_display is required.");
    const libCode = up(p.library_code);
    const brCode = String(p.branch_code).toUpperCase().trim();
    if (!/^[A-Z0-9_\-]+$/.test(brCode)) throw new Error("branch_code: only A-Z, 0-9, _, - allowed.");
    return await sql.begin(async (tx: any) => {
      const lib = (await tx`select 1 from libraries where upper(library_code)=${libCode} limit 1`) as any[];
      if (!lib.length) return { ok: false, error: "Parent library not found: " + libCode };
      const dup = (await tx`select 1 from library_branches where upper(branch_code)=${brCode} limit 1`) as any[];
      if (dup.length) return { ok: false, error: "branch_code already exists: " + brCode };
      await tx`insert into library_branches (library_code, branch_code, branch_display, address, contact, active, emoji, color)
        values (${libCode}, ${brCode}, ${String(p.branch_display).toUpperCase().trim()}, ${String(p.address || "").trim()}, ${String(p.contact || "").trim()}, ${p.active === false ? false : true}, ${String(p.emoji || "")}, ${String(p.color || "")})`;
      return { added: true, branch_code: brCode };
    });
  }
  async function updateBranch(p: any): Promise<any> {
    if (!p || !p.branch_code) throw new Error("branch_code is required.");
    const target = up(p.branch_code);
    const upd: Record<string, any> = {};
    if (p.branch_display !== undefined) upd.branch_display = String(p.branch_display).toUpperCase().trim();
    if (p.emoji !== undefined) upd.emoji = String(p.emoji);
    if (p.address !== undefined) upd.address = String(p.address).trim();
    if (p.contact !== undefined) upd.contact = String(p.contact).trim();
    if (p.color !== undefined) upd.color = String(p.color);
    if (!Object.keys(upd).length) return { updated: true };
    const r = (await sql`update library_branches set ${sql(upd)} where upper(branch_code)=${target}`) as any;
    if (!r.count) return { ok: false, error: "Branch not found: " + target };
    return { updated: true };
  }
  async function toggleBranch(p: any): Promise<any> {
    if (!p || !p.branch_code) throw new Error("branch_code is required.");
    const target = up(p.branch_code);
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select active from library_branches where upper(branch_code)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Branch not found: " + target };
      const newVal = !rows[0].active;
      let dependency_count = 0;
      if (!newVal) dependency_count = await _countBranchDepsW(tx, target);
      await tx`update library_branches set active=${newVal} where upper(branch_code)=${target}`;
      return { toggled: true, active: newVal, dependency_count };
    });
  }

  // ── SHIFTS ───────────────────────────────────────────────────────────
  async function addShift(p: any): Promise<any> {
    if (!p || !p.shift_key) throw new Error("shift_key is required.");
    if (!p.shift_name) throw new Error("shift_name is required.");
    const key = String(p.shift_key).toUpperCase().trim();
    if (!/^[A-Z0-9_\-\ ]+$/.test(key)) throw new Error("shift_key: only A-Z, 0-9, _, -, space allowed.");
    return await sql.begin(async (tx: any) => {
      const dup = (await tx`select 1 from shifts where upper(shift_key)=${key} limit 1`) as any[];
      if (dup.length) return { ok: false, error: "shift_key already exists: " + key };
      await tx`insert into shifts (shift_key, shift_name, shift_time, active)
        values (${key}, ${String(p.shift_name).toUpperCase().trim()}, ${String(p.shift_time || "").toUpperCase().trim()}, ${p.active === false ? false : true})`;
      return { added: true, shift_key: key };
    });
  }
  async function updateShift(p: any): Promise<any> {
    if (!p || !p.shift_key) throw new Error("shift_key is required.");
    const target = up(p.shift_key);
    const upd: Record<string, any> = {};
    if (p.shift_name !== undefined) upd.shift_name = String(p.shift_name).toUpperCase().trim();
    if (p.shift_time !== undefined) upd.shift_time = String(p.shift_time).toUpperCase().trim();
    if (!Object.keys(upd).length) return { updated: true };
    const r = (await sql`update shifts set ${sql(upd)} where upper(shift_key)=${target}`) as any;
    if (!r.count) return { ok: false, error: "Shift not found: " + target };
    return { updated: true };
  }
  async function toggleShift(p: any): Promise<any> {
    if (!p || !p.shift_key) throw new Error("shift_key is required.");
    const target = up(p.shift_key);
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select active from shifts where upper(shift_key)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Shift not found: " + target };
      const newVal = !rows[0].active;
      let dependency_count = 0;
      if (!newVal) dependency_count = await _countShiftDepsW(tx, target);
      await tx`update shifts set active=${newVal} where upper(shift_key)=${target}`;
      return { toggled: true, active: newVal, dependency_count };
    });
  }

  // ── PAYMENT TAGS ─────────────────────────────────────────────────────
  async function addPaymentTag(p: any): Promise<any> {
    if (!p || !p.tag_name) throw new Error("tag_name is required.");
    const name = String(p.tag_name).toUpperCase().trim();
    if (!/^[A-Z0-9_\-]+$/.test(name)) throw new Error("tag_name: only A-Z, 0-9, _, - allowed.");
    return await sql.begin(async (tx: any) => {
      const dup = (await tx`select 1 from fin.routes where upper(display_code)=${name} limit 1`) as any[];
      const bankCode = String(p.fees_mode || "").trim().toUpperCase();
      const bankOk = (await tx`select 1 from fin.accounts where upper(bank_code)=${bankCode} limit 1`) as any[];
      if (!bankOk.length) return { ok: false, error: "Unknown account code: " + bankCode + ". Add the account first." };
      if (dup.length) return { ok: false, error: "tag_name already exists: " + name };
      await tx`insert into fin.routes (display_code, bank_code, settlement_days, active_lma)
        values (${name}, ${bankCode}, ${Number(p.settlement_days || 0)}, ${p.active === false ? false : true})`;
      return { added: true, tag_name: name };
    });
  }
  async function updatePaymentTag(p: any): Promise<any> {
    if (!p || !p.tag_name) throw new Error("tag_name is required.");
    const target = up(p.tag_name);
    const upd: Record<string, any> = {};
    if (p.fees_mode !== undefined) upd.bank_code = String(p.fees_mode).trim().toUpperCase();
    if (p.settlement_days !== undefined) upd.settlement_days = Number(p.settlement_days) || 0;
    if (!Object.keys(upd).length) return { updated: true };
    if (upd.bank_code !== undefined) {
      const bankOk = (await sql`select 1 from fin.accounts where upper(bank_code)=${upd.bank_code} limit 1`) as any[];
      if (!bankOk.length) return { ok: false, error: "Unknown account code: " + upd.bank_code + ". Add the account first." };
    }
    const r = (await sql`update fin.routes set ${sql(upd)} where upper(display_code)=${target}`) as any;
    if (!r.count) return { ok: false, error: "Payment tag not found: " + target };
    return { updated: true };
  }
  async function togglePaymentTag(p: any): Promise<any> {
    if (!p || !p.tag_name) throw new Error("tag_name is required.");
    const target = up(p.tag_name);
    return await sql.begin(async (tx: any) => {
      const rows = (await tx`select active_lma as active from fin.routes where upper(display_code)=${target} limit 1 for update`) as any[];
      if (!rows.length) return { ok: false, error: "Payment tag not found: " + target };
      const newVal = !rows[0].active;
      await tx`update fin.routes set active_lma=${newVal} where upper(display_code)=${target}`;
      return { toggled: true, active: newVal };
    });
  }

  // ── FEES (upsert) ────────────────────────────────────────────────────
  async function updateFee(p: any): Promise<any> {
    if (!p || !p.fee_key) throw new Error("fee_key is required.");
    if (!p.shift_key) throw new Error("shift_key is required.");
    if (p.fee_amount === undefined || p.fee_amount === null) throw new Error("fee_amount is required.");
    const feeKey = up(p.fee_key), shiftKey = up(p.shift_key), amount = num(p.fee_amount);
    return await sql.begin(async (tx: any) => {
      const ex = (await tx`select s_no from library_fees where upper(fee_key)=${feeKey} and upper(shift_key)=${shiftKey} limit 1`) as any[];
      if (ex.length) { await tx`update library_fees set fee_amount=${amount} where s_no=${num(ex[0].s_no)}`; return { updated: true, action: "updated" }; }
      await tx`insert into library_fees (fee_key, shift_key, fee_amount) values (${feeKey}, ${shiftKey}, ${amount})`;
      return { added: true, action: "inserted" };
    });
  }

  // ── SETTINGS (raisable counters, set-once cutoffs, editable thresholds) ─
  async function updateSettings(p: any): Promise<any> {
    if (!p || !p.library) throw new Error("library is required.");
    const library = up(p.library);
    return await sql.begin(async (tx: any) => {
      let rows = (await tx`select * from settings where upper(library)=${library} limit 1 for update`) as any[];
      if (!rows.length) { await _ensureSettingsRowTx(tx, library); rows = (await tx`select * from settings where upper(library)=${library} limit 1 for update`) as any[]; }
      const cur = rows[0];
      const upd: Record<string, any> = {};
      const errors: string[] = [];
      for (const field of ["last_student_id", "last_receipt_no"]) {
        if (p[field] !== undefined) { const c = num(cur[field]), nv = num(p[field]); if (nv < c) errors.push(field + " cannot be lowered (current=" + c + ", attempted=" + nv + ")"); else upd[field] = nv; }
      }
      for (const field of ["cutoff_student_id", "cutoff_receipt_no"]) {
        if (p[field] !== undefined) { const c = num(cur[field]), nv = num(p[field]); if (c > 0) errors.push(field + " is already set to " + c + " and is immutable."); else upd[field] = nv; }
      }
      if (p.renewal_alert_days !== undefined || p.renewal_alert_days_primary !== undefined) {
        const curSec = num(cur.renewal_alert_days) || 5, curPri = num(cur.renewal_alert_days_primary) || 3;
        const sec = p.renewal_alert_days !== undefined ? num(p.renewal_alert_days) : curSec;
        const pri = p.renewal_alert_days_primary !== undefined ? num(p.renewal_alert_days_primary) : curPri;
        if (sec < 1 || sec > 60) errors.push("Expiring-soon days must be 1\u201360");
        else if (pri < 1 || pri > 60) errors.push("Urgent days must be 1\u201360");
        else if (pri > sec) errors.push("Urgent days (" + pri + ") cannot exceed expiring-soon days (" + sec + ")");
        else { upd.renewal_alert_days = sec; upd.renewal_alert_days_primary = pri; }
      }
      if (errors.length) return { ok: false, error: errors.join(" | ") };
      if (Object.keys(upd).length) await tx`update settings set ${tx(upd)} where upper(library)=${library}`;
      return { updated: true };
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // WRITE PHASE  —  17_Intake.gs  (B6 self-service admission intake)
  //   reads : intakeCheck, intakeFetch, intakeList
  //   writes: intakeSubmit, intakeMarkUsed, intakeGenerateCode, intakeVoid
  // STAGED ONLY: NONE added to PG_ACTIONS yet — enable the WHOLE module together
  //   (the flow couples read+write: owner's intakeFetch must see student's intakeSubmit).
  // C5 NOTES (deferred to the security pass):
  //   • the GAS CacheService circuit-breaker is omitted here — rate-limiting belongs
  //     in the API middleware/edge layer, not per-serverless-invocation.
  //   • intakeList still returns live codes (faithful to GAS) — harden in C5.
  // ════════════════════════════════════════════════════════════════════

  const INTAKE_CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 unambiguous chars
  const INTAKE_GENERIC = "Get your code from your library.";

  function _intakeNorm(code: unknown): string { return up(code).replace(/[^A-Z0-9]/g, ""); }
  function _intakePhone10(raw: unknown): string {
    let c = String(raw ?? "").replace(/\D/g, "");
    if (c.length > 10) {
      if (c.length === 12 && c.indexOf("91") === 0) c = c.slice(2);
      else if (c.length === 13 && c.indexOf("091") === 0) c = c.slice(3);
      else if (c.length === 11 && c.charAt(0) === "0") c = c.slice(1);
      else c = c.slice(-10);
    }
    return c.slice(0, 10);
  }
  function _intakePretty(code: unknown): string { const c = _intakeNorm(code); return c.length === 10 ? c.slice(0, 5) + "-" + c.slice(5) : c; }
  function _intakeRandCode(): string {
    const bytes = new Uint8Array(16);
    let out = "";
    while (out.length < 10) {
      globalThis.crypto.getRandomValues(bytes);
      for (let i = 0; i < bytes.length && out.length < 10; i++) {
        const b = bytes[i];
        if (b >= 248) continue; // 248 = 8*31 → uniform over the 31-char set
        out += INTAKE_CHARSET.charAt(b % 31);
      }
    }
    return out;
  }
  // code column isn't stored normalized → normalize both sides in SQL
  async function _intakeFindCodeRowW(exec: any, codeN: string): Promise<any | null> {
    const rows = (await exec`select * from intake_codes where upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')) = ${codeN} limit 1`) as any[];
    return rows.length ? rows[0] : null;
  }
  async function _intakeLibInfoW(exec: any, libCode: string, brCode: string): Promise<any> {
    const out: any = { code: brCode || libCode, name: "", address: "", contact: "" };
    try {
      const lrows = (await exec`select display_name, library_name, address, contact from libraries where upper(library_code)=${libCode} limit 1`) as any[];
      if (lrows.length) { const l = lrows[0]; out.name = String(l.display_name || l.library_name || ""); out.address = String(l.address ?? ""); out.contact = String(l.contact ?? ""); }
      if (brCode) {
        const brows = (await exec`select address, contact from library_branches where upper(branch_code)=${brCode} limit 1`) as any[];
        if (brows.length) { const b = brows[0]; if (String(b.address ?? "").trim()) out.address = String(b.address); if (String(b.contact ?? "").trim()) out.contact = String(b.contact); }
      }
    } catch { /* info is cosmetic — never block the form */ }
    return out;
  }

  // ── READ: step-1 code check (library label only, no PII) ──
  async function intakeCheck(params: any): Promise<any> {
    const codeN = _intakeNorm(params?.code);
    if (codeN.length !== 10) return { ok: false, error: INTAKE_GENERIC };
    const hit = await _intakeFindCodeRowW(sql, codeN);
    if (!hit || up(hit.status) !== "ISSUED") return { ok: false, error: INTAKE_GENERIC };
    const libCode = up(hit.library ?? ""), brCode = up(hit.branch ?? "");
    return { ok: true, library: brCode || libCode, info: await _intakeLibInfoW(sql, libCode, brCode) };
  }

  // ── WRITE: submit details (ISSUED → SUBMITTED, one time) ──
  async function intakeSubmit(p: any): Promise<any> {
    p = p || {};
    const codeN = _intakeNorm(p.code);
    const name = String(p.name ?? "").trim();
    const gender = up(p.gender);
    const phone = _intakePhone10(p.whatsapp_no);
    const dob = String(p.date_of_birth ?? "").trim();
    const address = String(p.address ?? "").trim();
    const prep = String(p.preparing_for ?? "").trim();
    if (!name) return { ok: false, error: "Please enter your name." };
    if (gender !== "M" && gender !== "F") return { ok: false, error: "Please select Male or Female." };
    if (!/^[6-9]\d{9}$/.test(phone)) return { ok: false, error: "Please enter a valid 10-digit WhatsApp number." };
    const dm = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let dOk = false;
    if (dm) { const y = +dm[1]; const d = new Date(+dm[1], +dm[2] - 1, +dm[3]); dOk = y >= 1900 && d.getTime() <= Date.now() && d.getMonth() === (+dm[2] - 1); }
    if (!dOk) return { ok: false, error: "Please enter a valid date of birth." };
    if (!address) return { ok: false, error: "Please enter your current address." };
    if (!prep) return { ok: false, error: "Please tell us what you are studying / preparing for." };

    return await sql.begin(async (tx: any) => {
      const hit = await _intakeFindCodeRowW(tx, codeN);
      if (!hit || up(hit.status) !== "ISSUED") return { ok: false, error: INTAKE_GENERIC };
      const now = nowTsIst();
      await tx`insert into intake_data (code, name, gender, whatsapp_no, date_of_birth, address, preparing_for, submitted_on)
        values (${codeN}, ${name}, ${gender}, ${phone}, ${dob}, ${address}, ${prep}, ${now})`;
      await tx`update intake_codes set status='SUBMITTED', submitted_on=${now} where upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'))=${codeN}`;
      return { ok: true, code: _intakePretty(codeN) };
    });
  }

  // ── READ: owner fetch of a SUBMITTED entry for prefill ──
  async function intakeFetch(params: any): Promise<any> {
    const codeN = _intakeNorm(params?.code);
    const hit = await _intakeFindCodeRowW(sql, codeN);
    if (!hit) return { ok: false, error: "Code not found." };
    const st = up(hit.status);
    if (st !== "SUBMITTED") return { ok: false, error: st === "ISSUED" ? "Student has not submitted this code yet." : "This code was already " + st.toLowerCase() + "." };
    const data = (await sql`select * from intake_data where upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'))=${codeN} order by s_no desc limit 1`) as any[];
    if (!data.length) return { ok: false, error: "No data found for this code." };
    const d = data[0];
    return {
      ok: true, code: codeN,
      remark: String(hit.remark ?? ""),
      mobile: _intakePhone10(hit.mobile),
      issued_for: up(hit.branch ?? "") || up(hit.library ?? ""),
      fields: {
        name: String(d.name ?? ""), gender: up(d.gender ?? ""), whatsapp_no: String(d.whatsapp_no ?? ""),
        date_of_birth: String(d.date_of_birth ?? ""), address: String(d.address ?? ""), preparing_for: String(d.preparing_for ?? ""),
      },
    };
  }

  // ── WRITE: consume after admission (SUBMITTED → USED) ──
  async function intakeMarkUsed(p: any): Promise<any> {
    p = p || {};
    const codeN = _intakeNorm(p.code);
    const rno = up(p.receipt_no ?? "");
    return await sql.begin(async (tx: any) => {
      const hit = await _intakeFindCodeRowW(tx, codeN);
      if (!hit) return { ok: false, error: "Code not found." };
      const st = up(hit.status);
      if (st === "USED") return { ok: true, already: true };
      if (st !== "SUBMITTED") return { ok: false, error: "Code is " + st + ", cannot mark used." };
      await tx`update intake_codes set status='USED', used_on=${nowTsIst()}, used_receipt=${rno}, used_by_library=${up(p.used_by_library ?? "")} where upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'))=${codeN}`;
      return { ok: true };
    });
  }

  // ── WRITE: generate a fresh ISSUED code ──
  async function intakeGenerateCode(p: any): Promise<any> {
    p = p || {};
    const lib = up(p.library ?? ""), br = up(p.branch ?? "");
    if (!lib) return { ok: false, error: "library required" };
    const mob = _intakePhone10(p.mobile);
    if (!/^[6-9]\d{9}$/.test(mob)) return { ok: false, error: "A valid 10-digit mobile number is required." };
    return await sql.begin(async (tx: any) => {
      let code = _intakeRandCode(), guard = 0;
      while (guard++ < 20) {
        const ex = (await tx`select 1 from intake_codes where upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'))=${code} limit 1`) as any[];
        if (!ex.length) break;
        code = _intakeRandCode();
      }
      await tx`insert into intake_codes (code, library, branch, status, issued_on, mobile, remark)
        values (${code}, ${lib}, ${br}, 'ISSUED', ${nowTsIst()}, ${mob}, ${String(p.remark ?? "").trim()})`;
      return { ok: true, code, pretty: _intakePretty(code), library: lib, branch: br };
    });
  }

  // ── READ: recent codes (C5: still exposes codes — harden in the security pass) ──
  async function intakeList(_p?: any): Promise<any> {
    const rows = (await sql`select * from intake_codes order by s_no desc limit 30`) as any[];
    const items = rows.map((r) => ({
      code: _intakePretty(r.code),
      library: up(r.library ?? ""), branch: up(r.branch ?? ""),
      status: up(r.status ?? ""),
      issued_on: r.issued_on ? formatForReceiptW(r.issued_on) : "",
      remark: String(r.remark ?? ""),
      mobile: _intakePhone10(r.mobile),
      used_receipt: up(r.used_receipt ?? ""),
      used_by_library: up(r.used_by_library ?? ""),
    }));
    return { ok: true, items };
  }

  // ── WRITE: void an unused code ──
  async function intakeVoid(p: any): Promise<any> {
    const codeN = _intakeNorm((p || {}).code);
    return await sql.begin(async (tx: any) => {
      const hit = await _intakeFindCodeRowW(tx, codeN);
      if (!hit) return { ok: false, error: "Code not found." };
      const st = up(hit.status);
      if (st === "USED") return { ok: false, error: "Already USED \u2014 cannot void." };
      if (st === "VOID") return { ok: true, already: true };
      await tx`update intake_codes set status='VOID', voided_on=${nowTsIst()} where upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'))=${codeN}`;
      return { ok: true };
    });
  }

  export async function runPg(
    action: string,
    params: Record<string, any>,
    _method: "GET" | "POST"
  ): Promise<any> {
    switch (action) {
      case "getInitData":
        return await getInitData();
      case "getStudentById":
        return await getStudentById(params);
      case "searchStudents":
        return await searchStudents(params);
      case "searchForRenewal":
        return await searchForRenewal(params);
      case "getAllStudents":
        return await getAllStudents(params);
      case "getStudentCounts":
        return await getStudentCounts();
      case "getPendingOptional":
        return await getPendingOptional(params);
      case "getSeatLayout":
        return await getSeatLayout(params);
      case "getAllSeatLayouts":
        return await getAllSeatLayouts();
      case "getSeatBlocks":
        return await getSeatBlocks(params);
      case "getBoardOccupancy":
        return await getBoardOccupancy(params);
      case "getVacantSeats":
        return await getVacantSeats(params);
      case "getSeatHistory":
        return await getSeatHistory(params);
      case "getReceiptLog":
        return await getReceiptLog(params);
      case "getStudentBookingHistory":
        return await getStudentBookingHistory(params);
      case "getPendingDues":
        return await getPendingDues(params);
      case "getDuePayments":
        return await getDuePayments(params);
      case "getDuePaymentLog":
        return await getDuePaymentLog(params);
      case "getIrrecoverableDues":
        return await getIrrecoverableDues(params);
      case "getMiscIncome":
        return await getMiscIncome(params);
      case "getRefundLog":
        return await getRefundLog(params);
      case "getRenewalsQueue":
        return await getRenewalsQueue(params);
      case "getCancellationsQueue":
        return await getCancellationsQueue(params);
      case "getReceiptEditHistory":
        return await getReceiptEditHistory(params);
      case "getReceiptMoneyTrail":
        return await getReceiptMoneyTrail(params);
      case "getDashboard":
        return await getDashboard(params);
      case "ping":
        return lmaPing();
      case "createReceipt":
        return await createReceipt(params);
      case "markReceiptRenewed":
        return await markReceiptRenewed(params);
      case "logFeePayment":
        return await logFeePayment(params);
      case "updateDuePayment":
        return await updateDuePayment(params);
      case "markDuesIrrecoverable":
        return await markDuesIrrecoverable(params);
      case "unmarkDuesIrrecoverable":
        return await unmarkDuesIrrecoverable(params);
      case "markReceiptDoNotRenew":
        return await markReceiptDoNotRenew(params);
      case "markReceiptCancelled":
        return await markReceiptCancelled(params);
      case "resetReceiptStatus":
        return await resetReceiptStatus(params);
      case "issueRefund":
        return await issueRefund(params);
      case "markReceiptCancelledWithRefund":
        return await markReceiptCancelledWithRefund(params);
      case "updateReceipt":
        return await updateReceipt(params);
      case "addSeatBlock":
        return await addSeatBlock(params);
      case "removeSeatBlock":
        return await removeSeatBlock(params);
      case "tempVacateSeat":
        return await tempVacateSeat(params);
      case "reAllotSeat":
        return await reAllotSeat(params);
      case "addStudent":
        return await addStudent(params);
      case "updateStudent":
        return await updateStudent(params);
      case "addMiscIncome":
        return await addMiscIncome(params);
      case "updateMiscIncome":
        return await updateMiscIncome(params);
      case "deleteMiscIncome":
        return await deleteMiscIncome(params);
      case "restoreMiscIncome":
        return await restoreMiscIncome(params);
      case "updateRefund":
        return await updateRefund(params);
      case "deleteRefund":
        return await deleteRefund(params);
      case "updateSeatBlock":
        return await updateSeatBlock(params);
      case "saveSeatSection":
        return await saveSeatSection(params);
      case "deleteSeatSection":
        return await deleteSeatSection(params);
      case "addOrUpdateSeat":
        return await addOrUpdateSeat(params);
      case "removeSeat":
        return await removeSeat(params);
      case "updateOptional":
        return await updateOptional(params);
      case "deleteStudent":
        return await deleteStudent(params);
      case "addLibrary":
        return await addLibrary(params);
      case "updateLibrary":
        return await updateLibrary(params);
      case "toggleLibrary":
        return await toggleLibrary(params);
      case "addBranch":
        return await addBranch(params);
      case "updateBranch":
        return await updateBranch(params);
      case "toggleBranch":
        return await toggleBranch(params);
      case "addShift":
        return await addShift(params);
      case "updateShift":
        return await updateShift(params);
      case "toggleShift":
        return await toggleShift(params);
      case "addPaymentTag":
        return await addPaymentTag(params);
      case "updatePaymentTag":
        return await updatePaymentTag(params);
      case "togglePaymentTag":
        return await togglePaymentTag(params);
      case "updateFee":
        return await updateFee(params);
      case "updateSettings":
        return await updateSettings(params);
      case "intakeCheck":
        return await intakeCheck(params);
      case "intakeSubmit":
        return await intakeSubmit(params);
      case "intakeFetch":
        return await intakeFetch(params);
      case "intakeMarkUsed":
        return await intakeMarkUsed(params);
      case "intakeGenerateCode":
        return await intakeGenerateCode(params);
      case "intakeList":
        return await intakeList(params);
      case "intakeVoid":
        return await intakeVoid(params);
      default:
        throw new Error("No Postgres handler for action: " + action);
    }
  }