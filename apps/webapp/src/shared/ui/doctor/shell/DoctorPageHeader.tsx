"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { doctorPageTitleClass } from "@/shared/ui/doctor/doctorVisual";
import {
  DOCTOR_PAGE_HEADER_HEIGHT_VAR,
  DOCTOR_PAGE_HEADER_STICKY_TOP_CLASS,
} from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { useReportShellChromeHeight } from "@/shared/hooks/useReportShellChromeHeight";

export type DoctorPageHeaderProps = {
  /** Заголовок страницы (слева). Строка приводится к роли page-title (`text-base`). */
  title: ReactNode;
  /** Необязательная подпись под заголовком (`text-xs text-muted-foreground`). */
  subtitle?: ReactNode;
  /** Важные уведомления/баннеры (центр-право): system-health и т.п. */
  info?: ReactNode;
  /** Вкладки раздела (право): для секций с табами (S2/S5/S6). */
  tabs?: ReactNode;
  /**
   * Док-зона липких тулбаров (фильтры/период) сразу под шапкой.
   * Прилипает вместе с шапкой как единый блок.
   */
  toolbar?: ReactNode;
  className?: string;
  id?: string;
};

/**
 * Per-page шапка кабинета врача (desktop-канон S1/D2).
 *
 * - Прилипает к верху контейнера контента (`#app-shell-doctor`) на скролле; на desktop (md+)
 *   глобальной шапки нет, поэтому именно эта шапка — липкий якорь страницы.
 * - Сообщает свою высоту в `--doctor-page-header-h`, которая на md+ становится
 *   `--doctor-sticky-offset` (см. `doctor.css`) — каталожные тулбары и chrome карточки
 *   клиента прилипают ровно под ней.
 * - Слоты: `title` (слева), `info` (центр/право — важные уведомления),
 *   `tabs` (право — вкладки раздела), `toolbar` (док-зона липких тулбаров под шапкой).
 *
 * Визуальный язык по `DOCTOR_APP_UI_STYLE_GUIDE` §A/§B: page-title `text-base`,
 * глубина — границы, не тени; радиусы page `rounded-xl` / панель `rounded-lg`.
 */
export function DoctorPageHeader({
  title,
  subtitle,
  info,
  tabs,
  toolbar,
  className,
  id,
}: DoctorPageHeaderProps) {
  const ref = useRef<HTMLElement>(null);
  // Высота этой шапки = desktop-офсет липких блоков контента (`--doctor-sticky-offset` на md+).
  // На <md значение игнорируется зональным правилом (там офсет = высота мобильной DoctorHeader).
  useReportShellChromeHeight(ref, DOCTOR_PAGE_HEADER_HEIGHT_VAR);

  return (
    <header
      ref={ref}
      id={id}
      data-doctor-page-header=""
      className={cn(
        "sticky z-30 -mx-3 -mt-3 flex flex-col bg-background/95 backdrop-blur-md supports-backdrop-filter:bg-background/85",
        DOCTOR_PAGE_HEADER_STICKY_TOP_CLASS,
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5 border-b border-border/70 px-3 py-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          {typeof title === "string" ? (
            <h1 className={doctorPageTitleClass}>{title}</h1>
          ) : (
            title
          )}
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {info || tabs ? (
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
            {info ? <div className="flex min-w-0 items-center gap-2">{info}</div> : null}
            {tabs ? <div className="flex min-w-0 items-center">{tabs}</div> : null}
          </div>
        ) : null}
      </div>
      {toolbar ? (
        <div className="border-b border-border/60 px-3 py-1.5">{toolbar}</div>
      ) : null}
    </header>
  );
}
