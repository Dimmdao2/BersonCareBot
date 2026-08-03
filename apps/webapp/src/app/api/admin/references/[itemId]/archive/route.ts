import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  requireAdminApiContext,
  requireDoctorWorkspaceApiContext,
} from '@/app-layer/guards/requireRole';

/** Админ: soft-delete значения справочника (is_active = false). */
export async function PATCH(_request: Request, context: { params: Promise<{ itemId: string }> }) {
  const adminGate = await requireAdminApiContext();
  if (!adminGate.ok) return adminGate.response;
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { itemId } = await context.params;
  if (!itemId?.trim()) {
    return NextResponse.json({ ok: false, error: 'item_required' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const item = await withDoctorWorkspacePrincipal(gate.ctx, async () => {
    const found = await deps.references.findItemById(itemId.trim());
    if (!found) return null;
    await deps.references.archiveItem(found.id);
    return found;
  });
  if (!item) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
