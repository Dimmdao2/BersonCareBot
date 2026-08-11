'use client';

import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { doctorPageTitleClass } from '@/shared/ui/doctor/doctorVisual';
import {
  DOCTOR_PAGE_HEADER_HEIGHT_VAR,
  DOCTOR_PAGE_HEADER_STICKY_TOP_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { useReportShellChromeHeight } from '@/shared/hooks/useReportShellChromeHeight';

export type DoctorPageHeaderProps = {
  /** Заголовок страницы (слева). Строка приводится к роли page-title (`text-base`). */
  title: ReactNode;
  /** Важные уведомления/баннеры (центр-право): system-health и т.п. */
  info?: ReactNode;
  /** Вкладки раздела (право): для секций с табами (S2/S5/S6). */
  tabs?: ReactNode;
  /** Classes for the tabs/right-slot wrapper (for example a full-width search surface). */
  tabsClassName?: string;
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
  info,
  tabs,
  tabsClassName,
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
        'sticky z-30 -mx-3 -mt-3 flex flex-col bg-[var(--doctor-page-header-background,#fff)]',
        DOCTOR_PAGE_HEADER_STICKY_TOP_CLASS,
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border/70 px-[var(--doctor-block-padding,18px)] py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          {typeof title === 'string' ? <h1 className={doctorPageTitleClass}>{title}</h1> : title}
        </div>
        {info || tabs ? (
          <div className="flex min-w-0 basis-full flex-wrap items-center justify-end gap-x-3 gap-y-1.5 md:flex-1 md:basis-auto">
            {info ? <div className="flex min-w-0 items-center gap-2">{info}</div> : null}
            {tabs ? (
              <div
                data-doctor-page-header-tabs=""
                className={cn('flex min-w-0 items-center', tabsClassName)}
              >
                {tabs}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {toolbar ? (
        <div
          data-doctor-page-header-toolbar=""
          className="border-b border-border/60 bg-[var(--doctor-page-header-background,#fff)] px-[var(--doctor-block-padding,18px)] py-1.5"
        >
          {toolbar}
        </div>
      ) : null}
    </header>
  );
}
