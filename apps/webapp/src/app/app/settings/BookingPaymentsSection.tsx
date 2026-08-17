'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { patchAdminSetting } from './patchAdminSetting';

type ProviderRow = {
  id: string;
  label: string;
  enabled: boolean;
  webhookSecret?: string;
  shopId?: string;
  apiKey?: string;
  // Tinkoff
  terminalKey?: string;
  // Alfa-Bank
  merchantLogin?: string;
  gatewayUrl?: string;
  // CloudPayments
  publicId?: string;
};

const EMPTY_FISCAL_CODE = '__unset__';
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

function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
  emptyLabel: string,
): string {
  return options.find((option) => option.value === value)?.label ?? emptyLabel;
}

type Props = {
  paymentEnabled: boolean;
  readOnly?: boolean;
  providersJson: {
    defaultProviderId: string;
    fiscalVatCode?: string | null;
    fiscalTaxSystemCode?: string | null;
    providers: ProviderRow[];
  };
};

export function BookingPaymentsSection({
  paymentEnabled: initialEnabled,
  providersJson,
  readOnly = false,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [providers, setProviders] = useState<ProviderRow[]>(providersJson.providers);
  const [defaultProviderId, setDefaultProviderId] = useState(
    providersJson.defaultProviderId || 'yookassa',
  );
  const [fiscalVatCode, setFiscalVatCode] = useState(
    providersJson.fiscalVatCode ?? EMPTY_FISCAL_CODE,
  );
  const [fiscalTaxSystemCode, setFiscalTaxSystemCode] = useState(
    providersJson.fiscalTaxSystemCode ?? EMPTY_FISCAL_CODE,
  );
  const [webhookSecrets, setWebhookSecrets] = useState<Record<string, string>>({});
  const [shopIds, setShopIds] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [terminalKeys, setTerminalKeys] = useState<Record<string, string>>({});
  const [merchantLogins, setMerchantLogins] = useState<Record<string, string>>({});
  const [gatewayUrls, setGatewayUrls] = useState<Record<string, string>>({});
  const [publicIds, setPublicIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (readOnly) return;
    setError(null);
    startTransition(async () => {
      const okEnabled = await patchAdminSetting('booking_payment_enabled', enabled);
      const okProviders = await patchAdminSetting('booking_payment_providers', {
        enabled: true,
        defaultProviderId,
        fiscalVatCode: fiscalVatCode === EMPTY_FISCAL_CODE ? null : fiscalVatCode,
        fiscalTaxSystemCode:
          fiscalTaxSystemCode === EMPTY_FISCAL_CODE ? null : fiscalTaxSystemCode,
        providers: providers.map((p) => ({
          ...p,
          webhookSecret: webhookSecrets[p.id]?.trim() || p.webhookSecret || '',
          shopId: shopIds[p.id]?.trim() || p.shopId || '',
          apiKey: apiKeys[p.id]?.trim() || p.apiKey || '',
          terminalKey: terminalKeys[p.id]?.trim() || p.terminalKey || '',
          merchantLogin: merchantLogins[p.id]?.trim() || p.merchantLogin || '',
          gatewayUrl: gatewayUrls[p.id]?.trim() || p.gatewayUrl || '',
          publicId: publicIds[p.id]?.trim() || p.publicId || '',
        })),
      });
      if (!okEnabled || !okProviders) setError('Не удалось сохранить');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Платежи записи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {readOnly ? (
          <p className="text-sm text-muted-foreground">
            Настройки приёма оплат доступны только для просмотра по текущему тарифу.
          </p>
        ) : null}
        <fieldset disabled={readOnly} className="space-y-4">
          <LabeledSwitch
            label="Включить оплату записи"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={readOnly}
          />
          <div className="space-y-2">
            <Label>Провайдер по умолчанию</Label>
            <Select
              value={defaultProviderId}
              onValueChange={(v) => v && setDefaultProviderId(v)}
              disabled={readOnly}
            >
              <SelectTrigger
                className="w-full"
                displayLabel={
                  providers.find((provider) => provider.id === defaultProviderId)?.label ??
                  defaultProviderId
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Ставка НДС для чека</Label>
              <Select
                value={fiscalVatCode}
                onValueChange={(value) => value && setFiscalVatCode(value)}
                disabled={readOnly}
              >
                <SelectTrigger
                  className="w-full"
                  displayLabel={optionLabel(VAT_OPTIONS, fiscalVatCode, 'Не задана')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_FISCAL_CODE}>Не задана</SelectItem>
                  {VAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Система налогообложения для чека</Label>
              <Select
                value={fiscalTaxSystemCode}
                onValueChange={(value) => value && setFiscalTaxSystemCode(value)}
                disabled={readOnly}
              >
                <SelectTrigger
                  className="w-full"
                  displayLabel={optionLabel(
                    TAX_SYSTEM_OPTIONS,
                    fiscalTaxSystemCode,
                    'Не задана',
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_FISCAL_CODE}>Не задана</SelectItem>
                  {TAX_SYSTEM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {providers.map((p) => (
            <div key={p.id} className="space-y-2 rounded-md border p-3">
              <LabeledSwitch
                label={p.label}
                checked={p.enabled}
                disabled={readOnly}
                onCheckedChange={(checked) =>
                  setProviders((prev) =>
                    prev.map((x) => (x.id === p.id ? { ...x, enabled: checked } : x)),
                  )
                }
              />

              {/* yookassa */}
              {p.id === 'yookassa' ? (
                <>
                  <div className="space-y-1">
                    <Label>Webhook Secret</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Webhook secret"
                      value={webhookSecrets[p.id] ?? ''}
                      onChange={(e) =>
                        setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Shop ID</Label>
                    <Input
                      placeholder="Shop ID"
                      value={shopIds[p.id] ?? p.shopId ?? ''}
                      onChange={(e) => setShopIds((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Секретный ключ API</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Секретный ключ API"
                      value={apiKeys[p.id] ?? ''}
                      onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </div>
                </>
              ) : null}

              {/* tinkoff */}
              {p.id === 'tinkoff' ? (
                <>
                  <div className="space-y-1">
                    <Label>Terminal Key</Label>
                    <Input
                      placeholder="Terminal Key"
                      value={terminalKeys[p.id] ?? p.terminalKey ?? ''}
                      onChange={(e) =>
                        setTerminalKeys((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Секретный пароль</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Секретный пароль"
                      value={apiKeys[p.id] ?? ''}
                      onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Webhook Secret</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Webhook secret"
                      value={webhookSecrets[p.id] ?? ''}
                      onChange={(e) =>
                        setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </div>
                </>
              ) : null}

              {/* alfabank */}
              {p.id === 'alfabank' ? (
                <>
                  <div className="space-y-1">
                    <Label>Логин мерчанта</Label>
                    <Input
                      placeholder="Логин мерчанта"
                      value={merchantLogins[p.id] ?? p.merchantLogin ?? ''}
                      onChange={(e) =>
                        setMerchantLogins((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Shop ID</Label>
                    <Input
                      placeholder="Shop ID"
                      value={shopIds[p.id] ?? p.shopId ?? ''}
                      onChange={(e) => setShopIds((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Пароль мерчанта</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Пароль мерчанта"
                      value={apiKeys[p.id] ?? ''}
                      onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Webhook Secret</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Webhook secret"
                      value={webhookSecrets[p.id] ?? ''}
                      onChange={(e) =>
                        setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>URL шлюза (необязательно)</Label>
                    <Input
                      placeholder="https://... (необязательно)"
                      value={gatewayUrls[p.id] ?? p.gatewayUrl ?? ''}
                      onChange={(e) =>
                        setGatewayUrls((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </div>
                </>
              ) : null}

              {/* cloudpayments */}
              {p.id === 'cloudpayments' ? (
                <>
                  <div className="space-y-1">
                    <Label>Public ID</Label>
                    <Input
                      placeholder="Public ID"
                      value={publicIds[p.id] ?? p.publicId ?? ''}
                      onChange={(e) =>
                        setPublicIds((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>API Secret</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="API Secret"
                      value={apiKeys[p.id] ?? ''}
                      onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Webhook Secret</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Webhook secret"
                      value={webhookSecrets[p.id] ?? ''}
                      onChange={(e) =>
                        setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </div>
                </>
              ) : null}
            </div>
          ))}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="button" disabled={pending || readOnly} onClick={save}>
            Сохранить
          </Button>
        </fieldset>
      </CardContent>
    </Card>
  );
}
