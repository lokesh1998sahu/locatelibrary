import { NextRequest, NextResponse } from "next/server";
import { PG_ACTIONS, runPg } from "./_handlers";
import { isSessionValid, PUBLIC_ACTIONS } from "./_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the public enquiry form may call the API without signing in, and it
// needs just these: check one code, and send the form. An action is open only
// if it is listed here AND in _auth.ts's PUBLIC_ACTIONS — so, for example, the
// full list of enquiry codes (intakeList) now always needs your sign-in.
const OPEN_ACTIONS = new Set<string>(["intakeCheck", "intakeSubmit", "ping"]);
const isOpen = (action: string) => OPEN_ACTIONS.has(action) && PUBLIC_ACTIONS.has(action);

// For the enquiry form's wrong-code limit: which connection and which phone is
// asking. The phone gets a random id in a cookie the first time; the server only
// ever stores it (and the connection) hashed.
const DEV_COOKIE = "lma_dev";
function clientOf(req: NextRequest): { ip: string; dev: string; fresh: boolean } {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const have = req.cookies.get(DEV_COOKIE)?.value || "";
  const dev = /^[a-f0-9]{32}$/.test(have) ? have : crypto.randomUUID().replace(/-/g, "");
  return { ip, dev, fresh: dev !== have };
}
function withDevice(res: NextResponse, c: { dev: string; fresh: boolean }): NextResponse {
  if (c.fresh) res.cookies.set(DEV_COOKIE, c.dev, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

/** Runs a Postgres-backed action. App-level errors come back as 200 + { ok:false, error }. */
async function runPostgres(
  action: string,
  params: Record<string, any>,
  method: "GET" | "POST"
): Promise<NextResponse> {
  try {
    const data = await runPg(action, params, method);
    // Several pages gate on `r.ok`, so a handler returning a bare object
    // (e.g. getBoardOccupancy) must still come back with ok:true.
    const out =
      data && typeof data === "object" && !Array.isArray(data)
        ? ((data as any).ok === undefined
            ? { ...(data as any), ok: !(data as any).error }
            : data)
        : data;
    return NextResponse.json(out, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}

// Every action now runs on Postgres. The old Google Apps Script fallback
// (NEXT_PUBLIC_LMA_SCRIPT_URL) is gone: an unknown action is simply refused.
const unknown = (action: string) =>
  NextResponse.json({ ok: false, error: "Unknown action: " + (action || "(none)") }, { status: 400 });

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  if (!isOpen(action) && !isSessionValid(req)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  if (!PG_ACTIONS.has(action)) return unknown(action);
  const params: Record<string, any> = Object.fromEntries(url.searchParams.entries());
  delete params.__ip; delete params.__dev;                      // never trust these from the caller
  if (OPEN_ACTIONS.has(action)) {
    const c = clientOf(req);
    return withDevice(await runPostgres(action, { ...params, __ip: c.ip, __dev: c.dev }, "GET"), c);
  }
  return runPostgres(action, params, "GET");
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const action = body?.action || "";
  if (!isOpen(action) && !isSessionValid(req)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  if (!PG_ACTIONS.has(action)) return unknown(action);
  const payload: Record<string, any> = { ...(body?.payload ?? {}) };
  delete payload.__ip; delete payload.__dev;                    // never trust these from the caller
  if (OPEN_ACTIONS.has(action)) {
    const c = clientOf(req);
    return withDevice(await runPostgres(action, { ...payload, __ip: c.ip, __dev: c.dev }, "POST"), c);
  }
  return runPostgres(action, payload, "POST");
}
