/**
 * Общая оболочка страницы приложения: верхняя панель и контент.
 * Используется на всех страницах после входа: пациент, врач, настройки. В шапке — заголовок,
 * опционально кнопка «Назад», имя и роль пользователя, ссылка «Настройки». Контент страницы
 * передаётся в children. Отображается везде внутри /app (кроме корневого layout).
 * Для пациента (variant="patient") — PatientHeader: назад, домой, заголовок, меню (Sheet).
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { SessionUser } from "@/shared/types/session";
import { PatientHeader } from "@/shared/ui/PatientHeader";
import { AskQuestionFAB } from "@/shared/ui/AskQuestionFAB";
import { PatientQuickAddFAB } from "@/app/app/patient/components/PatientQuickAddFAB";
import { SectionHeading } from "@/components/common/typography/SectionHeading";
import { cn } from "@/lib/utils";

type AppShellProps = {
  title: string;
  user: SessionUser | null;
  children: ReactNode;
  /** Ссылка «Назад» (например на главный экран пациента). */
  backHref?: string;
  backLabel?: string;
  /** Уменьшенный заголовок, когда есть кнопка «Назад». */
  titleSmall?: boolean;
  /** Вариант шапки: по умолчанию — заголовок и действия; patient — стрелка назад, BERSONCARE, гамбургер; doctor — широкий layout. */
  variant?: "default" | "patient" | "doctor";
  /** Доп. плавающий UI для пациента (например QuickAdd на дневнике). */
  patientFloatingSlot?: ReactNode;
};

/** Рендерит контейнер приложения, шапку с заголовком и действиями и основной контент. */
export function AppShell({
  title,
  user,
  children,
  backHref,
  backLabel = "Меню",
  titleSmall,
  variant = "default",
  patientFloatingSlot,
}: AppShellProps) {
  if (variant === "patient") {
    return (
      <div
        id="app-shell-patient"
        className="safe-padding-patient mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-[var(--patient-surface)] pt-0"
      >
        <PatientHeader
          pageTitle={title}
          showBack={!!backHref}
          backHref={backHref}
          backLabel={backLabel}
        />
        <main
          id="app-shell-content"
          className="flex min-h-0 flex-1 flex-col gap-[var(--patient-gap)]"
        >
          {children}
        </main>
        {patientFloatingSlot}
        <PatientQuickAddFAB visible={user !== null} />
        <AskQuestionFAB visible={user !== null} />
      </div>
    );
  }

  /** Кабинет врача: верхняя панель и «Настройки» — в `DoctorHeader` в `app/doctor/layout.tsx`. */
  if (variant === "doctor") {
    return (
      <div
        id="app-shell-doctor"
        className="mx-auto w-full max-w-7xl px-4 pb-8 md:px-6"
      >
        <main id="app-shell-content" className="flex flex-col gap-4">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div
      id="app-shell-default"
      className="mx-auto max-w-[600px] min-h-screen px-4 pb-12 pt-6"
    >
      <header
        id="app-shell-top-bar"
        className="mb-6 flex flex-col gap-4 rounded-[20px] border border-border/80 bg-card/95 px-5 py-5 shadow-sm backdrop-blur-md max-[720px]:items-start md:flex-row md:items-center md:justify-between"
      >
        <div>
          <div id="app-shell-title-row" className="flex items-center gap-4">
            {backHref ? (
              <Link href={backHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
                {backLabel}
              </Link>
            ) : null}
            <div>
              <SectionHeading level="eyebrow">BersonCare Platform</SectionHeading>
              <h1 className={titleSmall || backHref ? "text-xl font-semibold tracking-tight" : "text-[1.75rem] font-semibold leading-tight"}>
                {title}
              </h1>
            </div>
          </div>
        </div>
        <div id="app-shell-top-bar-actions" className="flex w-full flex-wrap items-center gap-3 max-[720px]:justify-between md:w-auto">
          {user ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm text-foreground">
              <span>{user.displayName}</span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{user.role}</span>
            </div>
          ) : null}
          <Link href="/app/settings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Настройки
          </Link>
        </div>
      </header>
      <main id="app-shell-content" className="flex flex-col gap-4">
        {children}
      </main>
    </div>
  );
}
