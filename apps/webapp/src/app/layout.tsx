/**
 * Корневой шаблон всего веб‑приложения.
 * Обёртка для всех страниц: задаёт язык (русский), подключает общие стили и скрипт
 * мини‑приложения Telegram (для открытия из бота). Отображается всегда — и для
 * пользователя (пациент/врач), и на любой странице.
 */
import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BersonCare Webapp",
  description: "Patient and doctor web application for the BersonCare platform.",
};

/** Рендерит общую обёртку страницы: тег html, тело и дочернее содержимое (конкретная страница). */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        {/* Скрипт Telegram Mini App — нужен, когда приложение открывают из бота в Telegram. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}
