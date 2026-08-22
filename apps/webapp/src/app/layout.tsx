/**
 * Корневой шаблон всего веб‑приложения.
 * Обёртка для всех страниц: задаёт язык (русский), подключает общие стили и скрипт
 * мини‑приложения Telegram (для открытия из бота). Отображается всегда — и для
 * пользователя (пациент/врач), и на любой странице.
 */
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './styles/local-fonts.css';
import './styles/tailwind-engine.css';
import { ClientToaster } from '@/components/ClientToaster';
import { TooltipProvider } from '@/shared/ui/patient/primitives/tooltip';
import { getPlatformEntry } from '@/shared/lib/platformCookie.server';
import { BUILD_ID_META_NAME } from '@/shared/lib/reloadConstants';
import { PlatformProvider } from '@/shared/ui/PlatformProvider';
import { BuildVersionWatcher } from '@/shared/ui/BuildVersionWatcher';
import { HorizontalOverflowProbe } from '@/shared/ui/dev/HorizontalOverflowProbe';
import { PWA_APP_ROOT_CLASS } from '@/shared/ui/patient/pwaLayoutClasses';
import { getRequestSurface } from '@/shared/lib/surface/requestSurface.server';
import {
  surfaceDisplayName,
  surfaceLayoutMetadata,
} from '@/shared/lib/surface/surfaceLayoutMetadata';

/**
 * ЕДИНСТВЕННАЯ точка, где поверхность запроса превращается в идентичность документа (TPB-08).
 * Ни один маршрут больше не объявляет `title`/`description`/`manifest`/`icons`/`appleWebApp` сам:
 * какому пути какая поверхность — решает таблица `config/surfaceRoutes.ts`, и новая страница внутри
 * классифицированного поддерева получает верную идентичность, ничего не объявляя. Раньше это был
 * пациентский fallback, который staff-зоны перекрывали каждая у себя, и забытый маршрут молча
 * представлялся пациентским продуктом.
 */
export async function generateMetadata(): Promise<Metadata> {
  return surfaceLayoutMetadata(await getRequestSurface());
}

/** Safe-area insets для мобильных (вырез, индикатор дома) — нужен viewport-fit=cover. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  /**
   * Светлый канвас: при `theme-color` = primary синий (#284da0) на iOS/Android при скролле
   * за границу страницы «просвечивала» синяя подложка. Бренд primary остаётся в UI; для PWA
   * при необходимости — отдельный manifest / `apple-mobile-web-app-status-bar-style`.
   */
  themeColor: '#ffffff',
};

/** Рендерит общую обёртку страницы: тег html, тело и дочернее содержимое (конкретная страница). */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [platformEntry, surface] = await Promise.all([getPlatformEntry(), getRequestSurface()]);
  const buildId = (process.env.BUILD_ID || process.env.NEXT_PUBLIC_BUILD_ID || '').trim();
  return (
    <html lang="ru" suppressHydrationWarning className="font-sans">
      <head>
        <meta name={BUILD_ID_META_NAME} content={buildId} />
      </head>
      <body>
        <div id="app-root" className={PWA_APP_ROOT_CLASS}>
          <TooltipProvider>
            <ClientToaster />
            <PlatformProvider serverHint={platformEntry} surfaceName={surfaceDisplayName(surface)}>
              <BuildVersionWatcher />
              <HorizontalOverflowProbe />
              {children}
            </PlatformProvider>
          </TooltipProvider>
        </div>
      </body>
    </html>
  );
}
