"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PatientSharePhonePanelMode = "blocked" | "timed_out" | "session_lost";

type Props = {
  mode: PatientSharePhonePanelMode;
  botHref: string | null;
  onRetry: () => void;
  variant?: "overlay" | "embedded";
};

export function PatientSharePhoneViaBotPanel({ mode, botHref, onRetry, variant = "overlay" }: Props) {
  const desc =
    mode === "session_lost"
      ? "Не удалось восстановить вход в приложение. Если вы открыли ссылку из бота, вернитесь и откройте приложение ещё раз. При открытии из Max убедитесь, что в ссылке есть параметр входа от бота."
      : mode === "timed_out"
        ? "Не удалось подтвердить номер автоматически за отведённое время. Откройте бота и нажмите «Поделиться контактом», затем снова «Проверить снова». Если номер уже привязан в боте, подождите минуту и повторите — возможна задержка синхронизации."
        : "Откройте чат с ботом и нажмите кнопку с запросом контакта. Когда номер привяжется, приложение продолжит работу.";

  const title = mode === "session_lost" ? "Нет сессии" : "Нужен номер телефона";

  const inner = (
    <>
      <h1 id="mini-app-contact-gate-title" className="text-lg font-semibold">
        {title}
      </h1>
      <p id="mini-app-contact-gate-desc" className="max-w-md text-sm text-muted-foreground">
        {desc}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {botHref ? (
          <Link href={botHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants())}>
            Открыть бота
          </Link>
        ) : null}
        <Button type="button" variant="outline" onClick={onRetry}>
          Проверить снова
        </Button>
      </div>
    </>
  );

  if (variant === "embedded") {
    return (
      <div
        id="patient-share-phone-via-bot-embedded"
        className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
        role="alert"
        aria-labelledby="mini-app-contact-gate-title"
        aria-describedby="mini-app-contact-gate-desc"
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      id="mini-app-share-contact-gate"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      role="alertdialog"
      aria-labelledby="mini-app-contact-gate-title"
      aria-describedby="mini-app-contact-gate-desc"
    >
      {inner}
    </div>
  );
}
