import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

const postBodySchema = z.object({
  label: z.string().min(1).max(500),
});

const patchBodySchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      label: z.string().min(1).max(500),
      sortOrder: z.number().int(),
    }),
  ),
});

export async function GET() {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const deps = buildAppDeps();
  const items = await deps.measureKinds.listMeasureKinds();
  return NextResponse.json({ ok: true, items });
}

/**
 * Idempotently adds a label to the current clinic's catalog. It never mutates another clinic or
 * the baseline used when creating future organizations.
 */
export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const { row, created } = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.measureKinds.createMeasureKindFromLabel(parsed.data.label),
    );
    return NextResponse.json({ ok: true, item: row, created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }
}

/**
 * The catalog is an organization-owned copy of the baseline. Staff may relabel/reorder only the
 * current clinic's rows; the global admin deliberately has no clinical-data capability.
 */
export async function PATCH(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const items = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.measureKinds.saveMeasureKindsOrderAndLabels(parsed.data.items),
    );
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }
}
