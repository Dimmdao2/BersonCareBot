"use client";

import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SupportContactLink } from "@/shared/ui/SupportContactLink";

export type PatientSharePhonePanelMode = "blocked" | "timed_out" | "session_lost" | "me_unavailable";

type Props = {
  mode: PatientSharePhonePanelMode;
  botHref: string | null;
  onRetry: () => void;
  variant?: "overlay" | "embedded";
  /** Mini App (страховка): пуш запроса контакта в чат через API и закрыть WebView. */
  onProvideContact?: () => Promise<void>;
  /** По умолчанию true (оверлей-гейт). На `/bind-phone` в embedded — без ручного опроса. */
  showRetryButton?: boolean;
  supportContactHref?: string;
};

export function PatientSharePhoneViaBotPanel({
  mode,
  botHref,
  onRetry,
  variant = "overlay",
  onProvideContact,
  showRetryButton = true,
  supportContactHref,
}: Props) {
  const [busy, setBusy] = useState(false);

  /** В состоянии «нужен контакт» (`blocked`) фоновый опрос `/api/me` уже идёт — дублирующая «Проверить снова» убрана. */
  const showRetry =
    showRetryButton && !(mode === "blocked" && Boolean(onProvideContact));

  const desc =
    mode === "session_lost"
      ? "Не удалось восстановить вход в приложение. Если вы открыли ссылку из бота, вернитесь и откройте приложение ещё раз. При открытии из Max убедитесь, что в ссылке есть параметр входа от бота."
      : mode === "me_unavailable"
        ? showRetry
          ? "Не удалось проверить статус аккаунта. Нажмите «Проверить снова». Если ошибка повторяется, откройте чат с ботом и отправьте контакт по кнопке там."
          : "Не удалось проверить статус аккаунта. Если ошибка повторяется, откройте чат с ботом и отправьте контакт по кнопке там."
        : mode === "timed_out"
          ? showRetry
            ? "Не удалось подтвердить номер автоматически за отведённое время. Нажмите «Предоставить контакт» — в чате появится кнопка для номера. В мини-приложении оно может закрыться — откройте снова из бота; в браузере страница обновится сама. Либо нажмите «Проверить снова»."
            : "Не удалось подтвердить номер автоматически за отведённое время. Нажмите «Предоставить контакт» — в чате появится кнопка для номера. В мини-приложении оно может закрыться — откройте снова из бота; в браузере страница обновится сама."
          : onProvideContact
            ? "Нажмите «Предоставить контакт»: в чате появится кнопка для номера. В мини-приложении окно часто закрывается — снова откройте приложение из бота; в обычном браузере эта страница обновится сама (примерно раз в несколько секунд)."
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
        {showRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            Проверить снова
          </Button>
        ) : null}
      </div>
      {supportContactHref ? (
        <SupportContactLink href={supportContactHref} className="text-sm text-primary underline">
          Связаться с поддержкой
        </SupportContactLink>
      ) : null}
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
