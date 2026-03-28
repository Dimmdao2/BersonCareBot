"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";

/**
 * Кнопка выхода для обычного браузера. В Mini App (Telegram с initData, MAX) — скрывается на клиенте.
 * В контексте бота (`ctx=bot`) секция не монтируется на сервере (см. страницу профиля).
 */
export function LogoutSection() {
  const [hideLogout, setHideLogout] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setHideLogout(isMessengerMiniAppHost());
    });
  }, []);

  if (hideLogout) return null;

  return (
    <section className="mt-4 flex flex-col gap-4">
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "w-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15",
          )}
        >
          Выйти из профиля
        </button>
      </form>
    </section>
  );
}
