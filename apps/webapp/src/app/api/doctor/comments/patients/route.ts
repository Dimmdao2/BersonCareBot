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
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { loadDoctorCommentPatients } from "@/app/app/doctor/comments/loadDoctorCommentPatients";
import { loadDoctorAllCommentPatients } from "@/app/app/doctor/comments/loadDoctorAllCommentPatients";

export async function GET(request: Request) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "all" ? "all" : "unread";

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();
  const excludedUserIds = audience?.excludedUserIds?.length
    ? audience.excludedUserIds
    : undefined;

  try {
    const patients =
      mode === "all"
        ? await loadDoctorAllCommentPatients(
            {
              doctorClientsPort: deps.doctorClientsPort,
              programItemDiscussion: deps.programItemDiscussion,
            },
            { viewerUserId: auth.session.user.userId },
            { excludedUserIds },
          )
        : await loadDoctorCommentPatients(
            {
              doctorClientsPort: deps.doctorClientsPort,
              programItemDiscussion: deps.programItemDiscussion,
            },
            { viewerUserId: auth.session.user.userId },
            { excludedUserIds },
          );

    return NextResponse.json({ ok: true, patients });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
