/**
 * DELETE /api/doctor/account/email — сброс email у своего аккаунта врача/админа.
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorApiSession } from '@/app-layer/guards/requireRole';

export async function DELETE() {
  const gate = await requireDoctorApiSession();
  if (!gate.ok) return gate.response;

  const result = await buildAppDeps().userProjection.clearStaffAccountEmail(
    gate.session.user.userId,
  );
  if (!result.ok) {
    if (result.reason === 'already_empty') {
      return NextResponse.json({ ok: false, error: 'already_empty' }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
