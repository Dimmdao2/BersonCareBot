import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { AppShell } from "@/shared/ui/AppShell";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import {
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
} from "@/shared/ui/patientVisual";

type Props = {
  params: Promise<{ auditId: string }>;
};

export default async function PatientBroadcastPage({ params }: Props) {
  const { auditId } = await params;
  const selfPath = routePaths.patientBroadcast(auditId);
  const session = await requirePatientAccess(selfPath);
  const deps = buildAppDeps();
  const view = await deps.patientBroadcasts.getBroadcastForPatient(auditId, session.user.userId);
  if (!view) notFound();

  const timeZone = await getAppDisplayTimeZone();
  const dateLabel = formatBookingDateTimeMediumRu(view.executedAt, timeZone);

  return (
    <AppShell
      title={view.title}
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <div className={patientInnerPageStackClass}>
        <article className={patientSectionSurfaceClass}>
          {dateLabel ?
            <p className={`${patientMutedTextClass} text-sm`}>{dateLabel}</p>
          : null}
          <div className="whitespace-pre-wrap text-sm text-foreground">{view.body}</div>
        </article>
      </div>
    </AppShell>
  );
}
