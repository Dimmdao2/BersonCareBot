'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORG_CUSTOM_DOMAIN_HOSTNAME_KEY } from '@/modules/system-settings/orgCustomDomainHostname';
import type {
  CustomDomainBindingState,
  OrgCustomDomainPlacement,
} from '@/modules/custom-domain-binding/ports';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/doctor/primitives/radio-group';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';

type Props = {
  initialDomain: string;
  initialBinding: CustomDomainBindingState | null;
  mutationAvailable: boolean;
  settingsEndpoint?: '/api/admin/settings';
};

type SaveResponse =
  { ok: true; domainBinding?: CustomDomainBindingState | null } | { ok: false; error: string };

const SAVE_ERROR_MESSAGES: Record<string, string> = {
  entitlement_required: 'Собственный домен недоступен на текущем тарифе.',
  commercial_read_only: 'Собственный домен доступен только для просмотра.',
  forbidden_owner_setting: 'Изменить домен может только владелец клиники.',
  invalid_value: 'Введите базовый домен без протокола и пути.',
  custom_domain_hostname_taken: 'Этот адрес уже подключён к другой клинике.',
  custom_domain_invalid_base_domain: 'Введите базовый домен без протокола и пути.',
};

function lifecycleMessage(binding: CustomDomainBindingState): string {
  switch (binding.status) {
    case 'pending':
      return 'Ожидаем DNS.';
    case 'dns_ready':
      return 'Выпускаем сертификат.';
    case 'active':
      return 'Подключён.';
    case 'failed':
      return binding.statusReason
        ? `Не удалось подключить: ${binding.statusReason}`
        : 'Не удалось подключить домен.';
    case 'suspended':
      return binding.statusReason
        ? `Подключение приостановлено: ${binding.statusReason}`
        : 'Подключение приостановлено.';
    case 'quarantine':
      return 'Домен отключён.';
  }
}

export function OrgCustomDomainSection({
  initialDomain,
  initialBinding,
  mutationAvailable,
  settingsEndpoint = '/api/admin/settings',
}: Props) {
  const router = useRouter();
  const [baseDomain, setBaseDomain] = useState(initialBinding?.baseDomain ?? initialDomain);
  const [placement, setPlacement] = useState<OrgCustomDomainPlacement>(
    initialBinding?.placement ?? 'apex',
  );
  const [binding, setBinding] = useState<CustomDomainBindingState | null>(initialBinding);
  const [saving, setSaving] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedDomain = baseDomain.trim().toLowerCase();
  const hasUnsavedIntent =
    normalizedDomain !== (binding?.baseDomain ?? initialDomain).trim().toLowerCase() ||
    placement !== (binding?.placement ?? 'apex');
  const canSubmitIntent = normalizedDomain.length > 0 && (!binding || hasUnsavedIntent);

  async function patch(
    body: Record<string, unknown>,
  ): Promise<CustomDomainBindingState | null | undefined> {
    const response = await fetch(settingsEndpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const responseBody = (await response.json()) as SaveResponse;
    if (!response.ok || !responseBody.ok) {
      const code = responseBody.ok ? 'unknown' : responseBody.error;
      throw new Error(SAVE_ERROR_MESSAGES[code] ?? 'Не удалось обновить домен.');
    }
    return responseBody.domainBinding;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const nextBinding = await patch({
        key: ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
        value: { value: normalizedDomain },
        placement,
      });
      setBinding(nextBinding ?? null);
      if (nextBinding) {
        setBaseDomain(nextBinding.baseDomain);
        setPlacement(nextBinding.placement);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обновить домен.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRecheck() {
    setRechecking(true);
    setError(null);
    try {
      const nextBinding = await patch({
        key: ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
        action: 'recheck',
      });
      setBinding(nextBinding ?? binding);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось проверить домен.');
    } finally {
      setRechecking(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      const nextBinding = await patch({
        key: ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
        value: { value: '' },
      });
      setBinding(nextBinding ?? null);
      setBaseDomain('');
      setPlacement('apex');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отключить домен.');
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
          Собственный домен доступен только для просмотра.
        </p>
      ) : null}

      <div className="flex max-w-md flex-col gap-4">
        <DoctorField label="Базовый домен" htmlFor="org-custom-domain-hostname">
          <Input
            id="org-custom-domain-hostname"
            value={baseDomain}
            onChange={(event) => setBaseDomain(event.currentTarget.value)}
            placeholder="clinic.ru"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={!mutationAvailable || saving || rechecking}
          />
        </DoctorField>

        <DoctorField label="Размещение приложения" htmlFor="org-custom-domain-placement">
          <RadioGroup
            id="org-custom-domain-placement"
            value={placement}
            onValueChange={(value) => setPlacement(value as OrgCustomDomainPlacement)}
            className="gap-2"
            disabled={!mutationAvailable || saving || rechecking}
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="apex" disabled={!mutationAvailable || saving || rechecking} />
              Домен целиком под приложение
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem
                value="subdomain"
                disabled={!mutationAvailable || saving || rechecking}
              />
              На домене уже есть сайт
            </label>
          </RadioGroup>
        </DoctorField>

        {binding ? (
          <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/15 p-3 text-sm">
            <p>
              Адрес приложения: <span className="font-medium">{binding.hostname}</span>
            </p>
            {binding.dnsInstruction ? (
              <p>
                {binding.dnsInstruction.recordType} {binding.dnsInstruction.name} →{' '}
                {binding.dnsInstruction.value}
              </p>
            ) : null}
            <p
              className={binding.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}
            >
              {lifecycleMessage(binding)}
            </p>
            {binding.status === 'active' ? (
              <a
                href={`https://${binding.hostname}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit text-primary underline underline-offset-2"
              >
                Открыть адрес
              </a>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {mutationAvailable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={saving || rechecking || !canSubmitIntent}
              onClick={() => void handleSave()}
            >
              {saving ? 'Сохранение…' : binding ? 'Изменить домен' : 'Подключить домен'}
            </Button>
            {binding ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving || rechecking}
                  onClick={() => void handleRecheck()}
                >
                  {rechecking ? 'Проверяем…' : 'Проверить DNS'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving || rechecking}
                  onClick={() => void handleClear()}
                >
                  Отключить домен
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </DoctorSection>
  );
}
