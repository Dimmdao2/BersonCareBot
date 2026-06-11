/**
 * Коммуникации → вкладка «Комментарии» («/app/doctor/comments»).
 *
 * Агрегатный URL: `/app/doctor/communications?tab=comments` (internal-rewrite, см. doctorRouteRedirects).
 *
 * Выделенный список новых комментариев пациентов по упражнениям: считается общим загрузчиком
 * `loadDoctorExerciseCommentAttention` по списку клиентов на сопровождении (тот же источник, что
 * и диалог «Сегодня»). См. communications.md TODO#1.
 */
import Link from "next/link";
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorCommunicationsTabsNav } from "../communications/DoctorCommunicationsTabsNav";
import { loadDoctorExerciseCommentAttention } from "../loadDoctorExerciseCommentAttention";
import { DoctorExerciseCommentsList } from "./DoctorExerciseCommentsList";

export default async function DoctorCommentsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();
  const clientAudience = audience?.excludedUserIds?.length
    ? { excludedUserIds: audience.excludedUserIds }
    : undefined;

  const onSupportListRaw = await deps.doctorClientsPort.listClients(
    { supportStatus: "on" },
    clientAudience,
  );
  const { items, total, truncated } = await loadDoctorExerciseCommentAttention(
    {
      doctorUserId: session.user.userId,
      treatmentProgramInstance: deps.treatmentProgramInstance,
      programItemDiscussion: deps.programItemDiscussion,
    },
    onSupportListRaw,
  );

  return (
    <DoctorAppShell title="Коммуникации" user={session.user}>
      <DoctorCommunicationsTabsNav activeTab="comments" />
      <DoctorSection id="doctor-communications-comments">
        <DoctorSectionTitle>Новые комментарии по упражнениям</DoctorSectionTitle>
        {items.length === 0 ? (
          <DoctorEmptyState>
            <p>Нет новых комментариев по упражнениям.</p>
            <p className="text-xs text-muted-foreground">
              Здесь появляются непрочитанные комментарии пациентов на сопровождении под активными
              упражнениями их программ. Эти же комментарии доступны на экране{" "}
              <Link href="/app/doctor" className={doctorInlineLinkClass}>
                «Сегодня»
              </Link>{" "}
              и в карточке пациента.
            </p>
          </DoctorEmptyState>
        ) : (
          <DoctorExerciseCommentsList items={items} total={total} truncated={truncated} />
        )}
      </DoctorSection>
    </DoctorAppShell>
  );
}
