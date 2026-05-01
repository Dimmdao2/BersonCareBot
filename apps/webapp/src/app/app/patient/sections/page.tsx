/**
 * Каталог разделов CMS: «/app/patient/sections».
 * Без tier patient показываются только разделы с `requires_auth = false`.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";
import {
  patientInnerCardGridClass,
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientPageSubtitleClass,
} from "@/shared/ui/patientVisual";

export default async function PatientSectionsIndexPage() {
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const canViewAuth = await resolvePatientCanViewAuthOnlyContent(session);

  let sections: Awaited<ReturnType<typeof deps.contentSections.listVisible>> = [];
  try {
    sections = await deps.contentSections.listVisible({ viewAuthOnlySections: canViewAuth });
  } catch (err) {
    logServerRuntimeError("app/patient/sections/index", err);
  }

  return (
    <AppShell
      title="Уроки и тренировки"
      user={session?.user ?? null}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <div className={patientInnerPageStackClass}>
        <p className={patientPageSubtitleClass}>
          Материалы по разделам. Некоторые разделы доступны после входа с подтверждённым телефоном.
        </p>
        <section className={patientInnerCardGridClass}>
          {sections.map((s) => (
            <FeatureCard
              key={s.id}
              containerId={`patient-sections-index-${s.slug}`}
              title={s.title}
              description={s.description || undefined}
              href={`/app/patient/sections/${encodeURIComponent(s.slug)}`}
            />
          ))}
        </section>
        {sections.length === 0 ? (
          <p className={patientMutedTextClass}>Пока нет доступных разделов.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
