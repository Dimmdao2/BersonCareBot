'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { routePaths } from '@/app-layer/routes/paths';
import { cn } from '@/lib/utils';
import { DoctorModal } from './DoctorModal';
import { Button } from './primitives/button';
import { Input } from './primitives/input';
import { Label } from './primitives/label';

function currentLocalDateTimeValue(clockToleranceMinutes = 0): string {
  const now = new Date(Date.now() + clockToleranceMinutes * 60_000);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function manualVisitErrorLabel(result: { error?: string; message?: string }): string {
  if (result.message) return result.message;
  const error = result.error;
  if (error === 'invalid_phone') return 'Проверьте номер телефона.';
  if (error === 'invalid_email') return 'Проверьте email.';
  if (error === 'invalid_fio') return 'Укажите фамилию и имя.';
  if (error === 'invalid_request_id') return 'Не удалось сформировать запрос, обновите страницу.';
  if (error === 'email_conflict') return 'Этот email уже связан с другой карточкой.';
  if (error === 'idempotency_conflict') return 'Заявка уже обрабатывается, обновите страницу.';
  if (error === 'patient_not_available') return 'Карточка недоступна в этой организации.';
  if (error === 'specialist_required') return 'Для сотрудника не назначен профиль специалиста.';
  if (error === 'visit_in_future') return 'Время визита не может быть в будущем.';
  if (error === 'client_creation_unavailable') return 'Создание карточки сейчас недоступно.';
  return 'Не удалось сохранить.';
}

type DoctorNewClientActionProps = {
  patientSingularLabel: string;
  className?: string;
  showIcon?: boolean;
  compactOnMobile?: boolean;
};

/** Каноническое действие создания карточки клиента для страницы клиентов и быстрых действий. */
export function DoctorNewClientAction({
  patientSingularLabel,
  className,
  showIcon = true,
  compactOnMobile = true,
}: DoctorNewClientActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [patronymic, setPatronymic] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [visitedAt, setVisitedAt] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const singularLower = patientSingularLabel.toLocaleLowerCase('ru-RU');
  const triggerLabel = `Новый ${singularLower}`;

  function reset() {
    setError(null);
    setLastName('');
    setFirstName('');
    setPatronymic('');
    setPhone('');
    setEmail('');
    setVisitedAt('');
    setRequestId(crypto.randomUUID());
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  async function submit() {
    setError(null);
    if (!lastName.trim() || !firstName.trim()) {
      setError('Укажите фамилию и имя.');
      return;
    }
    if (!phone.trim() && email.trim()) {
      setError('Для email укажите телефон или оставьте оба контакта пустыми.');
      return;
    }
    setPending(true);
    try {
      const hasVisit = visitedAt.trim().length > 0;
      const response = hasVisit
        ? await fetch('/api/doctor/booking-engine/appointments/manual-patient-visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestId,
              kind: 'walk_in',
              lastName,
              firstName,
              patronymic: patronymic.trim() || null,
              phone,
              email: email.trim() || null,
              visitedAt: new Date(visitedAt).toISOString(),
            }),
          })
        : await fetch('/api/doctor/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestId,
              lastName,
              firstName,
              patronymic: patronymic.trim() || null,
              phone: phone.trim() || null,
              email: email.trim() || null,
            }),
          });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        client?: { id?: string };
      };
      if (!response.ok || !result.ok || !result.client?.id) {
        setError(manualVisitErrorLabel(result));
        return;
      }
      setOpen(false);
      reset();
      router.push(routePaths.doctorPatientCard(result.client.id));
      router.refresh();
    } catch {
      setError('Не удалось сохранить.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className={cn('shrink-0 gap-1.5', className)}
        aria-label={triggerLabel}
        onClick={() => setOpen(true)}
      >
        {showIcon ? <Plus className="size-4" aria-hidden /> : null}
        {compactOnMobile ? (
          <>
            <span className="hidden sm:inline">{triggerLabel}</span>
            <span className="sr-only sm:hidden">{triggerLabel}</span>
          </>
        ) : (
          <span>{triggerLabel}</span>
        )}
      </Button>
      <DoctorModal
        open={open}
        onClose={close}
        title={triggerLabel}
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              Отмена
            </Button>
            <Button type="button" disabled={pending} onClick={() => void submit()}>
              {pending ? 'Создаём…' : 'Создать'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Карточка {singularLower}а создастся всегда. Дата и время визита — по желанию: если
            указать, визит зафиксируется как состоявшийся вместе с карточкой. Доступ в портал не
            активируется.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-new-client-last-name">Фамилия</Label>
              <Input
                id="doctor-new-client-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-new-client-first-name">Имя</Label>
              <Input
                id="doctor-new-client-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="doctor-new-client-patronymic">Отчество</Label>
              <Input
                id="doctor-new-client-patronymic"
                value={patronymic}
                onChange={(event) => setPatronymic(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-new-client-phone">Телефон, если есть</Label>
              <Input
                id="doctor-new-client-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                placeholder="+7 999 000-00-00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doctor-new-client-email">Email, если есть</Label>
              <Input
                id="doctor-new-client-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="doctor-new-client-visited-at">Дата и время визита, если есть</Label>
              <Input
                id="doctor-new-client-visited-at"
                type="datetime-local"
                value={visitedAt}
                max={currentLocalDateTimeValue(2)}
                placeholder="Не указано — создастся только карточка"
                onChange={(event) => setVisitedAt(event.target.value)}
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DoctorModal>
    </>
  );
}
