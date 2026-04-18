import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

const listQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const items = await deps.treatmentProgram.listTemplates({
    includeArchived: parsed.data.includeArchived ?? false,
    status: parsed.data.status,
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const row = await deps.treatmentProgram.createTemplate(
      {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        status: parsed.data.status,
      },
      session.user.userId,
    );
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
