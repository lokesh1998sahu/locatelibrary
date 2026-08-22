// MF 2.0 — POST /api/mf17052606
// Every action is gated by the MF session cookie. No GAS fallback, no legacy path.

import { NextRequest, NextResponse } from "next/server";
import { isSessionValid, PUBLIC_ACTIONS } from "./_auth";
import { handle } from "./_handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const action = String(body?.action || "");
  if (!action) {
    return NextResponse.json({ ok: false, error: "No action given." }, { status: 400 });
  }

  if (!PUBLIC_ACTIONS.has(action) && !isSessionValid(req)) {
    return NextResponse.json({ ok: false, error: "Your session expired. Sign in again." }, { status: 401 });
  }

  try {
    const data = await handle(action, body?.payload ?? {});
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    const msg = String(e?.message || e || "Something went wrong.");
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}