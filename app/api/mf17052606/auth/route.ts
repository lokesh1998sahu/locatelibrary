// MF 2.0 — POST /api/mf17052606/auth
// Actions: login | session | logout.  Rate limited in Postgres.

import { NextRequest, NextResponse } from "next/server";
import sql from "../../lma960805/_db";
import {
  COOKIE_NAME, SESSION_MAX_AGE, makeSessionValue,
  isSessionValid, passwordMatches, clientIp,
} from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MIN = 15;
const MAX_TRIES  = 5;

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body?.action || "");

  if (action === "session") {
    return NextResponse.json({ ok: true, authed: isSessionValid(req) });
  }

  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, "", cookieOpts(0));
    return res;
  }

  if (action !== "login") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const ip = clientIp(req);

  const recent = (await sql`
    select count(*)::int as tries, max(at) as last_at
    from fin.login_attempts
    where ip = ${ip} and ok = false and at > now() - (${WINDOW_MIN} || ' minutes')::interval
  `) as any[];

  const tries = Number(recent?.[0]?.tries ?? 0);
  if (tries >= MAX_TRIES) {
    const lastAt = recent?.[0]?.last_at ? new Date(recent[0].last_at).getTime() : Date.now();
    const waitMs = lastAt + WINDOW_MIN * 60_000 - Date.now();
    const mins = Math.max(1, Math.ceil(waitMs / 60_000));
    return NextResponse.json(
      { ok: false, error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` },
      { status: 429 },
    );
  }

  const good = passwordMatches(String(body?.password || ""));
  await sql`insert into fin.login_attempts (ip, ok) values (${ip}, ${good})`;

  if (!good) {
    const left = MAX_TRIES - tries - 1;
    return NextResponse.json(
      { ok: false, error: left > 0 ? `Wrong password. ${left} attempt${left === 1 ? "" : "s"} left.` : "Wrong password." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true, authed: true });
  res.cookies.set(COOKIE_NAME, makeSessionValue(), cookieOpts(SESSION_MAX_AGE));
  return res;
}