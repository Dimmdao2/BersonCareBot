"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    <section className="mt-4 flex flex-col gap-4">
      <a
        href="/api/auth/logout"
        className={cn(
          buttonVariants({ variant: "outline", size: "default" }),
          "border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15",
        )}
      >
        Выйти из аккаунта
      </a>
    </section>
  );
}
