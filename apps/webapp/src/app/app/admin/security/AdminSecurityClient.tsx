'use client';

/**
 * Кнопка «завершить сеансы» на экране безопасности админа платформы (#1112).
 *
 * Список устройств живёт в общей карточке `shared/ui/security/LoginDevicesCard` — он одинаков для
 * админа и специалиста. Здесь остаётся только то, что у админа своё: у специалиста та же кнопка уже
 * есть в его вкладке «Безопасность», и вторая копия рядом была бы обманом про два разных действия.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { notificationText } from '@/shared/notifications/notificationText';
import {
  staffSecurityErrorText,
  staffSecurityNetworkErrorText,
} from '@/shared/ui/auth/staffSecurityErrorText';

export function AdminSecurityRevokeCard() {
  const [busy, setBusy] = useState(false);

  async function revokeEverywhere() {
    setBusy(true);
    try {
      const response = await fetch('/api/account/security/sessions/revoke', { method: 'POST' });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!result?.ok) {
        toast.error(staffSecurityErrorText(result?.error, 'revoke_sessions'));
        return;
      }
      toast.success(notificationText.authOtherSessionsEnded);
    } catch {
      toast.error(staffSecurityNetworkErrorText('revoke_sessions'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Если вход сделали не вы</DoctorSectionTitle>
      </DoctorSectionHeader>
      {/*
        Текст исправлен 14.09: раньше здесь стояло «закрыть вход на всех устройствах — и на своих
        тоже. После этого везде потребуется войти заново». Это неправда — дверь
        `/api/account/security/sessions/revoke` заново подписывает куку вызывающего, чтобы не
        разлогинить того, кто нажал кнопку. Человек, прочитав прежний текст, ждал бы, что его сейчас
        выкинет, и не нажал бы её.
      */}
      <p className="text-sm">
        Можно завершить все остальные сеансы — на всех других устройствах потребуется войти заново.
        Здесь вы останетесь внутри. Завершить один отдельный сеанс, оставив остальные, пока нельзя:
        либо этот, либо все прочие.
      </p>
      <div className="mt-3">
        <Button type="button" variant="destructive" disabled={busy} onClick={revokeEverywhere}>
          Завершить другие сеансы
        </Button>
      </div>
    </DoctorSection>
  );
}
