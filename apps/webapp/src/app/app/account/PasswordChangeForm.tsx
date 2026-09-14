'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { PasswordAltchaChallenge } from '@/shared/ui/auth/PasswordAltchaChallenge';
import {
  staffSecurityErrorText,
  staffSecurityNetworkErrorText,
} from '@/shared/ui/auth/staffSecurityErrorText';
import { notificationText } from '@/shared/notifications/notificationText';

type Props = { successHref?: string };

export function PasswordChangeForm({ successHref }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [altchaRequired, setAltchaRequired] = useState(false);
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);
  const [altchaGeneration, setAltchaGeneration] = useState(0);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/account/security/password/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          ...(altchaPayload ? { altcha: altchaPayload } : {}),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        passwordChanged?: boolean;
        captchaRequired?: boolean;
        captchaRefreshRequired?: boolean;
      } | null;
      if (!result?.ok) {
        if (result?.passwordChanged) {
          setCurrentPassword('');
          setNewPassword('');
        }
        if (result?.captchaRefreshRequired) {
          setAltchaRequired(true);
          setAltchaPayload(null);
          setAltchaGeneration((current) => current + 1);
        } else if (result?.captchaRequired) {
          setAltchaRequired(true);
        }
        toast.error(staffSecurityErrorText(result?.error, 'change_password'));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setAltchaRequired(false);
      setAltchaPayload(null);
      toast.success(notificationText.authPasswordChanged);
      if (successHref) window.location.assign(successHref);
    } catch {
      toast.error(staffSecurityNetworkErrorText('change_password'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid max-w-md gap-2" onSubmit={changePassword}>
      <div className="grid gap-1">
        <Label htmlFor="account-current-password">Текущий пароль</Label>
        <Input
          id="account-current-password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="account-new-password">Новый пароль</Label>
        <Input
          id="account-new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </div>
      {altchaRequired ? (
        <PasswordAltchaChallenge
          key={altchaGeneration}
          endpoint="/api/account/security/password/change/challenge"
          onVerified={setAltchaPayload}
        />
      ) : null}
      <Button
        className="w-fit"
        size="sm"
        type="submit"
        disabled={busy || (altchaRequired && !altchaPayload)}
      >
        Сменить пароль
      </Button>
    </form>
  );
}
