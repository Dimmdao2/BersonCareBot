"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  patientListItemClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patient/patientVisual";

type PackageRow = {
  id: string;
  title: string;
  status: string;
  priceMinor: number;
  currency: string;
  validUntil: string | null;
  paymentIntentId: string | null;
  balance: {
    items: Array<{
      serviceId: string;
      serviceTitle?: string | null;
      quantityInitial: number;
      remaining: number;
      consumed: number;
      reserved: number;
    }>;
  };
};

const STATUS_LABEL: Record<string, string> = {
  offered: "Предложен",
  awaiting_payment: "Ожидает оплаты",
  active: "Активен",
  expired: "Истёк",
  cancelled: "Отменён",
};

export function PatientMembershipsSection() {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      void (async () => {
        const res = await fetch("/api/booking/memberships");
        const json = (await res.json()) as { ok?: boolean; packages?: PackageRow[] };
        if (json.ok && json.packages) setPackages(json.packages);
      })();
    });
  }, [startTransition]);

  if (packages.length === 0) return null;

  return (
    <div className={patientSectionSurfaceClass}>
      <h3 className={patientSectionTitleClass}>Абонементы</h3>
      <ul className="flex flex-col gap-2">
        {packages.map((p) => (
          <li key={p.id} className={patientListItemClass}>
            <p className="text-sm font-medium">{p.title}</p>
            <p className={patientMutedTextClass}>
              {STATUS_LABEL[p.status] ?? p.status}
              {p.validUntil ? ` · до ${new Date(p.validUntil).toLocaleDateString("ru-RU")}` : ""}
            </p>
            <p className={patientMutedTextClass}>
              Остаток:{" "}
              {p.balance.items
                .map((it) => {
                  const label = it.serviceTitle?.trim() || "услуга";
                  return `${label} ${it.remaining}/${it.quantityInitial}`;
                })
                .join("; ")}
            </p>
            <Link
              href={`/app/patient/memberships/${encodeURIComponent(p.id)}`}
              className="text-sm text-[var(--patient-color-primary)] underline"
            >
              Подробнее
            </Link>
            {p.status === "awaiting_payment" && p.paymentIntentId ? (
              <Link
                href={`/app/patient/memberships/pay?patientPackageId=${encodeURIComponent(p.id)}`}
                className="text-sm text-[var(--patient-color-primary)] underline"
              >
                Оплатить
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
