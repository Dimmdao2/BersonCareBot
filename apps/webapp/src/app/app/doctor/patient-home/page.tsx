import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { PATIENT_HOME_CMS_BLOCK_CODES, PATIENT_HOME_SYSTEM_BLOCK_CODES } from "@/modules/patient-home/blocks";
import { getDemoPatientHomeEditorPayload } from "@/modules/patient-home/patientHomeEditorDemo";
import type { PatientHomeEditorCandidateRow } from "@/modules/patient-home/patientHomeEditorDemo";
import { PatientHomeBlockSettingsCard } from "@/app/app/settings/patient-home/PatientHomeBlockSettingsCard";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";

function mapSectionsToCandidates(rows: { slug: string; title: string }[]): PatientHomeEditorCandidateRow[] {
  return rows.map((s) => ({
    id: `sec-${s.slug}`,
    targetType: "content_section" as const,
    targetRef: s.slug,
    title: s.title,
  }));
}

function mergeSubscriptionCarouselCandidates(
  sectionCandidates: PatientHomeEditorCandidateRow[],
  demoCandidates: PatientHomeEditorCandidateRow[],
  dbCourses: PatientHomeEditorCandidateRow[],
): PatientHomeEditorCandidateRow[] {
  const out: PatientHomeEditorCandidateRow[] = [];
  const seen = new Set<string>();
  const push = (c: PatientHomeEditorCandidateRow) => {
    const k = `${c.targetType}:${c.targetRef}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  for (const c of sectionCandidates) push(c);
  for (const c of demoCandidates) {
    if (c.targetType === "content_section") continue;
    push(c);
  }
  for (const c of dbCourses) push(c);
  return out;
}

export default async function DoctorPatientHomePage() {
  const deps = buildAppDeps();
  let sectionCandidates: PatientHomeEditorCandidateRow[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    const sections = await deps.contentSections.listAll();
    sectionCandidates = mapSectionsToCandidates(sections);
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/patient-home", err);
  }

  let dbCourseCandidates: PatientHomeEditorCandidateRow[] = [];
  try {
    const crs = await deps.courses.listCoursesForDoctor({ includeArchived: false });
    dbCourseCandidates = crs.map((c) => ({
      id: `dbc-${c.id}`,
      targetType: "course" as const,
      targetRef: c.id,
      title: c.title,
      statusLabel: c.status,
    }));
  } catch {
    /* ignore — in-memory / CI без courses */
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Главная пациента</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Настройка контентных блоков и подсказок по тому, что увидит пациент. Кандидаты-разделы для «Ситуаций»
          загружаются из БД; курсы для блока «Курсы» и карусели — из БД (без архивных по умолчанию). Привязка элементов к
          блоку в таблице `patient_home_block_items` — в следующих фазах инициативы.
        </p>
      </header>

      {loadError ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Не удалось загрузить разделы контента для выбора.
          {isDev ? ` (${loadError.name}: ${loadError.message})` : null}
        </p>
      ) : null}

      <section className="space-y-4" aria-labelledby="patient-home-cms-heading">
        <h2 id="patient-home-cms-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Контентные блоки
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PATIENT_HOME_CMS_BLOCK_CODES.map((code) => {
            const { items, candidates: demoCandidates } = getDemoPatientHomeEditorPayload(code);
            const visible = items.filter((i) => i.isVisible && i.resolved).length;
            let initialCandidates: PatientHomeEditorCandidateRow[];
            if (code === "situations") {
              initialCandidates = sectionCandidates;
            } else if (code === "courses") {
              initialCandidates = dbCourseCandidates.length > 0 ? dbCourseCandidates : demoCandidates;
            } else if (code === "subscription_carousel") {
              initialCandidates = mergeSubscriptionCarouselCandidates(
                sectionCandidates,
                demoCandidates,
                dbCourseCandidates,
              );
            } else {
              initialCandidates = demoCandidates;
            }
            return (
              <PatientHomeBlockSettingsCard
                key={code}
                blockCode={code}
                isBlockVisible
                visibleItemsCount={visible}
                initialItems={items}
                initialCandidates={initialCandidates}
              />
            );
          })}
        </div>
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="patient-home-system-heading">
        <h2
          id="patient-home-system-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Системные блоки
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PATIENT_HOME_SYSTEM_BLOCK_CODES.map((code) => (
            <PatientHomeBlockSettingsCard key={code} blockCode={code} isBlockVisible visibleItemsCount={0} />
          ))}
        </div>
      </section>
    </div>
  );
}
