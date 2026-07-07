import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});

function makeDoctorItemCode(): string {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ categoryCode: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { categoryCode } = await context.params;
  if (!categoryCode?.trim()) {
    return NextResponse.json({ ok: false, error: "category_required" }, { status: 400 });
  }

  const code = categoryCode.trim();
  const deps = buildAppDeps();
  const cat = await deps.references.findCategoryByCode(code);
  if (!cat) {
    return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
  }

  const items = await deps.references.listActiveItemsByCategoryCode(code);
  return NextResponse.json({
    ok: true,
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      title: i.title,
      sortOrder: i.sortOrder,
    })),
  });
}

/** Врач добавляет значение только в категорию с is_user_extensible (POST). */
export async function POST(
  request: Request,
  context: { params: Promise<{ categoryCode: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { categoryCode } = await context.params;
  if (!categoryCode?.trim()) {
    return NextResponse.json({ ok: false, error: "category_required" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const cat = await deps.references.findCategoryByCode(categoryCode.trim());
  if (!cat) {
    return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
  }
  if (!cat.isUserExtensible) {
    return NextResponse.json({ ok: false, error: "category_not_extensible" }, { status: 403 });
  }

  try {
    const item = await deps.references.insertItem({
      categoryCode: cat.code,
      code: makeDoctorItemCode(),
      title: parsed.data.title,
    });
    return NextResponse.json({
      ok: true,
      item: { id: item.id, code: item.code, title: item.title },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert_failed";
    if (msg === "category_not_extensible") {
      return NextResponse.json({ ok: false, error: "category_not_extensible" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }
}
