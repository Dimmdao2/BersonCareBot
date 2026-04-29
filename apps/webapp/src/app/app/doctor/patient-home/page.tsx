import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { PATIENT_HOME_CMS_BLOCK_CODES, PATIENT_HOME_SYSTEM_BLOCK_CODES } from "@/modules/patient-home/blocks";
import type { PatientHomeEditorCandidateRow } from "@/modules/patient-home/patientHomeEditorDemo";
import { PatientHomeBlockSettingsCard } from "@/app/app/settings/patient-home/PatientHomeBlockSettingsCard";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import type { PatientHomeUnresolvedRef } from "@/modules/patient-home/patientHomeUnresolvedRefs";

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
  dbPages: PatientHomeEditorCandidateRow[],
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
  for (const c of dbPages) push(c);
  for (const c of dbCourses) push(c);
  return out;
}

function buildUnresolvedRefs(
  items: { resolved: boolean; isVisible: boolean; targetType: string; targetRef: string }[],
): PatientHomeUnresolvedRef[] {
  const refs: PatientHomeUnresolvedRef[] = [];
  for (const i of items) {
    if (!i.resolved) {
      refs.push({ kind: "missing_target", targetKey: `${i.targetType}:${i.targetRef}` });
    }
  }
  return refs;
}

export default async function DoctorPatientHomePage() {
  const deps = buildAppDeps();
  let sectionCandidates: PatientHomeEditorCandidateRow[] = [];
  let pageCandidates: PatientHomeEditorCandidateRow[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    const sections = await deps.contentSections.listAll();
    sectionCandidates = mapSectionsToCandidates(sections);
    const pages = await deps.contentPages.listAll();
    pageCandidates = pages.map((p) => ({
      id: `pg-${p.id}`,
      targetType: "content_page" as const,
      targetRef: p.slug,
      title: p.title,
    }));
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

  let cmsSnapshots: Awaited<ReturnType<typeof deps.patientHome.listAllCmsBlockSnapshots>> | null = null;
  try {
    cmsSnapshots = await deps.patientHome.listAllCmsBlockSnapshots();
  } catch (err) {
    loadError = loadError ?? logServerRuntimeError("app/doctor/patient-home/cms", err);
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Главная пациента</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Настройка контентных блоков и подсказок по тому, что увидит пациент. Элементы блоков хранятся в{" "}
          <code className="rounded bg-muted px-1">patient_home_block_items</code> и отображаются на{" "}
          <code className="rounded bg-muted px-1">/app/patient</code> после публикации целей в CMS.
        </p>
      </header>

      {loadError ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Не удалось загрузить данные редактора главной пациента.
          {isDev ? ` (${loadError.name}: ${loadError.message})` : null}
        </p>
      ) : null}

      <section className="space-y-4" aria-labelledby="patient-home-cms-heading">
        <h2 id="patient-home-cms-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Контентные блоки
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PATIENT_HOME_CMS_BLOCK_CODES.map((code) => {
            const snap = cmsSnapshots?.[code];
            const items = snap?.items ?? [];
            const visible = items.filter((i) => i.isVisible && i.resolved).length;
            let initialCandidates: PatientHomeEditorCandidateRow[];
            if (code === "situations") {
              initialCandidates = sectionCandidates;
            } else if (code === "courses") {
              initialCandidates = dbCourseCandidates.length > 0 ? dbCourseCandidates : [];
            } else if (code === "subscription_carousel") {
              initialCandidates = mergeSubscriptionCarouselCandidates(sectionCandidates, pageCandidates, dbCourseCandidates);
            } else if (code === "daily_warmup") {
              initialCandidates = pageCandidates;
            } else {
              initialCandidates = [...sectionCandidates, ...pageCandidates];
            }
            return (
              <PatientHomeBlockSettingsCard
                key={code}
                blockCode={code}
                isBlockVisible={snap?.blockVisible ?? true}
                visibleItemsCount={visible}
                unresolvedRefs={buildUnresolvedRefs(items)}
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
