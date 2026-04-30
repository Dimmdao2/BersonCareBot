import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import {
  parsePatientHomeCmsReturnQuery,
  type PatientHomeCmsReturnQuery,
} from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { AppShell } from "@/shared/ui/AppShell";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import { ContentForm } from "../ContentForm";

function pick(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

export default async function DoctorContentNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireDoctorAccess();
  const sp = await searchParams;
  const patientHomeContext: PatientHomeCmsReturnQuery | null = parsePatientHomeCmsReturnQuery({
    returnTo: pick(sp, "returnTo"),
    patientHomeBlock: pick(sp, "patientHomeBlock"),
    suggestedTitle: pick(sp, "suggestedTitle"),
    suggestedSlug: pick(sp, "suggestedSlug"),
  });
  const sectionQueryRaw = pick(sp, "section")?.trim() ?? "";
  const deps = buildAppDeps();
  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let publishedCourses: { id: string; title: string }[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    sections = await deps.contentSections.listAll();
    publishedCourses = (
      await deps.courses.listCoursesForDoctor({ status: "published", includeArchived: false })
    ).map((c) => ({ id: c.id, title: c.title }));
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/content/new", err);
  }

  const isDev = process.env.NODE_ENV === "development";

  const knownSectionSlugs = new Set(sections.map((s) => s.slug));
  const initialSectionSlug =
    sectionQueryRaw.length > 0 && knownSectionSlugs.has(sectionQueryRaw) ? sectionQueryRaw : null;

  return (
    <AppShell
      title="Новая страница"
      user={session.user}
      variant="doctor"
      backHref={patientHomeContext?.returnTo ?? "/app/doctor/content"}
    >
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        <ContentForm
          sections={sections}
          publishedCourses={publishedCourses}
          patientHomeContext={patientHomeContext ?? undefined}
          initialSectionSlug={initialSectionSlug ?? undefined}
        />
      </section>
    </AppShell>
  );
}
