import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from "@/shared/ui/doctor/DoctorDnaFlatListRow";
import type { OrgMechanic } from "@/modules/org-entitlements/types";
import type { SaasBillingOverview } from "@/modules/saas-billing/ports";
import { SaasBillingOverview as SaasBillingOverviewSection } from "@/shared/ui/doctor/SaasBillingOverview";

export type BillingMechanicRow = {
  mechanic: OrgMechanic;
  label: string;
  enabled: boolean;
};

type Props = {
  /** `null` when the organization genuinely has no tariff assigned (own tariff, not the resolver's default). */
  tariffName: string | null;
  /** Human sentence from `describeCommercialAccessState` — never the raw enum. */
  commercialStateLabel: string;
  /** Every canonical mechanic (`MECHANICS`), resolved through `resolveOrgEntitlements`/`entitlementsFromSnapshot`. */
  mechanics: BillingMechanicRow[];
  /** Real rows from `saas_billing_*`; empty arrays mean no billing data, never synthetic zeroes. */
  billing: SaasBillingOverview;
};

/**
 * Read-only «Тариф и биллинг» tab. Defect #2 2026-07-25: this used to always render a hardcoded
 * "connect a tariff" sentence regardless of what the organization actually has. No tariff-change
 * UI here by design — that stays with the platform administrator.
 */
export function BillingSection({ tariffName, commercialStateLabel, mechanics, billing }: Props) {
  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Тариф и биллинг</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Тариф</span>
          <span className="text-right font-medium text-foreground">
            {tariffName ?? "Тариф не назначен"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{commercialStateLabel}</p>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Что доступно клинике</p>
          <ul aria-label="Механики тарифа" className={doctorDnaFlatListClass}>
            {mechanics.map((row) => (
              <li key={row.mechanic} className={`${doctorDnaFlatListRowClass} justify-between gap-2`}>
                <span className={doctorDnaFlatListPrimaryClass}>{row.label}</span>
                <span className={doctorDnaFlatListMetaClass}>
                  <Badge variant={row.enabled ? "secondary" : "outline"}>
                    {row.enabled ? "Включено" : "Недоступно"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Смена тарифа и подключение новых механик выполняется администратором платформы.
        </p>
      </DoctorSection>
      <SaasBillingOverviewSection billing={billing} />
    </>
  );
}
