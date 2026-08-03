/**
 * GET/POST /api/doctor/tasks — задачи специалиста для дашборда «Сегодня».
 *
 * Owner punch-list (2026-07-25) item 1 bugfix: GET раньше жёстко фильтровал
 * `patientUserId: null`, поэтому задача, созданная с привязкой к пациенту (через
 * SpecialistTaskFormDialog → POST с непустым patientUserId), полностью пропадала из
 * этого списка после первого reload() — она реально сохранялась в БД, но больше никогда
 * не возвращалась GET-запросом. Теперь GET отдаёт ВСЕ открытые задачи владельца
 * (привязанные к пациенту и глобальные) — как и SSR-загрузка в loadDoctorTodayDashboard.ts.
 * POST по-прежнему поддерживает опциональный patientUserId (создание с привязкой к пациенту).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForRead,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { specialistTaskBodySchema } from '@/modules/specialist-tasks/apiSchemas';

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;
  const entitlement = await requireEntitlementForRead(gate.ctx, 'specialist_tasks');
  if (!entitlement.ok) return entitlement.response;

  const url = new URL(request.url);
  const includeCompleted = url.searchParams.get('includeCompleted') === '1';
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10) || 20)) : 20;

  const deps = buildAppDeps();
  // patientUserId omitted (not `null`) — root-cause fix: `null` filtered the query down to
  // only unlinked tasks, which is why a patient-linked task never showed up here again.
  const tasks = await deps.specialistTasks.listForOwner({
    ownerUserId: session.user.userId,
    includeCompleted,
    limit: includeCompleted ? undefined : limit,
  });

  return NextResponse.json({ ok: true, tasks });
}

export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const entitlement = await requireEntitlementForMutation(gate.ctx, 'specialist_tasks');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('specialist_tasks', 'создать задачу');
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = specialistTaskBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (parsed.data.patientUserId) {
    const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
      parsed.data.patientUserId,
      gate.ctx.organizationId,
    );
    if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  try {
    const task = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.specialistTasks.create({
        ownerUserId: session.user.userId,
        patientUserId: parsed.data.patientUserId ?? null,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        dueAt: parsed.data.dueAt ?? null,
        remindAt: parsed.data.remindAt ?? null,
        isImportant: parsed.data.isImportant ?? false,
      }),
    );
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    if (e instanceof Error && e.message === 'empty_title') {
      return NextResponse.json({ ok: false, error: 'empty_title' }, { status: 400 });
    }
    throw e;
  }
}
