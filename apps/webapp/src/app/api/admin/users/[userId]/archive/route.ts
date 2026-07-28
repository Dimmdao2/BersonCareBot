/**
 * PATCH /api/admin/users/:userId/archive — compatibility alias for an organization-scoped
 * client archive action. It is deliberately not a global-admin patient-repair surface.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyClientArchiveChange,
  clientArchiveBodySchema,
} from '@/modules/doctor-clients/clientArchiveChange';
import { requireAdminWorkspaceApiContext } from '@/app-layer/guards/requireRole';

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = clientArchiveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  return applyClientArchiveChange(userId, parsed.data.archived);
}
