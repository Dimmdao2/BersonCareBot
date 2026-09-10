'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  normalizeOrgCustomDomainHostnamePatch,
  ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
} from '@/modules/system-settings/orgCustomDomainHostname';
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

type DomainVerificationResult = Readonly<{
  checked: number;
  healthy: number;
  unhealthy: number;
  canonicalResolutionFailed: boolean;
  failures: string[];
}>;

type SaveResponse =
  | {
      ok: true;
      domainBinding?: CustomDomainBindingState | null;
      verification?: DomainVerificationResult;
    }
  | { ok: false; error: string };

const SAVE_ERROR_MESSAGES: Record<string, string> = {
  entitlement_required: 'Собственный домен недоступен на текущем тарифе.',
  commercial_read_only: 'Собственный домен доступен только для просмотра.',
  forbidden_owner_setting: 'Изменить домен может только владелец клиники.',
  invalid_value: 'Введите базовый домен без протокола и пути.',
  custom_domain_hostname_taken: 'Этот адрес уже подключён к другой клинике.',
  custom_domain_invalid_base_domain: 'Введите базовый домен без протокола и пути.',
};

class DomainPatchError extends Error {}

function statusReasonMessage(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === 'organization_brand_or_custom_domain_entitlement_inactive') {
    return 'Проверьте, что клиника активна, бренд опубликован и тариф включает собственный домен.';
  }
  if (reason.startsWith('runtime_edge_ip_missing') || reason.startsWith('runtime_cname_target_missing')) {
    return 'Платформа ещё не настроена для этой DNS-записи. Обратитесь в поддержку.';
  }
  if (reason.startsWith('resolution_failed') || reason.startsWith('dns_mismatch')) {
    return 'Проверьте DNS-запись по инструкции выше и повторите проверку после её обновления.';
  }
  if (reason.startsWith('tls_handshake_failed')) {
    return 'DNS подтверждён, но сертификат ещё не готов. Подождите и повторите проверку.';
  }
  if (reason.startsWith('routing_probe_failed')) {
    return 'DNS и сертификат подтверждены, но адрес пока не доходит до приложения. Обратитесь в поддержку.';
  }
  if (reason.startsWith('cert_expired') || reason.startsWith('cert_expiring_soon')) {
    return 'Сертификат требует обновления. Обратитесь в поддержку.';
  }
  if (reason.startsWith('dns_verification_failed') || reason.startsWith('verification_failed')) {
    return 'Проверьте DNS-запись по инструкции выше и повторите проверку.';
  }
  return 'Повторите проверку; если состояние не изменится, обратитесь в поддержку.';
}

function lifecycleMessage(binding: CustomDomainBindingState): string {
  switch (binding.status) {
    case 'pending':
      return 'Ожидаем DNS.';
    case 'dns_ready':
      return 'Выпускаем сертификат.';
    case 'active':
      return 'Подключён.';
    case 'failed':
      return statusReasonMessage(binding.statusReason) ?? 'Не удалось подключить домен.';
    case 'suspended':
      return statusReasonMessage(binding.statusReason) ?? 'Подключение приостановлено.';
    case 'quarantine':
      return 'Домен отключён.';
  }
}

function recheckFeedback(
  verification: DomainVerificationResult | undefined,
  binding: CustomDomainBindingState | null,
): string {
  if (verification?.checked === 1 && verification.healthy === 1) {
    return 'Проверка завершена: DNS, сертификат и маршрут подтверждены.';
  }
  if (binding?.statusReason) {
    return `Проверка завершена: ${statusReasonMessage(binding.statusReason) ?? 'домен пока не готов.'}`;
  }
  return 'Проверка завершена: домен пока не готов. Проверьте DNS-запись и повторите попытку.';
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
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  const normalizedInput = normalizeOrgCustomDomainHostnamePatch({ value: baseDomain });
  const normalizedDomain = normalizedInput.ok ? normalizedInput.valueJson.value : baseDomain.trim().toLowerCase();
  const derivedHostname =
    normalizedInput.ok && normalizedInput.valueJson.value !== ''
      ? placement === 'subdomain'
        ? `app.${normalizedInput.valueJson.value}`
        : normalizedInput.valueJson.value
      : null;
  const hasUnsavedIntent =
    normalizedDomain !== (binding?.baseDomain ?? initialDomain).trim().toLowerCase() ||
    placement !== (binding?.placement ?? 'apex');
  const canSubmitIntent = normalizedDomain.length > 0 && (!binding || hasUnsavedIntent);

  async function patch(body: Record<string, unknown>): Promise<Extract<SaveResponse, { ok: true }>> {
    const response = await fetch(settingsEndpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const responseText = await response.text();
    let responseBody: SaveResponse | null = null;
    try {
      responseBody = JSON.parse(responseText) as SaveResponse;
    } catch {
      // A proxy or runtime failure must not leak parser text into the settings card.
    }
    if (!response.ok || !responseBody || !responseBody.ok) {
      const code = responseBody && !responseBody.ok ? responseBody.error : 'unknown';
      throw new DomainPatchError(SAVE_ERROR_MESSAGES[code] ?? 'Не удалось обновить домен.');
    }
    return responseBody;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setVerificationFeedback(null);
    try {
      if (!normalizedInput.ok) {
        setError(SAVE_ERROR_MESSAGES[normalizedInput.error]);
        return;
      }
      const response = await patch({
        key: ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
        value: { value: normalizedInput.valueJson.value },
        placement,
      });
      const nextBinding = response.domainBinding;
      setBinding(nextBinding ?? null);
      if (nextBinding) {
        setBaseDomain(nextBinding.baseDomain);
        setPlacement(nextBinding.placement);
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof DomainPatchError ? cause.message : 'Не удалось обновить домен.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRecheck() {
    setRechecking(true);
    setError(null);
    setVerificationFeedback(null);
    try {
      const response = await patch({
        key: ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
        action: 'recheck',
      });
      const nextBinding = response.domainBinding ?? binding;
      setBinding(nextBinding ?? binding);
      setVerificationFeedback(recheckFeedback(response.verification, nextBinding));
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof DomainPatchError ? cause.message : 'Не удалось проверить домен.',
      );
    } finally {
      setRechecking(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    setVerificationFeedback(null);
    try {
      const response = await patch({
        key: ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
        value: { value: '' },
      });
      const nextBinding = response.domainBinding;
      setBinding(nextBinding ?? null);
      setBaseDomain('');
      setPlacement('apex');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof DomainPatchError ? cause.message : 'Не удалось отключить домен.',
      );
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
              Приложение на введённом адресе — без добавления app.
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem
                value="subdomain"
                disabled={!mutationAvailable || saving || rechecking}
              />
              На домене уже есть сайт — приложение на app.&lt;домен&gt;
            </label>
          </RadioGroup>
        </DoctorField>

        {derivedHostname ? (
          <p className="text-sm text-muted-foreground">
            Адрес приложения после сохранения:{' '}
            <span className="font-medium text-foreground">{derivedHostname}</span>
          </p>
        ) : null}

        {binding ? (
          <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/15 p-3 text-sm">
            <p>
              Адрес приложения: <span className="font-medium">{binding.hostname}</span>
            </p>
            {binding.dnsInstructions ? (
              <div className="flex flex-col gap-1">
                {binding.dnsInstructions.map((instruction) => (
                  <p key={`${instruction.recordType}-${instruction.name}`}>
                    {instruction.recordType} {instruction.name} → {instruction.value}
                  </p>
                ))}
                {binding.placement === 'subdomain' ? (
                  <p className="text-muted-foreground">Достаточно одной из этих записей.</p>
                ) : null}
              </div>
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

        {verificationFeedback ? (
          <p role="status" className="text-sm text-muted-foreground">
            {verificationFeedback}
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
