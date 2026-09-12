import Image from 'next/image';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';
import { cn } from '@/lib/utils';

const portalCopy: Record<
  Exclude<RoleLoginPortal, 'doctor' | 'admin'>,
  {
    title: string;
    description: string;
    alternateLabel?: string;
    className: string;
  }
> = {
  patient: {
    title: 'Войти в личный кабинет',
    description: 'Продолжите в приложении выбранной клиники.',
    alternateLabel: 'Открыть кабинет специалистов',
    className: 'border-emerald-200 bg-emerald-50/70',
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
  // Doctor-портал (вход после разлогина) — без описательного блока и без ссылки на пациентский
  // вход: только вертикальный лого-лок-ап Therapysto (иконка + подпись уже в самом файле).
  // Родитель (AppEntryLoginContent) центрирует всю группу по высоте — этому блоку своя
  // вертикальная поправка не нужна — владелец, 12.09.
  if (portal === 'doctor') {
    return (
      <div className="flex flex-col items-center">
        <Image
          src="/brand/therapysto-lockup-vertical.png"
          alt="Therapysto"
          width={132}
          height={130}
          priority
          unoptimized
        />
      </div>
    );
  }

  // Admin-портал — глобал-админ платформы, один вход без выбора режима: только сама форма, без
  // описания и без ссылки на другой логин (владелец, 12.09: «только форма входа без всяких ссылок
  // на другие режимы входа и лишних пояснений»). Свой mark пространства вместо общего Therapysto —
  // тот же admin-mark-transparent-source.png, из которого уже собран admin PWA-манифест/иконки.
  if (portal === 'admin') {
    return (
      <div className="flex flex-col items-center">
        <Image
          src="/brand/admin-mark-transparent-source.png"
          alt="Therapysto Admin"
          width={112}
          height={98}
          priority
          unoptimized
        />
      </div>
    );
  }

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
