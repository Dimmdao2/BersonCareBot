'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { LogoutForm } from '@/shared/ui/LogoutForm';
import { Input } from '@/shared/ui/doctor/primitives/input';
import {
  staffSecurityErrorText,
  staffSecurityNetworkErrorText,
} from '@/shared/ui/auth/staffSecurityErrorText';
import { notificationText } from '@/shared/notifications/notificationText';
import { PasswordChangeForm } from './PasswordChangeForm';

type SecurityStatus = {
  enrolled: boolean;
  recoveryConfirmed: boolean;
  replacementRequired: boolean;
  lockedUntil: string | null;
};

type Props = {
  initialStatus: SecurityStatus;
  hasProfileName: boolean;
  hasOrganization: boolean;
  hasSpecialistBinding: boolean;
  showSpecialistFirstRun?: boolean;
  recoveryOnly?: boolean;
};

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as T | null;
  if (result !== null && typeof result === 'object') return result;
  return { ok: false, error: 'unexpected_response' } as T;
}

export function StaffSecuritySection(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(props.initialStatus);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [specialistFullName, setSpecialistFullName] = useState('');
  const [specialistFioRequired, setSpecialistFioRequired] = useState(false);

  const securityReady = status.enrolled && status.recoveryConfirmed && !status.replacementRequired;

  async function startEnrollment() {
    setBusy(true);
    try {
      const result = await postJson<{ ok: boolean; secret?: string; uri?: string; error?: string }>(
        '/api/account/security/totp/start',
      );
      if (!result.ok || !result.secret || !result.uri) {
        toast.error(staffSecurityErrorText(result.error, 'start_enrollment'));
        return;
      }
      setSecret(result.secret);
      setUri(result.uri);
      setRecoveryCodes([]);
    } catch {
      toast.error(staffSecurityNetworkErrorText('start_enrollment'));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment() {
    setBusy(true);
    try {
      const result = await postJson<{ ok: boolean; recoveryCodes?: string[]; error?: string }>(
        '/api/account/security/totp/verify',
        { code },
      );
      if (!result.ok || !result.recoveryCodes) {
        toast.error(staffSecurityErrorText(result.error, 'verify_enrollment'));
        return;
      }
      setCode('');
      setSecret(null);
      setUri(null);
      setRecoveryCodes(result.recoveryCodes);
      setStatus((current) => ({
        ...current,
        enrolled: true,
        recoveryConfirmed: false,
        replacementRequired: false,
        lockedUntil: null,
      }));
    } catch {
      toast.error(staffSecurityNetworkErrorText('verify_enrollment'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRecovery() {
    try {
      const result = await postJson<{ ok: boolean; error?: string }>(
        '/api/account/security/recovery/confirm',
      );
      if (!result.ok) return toast.error(staffSecurityErrorText(result.error, 'confirm_recovery'));
      setRecoveryCodes([]);
      router.replace('/app/account?tab=security');
      router.refresh();
    } catch {
      toast.error(staffSecurityNetworkErrorText('confirm_recovery'));
    }
  }

  async function bindSpecialist() {
    setBusy(true);
    try {
      const result = await postJson<{
        ok: boolean;
        redirectTo?: string;
        error?: string;
        message?: string;
      }>(
        '/api/account/first-run/bind-specialist',
        specialistFioRequired ? { fullName: specialistFullName } : undefined,
      );
      if (!result.ok) {
        if (result.error === 'fio_latin_rejected') setSpecialistFioRequired(true);
        return toast.error(result.message ?? staffSecurityErrorText(result.error, 'bind_specialist'));
      }
      window.location.assign(result.redirectTo ?? '/app/doctor');
    } catch {
      toast.error(staffSecurityNetworkErrorText('bind_specialist'));
    } finally {
      setBusy(false);
    }
  }

  async function retryProvisioning() {
    try {
      const result = await postJson<{ ok: boolean; redirectTo?: string; error?: string }>(
        '/api/auth/specialist-signup/retry',
      );
      if (!result.ok)
        return toast.error(staffSecurityErrorText(result.error, 'retry_provisioning'));
      window.location.assign(result.redirectTo ?? '/app/account?tab=security');
    } catch {
      toast.error(staffSecurityNetworkErrorText('retry_provisioning'));
    }
  }

  async function revokeSessions() {
    try {
      const result = await postJson<{ ok: boolean; error?: string }>(
        '/api/account/security/sessions/revoke',
      );
      if (!result.ok) return toast.error(staffSecurityErrorText(result.error, 'revoke_sessions'));
      toast.success(notificationText.authOtherSessionsEnded);
    } catch {
      toast.error(staffSecurityNetworkErrorText('revoke_sessions'));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!props.recoveryOnly && props.showSpecialistFirstRun !== false ? (
        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>Первый запуск</DoctorSectionTitle>
          </DoctorSectionHeader>
          <ul className="space-y-2 text-sm">
            <li>{props.hasProfileName ? '✓' : '○'} Профиль специалиста</li>
            <li>{props.hasOrganization ? '✓' : '○'} Кабинет создан</li>
            <li>{securityReady ? '✓' : '○'} Двухфакторная защита и резервные коды</li>
            <li>{props.hasSpecialistBinding ? '✓' : '○'} Рабочий кабинет специалиста</li>
            <li>{props.hasSpecialistBinding ? '○' : '—'} Услуга, место и доступность для записи</li>
            <li>{props.hasSpecialistBinding ? '○' : '—'} Готовность пригласить первого пациента</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="text-sm underline" href="/app/account">
              Профиль специалиста
            </Link>
            {!props.hasOrganization ? (
              <Button size="sm" variant="outline" onClick={retryProvisioning}>
                Повторить настройку аккаунта
              </Button>
            ) : null}
            {props.hasSpecialistBinding ? (
              <Link className="text-sm underline" href="/app/doctor/schedule?tab=setup">
                Настроить запись
              </Link>
            ) : null}
          </div>
          {/* Desktop hides DoctorHeader/DoctorAdminSidebar (no clinical/org capability yet) while this
            checklist is incomplete, so a stuck first-run account otherwise has no way to sign out. */}
          <LogoutForm className="mt-2">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15"
            >
              Выйти
            </Button>
          </LogoutForm>
        </DoctorSection>
      ) : null}

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Защита аккаунта</DoctorSectionTitle>
        </DoctorSectionHeader>
        <PasswordChangeForm />
        {securityReady ? (
          <p className="text-sm">Приложение-аутентификатор подключено, резервные коды сохранены.</p>
        ) : null}
        {status.replacementRequired ? (
          <p className="text-sm text-destructive">
            Вход выполнен резервным кодом. Подключите фактор заново.
          </p>
        ) : null}
        {!secret && (!securityReady || status.replacementRequired) ? (
          <Button size="sm" disabled={busy} onClick={startEnrollment}>
            Подключить приложение-аутентификатор
          </Button>
        ) : null}
        {secret ? (
          <div className="space-y-2 text-sm">
            <p>Добавьте ключ в приложение-аутентификатор:</p>
            <code className="block break-all rounded-md border p-2">{secret}</code>
            <a className="underline" href={uri ?? undefined}>
              Открыть в приложении
            </a>
            <div className="flex gap-2">
              <Input
                aria-label="Код из приложения"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <Button
                size="sm"
                disabled={busy || !/^\d{6}$/u.test(code)}
                onClick={verifyEnrollment}
              >
                Проверить
              </Button>
            </div>
          </div>
        ) : null}
        {recoveryCodes.length > 0 ? (
          <div className="space-y-2 text-sm">
            <p>Сохраните резервные коды. Каждый код действует один раз.</p>
            <pre className="rounded-md border p-2">{recoveryCodes.join('\n')}</pre>
            <Button size="sm" onClick={confirmRecovery}>
              Я сохранил коды
            </Button>
          </div>
        ) : null}
        {!props.recoveryOnly &&
        props.showSpecialistFirstRun !== false &&
        props.hasOrganization &&
        !props.hasSpecialistBinding ? (
          specialistFioRequired ? (
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="ФИО специалиста"
                placeholder="ФИО специалиста"
                value={specialistFullName}
                onChange={(event) => setSpecialistFullName(event.target.value)}
              />
              <Button size="sm" disabled={busy} onClick={bindSpecialist}>
                Подключить рабочий кабинет
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={busy} onClick={bindSpecialist}>
              Подключить рабочий кабинет
            </Button>
          )
        ) : null}
        {securityReady && !props.recoveryOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={revokeSessions}>
              Завершить другие сеансы
            </Button>
          </div>
        ) : null}
      </DoctorSection>
    </div>
  );
}
