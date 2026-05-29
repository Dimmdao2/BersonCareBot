"use client";

import { useEffect, useState } from "react";
import { patientListItemClass, patientMutedTextClass, patientSectionSurfaceClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";

type HistoryRow = {
  id: string;
  eventType: string;
  amountMinor: number | null;
  currency: string | null;
  occurredAt: string;
};

export function PatientBookingPaymentHistorySection() {
  const [events, setEvents] = useState<HistoryRow[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/booking/payment-history");
      const json = (await res.json()) as { ok?: boolean; events?: HistoryRow[] };
      if (json.ok && json.events) setEvents(json.events);
    })();
  }, []);

  if (events.length === 0) return null;

  return (
    <div className={patientSectionSurfaceClass}>
      <h3 className={patientSectionTitleClass}>Оплаты</h3>
      <ul className="flex flex-col gap-2">
        {events.slice(0, 12).map((e) => (
          <li key={e.id} className={patientListItemClass}>
            <p className="text-sm font-medium">{e.eventType}</p>
            <p className={patientMutedTextClass}>
              {e.amountMinor != null && e.currency
                ? (e.amountMinor / 100).toLocaleString("ru-RU", { style: "currency", currency: e.currency })
                : "—"}
              {" · "}
              {new Date(e.occurredAt).toLocaleString("ru-RU")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
