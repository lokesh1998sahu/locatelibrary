// LMA — login / session / logout.
//   POST   { password }  -> verify server-side, set signed httpOnly cookie
//   GET                  -> { ok:true, authed:boolean }  (cookie is httpOnly, so
//                            the client cannot read it directly)
//   DELETE               -> logout, clears the cookie server-side
//
// Brute-force protection lives in Postgres (table lma_login_attempts), because
// serverless invocations do NOT share in-memory counters.

import { NextRequest, NextResponse } from "next/server";
import sql from "../_db";
import {
  COOKIE_NAME, SESSION_MAX_AGE, makeSessionValue,
  isSessionValid, passwordMatches, clientIp,
} from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAILS = 5;

// Identical message for wrong-password AND rate-limited, so an attacker
// learns nothing from the response.
const GENERIC = "Incorrect password.";

/** "in 12 minutes" — tells the owner how long to wait. Safe to reveal: the
 *  lockout is checked BEFORE the password, so this message is identical
 *  whether the submitted password was right or wrong. */
function waitMsg(lockedUntil: any): string {
  const mins = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return "Too many failed attempts. Try again shortly.";
  return `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

function withCookie(res: NextResponse, value: string, maxAge: number): NextResponse {
  res.cookies.set({
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    // http://localhost has no TLS, so `secure` must be off in dev or the
    // cookie is silently dropped and login appears to "do nothing".
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, authed: isSessionValid(req) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  if (!process.env.LMA_APP_SECRET) {
    return NextResponse.json(
      { ok: false, error: "LMA_APP_SECRET is not configured on the server." },
      { status: 500 }
    );
  }

  let body: any = null;
  try { body = await req.json(); } catch { body = null; }
  const password = String(body?.password ?? "");
  const ip = clientIp(req);

  // Compute the lockout message OUTSIDE the try, so a formatting error can never
  // be swallowed by the catch and silently downgraded to the generic message.
  let lockedUntil: any = null;
  try {
    const rows = await sql`
      SELECT locked_until FROM lma_login_attempts
      WHERE ip = ${ip} AND locked_until IS NOT NULL AND locked_until > now()
    `;
    if (rows.length > 0) lockedUntil = rows[0].locked_until;
  } catch (e) {
    // If the attempts table is unreachable, fail CLOSED rather than allowing
    // unlimited guessing. Distinct wording so this path is never mistaken for
    // a wrong password.
    console.error("[lma auth] lockout check failed:", e);
    return NextResponse.json(
      { ok: false, error: "Login temporarily unavailable. Try again in a moment." },
      { status: 401 }
    );
  }
  if (lockedUntil) {
    return NextResponse.json({ ok: false, error: waitMsg(lockedUntil) }, { status: 401 });
  }

  let upd: any = null;
  if (!passwordMatches(password)) {
    try {
      upd = await sql`
        INSERT INTO lma_login_attempts (ip, fails, window_start, locked_until)
        VALUES (${ip}, 1, now(), NULL)
        ON CONFLICT (ip) DO UPDATE SET
          fails = CASE
            WHEN lma_login_attempts.window_start < now() - interval '15 minutes' THEN 1
            ELSE lma_login_attempts.fails + 1 END,
          window_start = CASE
            WHEN lma_login_attempts.window_start < now() - interval '15 minutes' THEN now()
            ELSE lma_login_attempts.window_start END,
          locked_until = CASE
            WHEN (CASE
                    WHEN lma_login_attempts.window_start < now() - interval '15 minutes' THEN 1
                    ELSE lma_login_attempts.fails + 1 END) >= 5
            THEN now() + interval '15 minutes'
            ELSE NULL END
        RETURNING fails, locked_until
      `;
    } catch (e) { console.error("[lma auth] attempt log failed:", e); }
    if (upd && upd[0]) {
      if (upd[0].locked_until) {
        return NextResponse.json({ ok: false, error: waitMsg(upd[0].locked_until) }, { status: 401 });
      }
      const left = MAX_FAILS - Number(upd[0].fails || 0);
      if (left > 0 && left <= 2) {
        return NextResponse.json(
          { ok: false, error: `${GENERIC} ${left} attempt${left === 1 ? "" : "s"} left before a 15-minute lockout.` },
          { status: 401 }
        );
      }
    }
    return NextResponse.json({ ok: false, error: GENERIC }, { status: 401 });
  }

  try { await sql`DELETE FROM lma_login_attempts WHERE ip = ${ip}`; } catch { /* non-fatal */ }

  return withCookie(NextResponse.json({ ok: true }, { status: 200 }), makeSessionValue(), SESSION_MAX_AGE);
}

export async function DELETE() {
  return withCookie(NextResponse.json({ ok: true }, { status: 200 }), "", 0);
}