'use client';

import { useEffect, useRef, useState } from 'react';
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

const SEAT_OVERAGE_INVITE_STORAGE_KEY = 'clinic-seat-overage-invite';

type StoredSeatOverageInvite = {
  email: string;
  role: OrganizationInviteRole;
  requestKey: string;
  invoiceId?: string;
};

function readStoredSeatOverageInvite(): StoredSeatOverageInvite | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(SEAT_OVERAGE_INVITE_STORAGE_KEY) ?? 'null',
    ) as unknown;
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<StoredSeatOverageInvite>;
    if (
      typeof candidate.email !== 'string' ||
      (candidate.role !== 'doctor' && candidate.role !== 'admin') ||
      typeof candidate.requestKey !== 'string'
    ) {
      return null;
    }
    return candidate as StoredSeatOverageInvite;
  } catch {
    return null;
  }
}

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
    requestKey: string;
  } | null>(null);
  const resumedSeatPayment = useRef(false);

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
        | { ok: false; error: string; priceMinor?: number; currency?: string }
        | null;
      if (!res.ok || body?.ok === false) {
        if (
          body?.ok === false &&
          body.error === 'seat_overage_confirmation_required' &&
          typeof body.priceMinor === 'number' &&
          typeof body.currency === 'string'
        ) {
          setSeatOverageConfirm({
            priceMinor: body.priceMinor,
            currency: body.currency,
            requestKey: seatOverageConfirm?.requestKey ?? crypto.randomUUID(),
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

  async function purchaseSeatOverage() {
    if (!seatOverageConfirm) return;
    const stored: StoredSeatOverageInvite = {
      email: email.trim(),
      role,
      requestKey: seatOverageConfirm.requestKey,
    };
    sessionStorage.setItem(SEAT_OVERAGE_INVITE_STORAGE_KEY, JSON.stringify(stored));
    setSubmitting(true);
    try {
      const response = await fetch('/api/clinic/billing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          purchase: 'seat_overage',
          requestKey: stored.requestKey,
          quotedAmountMinor: seatOverageConfirm.priceMinor,
          quotedCurrency: seatOverageConfirm.currency,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; outcome?: 'seat_available'; checkoutUrl?: string; invoiceId?: string }
        | { ok: false; error: string; priceMinor?: number; currency?: string }
        | null;
      if (body?.ok && body.outcome === 'seat_available') {
        sessionStorage.removeItem(SEAT_OVERAGE_INVITE_STORAGE_KEY);
        setSeatOverageConfirm(null);
        await submitInvite();
        return;
      }
      if (body?.ok && body.checkoutUrl && body.invoiceId) {
        sessionStorage.setItem(
          SEAT_OVERAGE_INVITE_STORAGE_KEY,
          JSON.stringify({ ...stored, invoiceId: body.invoiceId }),
        );
        window.location.assign(body.checkoutUrl);
        return;
      }
      if (
        body?.ok === false &&
        body.error === 'seat_overage_confirmation_required' &&
        typeof body.priceMinor === 'number' &&
        typeof body.currency === 'string'
      ) {
        setSeatOverageConfirm({
          priceMinor: body.priceMinor,
          currency: body.currency,
          requestKey: stored.requestKey,
        });
        return;
      }
      setInviteError('Не удалось создать оплату дополнительного места');
    } catch {
      setInviteError('Не удалось создать оплату дополнительного места');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!canMutateTeam) return;
    if (resumedSeatPayment.current) return;
    const invoiceId = new URLSearchParams(window.location.search).get('seatPayment');
    const stored = readStoredSeatOverageInvite();
    if (!invoiceId || !stored || stored.invoiceId !== invoiceId) return;
    resumedSeatPayment.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch('/api/clinic/billing');
        const body = (await response.json().catch(() => null)) as {
          ok: true;
          billing: { invoices: Array<{ id: string; status: string }> };
        } | null;
        const invoice = body?.ok
          ? body.billing.invoices.find((candidate) => candidate.id === invoiceId)
          : null;
        if (invoice?.status === 'paid') {
          sessionStorage.removeItem(SEAT_OVERAGE_INVITE_STORAGE_KEY);
          await fetch('/api/clinic/invites', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: stored.email, role: stored.role }),
          });
          if (!cancelled) router.refresh();
          return;
        }
      } catch {
        // A transient read failure is retried while the return page remains open.
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canMutateTeam, router]);

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
                  . После оплаты приглашение будет отправлено автоматически.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={submitting}
                    onClick={() => void purchaseSeatOverage()}
                  >
                    Оплатить место
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
