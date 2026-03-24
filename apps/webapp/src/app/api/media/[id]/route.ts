import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { getStoredMediaBody } from "@/infra/repos/mockMediaStorage";
import { readPgMediaFileBody } from "@/infra/repos/pgMediaStorage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  if (env.DATABASE_URL && UUID_RE.test(id)) {
    const pg = await readPgMediaFileBody(id);
    if (pg) {
      return new Response(new Uint8Array(pg.body), {
        headers: {
          "Content-Type": pg.mimeType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  const stored = getStoredMediaBody(id);
  if (!stored) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return new Response(stored.body, {
    headers: {
      "Content-Type": stored.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
