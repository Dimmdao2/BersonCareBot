import { notFound } from 'next/navigation';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { readPatientInviteContinuationCookie } from '@/modules/patient-invites/continuationCookie';
import { getOptionalResolvedSurface } from '@/shared/lib/surface/requestSurface.server';
import { JoinPatientClient, type JoinBrand } from './JoinPatientClient';
import { joinBrandFor } from './joinBrand';

type PageProps = { params: Promise<{ continuation: string }> };

/**
 * Бренд шапки. Решение живёт в `joinBrand.ts` и проверяется там же; здесь только то, что требует
 * запроса: поверхность, резолвленная по хосту. Идентификатор организации в браузер не уходит —
 * сравнение целиком на сервере.
 */
async function brandForInvite(inviteOrganizationId: string | null): Promise<JoinBrand> {
  const surface = await getOptionalResolvedSurface().catch(() => null);
  return joinBrandFor(
    surface && {
      organizationId: surface.organizationId,
      patientBrand: surface.effectivePatientBrand,
    },
    inviteOrganizationId,
  );
}

export default async function JoinContinuationPage({ params }: PageProps) {
  const { continuation } = await params;
  if (!z.string().min(32).max(256).safeParse(continuation).success) notFound();
  const cookieContinuation = await readPatientInviteContinuationCookie();
  if (cookieContinuation !== continuation) {
    return (
      <JoinPatientClient
        preview={null}
        failureCode="invalid_continuation"
        brand={await brandForInvite(null)}
      />
    );
  }
  stampBootstrapPrincipal('join/[continuation]:page');
  const result = await buildAppDeps().patientInvites.lookupContinuation(continuation);
  return (
    <JoinPatientClient
      preview={result.ok ? result.preview : null}
      failureCode={result.ok ? null : result.code}
      brand={await brandForInvite(result.ok ? result.organizationId : null)}
    />
  );
}
