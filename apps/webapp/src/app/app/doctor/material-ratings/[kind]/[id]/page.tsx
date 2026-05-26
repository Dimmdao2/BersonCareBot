import { DateTime } from "luxon";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { MATERIAL_RATING_TARGET_KINDS } from "@/modules/material-rating/types";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { AppShell } from "@/shared/ui/AppShell";

import { MaterialRatingDetailClient } from "@/app/app/doctor/material-ratings/MaterialRatingDetailClient";
import { MaterialRatingFeedbackDoctorPanel } from "@/app/app/doctor/material-ratings/MaterialRatingFeedbackDoctorPanel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ kind: string; id: string }>;
};

export default async function DoctorMaterialRatingDetailPage({ params }: Props) {
  const session = await requireDoctorAccess();
  const { kind, id } = await params;

  if (!MATERIAL_RATING_TARGET_KINDS.includes(kind as (typeof MATERIAL_RATING_TARGET_KINDS)[number])) {
    notFound();
  }
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const deps = buildAppDeps();
  const iana = await getAppDisplayTimeZone();
  const calendarTodayYmd = DateTime.now().setZone(iana).toFormat("yyyy-LL-dd");

  let titleSuffix = id;
  let feedbackSummary = null;
  if (kind === "content_page") {
    const meta = await deps.contentPages.listMetaByIds([id]);
    titleSuffix = meta[0]?.title?.trim() || id;
    feedbackSummary = await deps.materialRatingFeedback.getDoctorSummary(id);
  } else if (kind === "lfk_exercise") {
    const titles = await deps.lfkExercises.listExerciseTitlesByIds([id]);
    titleSuffix = titles.get(id)?.trim() || id;
  } else if (kind === "lfk_complex") {
    const t = await deps.lfkTemplates.getTemplate(id);
    titleSuffix = t?.title?.trim() || id;
  }

  return (
    <AppShell
      title={`Статистика · ${titleSuffix}`}
      user={session.user}
      variant="doctor"
      backHref="/app/doctor/material-ratings"
      backLabel="К сводке"
    >
      <div className="flex flex-col gap-6">
        <MaterialRatingDetailClient kind={kind} id={id} calendarTodayYmd={calendarTodayYmd} />
        {feedbackSummary ?
          <MaterialRatingFeedbackDoctorPanel contentPageId={id} summary={feedbackSummary} />
        : null}
      </div>
    </AppShell>
  );
}
