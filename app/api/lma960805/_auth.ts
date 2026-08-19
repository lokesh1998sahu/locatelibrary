// LMA — shared auth primitives (server-only).
// Used by BOTH app/api/lma960805/route.ts and app/api/lma960805/auth/route.ts.
// Single source of truth: never re-implement session logic anywhere else.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const COOKIE_NAME = "lma_sess";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Actions that must keep working WITHOUT a login.
//   intakeCheck / intakeSubmit -> the public student admission form
//   ping                       -> health check
// Every other action (all 76 remaining) requires a valid session cookie.
export const PUBLIC_ACTIONS = new Set<string>(["intakeCheck", "intakeSubmit", "ping"]);

function secret(): string {
  const s = process.env.LMA_APP_SECRET;
  if (!s) throw new Error("LMA_APP_SECRET is not set on the server.");
  return s;
}

// The cookie signing key is DERIVED from the app password. One env var to manage,
// and changing the password instantly invalidates every existing session.
function signingKey(): Buffer {
  return createHash("sha256").update("lma-cookie-v1|" + secret()).digest();
}

function hmac(msg: string): string {
  return createHmac("sha256", signingKey()).update(msg).digest("base64url");
}

/** Constant-time compare that never throws on a length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) { timingSafeEqual(bb, bb); return false; }
  return timingSafeEqual(ab, bb);
}

/** Cookie value for a fresh session: "<expiryEpochSeconds>.<signature>". */
export function makeSessionValue(maxAgeSec: number = SESSION_MAX_AGE): string {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  return exp + "." + hmac(String(exp));
}

/** True only if the cookie is present, correctly signed, and not past its expiry. */
export function isSessionValid(req: NextRequest): boolean {
  try {
    const raw = req.cookies.get(COOKIE_NAME)?.value;
    if (!raw) return false;
    const dot = raw.indexOf(".");
    if (dot <= 0) return false;
    const expStr = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    return safeEqual(sig, hmac(expStr));
  } catch {
    return false; // missing/invalid LMA_APP_SECRET -> deny, never 500 the whole API
  }
}

export function passwordMatches(input: string): boolean {
  return !!input && safeEqual(input, secret());
}

/** Best-effort client IP (Vercel populates x-forwarded-for). */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}