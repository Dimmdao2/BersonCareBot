/**
 * POST /api/doctor/treatment-program-promo/refresh — пересоздать активные promo-инстансы по сохранённому шаблону
 * Guard: role doctor | admin
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { refreshDefaultPromoPrograms } from '@/app-layer/treatment-program/refreshDefaultPromoPrograms';

export async function POST() {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const entitlement = await requireEntitlementForMutation(auth.ctx, 'promo');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('promo', 'обновить промо-программу');
  }

  const deps = buildAppDeps();

  try {
    const result = await refreshDefaultPromoPrograms(
      deps,
      auth.ctx.session.user.userId,
      auth.ctx.organizationId,
    );
    return NextResponse.json({
      ok: true,
      templateId: result.templateId,
      refreshedCount: result.refreshedCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
