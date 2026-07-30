'use client';

import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/patient/primitives/button';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';

type CredentialSummary = {
  credentialId: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

type CredentialsPayload = {
  ok?: boolean;
  credentials?: CredentialSummary[];
};

export function PasskeySection() {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/passkey/credentials', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = (await response.json().catch(() => ({}))) as CredentialsPayload;
      if (response.ok && data.ok && Array.isArray(data.credentials)) {
        setCredentials(data.credentials);
      }
    } catch {
      setCredentials([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addPasskey(): Promise<void> {
    setLoading(true);
    try {
      const optionsResponse = await fetch('/api/auth/passkey/register/options', {
        method: 'POST',
        credentials: 'include',
      });
      const optionsData = (await optionsResponse.json().catch(() => ({}))) as {
        ok?: boolean;
        challengeId?: string;
        options?: PublicKeyCredentialCreationOptionsJSON;
        message?: string;
      };
      if (
        !optionsResponse.ok ||
        !optionsData.ok ||
        !optionsData.challengeId ||
        !optionsData.options
      ) {
        toast.error(optionsData.message ?? 'Не удалось начать добавление ключа доступа');
        return;
      }

      const response = await startRegistration({ optionsJSON: optionsData.options });
      const verifyResponse = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: optionsData.challengeId, response }),
      });
      const verifyData = (await verifyResponse.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!verifyResponse.ok || !verifyData.ok) {
        toast.error(verifyData.message ?? 'Не удалось подтвердить ключ доступа');
        return;
      }
      toast.success('Ключ доступа добавлен');
      await refresh();
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') return;
      toast.error('Не удалось добавить ключ доступа');
    } finally {
      setLoading(false);
    }
  }

  async function removePasskey(credentialId: string): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/passkey/credentials', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credentialId }),
      });
      if (!response.ok) {
        toast.error('Не удалось удалить ключ доступа');
        return;
      }
      toast.success('Ключ доступа удалён');
      await refresh();
    } catch {
      toast.error('Не удалось удалить ключ доступа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={patientMutedTextClass}>
        Вход подтверждается Face ID, отпечатком или кодом устройства. Биометрия остаётся на
        устройстве и не передаётся BersonCare.
      </p>
      {credentials.map((credential, index) => (
        <div
          key={credential.credentialId}
          className="flex items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div>
            <p className="text-sm font-medium">Ключ доступа {index + 1}</p>
            <p className={patientMutedTextClass}>
              Добавлен {new Date(credential.createdAt).toLocaleDateString('ru-RU')}
              {credential.backedUp ? ' · синхронизируется' : ''}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void removePasskey(credential.credentialId)}
          >
            Удалить
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={loading}
        onClick={() => void addPasskey()}
      >
        {credentials.length > 0 ? 'Добавить ещё ключ' : 'Добавить ключ доступа'}
      </Button>
    </div>
  );
}
