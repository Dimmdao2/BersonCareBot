"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const shellOpacity = hideInMessenger ? 0 : miniAppEnv === "unknown" ? 0 : 1;
  const shellPointer = hideInMessenger || miniAppEnv === "unknown" ? "none" : "auto";

  return (
    <div
      className="ask-question-fab-root"
      style={{
        opacity: shellOpacity,
        pointerEvents: shellPointer as "none" | "auto",
        transition: "opacity 0.2s ease",
        visibility: hideInMessenger ? "hidden" : "visible",
      }}
      aria-hidden={hideInMessenger}
    >
      <button
        type="button"
        id="ask-question-fab-button"
        className="ask-question-fab"
        onClick={() => router.push(routePaths.patientMessages)}
        aria-label="Открыть сообщения"
      >
        Сообщения
      </button>
    </div>
  );
}
