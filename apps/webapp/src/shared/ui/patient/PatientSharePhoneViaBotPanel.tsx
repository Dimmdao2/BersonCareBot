"use client";

import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PatientSharePhonePanelMode = "blocked" | "timed_out" | "session_lost" | "me_unavailable";

type Props = {
  mode: PatientSharePhonePanelMode;
  botHref: string | null;
  onRetry: () => void;
  variant?: "overlay" | "embedded";
  /** Mini App (страховка): пуш запроса контакта в чат через API и закрыть WebView. */
  onProvideContact?: () => Promise<void>;
};

export function PatientSharePhoneViaBotPanel({
  mode,
  botHref,
  onRetry,
  variant = "overlay",
  onProvideContact,
}: Props) {
  const [busy, setBusy] = useState(false);

  const desc =
    mode === "session_lost"
      ? "Не удалось восстановить вход в приложение. Если вы открыли ссылку из бота, вернитесь и откройте приложение ещё раз. При открытии из Max убедитесь, что в ссылке есть параметр входа от бота."
      : mode === "me_unavailable"
        ? "Не удалось проверить статус аккаунта. Нажмите «Проверить снова». Если ошибка повторяется, откройте чат с ботом и отправьте контакт по кнопке там."
        : mode === "timed_out"
          ? "Не удалось подтвердить номер автоматически за отведённое время. Нажмите «Предоставить контакт» — в чате появится кнопка для номера. Либо нажмите «Проверить снова»."
          : onProvideContact
            ? "Нажмите «Предоставить контакт»: бот отправит в чат кнопку для номера, мини-приложение закроется. После отправки контакта снова откройте приложение из бота."
            : "Откройте чат с ботом и нажмите кнопку с запросом контакта. Когда номер привяжется, приложение продолжит работу.";

  const title =
    mode === "session_lost" ? "Нет сессии" : mode === "me_unavailable" ? "Сервис временно недоступен" : "Нужен номер телефона";

  const showProvide =
    Boolean(onProvideContact) && (mode === "blocked" || mode === "timed_out" || mode === "me_unavailable");

  const inner = (
    <>
      <h1 id="mini-app-contact-gate-title" className="text-lg font-semibold">
        {title}
      </h1>
      <p id="mini-app-contact-gate-desc" className="max-w-md text-sm text-muted-foreground">
        {desc}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {showProvide && onProvideContact ? (
          <Button
            type="button"
            className={cn(buttonVariants())}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void (async () => {
                try {
                  await onProvideContact();
                } catch {
                  toast.error("Не удалось отправить запрос. Попробуйте снова.");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? "Отправка…" : "Предоставить контакт"}
          </Button>
        ) : null}
        {!showProvide && botHref ? (
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
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      role="alertdialog"
      aria-labelledby="mini-app-contact-gate-title"
      aria-describedby="mini-app-contact-gate-desc"
    >
      {inner}
    </div>
  );
}
