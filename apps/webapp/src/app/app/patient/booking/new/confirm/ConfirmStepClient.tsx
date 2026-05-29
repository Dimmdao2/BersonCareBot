"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCategory } from "@/modules/patient-booking/types";
import type { BookingSlot } from "@/modules/patient-booking/types";
import type { BookingSelection } from "../../../cabinet/useBookingSelection";
import { useCreateBooking } from "../../../cabinet/useCreateBooking";
import { useRescheduleBooking } from "../../../cabinet/useRescheduleBooking";
import {
  formatBookingDateLongRu,
  formatBookingTimeShortRu,
} from "@/shared/lib/formatBusinessDateTime";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  patientButtonPrimaryClass,
  patientCardClass,
  patientFormSurfaceClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";

type FormField = {
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  isRequired: boolean;
};

const CONTACT_FIELD_KEYS = new Set([
  "contact_name",
  "first_name",
  "contact_phone",
  "phone",
  "contact_email",
  "email",
]);

function isExtraFormField(field: FormField): boolean {
  if (CONTACT_FIELD_KEYS.has(field.fieldKey)) return false;
  if (field.fieldType === "first_name" || field.fieldType === "last_name" || field.fieldType === "phone") {
    return false;
  }
  if (field.fieldType === "email") return false;
  return true;
}

type ConfirmStepOptions = {
  formFieldsApiPath?: string;
  successRedirectPath?: string;
  useCreateBookingHook?: typeof useCreateBooking;
  useRescheduleBookingHook?: typeof useRescheduleBooking;
};

type Props = ConfirmStepOptions & {
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
  formFieldsApiPath = "/api/booking/form-fields",
  successRedirectPath = routePaths.bookingNew,
  useCreateBookingHook = useCreateBooking,
  useRescheduleBookingHook = useRescheduleBooking,
  rescheduleBookingId,
}: Props & { rescheduleBookingId?: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState("");
  const [extraFields, setExtraFields] = useState<FormField[]>([]);
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [, startFieldsLoad] = useTransition();
  const createState = useCreateBookingHook();
  const rescheduleState = useRescheduleBookingHook();
  const isReschedule = Boolean(rescheduleBookingId);
  const submitting = isReschedule ? rescheduleState.submitting : createState.submitting;
  const error = isReschedule ? rescheduleState.error : createState.error;

  useEffect(() => {
    let cancelled = false;
    startFieldsLoad(() => {
      void (async () => {
        try {
          const res = await fetch(formFieldsApiPath);
          const json = (await res.json()) as { ok?: boolean; fields?: FormField[] };
          if (!cancelled && json.ok && json.fields) {
            setExtraFields(json.fields.filter(isExtraFormField));
          }
        } finally {
          if (!cancelled) setFieldsLoading(false);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [formFieldsApiPath]);

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

  const missingRequiredExtra = extraFields.some(
    (f) => f.isRequired && !(extraValues[f.fieldKey] ?? "").trim(),
  );

  const canSubmit = Boolean(selection && name.trim() && phone.trim() && !submitting && !missingRequiredExtra);

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(patientCardClass, "text-sm ring-0")}>
        <p className="font-semibold">Сводка</p>
        <ul className={cn(patientMutedTextClass, "mt-2 list-inside list-disc")}>
          <li>{formatLabel}</li>
          <li>
            Дата и время: {formatBookingDateLongRu(slotStart, appDisplayTimeZone)} ·{" "}
            {formatBookingTimeShortRu(slotStart, appDisplayTimeZone)} —{" "}
            {formatBookingTimeShortRu(slotEnd, appDisplayTimeZone)}
          </li>
        </ul>
      </div>

      <form
        className={cn(patientFormSurfaceClass, "gap-3")}
        onSubmit={(event) => {
          event.preventDefault();
          if (!selection) return;
          const formAnswers = extraFields.map((f) => ({
            fieldKey: f.fieldKey,
            value: (extraValues[f.fieldKey] ?? "").trim(),
          }));
          if (isReschedule && rescheduleBookingId) {
            void rescheduleState
              .rescheduleBooking({
                bookingId: rescheduleBookingId,
                slotStart: slot.startAt,
                slotEnd: slot.endAt,
              })
              .then((ok) => {
                if (ok) {
                  toast.success("Запись перенесена");
                  router.push(rescheduleState.successRedirectPath);
                }
              });
            return;
          }
          void createState
            .createBooking({
              selection,
              slot,
              contactName: name.trim(),
              contactPhone: phone.trim(),
              contactEmail: email.trim() || undefined,
              formAnswers: formAnswers.length > 0 ? formAnswers : undefined,
            })
            .then((ok) => {
              if (ok) {
                toast.success("Запись подтверждена");
                router.push(successRedirectPath);
              }
            });
        }}
      >
        <h2 className={patientSectionTitleClass}>Контакты</h2>

        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Имя</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Телефон</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Email</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        {fieldsLoading ? null : extraFields.length > 0 ? (
          <>
            <h2 className={patientSectionTitleClass}>Дополнительно</h2>
            {extraFields.map((field) => (
              <label key={field.fieldKey} className="flex flex-col gap-1">
                <span className={cn(patientMutedTextClass, "text-xs")}>
                  {field.label}
                  {field.isRequired ? " *" : ""}
                </span>
                {field.fieldType === "comment" || field.fieldType === "problem_description" ? (
                  <Textarea
                    value={extraValues[field.fieldKey] ?? ""}
                    placeholder={field.placeholder ?? undefined}
                    onChange={(e) =>
                      setExtraValues((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))
                    }
                    required={field.isRequired}
                  />
                ) : (
                  <Input
                    value={extraValues[field.fieldKey] ?? ""}
                    placeholder={field.placeholder ?? undefined}
                    onChange={(e) =>
                      setExtraValues((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))
                    }
                    required={field.isRequired}
                  />
                )}
              </label>
            ))}
          </>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button type="submit" className={patientButtonPrimaryClass} disabled={!canSubmit}>
          {submitting ? "Создаём запись..." : "Подтвердить запись"}
        </button>
      </form>
    </div>
  );
}
