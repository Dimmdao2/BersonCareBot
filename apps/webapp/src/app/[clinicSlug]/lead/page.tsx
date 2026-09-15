import { notFound } from 'next/navigation';
import { PublicLeadForm } from '@/shared/publicBook/PublicLeadForm';
import { withPublicLeadsAccess } from '@/app-layer/leads/withPublicLeadsAccess';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';

export const dynamic = 'force-dynamic';

export default async function PublicLeadPage({
  params,
}: {
  params: Promise<{ clinicSlug: string }>;
}) {
  stampBootstrapPrincipal('app/[clinicSlug]/lead:page');
  const { clinicSlug } = await params;
  const available = await withPublicLeadsAccess(
    clinicSlug,
    'app/[clinicSlug]/lead:page',
    'read',
    async () => true,
  );
  if (!available.ok) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <PublicLeadForm orgSlug={clinicSlug} sourceSurface="widget" />
    </main>
  );
}
