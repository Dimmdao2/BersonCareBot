import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import {
  parsePatientHomeCmsReturnQuery,
  type PatientHomeCmsReturnQuery,
} from "@/modules/patient-home/patientHomeCmsReturnUrls";
import {
  CMS_UNASSIGNED_SECTION_SLUG,
  HELP_SECTION_SLUG,
  isHelpSectionSlug,
  isSystemParentCode,
  SYSTEM_PARENT_CODES,
} from "@/modules/content-sections/types";
import { cn } from "@/lib/utils";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorSectionCardClass } from "@/shared/ui/doctor/doctorVisual";
import { DataLoadFailureNotice } from "@/shared/ui/doctor/DataLoadFailureNotice";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { Separator } from "@/shared/ui/doctor/primitives/separator";
import { ContentForm } from "../ContentForm";

// ---------------------------------------------------------------------------
// Static labels for system folders (mirrors ContentNav; no import to avoid
// coupling — labels are stable strings)
// ---------------------------------------------------------------------------

const SYSTEM_FOLDER_LABELS: Record<string, string> = {
  situations: "Ситуации",
  sos: "SOS",
  warmups: "Разминки",
};

/** System codes hidden from the nav (moved/removed sections). */
const HIDDEN_SYSTEM_CODES = new Set(["lessons"]);

const CONTENT_BASE = "/app/doctor/content";

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
  } else if (sectionQueryRaw === HELP_SECTION_SLUG) {
    filteredSections = allSections.filter((s) => isHelpSectionSlug(s.slug));
  } else {
    filteredSections = allSections.filter((s) => s.kind === "article" && !isHelpSectionSlug(s.slug));
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

  // Article sections for the static nav sidebar (mirrors ContentNav filtering)
  const articleSectionEntries = allSections.filter(
    (s) =>
      s.kind === "article" &&
      s.slug !== CMS_UNASSIGNED_SECTION_SLUG &&
      !isHelpSectionSlug(s.slug),
  );

  return (
    <DoctorAppShell
      title="Новая страница"
      user={session.user}
      backHref={patientHomeContext?.returnTo ?? "/app/doctor/content"}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-4">
        {/* ── Static ContentNav (links back to content hub) ── */}
        <nav
          className="flex w-full flex-col gap-0.5 md:w-56 md:shrink-0"
          aria-label="Контент и страницы"
        >
          <p className="px-2.5 pt-1 pb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Системные разделы
          </p>
          <div className="group relative flex items-center">
            <Link
              href="/app/doctor/patient-home"
              className="flex flex-1 min-w-0 items-center rounded-md py-1.5 pl-2.5 pr-2 text-sm whitespace-normal transition-colors border-l-2 border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              Главная пациента
            </Link>
          </div>
          {SYSTEM_PARENT_CODES.filter((code) => !HIDDEN_SYSTEM_CODES.has(code)).map((code) => (
            <div key={code} className="group relative flex items-center">
              <Link
                href={`${CONTENT_BASE}?section=${code}`}
                className="flex flex-1 min-w-0 items-center rounded-md py-1.5 pl-2.5 pr-2 text-sm whitespace-normal transition-colors border-l-2 border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                {SYSTEM_FOLDER_LABELS[code] ?? code}
              </Link>
            </div>
          ))}

          <Separator className="my-1.5" />

          <div className="flex items-center justify-between px-2.5 pb-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Статьи и страницы
            </p>
            <Link
              href={`${CONTENT_BASE}/sections/new`}
              aria-label="Создать раздел"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-6 px-2 text-xs")}
            >
              + Раздел
            </Link>
          </div>

          {articleSectionEntries.length === 0 ? (
            <p className="px-2.5 text-xs text-muted-foreground">Нет пользовательских разделов.</p>
          ) : (
            articleSectionEntries.map((s) => (
              <div key={s.slug} className="group relative flex items-center">
                <Link
                  href={`${CONTENT_BASE}?section=section_${s.slug}`}
                  className="flex flex-1 min-w-0 items-center rounded-md py-1.5 pl-2.5 pr-2 text-sm whitespace-normal transition-colors border-l-2 border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  {s.title}
                </Link>
              </div>
            ))
          )}

          <Separator className="my-1.5" />

          <p className="px-2.5 pb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Медиа
          </p>
          <div className="group relative flex items-center">
            <Link
              href={`${CONTENT_BASE}/library`}
              className="flex flex-1 min-w-0 items-center rounded-md py-1.5 pl-2.5 pr-2 text-sm whitespace-normal transition-colors border-l-2 border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              Файлы и медиа
            </Link>
          </div>

          <p className="mt-2 px-2.5 text-xs text-muted-foreground leading-relaxed">
            Системные разделы не удаляются. «Статьи и страницы» — ваши собственные.
          </p>
        </nav>

        {/* ── Form area ── */}
        <section className={cn(doctorSectionCardClass, "min-w-0 flex-1 gap-4")}>
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
      </div>
    </DoctorAppShell>
  );
}
