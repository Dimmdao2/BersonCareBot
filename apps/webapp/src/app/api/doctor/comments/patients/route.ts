/**
 * GET /api/doctor/comments/patients
 *
 * Список пациентов для левого пейна вкладки «Комментарии».
 * Поддерживает два режима через query-параметр `mode`:
 *   - `unread` (по умолчанию) — пациенты с непрочитанными комментариями
 *   - `all` — все пациенты с хотя бы одним комментарием (включая прочитанные)
 *
 * Режим `all` используется клиентом при переключении тоггла «Все» в DoctorCommentsTab.
 * Режим `unread` — запасной клиентский рефетч (SSR уже отдаёт unread-список при загрузке страницы).
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { loadDoctorCommentPatients } from '@/app/app/doctor/comments/loadDoctorCommentPatients';
import { loadDoctorAllCommentPatients } from '@/app/app/doctor/comments/loadDoctorAllCommentPatients';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') === 'all' ? 'all' : 'unread';

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();
  const excludedUserIds = audience?.excludedUserIds?.length ? audience.excludedUserIds : undefined;

  try {
    const patients = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      mode === 'all'
        ? loadDoctorAllCommentPatients(
            {
              doctorClientsPort: deps.doctorClientsPort,
              programItemDiscussion: deps.programItemDiscussion,
            },
            {
              viewerUserId: gate.ctx.session.user.userId,
              organizationId: gate.ctx.organizationId,
              visibilityActor: gate.ctx,
            },
            { excludedUserIds },
          )
        : loadDoctorCommentPatients(
            {
              doctorClientsPort: deps.doctorClientsPort,
              programItemDiscussion: deps.programItemDiscussion,
            },
            {
              viewerUserId: gate.ctx.session.user.userId,
              organizationId: gate.ctx.organizationId,
              visibilityActor: gate.ctx,
            },
            { excludedUserIds },
          ),
    );

    return NextResponse.json({ ok: true, patients });
  } catch (e) {
    return respondWithSafeApiError('api/doctor/comments/patients', e, {
      fallbackCode: 'comment_patients_load_failed',
      fallbackStatus: 500,
    });
  }
}
