"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StatsPeriod } from "@/modules/diaries/stats/periodWindow";

function shiftMonthYm(monthYm: string, delta: number): string {
  const [y, m] = monthYm.split("-").map(Number);
  if (!y || !m) return monthYm;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitleRu(monthYm: string): string {
  const [y, m] = monthYm.split("-").map(Number);
  if (!y || !m) return monthYm;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}

export function JournalMonthNav(props: {
  basePath: string;
  monthYm: string;
  period: StatsPeriod;
  offset: number;
  trackingId?: string;
  complexId?: string;
}) {
  const { basePath, monthYm, period, offset, trackingId, complexId } = props;
  const prevYm = shiftMonthYm(monthYm, -1);
  const nextYm = shiftMonthYm(monthYm, 1);

  const href = (month: string) => {
    const p = new URLSearchParams();
    p.set("month", month);
    p.set("period", period);
    p.set("offset", String(offset));
    if (trackingId) p.set("trackingId", trackingId);
    if (complexId) p.set("complexId", complexId);
    return `${basePath}?${p.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        href={href(prevYm)}
        aria-label="Предыдущий месяц"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
      >
        ← Месяц
      </Link>
      <span className="text-sm font-medium capitalize">{monthTitleRu(monthYm)}</span>
      <Link
        href={href(nextYm)}
        aria-label="Следующий месяц"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
      >
        Месяц →
      </Link>
    </div>
  );
}
