/**
 * Корневой шаблон всего веб‑приложения.
 * Обёртка для всех страниц: задаёт язык (русский), подключает общие стили и скрипт
 * мини‑приложения Telegram (для открытия из бота). Отображается всегда — и для
 * пользователя (пациент/врач), и на любой странице.
 */
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist, Roboto } from "next/font/google";
import { ClientToaster } from "@/components/ClientToaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { BUILD_ID_META_NAME } from "@/shared/lib/reloadConstants";
import { PlatformProvider } from "@/shared/ui/PlatformProvider";
import { BuildVersionWatcher } from "@/shared/ui/BuildVersionWatcher";
import { HorizontalOverflowProbe } from "@/shared/ui/dev/HorizontalOverflowProbe";
import { PWA_APP_ROOT_CLASS } from "@/shared/lib/pwaLayoutClasses";
import { TelegramMiniAppScript } from "@/shared/ui/TelegramMiniAppScript";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const robotoHeading = Roboto({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-roboto-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BersonCare Webapp",
  description: "Patient and doctor web application for the BersonCare platform.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "BersonCare",
    statusBarStyle: "default",
  },
};

/** Safe-area insets для мобильных (вырез, индикатор дома) — нужен viewport-fit=cover. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /**
   * Светлый канвас: при `theme-color` = primary синий (#284da0) на iOS/Android при скролле
   * за границу страницы «просвечивала» синяя подложка. Бренд primary остаётся в UI; для PWA
   * при необходимости — отдельный manifest / `apple-mobile-web-app-status-bar-style`.
   */
  themeColor: "#ffffff",
};

/** Рендерит общую обёртку страницы: тег html, тело и дочернее содержимое (конкретная страница). */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const platformEntry = await getPlatformEntry();
  const buildId = (process.env.BUILD_ID || process.env.NEXT_PUBLIC_BUILD_ID || "").trim();
  return (
    <html lang="ru" suppressHydrationWarning className={cn("font-sans", geist.variable, robotoHeading.variable)}>
      <head>
        <meta name={BUILD_ID_META_NAME} content={buildId} />
      </head>
      <body>
        <div id="app-root" className={PWA_APP_ROOT_CLASS}>
          <TooltipProvider>
            <ClientToaster />
            <TelegramMiniAppScript />
            <PlatformProvider serverHint={platformEntry}>
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
