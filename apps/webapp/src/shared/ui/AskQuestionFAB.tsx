"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import { usePlatform } from "@/shared/hooks/usePlatform";

type AskQuestionFABProps = {
  /** Показывать только когда пользователь залогинен. */
  visible: boolean;
};

/**
 * Плавающая кнопка: переход на экран переписки с поддержкой (`routePaths.patientMessages`).
 * Скрыта в бот-режиме (переписка идёт в мессенджере).
 */
export function AskQuestionFAB({ visible }: AskQuestionFABProps) {
  const pathname = usePathname();
  const router = useRouter();
  const platform = usePlatform();

  if (!visible) return null;
  if (platform === "bot") return null;
  if (pathname?.startsWith(routePaths.patientMessages)) return null;

  return (
    <div className="ask-question-fab-root">
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
