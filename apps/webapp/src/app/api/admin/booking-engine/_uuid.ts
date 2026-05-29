import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jsonIfInvalidUuid(id: string): NextResponse | null {
  if (!UUID_RE.test(id.trim())) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  return null;
}
