"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { routePaths } from "@/app-layer/routes/paths";

type AskQuestionFABProps = {
  /** Показывать только когда пользователь зашёл через браузер (не Mini App Telegram). */
  visible: boolean;
};

/**
 * Плавающая кнопка: переход на экран переписки с поддержкой (`routePaths.patientMessages`).
 * Отправка разовых вопросов в Telegram через `POST /api/patient/question` по-прежнему доступна
 * из других сценариев; основной UX чата — страница сообщений.
 */
export function AskQuestionFAB({ visible }: AskQuestionFABProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [miniAppEnv, setMiniAppEnv] = useState<"unknown" | "mini" | "browser">("unknown");

  useEffect(() => {
    queueMicrotask(() => {
      setMiniAppEnv(isMessengerMiniAppHost() ? "mini" : "browser");
    });
  }, []);

  if (!visible) return null;
  if (pathname?.startsWith(routePaths.patientMessages)) return null;

  const hideInMessenger = miniAppEnv === "mini";
  const isReady = miniAppEnv !== "unknown";

  return (
    <div
      className={[
        "ask-question-fab-root",
        "transition-opacity duration-200",
        isReady && !hideInMessenger ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        hideInMessenger ? "invisible" : "visible",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={hideInMessenger}
    >
      <Button
        type="button"
        id="ask-question-fab-button"
        variant="default"
        onClick={() => router.push(routePaths.patientMessages)}
        aria-label="Открыть сообщения"
        className="fixed bottom-0 left-0 right-0 z-[90] mx-auto max-w-[480px] rounded-none border-0 bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] py-[18px] pl-[max(1.5rem,env(safe-area-inset-left,0px))] pr-[max(1.5rem,env(safe-area-inset-right,0px))] pb-[max(18px,env(safe-area-inset-bottom,0px))] text-center text-base font-medium text-white shadow-[0_-2px_12px_rgba(37,99,235,0.25)] active:from-[#1d4ed8] active:to-[#1e40af] [-webkit-tap-highlight-color:transparent]"
      >
        Сообщения
      </Button>
    </div>
  );
}
