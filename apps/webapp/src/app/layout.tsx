/**
 * Корневой шаблон всего веб‑приложения.
 * Обёртка для всех страниц: задаёт язык (русский), подключает общие стили и скрипт
 * мини‑приложения Telegram (для открытия из бота). Отображается всегда — и для
 * пользователя (пациент/врач), и на любой странице.
 */
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import { ClientToaster } from "@/components/ClientToaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getPlatformEntry } from "@/shared/lib/platformCookie.server";
import { BUILD_ID_META_NAME } from "@/shared/lib/reloadConstants";
import { PlatformProvider } from "@/shared/ui/PlatformProvider";
import { BuildVersionWatcher } from "@/shared/ui/BuildVersionWatcher";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "BersonCare Webapp",
  description: "Patient and doctor web application for the BersonCare platform.",
};

/** Safe-area insets для мобильных (вырез, индикатор дома) — нужен viewport-fit=cover. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Рендерит общую обёртку страницы: тег html, тело и дочернее содержимое (конкретная страница). */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const platformEntry = await getPlatformEntry();
  const buildId = (process.env.BUILD_ID || process.env.NEXT_PUBLIC_BUILD_ID || "").trim();
  return (
    <html lang="ru" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <meta name={BUILD_ID_META_NAME} content={buildId} />
      </head>
      <body>
        <TooltipProvider>
          <ClientToaster />
          {/* Telegram Mini App SDK: lazyOnload — первый usable UI не ждёт telegram.org (вне Mini App скрипт догружается после загрузки страницы). */}
          <Script
            src="https://telegram.org/js/telegram-web-app.js"
            strategy="lazyOnload"
          />
          <PlatformProvider serverHint={platformEntry}>
            <BuildVersionWatcher />
            {children}
          </PlatformProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
