import { redirect } from 'next/navigation';
import { getCurrentSessionForPasswordChange } from '@/modules/auth/service';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { routePaths } from '@/app-layer/routes/paths';
import { PasswordChangeForm } from '@/app/app/account/PasswordChangeForm';
import { LogoutForm } from '@/shared/ui/LogoutForm';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { STAFF_SURFACE } from '@/config/productSurfaces';

export default async function RequiredPasswordChangePage() {
  const session = await getCurrentSessionForPasswordChange();
  if (!session) redirect(routePaths.root);
  if (!session.user.mustChangePassword) redirect(getRedirectPathForRole(session.user.role));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <section className="mx-auto flex max-w-lg flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-blue-800">{STAFF_SURFACE.name}</p>
          <h1 className="mt-1 text-2xl font-bold">Выберите новый пароль</h1>
        </div>
        <p className="text-sm leading-6 text-slate-700">
          Доступ к кабинету откроется после смены пароля.
        </p>
        <PasswordChangeForm successHref={getRedirectPathForRole(session.user.role)} />
        <LogoutForm>
          <Button type="submit" variant="outline" size="sm">
            Выйти и восстановить пароль
          </Button>
        </LogoutForm>
      </section>
    </main>
  );
}
