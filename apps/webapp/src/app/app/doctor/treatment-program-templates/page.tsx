import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { TreatmentProgramTemplatesPageClient } from './TreatmentProgramTemplatesPageClient';
import {
  parseDoctorCatalogPubArchQuery,
  treatmentProgramTemplateFilterFromPubArch,
} from '@/shared/lib/doctorCatalogListStatus';

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    q?: string;
    titleSort?: string;
    region?: string;
    status?: string;
    arch?: string;
    pub?: string;
  }>;
};

export default async function TreatmentProgramTemplatesPage({ searchParams }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const deps = buildAppDeps();

  const sp = (await searchParams) ?? {};
  const listPubArch = parseDoctorCatalogPubArchQuery(sp);
  const tplListFilter = treatmentProgramTemplateFilterFromPubArch(listPubArch);

  // List only — related editor catalogs load on demand when constructor opens.
  const templatesPromise = deps.treatmentProgram.listTemplates(tplListFilter);

  const raw = typeof sp.selected === 'string' ? sp.selected.trim() : '';
  const initialSelectedId = raw || null;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const initialTitleSort = sp.titleSort === 'asc' || sp.titleSort === 'desc' ? sp.titleSort : null;

  return (
    <DoctorAppShell title="Шаблоны программ" user={session.user} backHref="/app/doctor">
      <DoctorPageHeader title="Шаблоны программ" />
      <TreatmentProgramTemplatesPageClient
        templatesPromise={templatesPromise}
        initialSelectedId={initialSelectedId}
        filters={{ q, listPubArch }}
        initialTitleSort={initialTitleSort}
      />
    </DoctorAppShell>
  );
}
