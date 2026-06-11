/**
 * GET /api/doctor/exercise-comments
 *
 * Ленивая история комментариев для таба «Коммуникации → Комментарии» (TODO#3 Block 2.B).
 * Используется клиентским компонентом DoctorCommentsTab для подгрузки истории на скролле
 * и серверного добора при поиске (когда локальный фильтр даёт 0 результатов).
 *
 * Query params:
 *   cursor — JSON-encoded DoctorExerciseCommentCursor (optional, для пагинации)
 *   q      — строка поиска (optional, для серверного добора; без курсора)
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";
import type { TodayExerciseCommentAttentionItem } from "@/app/app/doctor/loadDoctorExerciseCommentAttention";
import { formatDateTimeRu } from "@/app/app/doctor/doctorTodayFormat";
import { doctorClientTreatmentProgramInstanceHref } from "@/app/app/doctor/clients/doctorClientInstanceHref";

const PAGE_SIZE = 30;

export async function GET(request: Request) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const cursorParam = searchParams.get("cursor");
  const q = searchParams.get("q")?.trim() ?? "";

  let cursor: DoctorExerciseCommentCursor | null = null;
  if (cursorParam) {
    try {
      const parsed = JSON.parse(cursorParam) as unknown;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        typeof (parsed as Record<string, unknown>).createdAt === "string" &&
        typeof (parsed as Record<string, unknown>).id === "string"
      ) {
        cursor = parsed as DoctorExerciseCommentCursor;
      } else {
        return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
    }
  }

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();
  const clientAudience = audience?.excludedUserIds?.length
    ? { excludedUserIds: audience.excludedUserIds }
    : undefined;

  const onSupport = await deps.doctorClientsPort.listClients(
    { supportStatus: "on" },
    clientAudience,
  );
  if (onSupport.length === 0) {
    return NextResponse.json({ ok: true, items: [], hasMore: false, nextCursor: null });
  }

  const nameById = new Map(
    onSupport.map((c) => [c.userId.trim(), c.displayName.trim() || "—"]),
  );
  const patientUserIds = [...nameById.keys()];

  const rows = await deps.programItemDiscussion.listExerciseCommentsForDoctor({
    patientUserIds,
    viewerUserId: auth.session.user.userId,
    limit: PAGE_SIZE + 1,
    cursor,
  });

  const hasMoreRaw = rows.length > PAGE_SIZE;
  const pageRows = q ? rows.slice(0, PAGE_SIZE) : rows.slice(0, PAGE_SIZE);

  let items: TodayExerciseCommentAttentionItem[] = pageRows.map((row) => ({
    patientUserId: row.patientUserId,
    patientDisplayName: nameById.get(row.patientUserId) ?? "—",
    instanceId: row.instanceId,
    stageItemId: row.stageItemId,
    stageItemTitle: row.stageItemTitle || "Упражнение",
    latestMessage: row.latestMessage,
    latestMessageAtLabel: formatDateTimeRu(row.latestMessage.createdAt),
    href: doctorClientTreatmentProgramInstanceHref(row.patientUserId, row.instanceId, {
      profileListScope: "appointments",
      discussionItemId: row.stageItemId,
    }),
  }));

  if (q) {
    const lower = q.toLowerCase();
    items = items.filter(
      (item) =>
        item.patientDisplayName.toLowerCase().includes(lower) ||
        (item.latestMessage.body?.toLowerCase().includes(lower) ?? false) ||
        item.stageItemTitle.toLowerCase().includes(lower),
    );
  }

  const lastRow = pageRows[pageRows.length - 1];
  const hasMore = hasMoreRaw && !q;
  const nextCursor: DoctorExerciseCommentCursor | null =
    hasMore && lastRow
      ? { createdAt: lastRow.createdAt, id: lastRow.latestMessage.id }
      : null;

  return NextResponse.json({ ok: true, items, hasMore, nextCursor });
}
