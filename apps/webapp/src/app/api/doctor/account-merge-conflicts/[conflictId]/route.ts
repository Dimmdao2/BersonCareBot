import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

const actionSchema = z.object({ action: z.enum(['merge', 'refuse']) }).strict();
const uuidSchema = z.string().uuid();

type RouteContext = { params: Promise<{ conflictId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { conflictId } = await context.params;
  if (!uuidSchema.safeParse(conflictId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_conflict' }, { status: 400 });
  }
  const service = buildAppDeps().patientMergeCandidate;
  if (!service) {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
  const conflict = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    service.readMedicalConflictDetails(gate.ctx.organizationId, conflictId),
  );
  if (!conflict) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, conflict });
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { conflictId } = await context.params;
  const body = (await request.json().catch(() => null)) as unknown;
  const parsedId = uuidSchema.safeParse(conflictId);
  const parsedBody = actionSchema.safeParse(body);
  if (!parsedId.success || !parsedBody.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  const service = buildAppDeps().patientMergeCandidate;
  if (!service) {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
  const actorId = gate.ctx.session.user.userId;
  if (parsedBody.data.action === 'refuse') {
    const refused = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      service.refuseMedicalConflict(gate.ctx.organizationId, conflictId, actorId),
    );
    if (!refused) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.json({ ok: true, action: 'refuse' });
  }

  const outcome = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    service.mergeMedicalConflict(gate.ctx.organizationId, conflictId, actorId),
  );
  if (outcome === 'conflict_not_found') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  if (outcome === 'fio_decision_required') {
    // Слияния НЕ было: §18а требует ответа человека про ФИО, а его у нас нет. Ответить `ok: true`
    // значило бы сказать врачу «слито» и оставить человеку подпись, которую никто не выбирал.
    return NextResponse.json(
      { ok: false, action: 'merge', error: 'fio_decision_required' },
      { status: 409 },
    );
  }
  if (outcome === 'awaiting_other_organization') {
    // Слияния НЕ было: блокер второй клиники снимает только её врач. Отвечать `ok: true` здесь
    // значит сказать врачу «слито» про человека, который остался двумя учётками.
    return NextResponse.json(
      { ok: false, action: 'merge', error: 'awaiting_other_organization' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, action: 'merge' });
}
