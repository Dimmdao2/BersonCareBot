import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  requireDoctorWorkspaceApiContext,
  requirePlatformOperationsApiContext,
} from '@/app-layer/guards/requireRole';

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
 * Doctor-facing, insert-only extension of the shared catalog (A-6/#1007): idempotent by the
 * label-derived `code` — either returns an existing row unchanged or inserts a brand-new one. A
 * doctor can never edit or overwrite a row this way, so this stays open to any clinic workspace
 * (it is how `ClinicalTestMeasureRowsEditor` lets a doctor add a new measurement label while
 * building a clinical test). Bulk relabel/reorder of EXISTING rows is a different, more dangerous
 * capability — see PATCH below.
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
 * Platform-operator-only (A-6/#1007): bulk relabel + reorder of EVERY row in the shared catalog by
 * raw `id`, with no ownership check possible (the table has no `organization_id` at all — see
 * `assertStaffOrPlatformWritePrincipal` in `pgClinicalTestMeasureKinds.ts`). Until this route was
 * fixed, any clinic's doctor could overwrite labels/order that every other clinic's clinical-test
 * forms render — exactly the "mutate a global dictionary for every tenant" defect. Only
 * `MeasureKindsTableClient` (the standalone "Виды измерений" admin page, itself labelled "Системный
 * справочник") ever called this; the doctor-facing clinical-test builder only calls POST above.
 * `requirePlatformOperationsApiContext` already stamps the platform DB principal — no
 * `withDoctorWorkspacePrincipal` wrapping needed or possible here (there is no organization).
 */
export async function PATCH(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const items = await deps.measureKinds.saveMeasureKindsOrderAndLabels(parsed.data.items);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }
}
