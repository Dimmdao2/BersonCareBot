'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DoctorCatalogPageLayoutProps = {
  /** Липкий блок фильтров/поиска (классы см. `DOCTOR_CATALOG_STICKY_BAR_CLASS` в doctorWorkspaceLayout). */
  toolbar?: ReactNode;
  children: ReactNode;
  /** Mobile catalog surface fills the shell width; rows keep their own inline padding. */
  mobileEdgeToEdge?: boolean;
  className?: string;
};

/** Обёртка каталожной страницы врача: опциональный липкий блок + контент (master-detail). */
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
        mobileEdgeToEdge && '-mx-3 md:mx-0',
        className,
      )}
    >
      {toolbar}
      {children}
    </div>
  );
}
