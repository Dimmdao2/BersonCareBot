'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/patient/primitives/button';
import { Input } from '@/shared/ui/patient/primitives/input';
import { Textarea } from '@/shared/ui/patient/primitives/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/patient/primitives/select';
import { routePaths } from '@/app-layer/routes/paths';
import type { BookingCategory } from '@/modules/patient-booking/types';
import type { BookingSlot, PatientBookingRecord } from '@/modules/patient-booking/types';
import type { BookingSelection } from '../../cabinet/useBookingSelection';
import { useCreateBooking } from '../../cabinet/useCreateBooking';
import { useRescheduleBooking } from '../../cabinet/useRescheduleBooking';
import {
  formatBookingDateLongRu,
  formatBookingTimeShortRu,
} from '@/shared/lib/formatBusinessDateTime';
import { formatDoctorFio, type StructuredFio } from '@/shared/lib/fio';
import { isBuiltInOnlineLocationCityCode } from '@/modules/booking-engine/onlineLocation';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  patientButtonPrimaryClass,
  patientCardClass,
  patientFormSurfaceClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';

type FormField = {
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  isRequired: boolean;
};

const CONTACT_FIELD_KEYS = new Set([
  'contact_name',
  'first_name',
  'last_name',
  'patronymic',
  'contact_phone',
  'phone',
  'contact_email',
  'email',
]);

function isExtraFormField(field: FormField): boolean {
  if (CONTACT_FIELD_KEYS.has(field.fieldKey)) return false;
  if (
    field.fieldType === 'first_name' ||
    field.fieldType === 'last_name' ||
    field.fieldType === 'phone'
  ) {
    return false;
  }
  if (field.fieldType === 'email') return false;
  return true;
}

type ConfirmStepOptions = {
  formFieldsApiPath?: string;
  successRedirectPath?: string;
  doneRedirectPath?: string;
  buildAwaitingPaymentHref?: (booking: PatientBookingRecord) => string;
  /**
   * A-3: the public variant of this hook may answer the first request with a one-time-code
   * challenge instead of a booking (`verificationPrompt`). The authenticated variant never does, so
   * the extra members are optional and the screen simply never shows the code step for it.
   */
  useCreateBookingHook?: () => ReturnType<typeof useCreateBooking> & {
    verificationPrompt?: {
      proofMethod: 'sms' | 'email';
      challengeId: string;
      expiresInSeconds: number;
      contact: string;
    } | null;
    confirmVerification?: (code: string) => Promise<PatientBookingRecord | false>;
    cancelVerification?: () => void;
    proofMethod?: 'sms' | 'email';
    setProofMethod?: (method: 'sms' | 'email') => void;
  };
  useRescheduleBookingHook?: typeof useRescheduleBooking;
};

type Props = ConfirmStepOptions & {
  type: 'in_person' | 'online';
  cityCode?: string;
  cityTitle?: string;
  branchId?: string;
  serviceId?: string;
  orgSlug?: string;
  serviceTitle?: string;
  category?: string;
  slotStart: string;
  slotEnd: string;
  slotCount?: number;
  priceMinor?: number;
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
  orgSlug,
  serviceTitle,
  category,
  slotStart,
  slotEnd,
  slotCount = 1,
  priceMinor = 0,
  defaultFio,
  defaultPhone,
  defaultEmail,
  appDisplayTimeZone,
  formFieldsApiPath = '/api/booking/form-fields',
  successRedirectPath = routePaths.bookingNew,
  doneRedirectPath = routePaths.bookingNewDone,
  buildAwaitingPaymentHref,
  useCreateBookingHook = useCreateBooking,
  useRescheduleBookingHook = useRescheduleBooking,
  rescheduleBookingId,
}: Props & { rescheduleBookingId?: string }) {
  const router = useRouter();
  const [lastName, setLastName] = useState(defaultFio.lastName ?? '');
  const [firstName, setFirstName] = useState(defaultFio.firstName ?? '');
  const [patronymic, setPatronymic] = useState(defaultFio.patronymic ?? '');
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);
  const [extraFields, setExtraFields] = useState<FormField[]>([]);
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [packageOptions, setPackageOptions] = useState<
    Array<{
      id: string;
      title: string;
      balance: { items: Array<{ remaining: number; quantityInitial: number }> };
    }>
  >([]);
  const [patientPackageId, setPatientPackageId] = useState('');
  const [, startFieldsLoad] = useTransition();
  const [, startPackagesLoad] = useTransition();
  const createState = useCreateBookingHook();
  const rescheduleState = useRescheduleBookingHook();
  const isReschedule = Boolean(rescheduleBookingId);
  const submitting = isReschedule ? rescheduleState.submitting : createState.submitting;
  const error = isReschedule ? rescheduleState.error : createState.error;
  const resolvedFormFieldsApiPath = useMemo(() => {
    if (type !== 'in_person') return formFieldsApiPath;
    const params = new URLSearchParams();
    if (branchId && serviceId) {
      params.set('branchId', branchId);
      params.set('serviceId', serviceId);
    }
    if (orgSlug) {
      params.set('orgSlug', orgSlug);
    }
    const qs = params.toString();
    return qs ? `${formFieldsApiPath}?${qs}` : formFieldsApiPath;
  }, [type, formFieldsApiPath, branchId, serviceId, orgSlug]);

  useEffect(() => {
    let cancelled = false;
    startFieldsLoad(() => {
      void (async () => {
        try {
          const res = await fetch(resolvedFormFieldsApiPath);
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
  }, [resolvedFormFieldsApiPath]);

  useEffect(() => {
    if (type !== 'in_person' || !branchId || !serviceId || isReschedule) return;
    let cancelled = false;
    startPackagesLoad(() => {
      void (async () => {
        const q = new URLSearchParams({ branchId, serviceId });
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
  }, [type, branchId, serviceId, isReschedule, startPackagesLoad]);

  const selection: BookingSelection | null = useMemo(() => {
    if (type === 'in_person' && cityCode && cityTitle && serviceTitle && branchId && serviceId) {
      return {
        type: 'in_person',
        cityCode,
        cityTitle,
        branchId,
        serviceId,
        serviceTitle,
        ...(orgSlug ? { orgSlug } : {}),
      };
    }
    if (type === 'online' && category) {
      return { type: 'online', category: category as BookingCategory };
    }
    return null;
  }, [type, cityCode, cityTitle, branchId, serviceId, serviceTitle, category, orgSlug]);

  const slot: BookingSlot = useMemo(
    () => ({ startAt: slotStart, endAt: slotEnd }),
    [slotStart, slotEnd],
  );

  const isOnlineLocation = type === 'in_person' && isBuiltInOnlineLocationCityCode(cityCode);
  const formatLabel =
    type === 'in_person'
      ? isOnlineLocation
        ? `Онлайн · ${serviceTitle ?? ''}`
        : `Очный приём · ${cityTitle ?? ''} · ${serviceTitle ?? ''}`
      : category === 'rehab_lfk'
        ? 'Онлайн — Реабилитация (ЛФК)'
        : category === 'nutrition'
          ? 'Онлайн — Нутрициология'
          : 'Онлайн';

  const missingRequiredExtra = extraFields.some(
    (f) => f.isRequired && !(extraValues[f.fieldKey] ?? '').trim(),
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
    selection && contactFioInput && phone.trim() && !submitting && !missingRequiredExtra,
  );

  /** Shared by the direct create and, for the public widget, the post-code create (A-3). */
  function onBookingCreated(booking: PatientBookingRecord) {
    if (booking.status === 'awaiting_payment') {
      toast.success('Требуется оплата');
      const payPath = buildAwaitingPaymentHref
        ? buildAwaitingPaymentHref(booking)
        : `/app/patient/booking/pay?bookingId=${encodeURIComponent(booking.id)}`;
      router.push(payPath);
      return;
    }
    const doneQ = new URLSearchParams({
      bookingId: booking.id,
      slotStart: booking.slotStart,
      slotEnd: booking.slotEnd,
      serviceTitle:
        booking.serviceTitleSnapshot ?? serviceTitle ?? (type === 'online' ? formatLabel : ''),
    });
    const loc =
      booking.branchTitleSnapshot ??
      (type === 'online' || isOnlineLocation ? 'Онлайн' : (cityTitle ?? ''));
    if (loc) doneQ.set('locationLabel', loc);
    if (cityCode) doneQ.set('cityCode', cityCode);
    router.push(`${doneRedirectPath}?${doneQ.toString()}`);
  }

  const verificationPrompt = createState.verificationPrompt ?? null;
  if (verificationPrompt && createState.confirmVerification) {
    const confirmVerification = createState.confirmVerification;
    return (
      <div className="flex flex-col gap-4">
        <form
          className={cn(patientFormSurfaceClass, 'gap-3')}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const code = String(data.get('publicBookingCode') ?? '');
            void confirmVerification(code).then((booking) => {
              if (!booking) return;
              onBookingCreated(booking);
            });
          }}
        >
          <h2 className={patientSectionTitleClass}>Подтверждение записи</h2>
          <p className={cn(patientMutedTextClass, 'text-sm')}>
            Мы отправили код на {verificationPrompt.contact}. Введите его, чтобы подтвердить запись.
          </p>
          <label className="flex flex-col gap-1">
            <span className={cn(patientMutedTextClass, 'text-xs')}>Код из сообщения</span>
            <Input
              name="publicBookingCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className={patientButtonPrimaryClass} disabled={submitting}>
            {submitting ? 'Проверяем код...' : 'Подтвердить запись'}
          </Button>
          {createState.cancelVerification ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => createState.cancelVerification?.()}
              disabled={submitting}
            >
              Изменить данные
            </Button>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(patientCardClass, 'text-sm ring-0')}>
        <p className="font-semibold">Сводка</p>
        <ul className={cn(patientMutedTextClass, 'mt-2 list-inside list-disc')}>
          <li>{formatLabel}</li>
          <li>
            Дата и время: {formatBookingDateLongRu(slotStart, appDisplayTimeZone)} ·{' '}
            {formatBookingTimeShortRu(slotStart, appDisplayTimeZone)} —{' '}
            {formatBookingTimeShortRu(slotEnd, appDisplayTimeZone)}
          </li>
          {slotCount > 1 ? <li>Последовательных слотов: {slotCount}</li> : null}
          <li>
            Стоимость:{' '}
            {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(
              (priceMinor * slotCount) / 100,
            )}
          </li>
        </ul>
      </div>

      <form
        className={cn(patientFormSurfaceClass, 'gap-3')}
        onSubmit={(event) => {
          event.preventDefault();
          if (!selection) return;
          if (!contactFioInput) return;
          const formAnswers = extraFields.map((f) => ({
            fieldKey: f.fieldKey,
            value: (extraValues[f.fieldKey] ?? '').trim(),
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
                toast.success('Запись перенесена');
                router.push(successRedirectPath);
              });
            return;
          }
          void createState
            .createBooking({
              selection,
              slot,
              slotCount,
              contactName,
              contactFio: contactFioInput,
              contactPhone: phone.trim(),
              contactEmail: email.trim() || undefined,
              formAnswers: formAnswers.length > 0 ? formAnswers : undefined,
              patientPackageId: patientPackageId.trim() || undefined,
            })
            .then((booking) => {
              // `false` also covers "the server asked for a code first" (A-3): the hook has set
              // `verificationPrompt` and the screen re-renders into the code step.
              if (!booking) return;
              onBookingCreated(booking);
            });
        }}
      >
        <h2 className={patientSectionTitleClass}>Контакты</h2>

        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, 'text-xs')}>Фамилия</span>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, 'text-xs')}>Имя</span>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, 'text-xs')}>Отчество</span>
          <Input value={patronymic} onChange={(e) => setPatronymic(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, 'text-xs')}>Телефон</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cn(patientMutedTextClass, 'text-xs')}>Email</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        {createState.proofMethod && createState.setProofMethod ? (
          <fieldset className="flex flex-col gap-2">
            <legend className={cn(patientMutedTextClass, 'text-xs')}>Подтверждение личности</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="publicBookingProofMethod"
                checked={createState.proofMethod === 'sms'}
                onChange={() => createState.setProofMethod?.('sms')}
              />
              Код по SMS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="publicBookingProofMethod"
                checked={createState.proofMethod === 'email'}
                onChange={() => createState.setProofMethod?.('email')}
              />
              Код на подтверждённую почту
            </label>
          </fieldset>
        ) : null}

        {type === 'in_person' && !isReschedule && packageOptions.length > 0 ? (
          <label className="flex flex-col gap-1">
            <span className={cn(patientMutedTextClass, 'text-xs')}>Абонемент</span>
            <Select
              value={patientPackageId}
              onValueChange={(v) => {
                setPatientPackageId(v ?? '');
              }}
            >
              <SelectTrigger className="w-full rounded-md border bg-background px-2 py-2 text-sm">
                <SelectValue placeholder="Без абонемента" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Без абонемента</SelectItem>
                {packageOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} (
                    {p.balance.items
                      .map((it) => `${it.remaining}/${it.quantityInitial}`)
                      .join(', ')}
                    )
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}

        {fieldsLoading ? null : extraFields.length > 0 ? (
          <>
            <h2 className={patientSectionTitleClass}>Дополнительно</h2>
            {extraFields.map((field) => (
              <label key={field.fieldKey} className="flex flex-col gap-1">
                <span className={cn(patientMutedTextClass, 'text-xs')}>
                  {field.label}
                  {field.isRequired ? ' *' : ''}
                </span>
                {field.fieldType === 'comment' || field.fieldType === 'problem_description' ? (
                  <Textarea
                    value={extraValues[field.fieldKey] ?? ''}
                    placeholder={field.placeholder ?? undefined}
                    onChange={(e) =>
                      setExtraValues((prev) => ({ ...prev, [field.fieldKey]: e.target.value }))
                    }
                    required={field.isRequired}
                  />
                ) : (
                  <Input
                    value={extraValues[field.fieldKey] ?? ''}
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
        <Button type="submit" className={patientButtonPrimaryClass} disabled={!canSubmit}>
          {submitting ? 'Создаём запись...' : 'Подтвердить запись'}
        </Button>
      </form>
    </div>
  );
}
