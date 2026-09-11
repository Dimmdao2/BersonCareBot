'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';

export type DoctorCatalogPageLayoutProps = {
  /** Липкая панель фильтров/поиска (`DoctorCatalogFiltersToolbar`). */
  toolbar?: ReactNode;
  children: ReactNode;
  /** Mobile catalog surface fills the shell width; rows keep their own inline padding. */
  mobileEdgeToEdge?: boolean;
  className?: string;
};

/**
 * Обёртка каталожной страницы врача: опциональный липкий блок + контент (master-detail).
 *
 * Приклеивание к шапке страницы на desktop живёт ЗДЕСЬ, а не у каждого вызывающего: каталожная страница по
 * построению идёт сразу под `DoctorPageHeader`, и межсекционный зазор shell между ними лишний. До 11.09 этот
 * класс передавали руками, и передавали его только задачи — шесть каталогов оставались с 12px полосой серого
 * канваса между заголовком и липким тулбаром. Владелец 11.09: «толбар просто оторвался от шапки… он от края
 * до края внутри контейнера и чётко прилеплен, нету никаких пробелов из серого фона вокруг». Класс `md:`-only,
 * мобильная раскладка со своим контрактом отступов не меняется.
 */
export function DoctorCatalogPageLayout({
  toolbar,
  children,
  mobileEdgeToEdge = false,
  className,
}: DoctorCatalogPageLayoutProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden',
        DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS,
        mobileEdgeToEdge && '-mx-3 md:mx-0',
        className,
      )}
    >
      {toolbar}
      {children}
    </div>
  );
}
