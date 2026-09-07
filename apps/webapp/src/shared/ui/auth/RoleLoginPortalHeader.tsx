import type { RoleLoginPortal } from '@/modules/auth/roleLogin';
import { cn } from '@/lib/utils';

const portalCopy: Record<
  RoleLoginPortal,
  {
    title: string;
    description: string;
    alternateLabel?: string;
    className: string;
  }
> = {
  doctor: {
    title: 'Кабинет специалистов и команды клиники',
    description: 'Войдите с рабочей учётной записью. Доступ определяется вашей ролью и организацией.',
    alternateLabel: 'Открыть вход для пациентов',
    className: 'border-sky-200 bg-sky-50/70',
  },
  patient: {
    title: 'Войти в личный кабинет',
    description: 'Продолжите в приложении выбранной клиники.',
    alternateLabel: 'Открыть кабинет специалистов',
    className: 'border-emerald-200 bg-emerald-50/70',
  },
  admin: {
    title: 'Управление платформой',
    description: 'Вход только для операторов платформы Therapysto. Сотрудники клиник входят на Therapysto.',
    className: 'border-violet-200 bg-violet-50/70',
  },
};

export function RoleLoginPortalHeader({
  portal,
  surfaceName,
  alternateHref,
}: {
  portal: RoleLoginPortal;
  surfaceName: string;
  alternateHref: string | null;
}) {
  const copy = portalCopy[portal];
  return (
    <div className={cn('mt-2 flex flex-col gap-2 rounded-xl border p-5', copy.className)}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {surfaceName}
      </p>
      <h1 className="text-xl font-semibold text-foreground">{copy.title}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{copy.description}</p>
      {copy.alternateLabel && alternateHref ? (
        <a className="mt-1 text-sm text-muted-foreground underline" href={alternateHref}>
          {copy.alternateLabel}
        </a>
      ) : null}
    </div>
  );
}
