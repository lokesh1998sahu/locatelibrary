// MF → Set up → "Download backup": the same full backup (LMA + MF), behind MF's sign-in.
import { NextRequest, NextResponse } from "next/server";
import sql from "../../lma960805/_db";
import { isSessionValid } from "../_auth";
import { buildBackup } from "../../lma960805/_backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isSessionValid(req)) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  try {
    const b = await buildBackup(sql);
    return new NextResponse(Buffer.from(b.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${b.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: "Backup failed: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
