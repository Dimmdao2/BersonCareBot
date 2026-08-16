/** Адрес кабинета: внешняя страница специалиста открывается отдельно. */
import { ExternalLink } from 'lucide-react';
import { getOptionalPatientSession } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { buttonVariants } from '@/shared/ui/patient/primitives/button-variants';

const ADDRESS_IFRAME_SRC = 'https://dmitryberson.ru/adress';

export default async function PatientAddressPage() {
  const session = await getOptionalPatientSession();

  return (
    <PatientAppShell
      title="Адрес кабинета"
      user={session?.user ?? null}
      backHref={routePaths.patient}
      backLabel="Меню"
    >
      <div className="flex min-h-0 flex-1 flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          Адрес, маршрут и контакты кабинета находятся на сайте специалиста.
        </p>
        <a
          href={ADDRESS_IFRAME_SRC}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'default' })}
        >
          Открыть адрес
          <ExternalLink aria-hidden="true" />
        </a>
      </div>
    </PatientAppShell>
  );
}
