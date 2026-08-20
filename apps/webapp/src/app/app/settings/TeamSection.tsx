'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/shared/lib/apiJson';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import type { ClinicSeatStatus } from '@/modules/clinic-seats/service';
import type { OrganizationInviteRole } from '@/modules/organization-invites/ports';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  doctor: 'Врач',
  assistant: 'Ассистент',
};

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  seat_limit_reached:
    'Достигнут лимит мест специалистов по тарифу. Освободите место или расширьте тариф.',
  // Р-15: отдельный счёт покрывает остаток ТЕКУЩЕГО оплаченного периода. Периода нет — покрывать
  // нечего, и человеку говорится ровно это, а не «оплатите полный тариф места за ноль дней».
  seat_overage_paid_period_over:
    'Оплаченный период тарифа закончился. Оплатите продление — после этого можно будет добавить место сверх тарифа.',
  already_member: 'Этот email уже участвует в организации.',
  invalid_email: 'Некорректный email',
};

function formatSeatOveragePrice(priceMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(priceMinor / 100);
  } catch {
    return `${new Intl.NumberFormat('ru-RU').format(priceMinor / 100)} ${currency}`;
  }
}

export type TeamMemberRow = {
  id: string;
  displayName: string | null;
  role: string;
  status: string;
  seatConsuming: boolean;
};

export type TeamInviteRow = {
  id: string;
  invitedEmail: string;
  invitedRole: string;
  expiresAt: string;
};

export type TeamSeatStatus = ClinicSeatStatus;

type Props = {
  members: TeamMemberRow[];
  invites: TeamInviteRow[];
  seats: TeamSeatStatus;
  canMutateTeam: boolean;
};

function formatSeatStatus(seats: TeamSeatStatus): string {
  if (!seats.configured) {
    return 'Места специалистов не настроены. Укажите их в тарифе или в исключении организации.';
  }
  return `Занято мест: ${seats.used} из ${seats.limit}`;
}

export function TeamSection({ members, invites, seats, canMutateTeam }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationInviteRole>('doctor');
  const [submitting, setSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [seatOverageConfirm, setSeatOverageConfirm] = useState<{
    priceMinor: number;
    currency: string;
    quote: string;
  } | null>(null);
  /** Место уже открыто, счёт выставлен — человеку остаётся его оплатить (Р-15). */
  const [seatInvoiceNotice, setSeatInvoiceNotice] = useState<{
    priceMinor: number;
    currency: string;
    checkoutUrl: string | null;
  } | null>(null);

  const seatsExhaustedForDoctor = !seats.configured || seats.available === 0;

  // Bypasses the shared `apiJson` helper (which only surfaces the error string) because this call
  // needs the full error body — `priceMinor`/`currency` — to show the overage confirmation dialog.
  async function submitInvite() {
    setInviteError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setInviteError('Введите email');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/clinic/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          role,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: string; quote?: string; priceMinor?: number; currency?: string }
        | null;
      if (!res.ok || body?.ok === false) {
        if (
          body?.ok === false &&
          body.error === 'seat_overage_confirmation_required' &&
          typeof body.quote === 'string' &&
          typeof body.priceMinor === 'number' &&
          typeof body.currency === 'string'
        ) {
          setSeatOverageConfirm({
            priceMinor: body.priceMinor,
            currency: body.currency,
            quote: body.quote,
          });
          return;
        }
        const code = body?.ok === false ? body.error : 'error';
        setInviteError(INVITE_ERROR_MESSAGES[code] ?? 'Не удалось отправить приглашение');
        return;
      }
      setSeatOverageConfirm(null);
      setEmail('');
      router.refresh();
    } catch {
      setInviteError('Не удалось отправить приглашение');
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    setRevokingId(inviteId);
    try {
      await apiJson(`/api/clinic/invites/${inviteId}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setRevokingId(null);
    }
  }

  /**
   * Р-15 в действующей редакции: место открывается СРАЗУ, счёт уходит в оплату отдельно. Поэтому
   * подтверждение цены больше не ведёт на checkout и не ждёт денег — оно открывает место, после
   * чего приглашение отправляется тем же кликом. Оплата счёта живёт в разделе оплаты; экран
   * команды только называет сумму и даёт ссылку, если провайдер её вернул.
   */
  async function confirmSeatOverage() {
    if (!seatOverageConfirm) return;
    const quote = seatOverageConfirm.quote;
    setSubmitting(true);
    try {
      const response = await fetch('/api/clinic/billing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purchase: 'seat_overage', quote }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            ok: true;
            outcome?: 'seat_available' | 'seat_opened';
            checkoutUrl?: string;
            invoiceId?: string;
            amountMinor?: number;
            currency?: string;
          }
        | { ok: false; error: string; quote?: string; priceMinor?: number; currency?: string }
        | null;
      if (body?.ok && (body.outcome === 'seat_available' || body.outcome === 'seat_opened')) {
        if (body.outcome === 'seat_opened' && typeof body.amountMinor === 'number' && body.currency) {
          setSeatInvoiceNotice({
            priceMinor: body.amountMinor,
            currency: body.currency,
            checkoutUrl: body.checkoutUrl ?? null,
          });
        }
        setSeatOverageConfirm(null);
        await submitInvite();
        return;
      }
      // Цена сдвинулась, пока человек думал: сервер прислал новую вместе с новой котировкой.
      // Старая не перевыпускается молча — подтверждать заново будет человек.
      if (
        body?.ok === false &&
        body.error === 'seat_overage_confirmation_required' &&
        typeof body.quote === 'string' &&
        typeof body.priceMinor === 'number' &&
        typeof body.currency === 'string'
      ) {
        setSeatOverageConfirm({
          priceMinor: body.priceMinor,
          currency: body.currency,
          quote: body.quote,
        });
        return;
      }
      // Котировка истекла (цена пересчитывается на границе суток остатка) — цены у этой двери нет.
      // Идём за свежей туда, где она выпускается: экран снова покажет цену и вопрос.
      if (body?.ok === false && body.error === 'seat_overage_quote_expired') {
        setSeatOverageConfirm(null);
        await submitInvite();
        return;
      }
      setInviteError(
        (body?.ok === false && INVITE_ERROR_MESSAGES[body.error]) ||
          'Не удалось открыть дополнительное место',
      );
    } catch {
      setInviteError('Не удалось открыть дополнительное место');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Команда</DoctorSectionTitle>
        </DoctorSectionHeader>
        <p className="text-muted-foreground text-sm">{formatSeatStatus(seats)}</p>
        {!canMutateTeam ? (
          <p className="text-muted-foreground text-sm" role="status">
            Команда сейчас доступна только для просмотра по тарифу клиники.
          </p>
        ) : null}
        {members.length === 0 ? (
          <DoctorEmptyState>В организации пока нет участников.</DoctorEmptyState>
        ) : (
          <ul aria-label="Участники команды" className={doctorDnaFlatListClass}>
            {members.map((member) => (
              <li
                key={member.id}
                className={`${doctorDnaFlatListRowClass} flex-wrap justify-between gap-2`}
              >
                <span className={`${doctorDnaFlatListPrimaryClass} min-w-0 flex-1 truncate`}>
                  {member.displayName ?? 'Без имени'}
                </span>
                <span
                  className={`${doctorDnaFlatListMetaClass} flex flex-wrap items-center gap-1.5`}
                >
                  <Badge variant="outline">{ROLE_LABELS[member.role] ?? member.role}</Badge>
                  {member.seatConsuming ? <Badge variant="secondary">Место</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>

      {canMutateTeam ? (
        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>Пригласить в команду</DoctorSectionTitle>
          </DoctorSectionHeader>
          <div className="flex max-w-md flex-col gap-3">
            <Input
              type="email"
              autoComplete="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSeatOverageConfirm(null);
              }}
              disabled={submitting}
            />
            <Select
              value={role}
              onValueChange={(value) => {
                setRole(value as OrganizationInviteRole);
                setSeatOverageConfirm(null);
              }}
            >
              <SelectTrigger disabled={submitting}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="doctor">Врач</SelectItem>
                <SelectItem value="admin">Администратор</SelectItem>
              </SelectContent>
            </Select>
            {role === 'doctor' && !seats.configured ? (
              <p className="text-destructive text-sm" role="alert">
                Нельзя пригласить специалиста: укажите число мест специалистов в тарифе или в
                исключении организации.
              </p>
            ) : role === 'doctor' && seatsExhaustedForDoctor && !seatOverageConfirm ? (
              <p className="text-muted-foreground text-xs">
                Все места специалистов по тарифу заняты. Если тариф допускает место сверх базы,
                будет предложено подтвердить его стоимость; иначе приглашение будет отклонено.
              </p>
            ) : null}
            {seatOverageConfirm ? (
              <div className="border-amber-500 bg-amber-50 space-y-2 rounded-md border p-3 text-sm">
                <p>
                  Все места по тарифу заняты. Дополнительное место специалиста стоит{' '}
                  <strong>
                    {formatSeatOveragePrice(
                      seatOverageConfirm.priceMinor,
                      seatOverageConfirm.currency,
                    )}
                  </strong>
                  . Место откроется сразу, приглашение уйдёт тем же действием, а счёт на эту
                  сумму придёт в раздел оплаты.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={submitting}
                    onClick={() => void confirmSeatOverage()}
                  >
                    Добавить место
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submitting}
                    onClick={() => setSeatOverageConfirm(null)}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            ) : null}
            {seatInvoiceNotice ? (
              <div className="space-y-2 rounded-md border p-3 text-sm" role="status">
                <p>
                  Место открыто. Счёт на{' '}
                  <strong>
                    {formatSeatOveragePrice(
                      seatInvoiceNotice.priceMinor,
                      seatInvoiceNotice.currency,
                    )}
                  </strong>{' '}
                  выставлен и ждёт оплаты.
                </p>
                {seatInvoiceNotice.checkoutUrl ? (
                  <a
                    className="underline"
                    href={seatInvoiceNotice.checkoutUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Оплатить счёт
                  </a>
                ) : null}
              </div>
            ) : null}
            {inviteError ? <p className="text-destructive text-sm">{inviteError}</p> : null}
            {seatOverageConfirm ? null : (
              <Button
                type="button"
                size="sm"
                disabled={submitting || (role === 'doctor' && !seats.configured)}
                onClick={() => void submitInvite()}
              >
                {submitting ? 'Отправка…' : 'Пригласить'}
              </Button>
            )}
          </div>
        </DoctorSection>
      ) : null}

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Приглашения в ожидании</DoctorSectionTitle>
        </DoctorSectionHeader>
        {invites.length === 0 ? (
          <DoctorEmptyState>Нет приглашений в ожидании подтверждения.</DoctorEmptyState>
        ) : (
          <ul aria-label="Приглашения в ожидании" className={doctorDnaFlatListClass}>
            {invites.map((invite) => (
              <li
                key={invite.id}
                className={`${doctorDnaFlatListRowClass} flex-wrap justify-between gap-2`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`${doctorDnaFlatListPrimaryClass} block truncate`}>
                    {invite.invitedEmail}
                  </span>
                  <span className={`${doctorDnaFlatListMetaClass} block`}>
                    {ROLE_LABELS[invite.invitedRole] ?? invite.invitedRole}
                  </span>
                </span>
                {canMutateTeam ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={revokingId === invite.id}
                    onClick={() => void revokeInvite(invite.id)}
                  >
                    Отозвать
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>
    </>
  );
}
