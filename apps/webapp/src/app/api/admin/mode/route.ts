/**
 * POST /api/admin/mode — toggle adminMode в сессии.
 * Guard: role === 'admin'. Вариант A (toggle + confirm dialog).
 */
import { NextResponse } from 'next/server';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { toggleAdminMode } from '@/modules/auth/service';

export async function POST() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const result = await toggleAdminMode();
  return NextResponse.json({ ok: result.ok, adminMode: result.adminMode });
}
