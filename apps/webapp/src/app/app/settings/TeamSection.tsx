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
};

function formatSeatStatus(seats: TeamSeatStatus): string {
  if (!seats.configured) {
    return 'Места специалистов не настроены. Укажите их в тарифе или в исключении организации.';
  }
  return `Занято мест: ${seats.used} из ${seats.limit}`;
}

export function TeamSection({ members, invites, seats }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationInviteRole>('doctor');
  const [submitting, setSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // §5a item 5.1 — set only by a `seat_overage_confirmation_required` response; the clinic sees
  // the price and must resubmit with it echoed back before the seat is created and billed.
  const [seatOverageConfirm, setSeatOverageConfirm] = useState<{
    priceMinor: number;
    currency: string;
  } | null>(null);

  const seatsExhaustedForDoctor = !seats.configured || seats.available === 0;

  // Bypasses the shared `apiJson` helper (which only surfaces the error string) because this call
  // needs the full error body — `priceMinor`/`currency` — to show the overage confirmation dialog.
  async function submitInvite(confirmedSeatOveragePriceMinor?: number) {
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
          ...(confirmedSeatOveragePriceMinor !== undefined
            ? { confirmedSeatOveragePriceMinor }
            : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: string; priceMinor?: number; currency?: string }
        | null;
      if (!res.ok || body?.ok === false) {
        if (
          body?.ok === false &&
          body.error === 'seat_overage_confirmation_required' &&
          typeof body.priceMinor === 'number' &&
          typeof body.currency === 'string'
        ) {
          setSeatOverageConfirm({ priceMinor: body.priceMinor, currency: body.currency });
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

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Команда</DoctorSectionTitle>
        </DoctorSectionHeader>
        <p className="text-muted-foreground text-sm">{formatSeatStatus(seats)}</p>
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
                  {formatSeatOveragePrice(seatOverageConfirm.priceMinor, seatOverageConfirm.currency)}
                </strong>
                . Подтвердите — место будет создано и клинике выставлен счёт.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={submitting}
                  onClick={() => void submitInvite(seatOverageConfirm.priceMinor)}
                >
                  {submitting ? 'Отправка…' : 'Подтвердить и пригласить'}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revokingId === invite.id}
                  onClick={() => void revokeInvite(invite.id)}
                >
                  Отозвать
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>
    </>
  );
}
