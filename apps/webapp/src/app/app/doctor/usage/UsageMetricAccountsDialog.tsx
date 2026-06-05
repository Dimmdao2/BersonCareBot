"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/doctor/primitives/dialog";
import type { ProductAnalyticsClientActivityRow } from "@/modules/product-analytics/types";
import { formatDisplayZoneInstantRu } from "@/shared/datetime/displayTimeZoneFormat";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: ProductAnalyticsClientActivityRow[];
  displayTimezone: string;
};

export function UsageMetricAccountsDialog({ open, onOpenChange, title, rows, displayTimezone }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных по метрике.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.userId} className="rounded-md border border-border/60 p-2">
                  <Link
                    href={`/app/doctor/clients/${row.userId}`}
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
      </DialogContent>
    </Dialog>
  );
}
