/**
 * Коммуникации → вкладка «Комментарии» («/app/doctor/comments»).
 *
 * Агрегатный URL: `/app/doctor/communications?tab=comments` (internal-rewrite, см. doctorRouteRedirects).
 *
 * TODO (communications.md): подключить выделенный список новых комментариев к упражнениям.
 * Данные уже считаются в `loadTodayExerciseCommentAttention` (loadDoctorTodayDashboard.ts) —
 * требуется извлечь загрузчик в shared app-layer (`loadDoctorExerciseCommentAttention`) и
 * переиспользовать здесь со списком клиентов на сопровождении. До этого комментарии
 * остаются доступны на экране «Сегодня» (диалог) и в карточке пациента.
 */
import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorCommunicationsTabsNav } from "../communications/DoctorCommunicationsTabsNav";

export default async function DoctorCommentsPage() {
  const session = await requireDoctorAccess();

  return (
    <DoctorAppShell title="Коммуникации" user={session.user}>
      <DoctorCommunicationsTabsNav activeTab="comments" />
      <DoctorSection id="doctor-communications-comments">
        <DoctorSectionTitle>Новые комментарии по упражнениям</DoctorSectionTitle>
        <DoctorEmptyState>
          <p>Выделенный список комментариев готовится.</p>
          <p className="text-xs text-muted-foreground">
            Сейчас новые комментарии пациентов по упражнениям доступны на экране{" "}
            <Link href="/app/doctor" className={doctorInlineLinkClass}>
              «Сегодня»
            </Link>{" "}
            и в карточке пациента (программа лечения).
          </p>
        </DoctorEmptyState>
      </DoctorSection>
    </DoctorAppShell>
  );
}
