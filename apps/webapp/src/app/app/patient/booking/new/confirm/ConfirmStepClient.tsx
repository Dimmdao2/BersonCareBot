"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCategory } from "@/modules/patient-booking/types";
import type { BookingSlot } from "@/modules/patient-booking/types";
import type { BookingSelection } from "../../../cabinet/useBookingSelection";
import { useCreateBooking } from "../../../cabinet/useCreateBooking";
import {
  formatBookingDateLongRu,
  formatBookingTimeShortRu,
} from "@/shared/lib/formatBusinessDateTime";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { patientCardClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

type Props = {
  type: "in_person" | "online";
  cityCode?: string;
  cityTitle?: string;
  branchServiceId?: string;
  serviceTitle?: string;
  category?: string;
  slotStart: string;
  slotEnd: string;
  defaultName: string;
  defaultPhone: string;
  /** IANA-таймзона отображения (`system_settings.app_display_timezone`). */
  appDisplayTimeZone: string;
};

export function ConfirmStepClient({
  type,
  cityCode,
  cityTitle,
  branchServiceId,
  serviceTitle,
  category,
  slotStart,
  slotEnd,
  defaultName,
  defaultPhone,
  appDisplayTimeZone,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState("");
  const { submitting, error, createBooking } = useCreateBooking();

  const selection: BookingSelection | null = useMemo(() => {
    if (type === "in_person" && cityCode && cityTitle && branchServiceId && serviceTitle) {
      return {
        type: "in_person",
        cityCode,
        cityTitle,
        branchServiceId,
        serviceTitle,
      };
    }
    if (type === "online" && category) {
      return { type: "online", category: category as BookingCategory };
    }
    return null;
  }, [type, cityCode, cityTitle, branchServiceId, serviceTitle, category]);

  const slot: BookingSlot = useMemo(
    () => ({ startAt: slotStart, endAt: slotEnd }),
    [slotStart, slotEnd],
  );

  const formatLabel =
    type === "in_person"
      ? `Очный приём · ${cityTitle ?? ""} · ${serviceTitle ?? ""}`
      : category === "rehab_lfk"
        ? "Онлайн — Реабилитация (ЛФК)"
        : category === "nutrition"
          ? "Онлайн — Нутрициология"
          : "Онлайн";

  const canSubmit = Boolean(selection && name.trim() && phone.trim() && !submitting);

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(patientCardClass, "text-sm ring-0")}>
        <p className="font-semibold">Сводка</p>
        <ul className={cn(patientMutedTextClass, "mt-2 list-inside list-disc")}>
          <li>{formatLabel}</li>
          {type === "in_person" && cityCode ? <li>Код города: {cityCode}</li> : null}
          <li>
            Дата и время: {formatBookingDateLongRu(slotStart, appDisplayTimeZone)} ·{" "}
            {formatBookingTimeShortRu(slotStart, appDisplayTimeZone)} — {formatBookingTimeShortRu(slotEnd, appDisplayTimeZone)}
          </li>
        </ul>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!selection) return;
          void createBooking({
            selection,
            slot,
            contactName: name.trim(),
            contactPhone: phone.trim(),
            contactEmail: email.trim() || undefined,
          }).then((ok) => {
            if (ok) {
              toast.success("Запись подтверждена");
              router.push(routePaths.bookingNew);
            }
          });
        }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Контакты</h2>
          <Badge variant="outline">Шаг 4</Badge>
        </div>

        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Имя</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Телефон</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Email (опционально)</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? "Создаём запись..." : "Подтвердить запись"}
        </Button>
      </form>
    </div>
  );
}
