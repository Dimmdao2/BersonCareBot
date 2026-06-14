"use client";

/**
 * PatientTabAccount — Wave 2 placeholder.
 * Wave 3: payments block (integration-sourced + manual cash entry), membership info.
 * Wave 4: model payments + manual cash backend; acquiring integration port/stub.
 */
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabAccount({ userId, header: _header }: Props) {
  return (
    <div className={doctorSectionCardClass}>
      <p className={doctorSectionTitleClass}>Учётка</p>
      <p className="text-sm text-muted-foreground">
        {/* TODO(Wave 3): блок платежей (интеграции + ручной кэш), абонементы, репутация/мёрдж. */}
        {/* TODO(Wave 4): backend — модель payments, manual cash, порт эквайринга. */}
        Содержимое вкладки «Учётка» — Wave 3.
      </p>
    </div>
  );
}
