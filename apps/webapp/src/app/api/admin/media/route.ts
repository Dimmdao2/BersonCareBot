import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const querySchema = z.object({
  kind: z.enum(["all", "image", "video", "audio", "file"]).optional(),
  sortBy: z.enum(["date", "size", "type"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    kind: url.searchParams.get("kind") ?? undefined,
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    sortDir: url.searchParams.get("sortDir") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const sortByMap = {
    date: "createdAt",
    size: "size",
    type: "kind",
  } as const;

  const deps = buildAppDeps();
  const items = await deps.media.list({
    kind: parsed.data.kind ?? "all",
    query: parsed.data.q ?? "",
    sortBy: parsed.data.sortBy ? sortByMap[parsed.data.sortBy] : "createdAt",
    sortDir: parsed.data.sortDir ?? "desc",
    limit: parsed.data.limit ?? 50,
    offset: parsed.data.offset ?? 0,
  });

  return NextResponse.json({
    ok: true,
    items: items.map((item) => ({
      ...item,
      url: `/api/media/${item.id}`,
    })),
  });
}
