/**
 * Общая оболочка страницы приложения: верхняя панель и контент.
 * Для пациента (variant="patient" / "patient-wide") — {@link PatientGatedHeader} / {@link PatientHeader}:
 * заголовок, «Назад», «Домой» на главную, справа иконка профиля;
 * внизу — {@link PatientBottomNav} (кроме `patientEmbedMain` / `patientHideBottomNav`).
 * Для кабинета врача (variant="doctor") — контейнер контента; шапка в `app/doctor/layout.tsx`.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { SessionUser } from "@/shared/types/session";
import { PatientGatedHeader } from "@/shared/ui/PatientGatedHeader";
import { PatientBottomNav } from "@/shared/ui/PatientBottomNav";
import { SectionHeading } from "@/components/common/typography/SectionHeading";
import { cn } from "@/lib/utils";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

type AppShellProps = {
  title: string;
  user: SessionUser | null;
  children: ReactNode;
  /** Ссылка «Назад» (например на главный экран пациента). */
  backHref?: string;
  backLabel?: string;
  /** Уменьшенный заголовок, когда есть кнопка «Назад». */
  titleSmall?: boolean;
  /**
   * Вариант оболочки.
   * - `patient` — узкая колонка пациента (`max-w-[480px]` на всех ширинах).
   * - `patient-wide` — то же до брейкпоинта `lg`; с `lg:` расширяется до `max-w-6xl`. Использовать только на главной пациента `/app/patient`.
   * - `doctor` — кабинет специалиста (широкий workspace).
   */
  variant?: "default" | "patient" | "patient-wide" | "doctor";
  /** Доп. плавающий UI для пациента. */
  patientFloatingSlot?: ReactNode;
  /**
   * Режим встраиваемого контента на всю ширину (например iframe записи): без зазора под шапкой,
   * компактный нижний отступ; нижняя навигация скрыта.
   */
  patientEmbedMain?: boolean;
  /** См. {@link PatientHeader}: скрыть «домой» на главную пациента. */
  patientHideHome?: boolean;
  /** См. {@link PatientHeader}: скрыть правые иконки шапки. */
  patientHideRightIcons?: boolean;
  /** См. {@link PatientHeader}: заголовок по центру (экраны входа). */
  patientBrandTitleBar?: boolean;
  /** См. {@link PatientHeader}: компактный бейдж рядом с заголовком (например «По подписке» на странице раздела). */
  patientTitleBadge?: string;
  /** Скрыть нижнюю навигацию (экраны входа и гостевые страницы без основного меню пациента). */
  patientHideBottomNav?: boolean;
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
  patientEmbedMain = false,
  patientHideHome = false,
  patientHideRightIcons = false,
  patientBrandTitleBar = false,
  patientTitleBadge,
  patientHideBottomNav = false,
}: AppShellProps) {
  if (variant === "patient" || variant === "patient-wide") {
    const patientShellWidthClass = variant === "patient-wide" ? "max-w-[480px] lg:max-w-6xl" : "max-w-[480px]";

    return (
      <div
        id="app-shell-patient"
        className={cn(
          "mx-auto flex min-h-[100dvh] w-full flex-col bg-[var(--patient-surface)] pt-[max(0px,env(safe-area-inset-top,0px))]",
          patientShellWidthClass,
          patientEmbedMain
            ? "gap-0 pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
            : patientHideBottomNav ?
              "gap-3 pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
            : "safe-padding-patient gap-3",
        )}
      >
        <PatientGatedHeader
          pageTitle={title}
          showBack={!!backHref}
          backHref={backHref}
          backLabel={backLabel}
          hideHome={patientHideHome}
          hideRightIcons={patientHideRightIcons}
          brandTitleBar={patientBrandTitleBar}
          titleBadge={patientTitleBadge}
        />
        <main
          id="app-shell-content"
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            patientEmbedMain ? "gap-0 pt-0" : "gap-[var(--patient-gap)] pt-1",
          )}
        >
          {children}
        </main>
        {patientFloatingSlot}
        {patientEmbedMain || patientHideBottomNav ? null : <PatientBottomNav />}
      </div>
    );
  }

  /** Кабинет врача: верхняя панель и «Настройки» — в `DoctorHeader` в `app/doctor/layout.tsx`. */
  if (variant === "doctor") {
    return (
      <div
        id="app-shell-doctor"
        className={DOCTOR_PAGE_CONTAINER_CLASS}
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
