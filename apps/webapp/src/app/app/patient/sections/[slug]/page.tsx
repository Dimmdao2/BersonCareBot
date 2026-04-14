/**
 * Список материалов раздела: «/app/patient/sections/[slug]».
 * Раздел и карточки загружаются из БД (content_sections + content_pages).
 */

import { notFound } from "next/navigation";
import { reminderRuleToPatientJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";
import { SectionWarmupsReminderBar } from "../SectionWarmupsReminderBar";

type Props = { params: Promise<{ slug: string }> };

export default async function PatientSectionPage({ params }: Props) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();

  const section = await deps.contentSections.getBySlug(slug);
  if (!section || !section.isVisible) notFound();

  const canViewAuth = await resolvePatientCanViewAuthOnlyContent(session);
  if (section.requiresAuth && !canViewAuth) notFound();

  const pages = await deps.contentPages.listBySection(slug, { viewAuthOnlyPages: canViewAuth });

  let warmupsReminderJson: ReturnType<typeof reminderRuleToPatientJson> | null = null;
  let warmupsPersonalBar = false;
  if (slug === "warmups" && session) {
    const dataGate = await patientRscPersonalDataGate(
      session,
      `/app/patient/sections/${encodeURIComponent(slug)}`,
    );
    if (dataGate === "allow") {
      warmupsPersonalBar = true;
      const rules = await deps.reminders.listRulesByUser(session.user.userId);
      const matches = rules.filter(
        (r) => r.linkedObjectType === "content_section" && r.linkedObjectId === "warmups",
      );
      matches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const latest = matches[0];
      if (latest) warmupsReminderJson = reminderRuleToPatientJson(latest);
    }
  }

  return (
    <AppShell title={section.title} user={session?.user ?? null} backHref="/app/patient" backLabel="Меню" variant="patient">
      {warmupsPersonalBar ? (
        <SectionWarmupsReminderBar sectionTitle={section.title} existingRule={warmupsReminderJson} />
      ) : null}
      <section id={`patient-section-${slug}-grid`} className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <FeatureCard
            key={p.id}
            containerId={`patient-section-${slug}-card-${p.slug}`}
            title={p.title}
            href={`/app/patient/content/${p.slug}`}
            compact
          />
        ))}
      </section>
      {pages.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">В этом разделе пока нет материалов.</p>
      ) : null}
    </AppShell>
  );
}
