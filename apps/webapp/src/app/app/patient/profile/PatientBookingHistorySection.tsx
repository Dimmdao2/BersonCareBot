"use client";

import { useCallback, useEffect, useState } from "react";
import {
  patientListItemClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patient/patientVisual";
import {
  appointmentStatusLabel,
  formatAmountMinor,
  paymentMethodLabel,
  paymentPurposeLabel,
  timelineEventTitle,
} from "@/modules/client-history/labels";

type TimelineItem = {
  id: string;
  title: string;
  summary: string | null;
  occurredAt: string;
};

type PaymentRow = {
  id: string;
  occurredAt: string;
  eventType: string;
  amountMinor: number | null;
  currency: string | null;
  providerId: string | null;
  paymentMethodLabel: string | null;
  purpose: string | null;
  serviceTitle: string | null;
  packageTitle: string | null;
  productTitle: string | null;
};

type VisitRow = {
  appointmentId: string;
  startAt: string;
  endAt: string;
  status: string;
  serviceTitle: string | null;
  specialistName: string | null;
  branchTitle: string | null;
};

type Props = {
  mode?: "full" | "payments";
};

export function PatientBookingHistorySection({ mode = "full" }: Props) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/booking/history");
      const json = (await res.json()) as {
        ok?: boolean;
        timeline?: TimelineItem[];
        payments?: PaymentRow[];
        visits?: VisitRow[];
      };
      if (json.ok) {
        setTimeline(json.timeline ?? []);
        setPayments(json.payments ?? []);
        setVisits(json.visits ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showVisits = mode === "full";
  const showTimeline = mode === "full";
  const showPayments = mode === "full" || mode === "payments";

  if (loading) {
    return (
      <section className={patientSectionSurfaceClass}>
        <h2 className={patientSectionTitleClass}>{mode === "payments" ? "Оплаты" : "История"}</h2>
        <p className={patientMutedTextClass}>Загрузка…</p>
      </section>
    );
  }

  const hasContent =
    (showPayments && payments.length > 0) ||
    (showVisits && visits.length > 0) ||
    (showTimeline && timeline.length > 0);
  if (!hasContent) return null;

  function paymentMeta(p: PaymentRow): string {
    const parts: string[] = [new Date(p.occurredAt).toLocaleString("ru-RU")];
    if (p.serviceTitle) parts.push(p.serviceTitle);
    if (p.packageTitle) parts.push(p.packageTitle);
    if (p.productTitle) parts.push(p.productTitle);
    const method = p.paymentMethodLabel ?? paymentMethodLabel(p.providerId);
    if (method) parts.push(method);
    const purpose = paymentPurposeLabel(p.purpose);
    if (purpose) parts.push(purpose);
    return parts.join(" · ");
  }

  return (
    <section className={patientSectionSurfaceClass}>
      <h2 className={patientSectionTitleClass}>{mode === "payments" ? "Оплаты" : "История"}</h2>
      {showPayments && payments.length > 0 ? (
        <ul className={`flex flex-col gap-2 ${showVisits || showTimeline ? "mb-4" : ""}`}>
          {payments.slice(0, mode === "payments" ? 20 : 8).map((p) => (
            <li key={p.id} className={patientListItemClass}>
              <p className="text-sm font-medium">
                {timelineEventTitle(p.eventType)}
                {formatAmountMinor(p.amountMinor, p.currency)
                  ? ` · ${formatAmountMinor(p.amountMinor, p.currency)}`
                  : ""}
              </p>
              <p className={patientMutedTextClass}>{paymentMeta(p)}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {showVisits && visits.length > 0 ? (
        <ul className={`flex flex-col gap-2 ${showTimeline ? "mb-4" : ""}`}>
          {visits.slice(0, 8).map((v) => (
            <li key={v.appointmentId} className={patientListItemClass}>
              <p className="text-sm font-medium">{v.serviceTitle ?? "Запись"}</p>
              <p className={patientMutedTextClass}>
                {new Date(v.startAt).toLocaleString("ru-RU")}
                {v.endAt
                  ? ` — ${new Date(v.endAt).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
                {" · "}
                {appointmentStatusLabel(v.status)}
                {v.specialistName ? ` · ${v.specialistName}` : ""}
                {v.branchTitle ? ` · ${v.branchTitle}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {showTimeline && timeline.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {timeline.slice(0, 10).map((e) => (
            <li key={e.id} className={patientListItemClass}>
              <p className="text-sm font-medium">{e.title}</p>
              <p className={patientMutedTextClass}>
                {e.summary ? `${e.summary} · ` : ""}
                {new Date(e.occurredAt).toLocaleString("ru-RU")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
