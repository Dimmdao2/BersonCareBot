import type { RoleLoginPortal } from '@/modules/auth/roleLogin';
import { getRoleLoginPath } from '@/modules/auth/roleLogin';

const portalCopy: Record<
  RoleLoginPortal,
  { title: string; alternate?: { label: string; portal: RoleLoginPortal } }
> = {
  doctor: {
    title: 'Вход для специалистов и сотрудников клиники',
    alternate: { label: 'Войти как пациент', portal: 'patient' },
  },
  patient: {
    title: 'Вход для пациентов',
    alternate: { label: 'Войти как специалист', portal: 'doctor' },
  },
  admin: { title: 'Вход для администратора' },
};

export function RoleLoginPortalHeader({ portal }: { portal: RoleLoginPortal }) {
  const copy = portalCopy[portal];
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border bg-card p-5">
      <h1 className="text-xl font-semibold text-foreground">{copy.title}</h1>
      {copy.alternate ? (
        <a
          className="text-sm text-muted-foreground underline"
          href={getRoleLoginPath(copy.alternate.portal)}
        >
          {copy.alternate.label}
        </a>
      ) : null}
    </div>
  );
}
