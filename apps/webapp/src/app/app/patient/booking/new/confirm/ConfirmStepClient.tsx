"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/shared/ui/patient/primitives/input";
import { Textarea } from "@/shared/ui/patient/primitives/textarea";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCategory } from "@/modules/patient-booking/types";
import type { BookingSlot, PatientBookingRecord } from "@/modules/patient-booking/types";
import type { BookingSelection } from "../../../cabinet/useBookingSelection";
import { useCreateBooking } from "../../../cabinet/useCreateBooking";
import { useRescheduleBooking } from "../../../cabinet/useRescheduleBooking";
import {
  formatBookingDateLongRu,
  formatBookingTimeShortRu,
} from "@/shared/lib/formatBusinessDateTime";
import { formatDoctorFio, type StructuredFio } from "@/shared/lib/fio";
import toast from "react-hot-toast";
import { showBookingPartialOutcomeToast } from "@/shared/booking/bookingPartialOutcomeToast";
import { cn } from "@/lib/utils";
import {
  patientButtonPrimaryClass,
  patientCardClass,
  patientFormSurfaceClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from "@/shared/ui/patient/patientVisual";

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
  "last_name",
  "patronymic",
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
  buildAwaitingPaymentHref?: (booking: PatientBookingRecord, contactPhone: string) => string;
  useCreateBookingHook?: typeof useCreateBooking;
  useRescheduleBookingHook?: typeof useRescheduleBooking;
};

type Props = ConfirmStepOptions & {
  type: "in_person" | "online";
  cityCode?: string;
  cityTitle?: string;
  branchId?: string;
  serviceId?: string;
  branchServiceId?: string;
  serviceTitle?: string;
  category?: string;
  slotStart: string;
  slotEnd: string;
  defaultFio: StructuredFio;
  defaultPhone: string;
  defaultEmail: string;
  appDisplayTimeZone: string;
};

export function ConfirmStepClient({
  type,
  cityCode,
  cityTitle,
  branchId,
  serviceId,
  branchServiceId,
  serviceTitle,
  category,
  slotStart,
  slotEnd,
  defaultFio,
  defaultPhone,
  defaultEmail,
  appDisplayTimeZone,
  formFieldsApiPath = "/api/booking/form-fields",
  successRedirectPath = routePaths.bookingNew,
  buildAwaitingPaymentHref,
  useCreateBookingHook = useCreateBooking,
  useRescheduleBookingHook = useRescheduleBooking,
  rescheduleBookingId,
}: Props & { rescheduleBookingId?: string }) {
  const router = useRouter();
  const [lastName, setLastName] = useState(defaultFio.lastName ?? "");
  const [firstName, setFirstName] = useState(defaultFio.firstName ?? "");
  const [patronymic, setPatronymic] = useState(defaultFio.patronymic ?? "");
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);
  const [extraFields, setExtraFields] = useState<FormField[]>([]);
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [packageOptions, setPackageOptions] = useState<
    Array<{ id: string; title: string; balance: { items: Array<{ remaining: number; quantityInitial: number }> } }>
  >([]);
  const [patientPackageId, setPatientPackageId] = useState("");
  const [productOptions, setProductOptions] = useState<
    Array<{ id: string; title: string; visitsRemaining: number }>
  >([]);
  const [productPurchaseId, setProductPurchaseId] = useState("");
  const [, startFieldsLoad] = useTransition();
  const [, startPackagesLoad] = useTransition();
  const [, startProductsLoad] = useTransition();
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

  useEffect(() => {
    const hasCanonical = Boolean(branchId && serviceId);
    if (type !== "in_person" || (!hasCanonical && !branchServiceId) || isReschedule) return;
    let cancelled = false;
    startPackagesLoad(() => {
      void (async () => {
        const q = hasCanonical
          ? new URLSearchParams({ branchId: branchId!, serviceId: serviceId! })
          : new URLSearchParams({ branchServiceId: branchServiceId! });
        const res = await fetch(`/api/booking/memberships/available?${q.toString()}`);
        const json = (await res.json()) as {
          ok?: boolean;
          packages?: Array<{
            id: string;
            title: string;
            balance: { items: Array<{ remaining: number; quantityInitial: number }> };
          }>;
        };
        if (!cancelled && json.ok && json.packages) {
          setPackageOptions(json.packages);
          if (json.packages.length === 1) setPatientPackageId(json.packages[0]!.id);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [type, branchId, serviceId, branchServiceId, isReschedule, startPackagesLoad]);

  useEffect(() => {
    const hasCanonical = Boolean(branchId && serviceId);
    if (type !== "in_person" || (!hasCanonical && !branchServiceId) || isReschedule) return;
    let cancelled = false;
    startProductsLoad(() => {
      void (async () => {
        const q = hasCanonical
          ? new URLSearchParams({ branchId: branchId!, serviceId: serviceId! })
          : new URLSearchParams({ branchServiceId: branchServiceId! });
        const res = await fetch(`/api/booking/products/available?${q.toString()}`);
        const json = (await res.json()) as {
          ok?: boolean;
          purchases?: Array<{ id: string; title: string; visitsRemaining: number }>;
        };
        if (!cancelled && json.ok && json.purchases) {
          setProductOptions(json.purchases);
          if (json.purchases.length === 1) setProductPurchaseId(json.purchases[0]!.id);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [type, branchId, serviceId, branchServiceId, isReschedule, startProductsLoad]);

  const selection: BookingSelection | null = useMemo(() => {
    if (
      type === "in_person" &&
      cityCode &&
      cityTitle &&
      serviceTitle &&
      branchId &&
      serviceId
    ) {
      return {
        type: "in_person",
        cityCode,
        cityTitle,
        branchId,
        serviceId,
        serviceTitle,
      };
    }
    if (
      type === "in_person" &&
      cityCode &&
      cityTitle &&
      branchServiceId &&
      serviceTitle
    ) {
      return {
        type: "in_person",
        cityCode,
        cityTitle,
        branchId: "",
        serviceId: "",
        serviceTitle,
        branchServiceId,
      };
    }
    if (type === "online" && category) {
      return { type: "online", category: category as BookingCategory };
    }
    return null;
  }, [type, cityCode, cityTitle, branchId, serviceId, branchServiceId, serviceTitle, category]);

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

  const contactFio: StructuredFio = {
    lastName: lastName.trim() || null,
    firstName: firstName.trim() || null,
    patronymic: patronymic.trim() || null,
  };
  const contactName = formatDoctorFio(contactFio);
  const contactFioInput =
    contactFio.lastName && contactFio.firstName
      ? {
          lastName: contactFio.lastName,
          firstName: contactFio.firstName,
          ...(contactFio.patronymic ? { patronymic: contactFio.patronymic } : {}),
        }
      : undefined;
  const canSubmit = Boolean(
    selection &&
      contactFioInput &&
      phone.trim() &&
      !submitting &&
      !missingRequiredExtra,
  );

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
          if (!contactFioInput) return;
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
              .then((result) => {
                if (!result.ok) return;
                toast.success("Запись перенесена");
                showBookingPartialOutcomeToast(result.partial);
                router.push(successRedirectPath);
              });
            return;
          }
          void createState
            .createBooking({
              selection,
              slot,
              contactName,
              contactFio: contactFioInput,
              contactPhone: phone.trim(),
              contactEmail: email.trim() || undefined,
              formAnswers: formAnswers.length > 0 ? formAnswers : undefined,
              patientPackageId: patientPackageId.trim() || undefined,
              productPurchaseId: productPurchaseId.trim() || undefined,
            })
            .then((booking) => {
              if (!booking) return;
              if (booking.status === "awaiting_payment") {
                toast.success("Требуется оплата");
                const payPath = buildAwaitingPaymentHref
                  ? buildAwaitingPaymentHref(booking, phone.trim())
                  : `/app/patient/booking/pay?bookingId=${encodeURIComponent(booking.id)}`;
                router.push(payPath);
                return;
              }
              // Redirect to success/calendar screen instead of straight to hub.
              const doneQ = new URLSearchParams({
                bookingId: booking.id,
                slotStart: booking.slotStart,
                slotEnd: booking.slotEnd,
                serviceTitle:
                  booking.serviceTitleSnapshot ??
                  serviceTitle ??
                  (type === "online" ? formatLabel : ""),
              });
              const loc =
                booking.branchTitleSnapshot ??
                (type === "online" ? "Онлайн" : cityTitle ?? "");
              if (loc) doneQ.set("locationLabel", loc);
              if (cityCode) doneQ.set("cityCode", cityCode);
              router.push(`${routePaths.bookingNewDone}?${doneQ.toString()}`);
            });
        }}
      >
        <h2 className={patientSectionTitleClass}>Контакты</h2>

        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Фамилия</span>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Имя</span>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Отчество</span>
          <Input value={patronymic} onChange={(e) => setPatronymic(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Телефон</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, "text-xs")}>Email</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        {type === "in_person" && !isReschedule && packageOptions.length > 0 ? (
          <label className="flex flex-col gap-1">
            <span className={cn(patientMutedTextClass, "text-xs")}>Абонемент</span>
            <select
              className="rounded-md border bg-background px-2 py-2 text-sm"
              value={patientPackageId}
              onChange={(e) => {
                setPatientPackageId(e.target.value);
                if (e.target.value) setProductPurchaseId("");
              }}
            >
              <option value="">Без абонемента</option>
              {packageOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (
                  {p.balance.items.map((it) => `${it.remaining}/${it.quantityInitial}`).join(", ")})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {type === "in_person" && !isReschedule && productOptions.length > 0 ? (
          <label className="flex flex-col gap-1">
            <span className={cn(patientMutedTextClass, "text-xs")}>Покупка</span>
            <select
              className="rounded-md border bg-background px-2 py-2 text-sm"
              value={productPurchaseId}
              onChange={(e) => {
                setProductPurchaseId(e.target.value);
                if (e.target.value) setPatientPackageId("");
              }}
            >
              <option value="">Без покупки</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.visitsRemaining})
                </option>
              ))}
            </select>
          </label>
        ) : null}

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
