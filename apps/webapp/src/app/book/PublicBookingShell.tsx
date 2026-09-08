import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  patientCaptionTextClass,
  patientInlineLinkClass,
  patientPageTitleClass,
} from '@/shared/ui/patient/patientVisual';

type Props = {
  title: string;
  step: number;
  totalSteps: number;
  backHref: string | null;
  children: ReactNode;
};

export function PublicBookingShell({ title, step, totalSteps, backHref, children }: Props) {
  const showBack = Boolean(backHref && step > 1);
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className={patientPageTitleClass}>{title}</h1>
        <div
          className={cn(
            patientCaptionTextClass,
            'flex items-center',
            showBack ? 'justify-between' : 'justify-center',
          )}
        >
          {showBack && backHref ? (
            <Link
              href={backHref}
              prefetch={false}
              className={cn(patientInlineLinkClass, 'underline-offset-2')}
            >
              Назад
            </Link>
          ) : null}
          <span>
            Шаг {step} из {totalSteps}
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
