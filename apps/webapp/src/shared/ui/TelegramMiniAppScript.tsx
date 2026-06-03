"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/** Telegram Mini App SDK нужен внутри приложения, но не должен грузиться на публичном лендинге. */
export function TelegramMiniAppScript() {
  const pathname = usePathname();

  if (!pathname?.startsWith("/app")) {
    return null;
  }

  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="lazyOnload"
    />
  );
}
