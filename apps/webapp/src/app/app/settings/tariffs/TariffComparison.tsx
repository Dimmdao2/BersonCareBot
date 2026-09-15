import { MECHANIC_REGISTRY, type OrgMechanic } from '@/modules/org-entitlements/types';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';
import { formatQuotaValue } from '../billingQuotaFormat';
import { PayTariffButton, type ClinicTariffChangeState } from '../PayTariffButton';

type Props = {
  tariffChange: ClinicTariffChangeState;
  billingEmail: string | null;
};

type TariffChoice = ClinicTariffChangeState['choices'][number];

function enabledMechanics(tariff: TariffChoice): OrgMechanic[] {
  return (Object.keys(MECHANIC_REGISTRY) as OrgMechanic[]).filter(
    (mechanic) => tariff.mechanics?.[mechanic] !== false,
  );
}

export function TariffComparison({ tariffChange, billingEmail }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {tariffChange.choices.map((tariff) => {
          const current = tariff.id === tariffChange.currentTariffId;
          return (
            <section key={tariff.id} className={cn(doctorSectionCardClass, 'min-w-0')}>
              <div className="flex items-start justify-between gap-2">
                <h2 className={doctorSectionTitleClass}>{tariff.name}</h2>
                {current ? <Badge variant="secondary">Текущий</Badge> : null}
              </div>
              {tariff.description ? (
                <p className="text-sm text-muted-foreground">{tariff.description}</p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {tariff.periodPrices.map((price) => (
                  <Badge key={price.billingPeriodCode} variant="outline">
                    {price.billingPeriodCode}: {(price.priceMinor / 100).toLocaleString('ru-RU')} ₽
                  </Badge>
                ))}
              </div>
              <ul className="space-y-1 text-sm">
                {enabledMechanics(tariff).map((mechanic) => (
                  <li key={mechanic}>{MECHANIC_REGISTRY[mechanic].label}</li>
                ))}
                {Object.entries(tariff.quotas ?? {}).map(([mechanic, quota]) =>
                  quota ? (
                    <li key={mechanic}>
                      {MECHANIC_REGISTRY[mechanic as OrgMechanic].label}:{' '}
                      {quota.kind === 'unlimited'
                        ? 'без ограничений'
                        : quota.limit === null
                          ? 'не настроено'
                          : formatQuotaValue(quota.limit, quota.unit)}
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <section className={doctorSectionCardClass}>
        <h2 className={doctorSectionTitleClass}>Выбор тарифа</h2>
        <PayTariffButton tariffChange={tariffChange} billingEmail={billingEmail} />
      </section>
    </div>
  );
}
