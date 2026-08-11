'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORG_CUSTOM_DOMAIN_HOSTNAME_KEY } from '@/modules/system-settings/orgCustomDomainHostname';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';

type Props = {
  hostname: string;
  mutationAvailable: boolean;
  settingsEndpoint?: '/api/admin/settings';
};

type SaveResponse =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'entitlement_required'
        | 'commercial_read_only'
        | 'forbidden_owner_setting'
        | 'invalid_value'
        | string;
    };

const SAVE_ERROR_MESSAGES: Record<string, string> = {
  entitlement_required: 'Собственный домен недоступен на текущем тарифе.',
  commercial_read_only: 'Собственный домен доступен только для просмотра.',
  forbidden_owner_setting: 'Изменить домен может только владелец клиники.',
  invalid_value: 'Введите корректное доменное имя без протокола и пути.',
};

export function OrgCustomDomainSection({
  hostname: initialHostname,
  mutationAvailable,
  settingsEndpoint = '/api/admin/settings',
}: Props) {
  const router = useRouter();
  const [hostname, setHostname] = useState(initialHostname);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = hostname.trim().toLowerCase() !== initialHostname.trim().toLowerCase();

  async function handleSave() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const response = await fetch(settingsEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
          value: { value: hostname.trim().toLowerCase() },
        }),
      });
      const body = (await response.json()) as SaveResponse;
      if (!response.ok || !body.ok) {
        const code = body.ok ? 'unknown' : body.error;
        setError(SAVE_ERROR_MESSAGES[code] ?? 'Не удалось сохранить.');
        return;
      }
      setJustSaved(true);
      router.refresh();
    } catch {
      setError('Не удалось сохранить.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Собственный домен</DoctorSectionTitle>
      </DoctorSectionHeader>

      {!mutationAvailable ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-muted-foreground">
          Собственный домен доступен только для просмотра. Сохранённое доменное имя остаётся
          записанным, но изменения недоступны.
        </p>
      ) : null}

      <div className="flex max-w-md flex-col gap-4">
        <DoctorField label="Доменное имя" htmlFor="org-custom-domain-hostname">
          <Input
            id="org-custom-domain-hostname"
            value={hostname}
            onChange={(event) => {
              setHostname(event.currentTarget.value);
              setJustSaved(false);
            }}
            placeholder="clinic.example.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={!mutationAvailable || saving}
          />
        </DoctorField>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {justSaved && !dirty ? <p className="text-sm text-muted-foreground">Сохранено.</p> : null}

        <div>
          <Button
            type="button"
            size="sm"
            disabled={!mutationAvailable || saving || !dirty}
            onClick={() => void handleSave()}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </DoctorSection>
  );
}
