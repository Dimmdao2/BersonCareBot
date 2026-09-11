import { notFound } from 'next/navigation';
import { z } from 'zod';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { readPatientInviteContinuationCookie } from '@/modules/patient-invites/continuationCookie';
import { getOptionalResolvedSurface } from '@/shared/lib/surface/requestSurface.server';
import { JoinPatientClient, type JoinBrand } from './JoinPatientClient';

type PageProps = { params: Promise<{ continuation: string }> };

/**
 * Чей бренд стоит над приглашением.
 *
 * Владелец 10.09: «он видит логотип терапии, логотип клиники», и 11.09 уточнил, чем эти два случая
 * различаются: «нет логотипа клиники, потому что небрендированная. Логотип терапии как раз есть».
 * То есть шапка показывает бренд ТОЙ ПОВЕРХНОСТИ, на которой человек стоит, ровно как это уже
 * сделано на пациентском входе (`TherapyGoLoginShell` против брендированного `PatientAppShell`):
 *
 * 1. Общий пациентский вход — бренд здесь наш собственный, значит логотип платформенного
 *    приложения. Именно сюда уводит редирект с чужого хоста, безымянным этот экран быть не должен.
 * 2. Брендированный хост клиники — её логотип, и наш тут не появляется: бренд клиники их. Про
 *    платформу человек всё равно узнаёт из соглашения в подвале (владелец 11.09: «нам же всё равно
 *    надо показывать соглашение о пользовании, всё равно надо давать информацию про нашу
 *    платформу»).
 *
 * Логотип клиники берётся ТОЛЬКО когда организация хоста совпала с организацией самого приглашения:
 * continuation можно открыть на хосте ЧУЖОЙ клиники, и тогда приглашение одной клиники показалось
 * бы под логотипом другой. Не совпало или приглашение неизвестно — шапки нет вовсе; имя клиники в
 * карточке всё равно стоит, оно приходит с самим приглашением.
 *
 * Идентификатор организации в браузер не уходит: сравнение целиком здесь.
 */
async function brandForInvite(inviteOrganizationId: string | null): Promise<JoinBrand> {
  const surface = await getOptionalResolvedSurface().catch(() => null);
  const brand = surface?.effectivePatientBrand;
  if (!brand) return { platformLockup: true };
  const sameClinic =
    inviteOrganizationId !== null && surface.organizationId === inviteOrganizationId;
  return sameClinic && brand.logoUrl ? { clinicLogoUrl: brand.logoUrl } : {};
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
