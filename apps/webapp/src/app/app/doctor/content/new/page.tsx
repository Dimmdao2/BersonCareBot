import { notFound } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logServerRuntimeError } from '@/infra/logging/serverRuntimeLog';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  getMechanicMutationAvailability,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  parsePatientHomeCmsReturnQuery,
  type PatientHomeCmsReturnQuery,
} from '@/modules/patient-home/patientHomeCmsReturnUrls';
import {
  HELP_SECTION_SLUG,
  isHelpSectionSlug,
  isSystemParentCode,
} from '@/modules/content-sections/types';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { doctorSectionCardClass } from '@/shared/ui/doctor/doctorVisual';
import { DataLoadFailureNotice } from '@/shared/ui/doctor/DataLoadFailureNotice';
import { ContentForm } from '../ContentForm';

function pick(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
}

export default async function DoctorContentNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const workspace = await requireDoctorWorkspaceContext();
  const entitlement = await requireEntitlementForReadAction(workspace, 'cms_pages');
  if (!entitlement.ok) notFound();
  if (!(await getMechanicMutationAvailability(workspace, 'cms_pages')).available) notFound();
  const session = workspace.session;
  const sp = await searchParams;
  const patientHomeContext: PatientHomeCmsReturnQuery | null = parsePatientHomeCmsReturnQuery({
    returnTo: pick(sp, 'returnTo'),
    patientHomeBlock: pick(sp, 'patientHomeBlock'),
    suggestedTitle: pick(sp, 'suggestedTitle'),
    suggestedSlug: pick(sp, 'suggestedSlug'),
  });
  const sectionQueryRaw = pick(sp, 'section')?.trim() ?? '';
  const systemParentRaw = pick(sp, 'systemParentCode')?.trim().toLowerCase() ?? '';
  const systemParentFilter = isSystemParentCode(systemParentRaw) ? systemParentRaw : undefined;

  const deps = buildAppDeps();
  const coursesEnabled = (await requireEntitlementForReadAction(workspace, 'courses')).ok;
  let allSections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let publishedCourses: { id: string; title: string }[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    ({ allSections, publishedCourses } = await withDoctorWorkspacePrincipal(
      workspace,
      'doctor.content.new.read',
      async () => ({
        allSections: await deps.contentSections.listAll(),
        publishedCourses: coursesEnabled
          ? (
              await deps.courses.listCoursesForDoctor({
                status: 'published',
                includeArchived: false,
              })
            ).map((c) => ({ id: c.id, title: c.title }))
          : [],
      }),
    ));
  } catch (err) {
    loadError = logServerRuntimeError('app/doctor/content/new', err);
  }

  const isDev = process.env.NODE_ENV === 'development';

  let filteredSections = allSections;
  if (systemParentFilter) {
    filteredSections = allSections.filter(
      (s) => s.kind === 'system' && s.systemParentCode === systemParentFilter,
    );
  } else if (sectionQueryRaw === HELP_SECTION_SLUG) {
    filteredSections = allSections.filter((s) => isHelpSectionSlug(s.slug));
  } else {
    filteredSections = allSections.filter(
      (s) => s.kind === 'article' && !isHelpSectionSlug(s.slug),
    );
  }

  const sectionQueryClean = sectionQueryRaw.length > 0 ? sectionQueryRaw : '';
  if (sectionQueryClean.length > 0 && filteredSections.some((s) => s.slug === sectionQueryClean)) {
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
              В этой системной папке пока нет разделов. Создайте раздел или добавьте существующий из
              каталога статей.
            </>
          ) : (
            <>Нет разделов для статей. Сначала создайте раздел в CMS.</>
          )}
        </p>
      </div>
    ) : null;

  return (
    <DoctorAppShell
      title="Новая страница"
      user={session.user}
      backHref={patientHomeContext?.returnTo ?? '/app/doctor/content'}
    >
      <div className="flex flex-col gap-4">
        <section className={`${doctorSectionCardClass} min-w-0 gap-4`}>
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
