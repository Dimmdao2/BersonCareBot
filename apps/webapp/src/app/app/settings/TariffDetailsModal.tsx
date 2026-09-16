'use client';

import { useState } from 'react';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import {
  MECHANICS,
  MECHANIC_REGISTRY,
  type OrgMechanic,
  type TariffQuotaMap,
} from '@/modules/org-entitlements/types';
import { formatQuotaValue } from './billingQuotaFormat';

type TariffDetails = {
  mechanics: Record<string, boolean>;
  quotas: TariffQuotaMap;
  includedSeats: number | null;
};

type Props = {
  tariffName: string;
  details: TariffDetails;
};

function isIncluded(details: TariffDetails, mechanic: OrgMechanic): boolean {
  return MECHANIC_REGISTRY[mechanic].class === 'никогда' || details.mechanics[mechanic] !== false;
}

function mechanicLimit(details: TariffDetails, mechanic: OrgMechanic): string | null {
  if (mechanic === 'clinic_team' && details.includedSeats !== null) {
    return `${details.includedSeats} мест специалистов`;
  }
  if (mechanic !== 'files' && mechanic !== 'branches') return null;
  const quota = details.quotas[mechanic];
  if (!quota) return null;
  if (quota.kind === 'unlimited') return 'Без ограничений';
  return quota.limit === null ? null : `До ${formatQuotaValue(quota.limit, quota.unit)}`;
}

function MechanicList({
  mechanics,
  details,
}: {
  mechanics: OrgMechanic[];
  details: TariffDetails;
}) {
  return (
    <ul className={doctorDnaFlatListClass}>
      {mechanics.map((mechanic) => {
        const limit = mechanicLimit(details, mechanic);
        return (
          <li key={mechanic} className={`${doctorDnaFlatListRowClass} justify-between gap-3`}>
            <span className={doctorDnaFlatListPrimaryClass}>
              {MECHANIC_REGISTRY[mechanic].label}
            </span>
            {limit ? <span className={doctorDnaFlatListMetaClass}>{limit}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TariffDetailsModal({ tariffName, details }: Props) {
  const [open, setOpen] = useState(false);
  const included = MECHANICS.filter((mechanic) => isIncluded(details, mechanic));
  const excluded = MECHANICS.filter((mechanic) => !isIncluded(details, mechanic));

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Что входит в тариф
      </Button>
      <DoctorModal
        open={open}
        onClose={() => setOpen(false)}
        title="Состав тарифа"
        titleSubject={tariffName}
        size="content"
        desktopPresentation="right-sheet"
      >
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h3 className={doctorSectionTitleClass}>Включено</h3>
            <MechanicList mechanics={included} details={details} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className={doctorSectionTitleClass}>Не входит</h3>
            {excluded.length > 0 ? (
              <MechanicList mechanics={excluded} details={details} />
            ) : (
              <p className="text-sm text-muted-foreground">Ограничений по возможностям нет.</p>
            )}
          </section>
        </div>
      </DoctorModal>
    </>
  );
}
