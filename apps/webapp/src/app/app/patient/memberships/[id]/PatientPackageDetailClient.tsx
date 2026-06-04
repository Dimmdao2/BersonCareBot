"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientCardClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from "@/shared/ui/patient/patientVisual";

type PackageDetail = {
  package: {
    title: string;
    status: string;
    balance: {
      items: Array<{
        serviceId: string;
        serviceTitle?: string | null;
        remaining: number;
        quantityInitial: number;
      }>;
    };
  };
  usages: Array<{ usageKind: string; occurredAt: string }>;
  history: Array<{ eventType: string; occurredAt: string }>;
};

type Props = { patientPackageId: string };

export function PatientPackageDetailClient({ patientPackageId }: Props) {
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/booking/memberships/${encodeURIComponent(patientPackageId)}`);
        const json = (await res.json()) as { ok?: boolean; package?: PackageDetail["package"]; usages?: PackageDetail["usages"]; history?: PackageDetail["history"] };
        if (json.ok && json.package) {
          setDetail({
            package: json.package,
            usages: json.usages ?? [],
            history: json.history ?? [],
          });
          setNotFound(false);
          return;
        }
        setNotFound(true);
      })();
    });
  }, [patientPackageId, startTransition]);

  if (notFound) {
    return (
      <div className="p-4">
        <Link href={routePaths.patientBooking} className="text-sm underline">
          Назад
        </Link>
        <p className={patientMutedTextClass}>Абонемент не найден.</p>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href={routePaths.patientBooking} className="text-sm underline">
        Назад
      </Link>
      <div className={patientCardClass}>
        <h1 className={patientSectionTitleClass}>{detail.package.title}</h1>
        <p className={patientMutedTextClass}>{detail.package.status}</p>
        <ul className={patientMutedTextClass}>
          {detail.package.balance.items.map((it) => (
            <li key={it.serviceId}>
              {(it.serviceTitle?.trim() || "Услуга") + `: ${it.remaining}/${it.quantityInitial}`}
            </li>
          ))}
        </ul>
      </div>
      {detail.history.length > 0 ? (
        <div className={patientCardClass}>
          <h2 className={patientSectionTitleClass}>История</h2>
          <ul className={patientMutedTextClass}>
            {detail.history.map((h) => (
              <li key={`${h.eventType}-${h.occurredAt}`}>
                {h.eventType} · {new Date(h.occurredAt).toLocaleString("ru-RU")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
