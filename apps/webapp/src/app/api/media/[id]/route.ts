import { NextResponse } from "next/server";
import { getStoredMediaBody } from "@/infra/repos/mockMediaStorage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
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
