import { notFound } from 'next/navigation';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { readPatientInviteContinuationCookie } from '@/modules/patient-invites/continuationCookie';
import { getOptionalResolvedSurface } from '@/shared/lib/surface/requestSurface.server';
import { JoinPatientClient, type JoinBrand } from './JoinPatientClient';

type PageProps = { params: Promise<{ continuation: string }> };

/**
 * Бренд на экране приглашения — только тот, чьё это приглашение.
 *
 * Владелец 10.09: «он видит логотип терапии, логотип клиники». Бренд клиники уже приезжает в
 * запрос: поверхность резолвится по хосту (`<slug>.<пациентский хост>` либо брендированный домен) и
 * несёт `effectivePatientBrand`. Брать его на веру нельзя — continuation можно открыть на хосте
 * ЧУЖОЙ клиники, и тогда приглашение одной клиники показалось бы под логотипом другой. Поэтому
 * логотип берётся ТОЛЬКО когда организация хоста совпала с организацией самого приглашения; иначе
 * остаётся имя клиники текстом, которое пришло вместе с приглашением.
 *
 * Идентификатор организации в браузер не уходит: сравнение целиком здесь, наружу отдаётся только
 * готовая пара «логотип + имя приложения».
 */
async function brandForInvite(inviteOrganizationId: string | null): Promise<JoinBrand> {
  const surface = await getOptionalResolvedSurface().catch(() => null);
  const brand = surface?.effectivePatientBrand;
  if (!brand) return {};
  // Организация приглашения неизвестна (кука не совпала, ссылка протухла) — значит и утверждать,
  // чьё это приглашение, нечем: остаётся имя приложения, то есть «логотип терапии» без клиники.
  const sameClinic =
    inviteOrganizationId !== null && surface.organizationId === inviteOrganizationId;
  return {
    patientAppName: brand.patientAppName,
    ...(sameClinic && brand.logoUrl ? { clinicLogoUrl: brand.logoUrl } : {}),
  };
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
