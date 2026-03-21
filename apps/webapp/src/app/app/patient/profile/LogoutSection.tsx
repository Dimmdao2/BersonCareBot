"use client";

import { useEffect, useState } from "react";

/** Скрывает кнопку выхода в Telegram Mini App (выход там недоступен / не нужен). */
export function LogoutSection() {
  const [hideLogout, setHideLogout] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setHideLogout(!!window.Telegram?.WebApp);
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
