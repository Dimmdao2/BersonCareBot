"use client";

import { useEffect, useState } from "react";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";

/** Скрывает кнопку выхода в Mini App мессенджера (Telegram / MAX). */
export function LogoutSection() {
  const [hideLogout, setHideLogout] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setHideLogout(isMessengerMiniAppHost());
    });
  }, []);

  if (hideLogout) return null;

  return (
    <section className="stack" style={{ marginTop: 16 }}>
      <a href="/api/auth/logout" className="button button--danger-outline">
        Выйти из аккаунта
      </a>
    </section>
  );
}
