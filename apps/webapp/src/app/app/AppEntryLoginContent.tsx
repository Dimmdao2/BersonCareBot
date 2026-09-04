'use client';

/**
 * Клиентская часть экрана `/app` и Suspense с AuthBootstrap.
 */

import { Suspense } from 'react';
import { AuthBootstrap } from '@/shared/ui/patient/AuthBootstrap';
import { LegalFooterLinks } from '@/shared/ui/patient/LegalFooterLinks';
import type { MessengerSurfaceHint } from '@/shared/lib/platform';
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
};

export function AppEntryLoginContent({
  supportContactHref,
  prefetchedPublicAuth,
  serverPlatformMessengerCookie,
  serverMessengerSurface,
  entryClassification,
  routeBoundMiniappEntry = false,
  roleLoginPortal = null,
}: AppEntryLoginContentProps) {
  return (
    <div id={CLIENT_BOOT_ACTIVE_CONTENT_ID}>
      <div id="app-entry-content" className="flex flex-col gap-6">
        {roleLoginPortal ? <RoleLoginPortalHeader portal={roleLoginPortal} /> : null}
      </div>
      <Suspense fallback={<AppContentLoading className="py-6" />}>
        <AuthBootstrap
          supportContactHref={supportContactHref}
          initialPublicAuthConfig={prefetchedPublicAuth ?? null}
          serverPlatformMessengerCookie={Boolean(serverPlatformMessengerCookie)}
          serverMessengerSurface={serverMessengerSurface ?? null}
          entryClassification={entryClassification}
          routeBoundMiniappEntry={routeBoundMiniappEntry}
          roleLoginPortal={roleLoginPortal}
        />
      </Suspense>
      <LegalFooterLinks className="mt-8" supportHref={supportContactHref} />
    </div>
  );
}
