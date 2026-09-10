import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';
import { requireDoctorWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';
import { patientInviteRelativeUrl } from '@/modules/patient-invites/service';
import { renderInviteQrDataUri } from '@/modules/patient-invites/inviteQr';

const paramsSchema = z.object({ userId: z.string().uuid() });
const revokeSchema = z.object({ inviteId: z.string().uuid() }).strict();

/**
 * Ссылка и её QR-код собираются В ОДНОМ месте: показать человеку код, ведущий не туда, куда ведёт
 * скопированная ссылка, — тихий и очень дорогой отказ (пациент попадает в чужой кабинет или в 404,
 * а в интерфейсе всё зелено). Поэтому обе двери — и GET, и POST — берут пару отсюда.
 *
 * Origin — у той же единственной двери, что и все прочие пациентские ссылки клиники: у клиники со
 * своим доменом приглашение обязано вести на её домен, а не на хост, где сейчас стоит специалист.
 * Именно у `deps.resolvePatientPublicOrigin`, а не у сервиса напрямую: витрина, из которой origin
 * выводится, объявлена пред-сессионной, и под принципалом специалиста прямой вызов падает 500.
 */
async function inviteLinkPayload(
  deps: ReturnType<typeof buildAppDeps>,
  organizationId: string,
  inviteId: string,
): Promise<{ url: string; qrDataUri: string } | null> {
  const patientOrigin = await deps.resolvePatientPublicOrigin?.(organizationId);
  if (!patientOrigin) return null;
  const url = new URL(patientInviteRelativeUrl(inviteId), patientOrigin).toString();
  return { url, qrDataUri: await renderInviteQrDataUri(url) };
}

async function resolvePatient(
  userId: string,
  organizationId: string,
  actor: PatientVisibilityActor,
) {
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    organizationId,
    actor,
  );
  return identity
    ? { deps, patientUserId: identity.userId, invitedEmail: identity.email ?? null }
    : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  const patient = await resolvePatient(parsed.data.userId, gate.ctx.organizationId, gate.ctx);
  if (!patient) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const state = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    patient.deps.patientInvites.getPortalStatus(gate.ctx.organizationId, patient.patientUserId),
  );
  // Пока приглашение живо, его ссылку можно показать снова — она выводится из самого приглашения,
  // а не хранится. Поэтому экран открывается уже со ссылкой, и «Пригласить» ничего не переделывает.
  const link = state.inviteId
    ? await inviteLinkPayload(patient.deps, gate.ctx.organizationId, state.inviteId)
    : null;
  return NextResponse.json({ ok: true, state, ...(link ?? {}) });
}

export async function POST(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const moduleGate = await requireDoctorWorkspaceModuleForApi(
    buildAppDeps(),
    gate.ctx,
    'client_portal',
  );
  if (!moduleGate.ok) return moduleGate.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  const patient = await resolvePatient(parsed.data.userId, gate.ctx.organizationId, gate.ctx);
  if (!patient) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const policy = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    patient.deps.doctorClients.getClientChannelPolicy(patient.patientUserId, {
      organizationId: gate.ctx.organizationId,
    }),
  );
  if (!policy.portalAllowed) {
    return NextResponse.json(
      { ok: false, error: 'workspace_module_disabled', module: 'client_portal' },
      { status: 403 },
    );
  }
  const result = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patient-portal-invite.issue',
    () =>
      patient.deps.patientInvites.issue({
        organizationId: gate.ctx.organizationId,
        patientUserId: patient.patientUserId,
        invitedEmail: patient.invitedEmail,
        createdByPlatformUserId: gate.ctx.session.user.userId,
      }),
  );
  if (!result.ok) {
    const status = result.code === 'already_linked' ? 409 : result.code === 'wrong_org' ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.code }, { status });
  }
  // Ссылку собирает СЕРВЕР, а не браузер. Кабинет специалиста и кабинет пациента живут на разных
  // хостах, поэтому `window.location.origin` в кабинете врача давал ссылку на хост специалистов —
  // а `/join` принадлежит пациентской поверхности, и прокси отвечал на ней 404 (владелец 10.09
  // прислал ровно это: ссылка вела на 127.0.0.1, а Safari предлагал «сохранить файл start»).
  const link = await inviteLinkPayload(patient.deps, gate.ctx.organizationId, result.invite.id);
  if (!link) {
    return NextResponse.json({ ok: false, error: 'patient_origin_unresolved' }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    inviteId: result.invite.id,
    expiresAt: result.invite.expiresAt,
    ...link,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const parsed = paramsSchema.safeParse(await params);
  const body = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !body.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const patient = await resolvePatient(parsed.data.userId, gate.ctx.organizationId, gate.ctx);
  if (!patient) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const revoked = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patient-portal-invite.revoke',
    () =>
      patient.deps.patientInvites.revoke({
        organizationId: gate.ctx.organizationId,
        patientUserId: patient.patientUserId,
        inviteId: body.data.inviteId,
        revokedByPlatformUserId: gate.ctx.session.user.userId,
      }),
  );
  return revoked
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
}
