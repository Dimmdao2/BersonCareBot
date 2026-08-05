'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID,
  parseSaasBillingPaymentProviderSettings,
  type SaasBillingPaymentProviderSettings,
} from '@/modules/saas-billing/settings';
import type { SystemSetting } from '@/modules/system-settings/types';
import { apiJson } from '@/shared/lib/apiJson';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/doctor/primitives/card';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';

const EMPTY_VALUE = '__unset__';

const VAT_OPTIONS = [
  { value: '1', label: 'Без НДС' },
  { value: '2', label: '0%' },
  { value: '3', label: '10%' },
  { value: '4', label: '20%' },
  { value: '5', label: '10/110' },
  { value: '6', label: '20/120' },
  { value: '7', label: '5%' },
  { value: '8', label: '7%' },
  { value: '9', label: '5/105' },
  { value: '10', label: '7/107' },
  { value: '11', label: '22%' },
  { value: '12', label: '22/122' },
] as const;

const TAX_SYSTEM_OPTIONS = [
  { value: '1', label: 'Общая' },
  { value: '2', label: 'УСН, доходы' },
  { value: '3', label: 'УСН, доходы минус расходы' },
  { value: '4', label: 'ЕСХН' },
  { value: '5', label: 'Патент' },
  { value: '6', label: 'ЕНВД' },
] as const;

type SettingsResponse = { ok: true; settings: SystemSetting[] } | { ok: false; error?: string };
type PatchResponse = { ok: true; setting: SystemSetting } | { ok: false; error?: string };

function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
  emptyLabel: string,
): string {
  return options.find((option) => option.value === value)?.label ?? emptyLabel;
}

export function SaasBillingProviderSettings() {
  const [settings, setSettings] = useState<SaasBillingPaymentProviderSettings | null>(null);
  const [shopId, setShopId] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [vatCode, setVatCode] = useState(EMPTY_VALUE);
  const [taxSystemCode, setTaxSystemCode] = useState(EMPTY_VALUE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const provider = useMemo(
    () =>
      settings?.providers.find(({ id }) => id === DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID) ?? null,
    [settings],
  );
  const hasStoredApiKey = provider?.apiKey === '[REDACTED]';
  const hasStoredWebhookSecret = provider?.webhookSecret === '[REDACTED]';

  const applySetting = useCallback((valueJson: unknown) => {
    const parsed = parseSaasBillingPaymentProviderSettings(valueJson);
    const yookassa = parsed.providers.find(
      ({ id }) => id === DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID,
    );
    setSettings(parsed);
    setShopId(yookassa?.shopId ?? '');
    setNewApiKey('');
    setNewWebhookSecret('');
    setVatCode(parsed.payeeRequisites.vatCode ?? EMPTY_VALUE);
    setTaxSystemCode(parsed.payeeRequisites.taxSystemCode ?? EMPTY_VALUE);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiJson<SettingsResponse>('/api/admin/settings', {
        credentials: 'include',
      });
      const row = json.ok
        ? json.settings.find(({ key }) => key === 'saas_billing_payment_provider')
        : null;
      applySetting(row?.valueJson ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'network');
    } finally {
      setLoading(false);
    }
  }, [applySetting]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const nextProvider = {
      ...(provider ?? {
        id: DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID,
        label: 'ЮKassa',
        enabled: true,
      }),
      shopId: shopId.trim() || undefined,
      apiKey: newApiKey.trim() || provider?.apiKey,
      webhookSecret: newWebhookSecret.trim() || provider?.webhookSecret,
    };
    const providers = provider
      ? settings.providers.map((item) => (item.id === nextProvider.id ? nextProvider : item))
      : [...settings.providers, nextProvider];
    try {
      const json = await apiJson<PatchResponse>('/api/admin/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'saas_billing_payment_provider',
          value: {
            value: {
              ...settings,
              providers,
              payeeRequisites: {
                ...settings.payeeRequisites,
                vatCode: vatCode === EMPTY_VALUE ? null : vatCode,
                taxSystemCode: taxSystemCode === EMPTY_VALUE ? null : taxSystemCode,
              },
            },
          },
        }),
      });
      if (json.ok) applySetting(json.setting.valueJson);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'network');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Магазин ЮKassa</CardTitle>
        <CardDescription>Реквизиты магазина и налоговые параметры чека.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="saas-yookassa-shop-id">Shop ID</Label>
                <Input
                  id="saas-yookassa-shop-id"
                  value={shopId}
                  onChange={(event) => setShopId(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saas-yookassa-api-key">Новый секретный ключ</Label>
                <Input
                  id="saas-yookassa-api-key"
                  type="password"
                  value={newApiKey}
                  onChange={(event) => setNewApiKey(event.target.value)}
                  placeholder={hasStoredApiKey ? 'Ключ сохранён' : ''}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saas-yookassa-webhook-secret">Секрет вебхука</Label>
                <Input
                  id="saas-yookassa-webhook-secret"
                  type="password"
                  value={newWebhookSecret}
                  onChange={(event) => setNewWebhookSecret(event.target.value)}
                  placeholder={hasStoredWebhookSecret ? 'Секрет сохранён' : ''}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saas-yookassa-vat-code">НДС в чеке</Label>
                <Select
                  value={vatCode}
                  onValueChange={(value) => value !== null && setVatCode(value)}
                >
                  <SelectTrigger
                    id="saas-yookassa-vat-code"
                    className="w-full"
                    displayLabel={optionLabel(VAT_OPTIONS, vatCode, 'Не задан')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>Не задан</SelectItem>
                    {VAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saas-yookassa-tax-system-code">Система налогообложения</Label>
                <Select
                  value={taxSystemCode}
                  onValueChange={(value) => value !== null && setTaxSystemCode(value)}
                >
                  <SelectTrigger
                    id="saas-yookassa-tax-system-code"
                    className="w-full"
                    displayLabel={optionLabel(TAX_SYSTEM_OPTIONS, taxSystemCode, 'Не задана')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>Не задана</SelectItem>
                    {TAX_SYSTEM_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" onClick={() => void save()} disabled={saving || !settings}>
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              {saved && <span className="text-sm text-muted-foreground">Сохранено</span>}
            </div>
          </>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            Настройки не сохранены ({error}).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
