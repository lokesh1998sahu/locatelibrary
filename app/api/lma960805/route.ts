import { NextRequest, NextResponse } from "next/server";
import { PG_ACTIONS, runPg } from "./_handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCRIPT_URL = process.env.NEXT_PUBLIC_LMA_SCRIPT_URL!;
const TIMEOUT_MS = 30_000;

if (!SCRIPT_URL) {
  console.warn("[api/lma960805] NEXT_PUBLIC_LMA_SCRIPT_URL is not set");
}

/** LEGACY PATH — proxies an Apps Script call with a timeout + error wrapper.
 *  Used for every action not yet migrated to Postgres. Unchanged behaviour. */
async function callAppsScript(
  method: "GET" | "POST",
  search: string,
  body?: unknown
): Promise<NextResponse> {
  if (!SCRIPT_URL) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_LMA_SCRIPT_URL not configured on server." },
      { status: 500 }
    );
  }
  const url = method === "GET" ? `${SCRIPT_URL}${search}` : SCRIPT_URL;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const init: RequestInit = {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: method === "POST" ? { "Content-Type": "text/plain;charset=utf-8" } : undefined,
      body: method === "POST" ? JSON.stringify(body) : undefined,
      cache: "no-store",
    };
    const res = await fetch(url, init);
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: 200 });
    } catch {
      return NextResponse.json(
        { ok: false, error: "Apps Script returned non-JSON response.", raw: text.slice(0, 500) },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("aborted") || msg.includes("AbortError");
    return NextResponse.json(
      { ok: false, error: isTimeout ? "Apps Script call timed out after 30s." : msg },
      { status: isTimeout ? 504 : 502 }
    );
  } finally {
    clearTimeout(t);
  }
}

/** NEW PATH — runs a Postgres-backed action, returning JSON in the same
 *  contract GAS uses (app-level errors come back as 200 + { ok:false, error }). */
async function runPostgres(
  action: string,
  params: Record<string, any>,
  method: "GET" | "POST"
): Promise<NextResponse> {
  try {
    const data = await runPg(action, params, method);
    // Mirror the GAS router (01_Routing doGet/doPost):
    //   if (r && r.ok === undefined) r.ok = !r.error;
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  if (PG_ACTIONS.has(action)) {
    return runPostgres(action, Object.fromEntries(url.searchParams.entries()), "GET");
  }
  return callAppsScript("GET", url.search);
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const action = body?.action || "";
  if (PG_ACTIONS.has(action)) {
    return runPostgres(action, body?.payload ?? {}, "POST");
  }
  return callAppsScript("POST", "", body);
}