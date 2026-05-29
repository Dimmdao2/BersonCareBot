"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import { Textarea } from "@/components/ui/textarea";
import {
  appointmentStatusLabel,
  formatAmountMinor,
  paymentMethodLabel,
  paymentPurposeLabel,
  timelineEventTitle,
} from "@/modules/client-history/labels";
import { isRefundEventType } from "@/modules/client-history/clientHistoryUtils";
import { AppointmentStaffCommentsSection } from "./AppointmentStaffCommentsSection";

type TimelineItem = {
  id: string;
  category: string;
  eventType: string;
  title: string;
  summary: string | null;
  occurredAt: string;
  appointmentId: string | null;
};

type PaymentRow = {
  id: string;
  occurredAt: string;
  eventType: string;
  amountMinor: number | null;
  currency: string | null;
  providerId: string | null;
  paymentMethodLabel: string | null;
  status: string | null;
  purpose: string | null;
  serviceTitle: string | null;
  packageTitle: string | null;
  productTitle: string | null;
  refundId: string | null;
  comment: string | null;
};

type VisitRow = {
  appointmentId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  specialistName: string | null;
  branchTitle: string | null;
  roomTitle: string | null;
  serviceTitle: string | null;
  wasViaPackage: boolean;
  packageUsageSummary: string | null;
  prepaymentAmountMinor: number | null;
  prepaymentCurrency: string | null;
  finalPaymentAmountMinor: number | null;
  finalPaymentCurrency: string | null;
  staffComment: string | null;
};

type BookingProfile = {
  isProblematic: boolean;
  bookingBlocked: boolean;
  problematicNote: string | null;
};

type Tab = "timeline" | "payments" | "visits";

type Props = {
  userId: string;
};

export function ClientBookingHistoryPanel({ userId }: Props) {
  const [tab, setTab] = useState<Tab>("timeline");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [profile, setProfile] = useState<BookingProfile>({
    isProblematic: false,
    bookingBlocked: false,
    problematicNote: null,
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, profileRes] = await Promise.all([
        fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/history`),
        fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/booking-profile`),
      ]);
      const historyJson = (await historyRes.json()) as {
        ok?: boolean;
        timeline?: TimelineItem[];
        payments?: PaymentRow[];
        visits?: VisitRow[];
      };
      const profileJson = (await profileRes.json()) as { ok?: boolean; profile?: BookingProfile };
      if (!historyRes.ok || !historyJson.ok) {
        setError("Не удалось загрузить историю");
        return;
      }
      setTimeline(historyJson.timeline ?? []);
      setPayments(historyJson.payments ?? []);
      setVisits(historyJson.visits ?? []);
      if (profileRes.ok && profileJson.ok && profileJson.profile) {
        setProfile(profileJson.profile);
        setNoteDraft(profileJson.profile.problematicNote ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load, historyVersion]);

  async function saveProfile(patch: Partial<BookingProfile>) {
    setSavingProfile(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/booking-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...patch,
          problematicNote: noteDraft.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; profile?: BookingProfile };
      if (!res.ok || !json.ok || !json.profile) {
        setError("Не удалось сохранить");
        return;
      }
      setProfile(json.profile);
    } finally {
      setSavingProfile(false);
    }
  }

  function paymentMeta(p: PaymentRow): string {
    const parts: string[] = [new Date(p.occurredAt).toLocaleString("ru-RU")];
    if (p.serviceTitle) parts.push(p.serviceTitle);
    if (p.packageTitle) parts.push(p.packageTitle);
    if (p.productTitle) parts.push(p.productTitle);
    const method = p.paymentMethodLabel ?? paymentMethodLabel(p.providerId);
    if (method) parts.push(method);
    const purpose = paymentPurposeLabel(p.purpose);
    if (purpose) parts.push(purpose);
    if (p.status) parts.push(p.status);
    return parts.join(" · ");
  }

  return (
    <section
      id="doctor-client-section-booking-history"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4"
      aria-labelledby="doctor-booking-history-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="doctor-booking-history-heading">История записи</h2>
        <div className="flex flex-wrap gap-1">
          {(["timeline", "payments", "visits"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={tab === t ? "default" : "outline"}
              onClick={() => setTab(t)}
            >
              {t === "timeline" ? "События" : t === "payments" ? "Оплаты" : "Визиты"}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-6">
          <LabeledSwitch
            label="Проблемный"
            checked={profile.isProblematic}
            disabled={savingProfile}
            onCheckedChange={(v) => void saveProfile({ isProblematic: v, bookingBlocked: profile.bookingBlocked })}
          />
          <LabeledSwitch
            label="Блок самозаписи"
            checked={profile.bookingBlocked}
            disabled={savingProfile}
            onCheckedChange={(v) => void saveProfile({ bookingBlocked: v, isProblematic: profile.isProblematic })}
          />
          {profile.isProblematic ? <Badge variant="destructive">Проблемный</Badge> : null}
          {profile.bookingBlocked ? <Badge variant="secondary">Самозапись закрыта</Badge> : null}
        </div>
        <Textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={2}
          placeholder="Заметка по booking-репутации"
          disabled={savingProfile}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={savingProfile}
          onClick={() => void saveProfile({ isProblematic: profile.isProblematic, bookingBlocked: profile.bookingBlocked })}
        >
          Сохранить пометки
        </Button>
      </div>

      {loading ? <p className="text-muted-foreground text-sm">Загрузка…</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {tab === "timeline" && !loading ? (
        <ul className="m-0 list-none space-y-2 p-0">
          {timeline.length === 0 ? (
            <li className="text-sm text-muted-foreground">Нет событий</li>
          ) : (
            timeline.map((item) => (
              <li key={item.id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.occurredAt).toLocaleString("ru-RU")}
                  </span>
                </div>
                {item.summary ? <p className="mt-1 text-muted-foreground">{item.summary}</p> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "payments" && !loading ? (
        <ul className="m-0 list-none space-y-2 p-0">
          {payments.length === 0 ? (
            <li className="text-sm text-muted-foreground">Нет оплат</li>
          ) : (
            payments.map((p) => (
              <li key={p.id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{timelineEventTitle(p.eventType)}</span>
                  <span>{formatAmountMinor(p.amountMinor, p.currency) ?? "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{paymentMeta(p)}</p>
                {p.refundId || isRefundEventType(p.eventType) ? (
                  <p className="text-xs text-muted-foreground mt-1">Возврат</p>
                ) : null}
                {p.comment ? <p className="mt-1">{p.comment}</p> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "visits" && !loading ? (
        <ul className="m-0 list-none space-y-2 p-0">
          {visits.length === 0 ? (
            <li className="text-sm text-muted-foreground">Нет визитов</li>
          ) : (
            visits.map((v) => (
              <li key={v.appointmentId} className="rounded-md border border-border p-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{v.serviceTitle ?? "Запись"}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.startAt).toLocaleString("ru-RU")}
                    {v.endAt ? ` — ${new Date(v.endAt).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {appointmentStatusLabel(v.status)}
                  {v.specialistName ? ` · ${v.specialistName}` : ""}
                  {v.branchTitle ? ` · ${v.branchTitle}` : ""}
                  {v.roomTitle ? ` · ${v.roomTitle}` : ""}
                  {v.durationMinutes ? ` · ${v.durationMinutes} мин` : ""}
                </p>
                {v.wasViaPackage ? (
                  <p className="mt-1">Абонемент: {v.packageUsageSummary ?? "да"}</p>
                ) : null}
                {(v.prepaymentAmountMinor != null || v.finalPaymentAmountMinor != null) && (
                  <p className="mt-1 text-muted-foreground">
                    {v.prepaymentAmountMinor != null
                      ? `Предоплата: ${formatAmountMinor(v.prepaymentAmountMinor, v.prepaymentCurrency ?? "RUB")}`
                      : null}
                    {v.finalPaymentAmountMinor != null
                      ? ` · Оплата: ${formatAmountMinor(v.finalPaymentAmountMinor, v.finalPaymentCurrency ?? "RUB")}`
                      : null}
                  </p>
                )}
                {v.staffComment ? <p className="mt-1 whitespace-pre-wrap">{v.staffComment}</p> : null}
                <AppointmentStaffCommentsSection
                  appointmentId={v.appointmentId}
                  onChanged={() => setHistoryVersion((n) => n + 1)}
                />
              </li>
            ))
          )}
        </ul>
      ) : null}
    </section>
  );
}
