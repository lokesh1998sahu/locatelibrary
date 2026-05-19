import { NextRequest, NextResponse } from "next/server";

const SCRIPT_URL = process.env.NEXT_PUBLIC_LMA_SCRIPT_URL!;
const TIMEOUT_MS = 30_000;

if (!SCRIPT_URL) {
  // Runtime warning only — Next.js builds without env vars at build time fine
  console.warn("[api/lma] NEXT_PUBLIC_LMA_SCRIPT_URL is not set");
}

/** Proxies an Apps Script call with a timeout + error wrapper. */
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
    // Apps Script always returns JSON; parse defensively
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: 200 });
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

export async function GET(req: NextRequest) {
  // Pass through entire query string (e.g. ?action=ping&library=KAL)
  const url = new URL(req.url);
  return callAppsScript("GET", url.search);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }
  return callAppsScript("POST", "", body);
}