// MF 2.0 — shared auth primitives (server-only).
// Deliberately SEPARATE from LMA: different secret, different cookie name.
// An LMA session can never reach MF 2.0, and vice versa. This app holds net
// worth and personal accounts; LMA is used by branch staff.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const COOKIE_NAME = "mf_sess";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// MF 2.0 has no public surface at all. Only the health check is unauthenticated.
export const PUBLIC_ACTIONS = new Set<string>(["ping"]);

function secret(): string {
  const s = process.env.MF_APP_SECRET;
  if (!s) throw new Error("MF_APP_SECRET is not set on the server.");
  return s;
}

function signingKey(): Buffer {
  return createHash("sha256").update("mf-cookie-v1|" + secret()).digest();
}

function hmac(msg: string): string {
  return createHmac("sha256", signingKey()).update(msg).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) { timingSafeEqual(bb, bb); return false; }
  return timingSafeEqual(ab, bb);
}

export function makeSessionValue(maxAgeSec: number = SESSION_MAX_AGE): string {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  return exp + "." + hmac(String(exp));
}

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
    return false;
  }
}

export function passwordMatches(input: string): boolean {
  return !!input && safeEqual(input, secret());
}

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}