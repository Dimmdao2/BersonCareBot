import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});

function makeDoctorItemCode(): string {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ categoryCode: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { categoryCode } = await context.params;
  if (!categoryCode?.trim()) {
    return NextResponse.json({ ok: false, error: 'category_required' }, { status: 400 });
  }

  const code = categoryCode.trim();
  const deps = buildAppDeps();
  const result = await withDoctorWorkspacePrincipal(gate.ctx, async () => {
    const cat = await deps.references.findCategoryByCode(code);
    if (!cat) return null;
    const items = await deps.references.listActiveItemsByCategoryCode(code);
    return { cat, items };
  });
  if (!result) {
    return NextResponse.json({ ok: false, error: 'category_not_found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    items: result.items.map((i) => ({
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
  context: { params: Promise<{ categoryCode: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { categoryCode } = await context.params;
  if (!categoryCode?.trim()) {
    return NextResponse.json({ ok: false, error: 'category_required' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const result = await withDoctorWorkspacePrincipal(gate.ctx, async () => {
      const cat = await deps.references.findCategoryByCode(categoryCode.trim());
      if (!cat) return { kind: 'not_found' } as const;
      if (!cat.isUserExtensible) return { kind: 'not_extensible' } as const;
      const item = await deps.references.insertItem({
        categoryCode: cat.code,
        code: makeDoctorItemCode(),
        title: parsed.data.title,
      });
      return { kind: 'inserted', item } as const;
    });
    if (result.kind === 'not_found') {
      return NextResponse.json({ ok: false, error: 'category_not_found' }, { status: 404 });
    }
    if (result.kind === 'not_extensible') {
      return NextResponse.json({ ok: false, error: 'category_not_extensible' }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      item: { id: result.item.id, code: result.item.code, title: result.item.title },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'insert_failed';
    if (msg === 'category_not_extensible') {
      return NextResponse.json({ ok: false, error: 'category_not_extensible' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 });
  }
}
