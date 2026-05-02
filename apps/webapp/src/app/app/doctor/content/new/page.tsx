import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import {
  parsePatientHomeCmsReturnQuery,
  type PatientHomeCmsReturnQuery,
} from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { isSystemParentCode } from "@/modules/content-sections/types";
import { AppShell } from "@/shared/ui/AppShell";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import { buttonVariants } from "@/components/ui/button-variants";
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
  const systemParentRaw = pick(sp, "systemParentCode")?.trim().toLowerCase() ?? "";
  const systemParentFilter = isSystemParentCode(systemParentRaw) ? systemParentRaw : undefined;

  const deps = buildAppDeps();
  let allSections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let publishedCourses: { id: string; title: string }[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    allSections = await deps.contentSections.listAll();
    publishedCourses = (
      await deps.courses.listCoursesForDoctor({ status: "published", includeArchived: false })
    ).map((c) => ({ id: c.id, title: c.title }));
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/content/new", err);
  }

  const isDev = process.env.NODE_ENV === "development";

  let filteredSections = allSections;
  if (systemParentFilter) {
    filteredSections = allSections.filter(
      (s) => s.kind === "system" && s.systemParentCode === systemParentFilter,
    );
  } else {
    filteredSections = allSections.filter((s) => s.kind === "article");
  }

  const sectionQueryClean = sectionQueryRaw.length > 0 ? sectionQueryRaw : "";
  if (
    sectionQueryClean.length > 0 &&
    filteredSections.some((s) => s.slug === sectionQueryClean)
  ) {
    filteredSections = filteredSections.filter((s) => s.slug === sectionQueryClean);
  }

  const initialSectionSlug = filteredSections.length === 1 ? filteredSections[0]!.slug : null;

  const sectionSelectReadOnly = filteredSections.length === 1;

  const emptySectionsBlock =
    !loadError && filteredSections.length === 0 ? (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          {systemParentFilter ? (
            <>
              В этой системной папке пока нет разделов. Создайте раздел или добавьте существующий из каталога статей.
            </>
          ) : (
            <>Нет разделов для статей. Сначала создайте раздел в CMS.</>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {systemParentFilter ? (
            <Link
              href={`/app/doctor/content/sections/new?systemParentCode=${encodeURIComponent(systemParentFilter)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Создать раздел в папке
            </Link>
          ) : null}
          {systemParentFilter ? (
            <Link
              href={`/app/doctor/content?systemParentCode=${encodeURIComponent(systemParentFilter)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Добавить из существующих разделов
            </Link>
          ) : (
            <Link href="/app/doctor/content/sections/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Создать раздел
            </Link>
          )}
          <Link href="/app/doctor/content" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Назад к контенту
          </Link>
        </div>
      </div>
    ) : null;

  return (
    <AppShell
      title="Новая страница"
      user={session.user}
      variant="doctor"
      backHref={patientHomeContext?.returnTo ?? "/app/doctor/content"}
    >
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        {emptySectionsBlock}
        {!loadError && filteredSections.length > 0 ? (
          <ContentForm
            sections={filteredSections}
            publishedCourses={publishedCourses}
            patientHomeContext={patientHomeContext ?? undefined}
            initialSectionSlug={initialSectionSlug ?? undefined}
            sectionSelectReadOnly={sectionSelectReadOnly}
          />
        ) : null}
      </section>
    </AppShell>
  );
}
