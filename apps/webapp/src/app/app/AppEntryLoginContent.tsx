'use client';

/**
 * Клиентская часть экрана `/app` и Suspense с AuthBootstrap.
 */

import { Suspense } from 'react';
import { AuthBootstrap } from '@/shared/ui/patient/AuthBootstrap';
import { LegalFooterLinks } from '@/shared/ui/patient/LegalFooterLinks';
import type { MessengerSurfaceHint } from '@/shared/lib/platform';
import type { SurfaceAuthPolicy } from '@/shared/lib/surface/requestSurface';
import type { PrefetchedPublicAuthConfig } from '@/shared/ui/patient/auth/AuthFlowV2';
import type { UnauthenticatedAppEntryClassification } from '@/modules/auth/appEntryClassification';
import { CLIENT_BOOT_ACTIVE_CONTENT_ID } from '@/modules/auth/clientBootWatchdog';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';
import { RoleLoginPortalHeader } from '@/shared/ui/auth/RoleLoginPortalHeader';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';

type AppEntryLoginContentProps = {
  supportContactHref: string;
  /** Серверный снимок публичных конфигов входа — без дублирующих fetch на клиенте. */
  prefetchedPublicAuth?: PrefetchedPublicAuthConfig | null;
  /** Cookie платформы `bot` после `?ctx=bot|max`: подавляет `auth/exchange` по `?t=` в пользу initData. */
  serverPlatformMessengerCookie?: boolean;
  /** Канал из middleware (`ctx=bot` → telegram, `ctx=max` → max); условная загрузка MAX bridge. */
  serverMessengerSurface?: MessengerSurfaceHint | null;
  /** Server-first классификация входа на `/app` (без сессии). */
  entryClassification: UnauthenticatedAppEntryClassification;
  /** Канон `/app/tg` или `/app/max`: не подменять miniapp полноценным веб-входом. */
  routeBoundMiniappEntry?: boolean;
  /** A role-specific browser door; the auth mechanics remain shared. */
  roleLoginPortal?: RoleLoginPortal | null;
  /** Resolved server-side product identity for the role-login presentation. */
  roleLoginSurfaceName?: string;
  /** Логотип клиники с уже опознанной поверхности — знак над формой входа. */
  roleLoginBrandLogoUrl?: string | null;
  /** Вход на домене клиники, а не общий TherapyGo. */
  roleLoginBrandedSurface?: boolean;
  /** Canonical cross-product login URL, never a role path on the current origin. */
  /** Auth methods allowed by proxy's already-resolved surface. */
  surfaceAuthPolicy?: SurfaceAuthPolicy;
  /** Surface-owned shell supplies its own header and legal footer; auth mechanics stay shared. */
  embeddedInSurfaceShell?: boolean;
  /** `/app/doctor/register`: its own door, not a same-page toggle off `/app/doctor/login`. */
  roleLoginInitialView?: 'login' | 'register';
  /**
   * Раскладка пациентской двери: группа прижата к верху фиксированным отступом, а правовые ссылки
   * уходят в самый низ экрана. Владелец 15.09: «иконку терапиго поднять на половину верхнего
   * пространства… не надо делать её адаптивной… ссылки на документы убрать в самый низ». Прежняя
   * раскладка центрировала всю группу по высоте viewport — то есть зависела от телефона; здесь
   * высота задана числом. Двери врача и админа остаются на прежней центрированной раскладке.
   */
  topAnchoredLayout?: boolean;
};

export function AppEntryLoginContent({
  supportContactHref,
  prefetchedPublicAuth,
  serverPlatformMessengerCookie,
  serverMessengerSurface,
  entryClassification,
  routeBoundMiniappEntry = false,
  roleLoginPortal = null,
  roleLoginSurfaceName,
  roleLoginBrandLogoUrl,
  roleLoginBrandedSurface,
  surfaceAuthPolicy,
  embeddedInSurfaceShell = false,
  roleLoginInitialView = 'login',
  topAnchoredLayout = false,
}: AppEntryLoginContentProps) {
  const portalHeader =
    roleLoginPortal && !embeddedInSurfaceShell ? (
      <RoleLoginPortalHeader
        portal={roleLoginPortal}
        surfaceName={roleLoginSurfaceName ?? ''}
        brandLogoUrl={roleLoginBrandLogoUrl ?? null}
        brandedSurface={Boolean(roleLoginBrandedSurface)}
      />
    ) : null;
  const authFlow = (
    <Suspense fallback={<AppContentLoading className="py-6" />}>
      <AuthBootstrap
        supportContactHref={roleLoginPortal === 'admin' ? '' : supportContactHref}
        initialPublicAuthConfig={prefetchedPublicAuth ?? null}
        serverPlatformMessengerCookie={Boolean(serverPlatformMessengerCookie)}
        serverMessengerSurface={serverMessengerSurface ?? null}
        entryClassification={entryClassification}
        routeBoundMiniappEntry={routeBoundMiniappEntry}
        roleLoginPortal={roleLoginPortal}
        surfaceAuthPolicy={surfaceAuthPolicy}
        preferEmailEntry={
          embeddedInSurfaceShell || roleLoginPortal === 'doctor' || roleLoginPortal === 'admin'
        }
        roleLoginInitialView={roleLoginInitialView}
      />
    </Suspense>
  );

  if (topAnchoredLayout) {
    // Три числа вместо центрирования: отступ сверху до знака, шаг до карточки и правовые ссылки,
    // прижатые к низу экрана (`mt-auto`). Связи с поддержкой здесь нет — она переехала внутрь
    // карточки, в самый низ блока с кнопками (владелец 15.09).
    return (
      <div id={CLIENT_BOOT_ACTIVE_CONTENT_ID} className="flex flex-1 flex-col">
        <div className="flex flex-col gap-6 pt-[84px]">
          {portalHeader}
          {authFlow}
        </div>
        <LegalFooterLinks
          className="mt-auto pb-6 pt-8"
          supportHref={roleLoginPortal === 'admin' ? undefined : supportContactHref}
        />
      </div>
    );
  }

  return (
    // Один flex-столбец на весь блок (шапка портала + форма + footer) вместо двух несвязанных
    // секций — иначе рёбра между ними определял голый document flow, а не системный gap. `flex-1
    // justify-center` центрирует группу в доступной высоте `<main>` вместо накопления пустоты
    // внизу viewport — владелец, «пространство распредели», 12.09.
    <div
      id={CLIENT_BOOT_ACTIVE_CONTENT_ID}
      className={`flex flex-1 flex-col justify-center ${
        roleLoginPortal === 'doctor' ? 'gap-2' : 'gap-6'
      }`}
    >
      {portalHeader}
      {authFlow}
      {embeddedInSurfaceShell ? null : (
        <LegalFooterLinks
          className="mt-2"
          supportHref={roleLoginPortal === 'admin' ? undefined : supportContactHref}
        />
      )}
    </div>
  );
}
