"use client";

import Link from "next/link";
import { DoctorModal } from "@/shared/ui/doctor/DoctorModal";
import type { ProductAnalyticsClientActivityRow } from "@/modules/product-analytics/types";
import { formatDisplayZoneInstantRu } from "@/shared/datetime/displayTimeZoneFormat";
import { patientCardHref } from "@/app/app/doctor/patients/patientCardHref";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: ProductAnalyticsClientActivityRow[];
  displayTimezone: string;
};

export function UsageMetricAccountsDialog({ open, onOpenChange, title, rows, displayTimezone }: Props) {
  return (
    <DoctorModal open={open} onClose={() => onOpenChange(false)} title={title} size="lg">
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет данных по метрике.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.userId} className="rounded-md border border-border/60 p-2">
                <Link
                  href={patientCardHref(row.userId)}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  {row.displayName}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Заходы: {row.appOpens} · Страницы: {row.pageViews} · Push open: {row.pushOpens}
                  {row.lastSeenAt
                    ? ` · ${formatDisplayZoneInstantRu(row.lastSeenAt, displayTimezone)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DoctorModal>
  );
}
