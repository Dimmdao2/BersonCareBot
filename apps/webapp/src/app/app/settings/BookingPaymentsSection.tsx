"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { LabeledSwitch } from "@/shared/ui/doctor/primitives/labeled-switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/doctor/primitives/select";
import { patchAdminSetting } from "./patchAdminSetting";

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

type Props = {
  paymentEnabled: boolean;
  providersJson: {
    defaultProviderId: string;
    providers: ProviderRow[];
  };
};

export function BookingPaymentsSection({ paymentEnabled: initialEnabled, providersJson }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [providers, setProviders] = useState<ProviderRow[]>(providersJson.providers);
  const [defaultProviderId, setDefaultProviderId] = useState(providersJson.defaultProviderId || "mock");
  const [webhookSecrets, setWebhookSecrets] = useState<Record<string, string>>({});
  const [shopIds, setShopIds] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [terminalKeys, setTerminalKeys] = useState<Record<string, string>>({});
  const [merchantLogins, setMerchantLogins] = useState<Record<string, string>>({});
  const [gatewayUrls, setGatewayUrls] = useState<Record<string, string>>({});
  const [publicIds, setPublicIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const defaultLabel = providers.find((p) => p.id === defaultProviderId)?.label ?? defaultProviderId;

  function save() {
    setError(null);
    startTransition(async () => {
      const okEnabled = await patchAdminSetting("booking_payment_enabled", enabled);
      const okProviders = await patchAdminSetting("booking_payment_providers", {
        enabled: true,
        defaultProviderId,
        providers: providers.map((p) => ({
          ...p,
          webhookSecret: webhookSecrets[p.id]?.trim() || p.webhookSecret || "",
          shopId: shopIds[p.id]?.trim() || p.shopId || "",
          apiKey: apiKeys[p.id]?.trim() || p.apiKey || "",
          terminalKey: terminalKeys[p.id]?.trim() || p.terminalKey || "",
          merchantLogin: merchantLogins[p.id]?.trim() || p.merchantLogin || "",
          gatewayUrl: gatewayUrls[p.id]?.trim() || p.gatewayUrl || "",
          publicId: publicIds[p.id]?.trim() || p.publicId || "",
        })),
      });
      if (!okEnabled || !okProviders) setError("Не удалось сохранить");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Платежи записи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <LabeledSwitch label="Включить оплату записи" checked={enabled} onCheckedChange={setEnabled} />
        <div className="space-y-2">
          <Label>Провайдер по умолчанию</Label>
          <Select value={defaultProviderId} onValueChange={(v) => v && setDefaultProviderId(v)}>
            <SelectTrigger displayLabel={defaultLabel} className="w-full" />
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {providers.map((p) => (
          <div key={p.id} className="space-y-2 rounded-md border p-3">
            <LabeledSwitch
              label={p.label}
              checked={p.enabled}
              onCheckedChange={(checked) =>
                setProviders((prev) => prev.map((x) => (x.id === p.id ? { ...x, enabled: checked } : x)))
              }
            />

            {/* mock */}
            {p.id === "mock" ? (
              <div className="space-y-1">
                <Label>Webhook Secret</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="Webhook secret"
                  value={webhookSecrets[p.id] ?? ""}
                  onChange={(e) => setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
              </div>
            ) : null}

            {/* yookassa */}
            {p.id === "yookassa" ? (
              <>
                <div className="space-y-1">
                  <Label>Webhook Secret</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Webhook secret"
                    value={webhookSecrets[p.id] ?? ""}
                    onChange={(e) => setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Shop ID</Label>
                  <Input
                    placeholder="Shop ID"
                    value={shopIds[p.id] ?? p.shopId ?? ""}
                    onChange={(e) => setShopIds((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Секретный ключ API</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Секретный ключ API"
                    value={apiKeys[p.id] ?? ""}
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
              </>
            ) : null}

            {/* tinkoff */}
            {p.id === "tinkoff" ? (
              <>
                <div className="space-y-1">
                  <Label>Terminal Key</Label>
                  <Input
                    placeholder="Terminal Key"
                    value={terminalKeys[p.id] ?? p.terminalKey ?? ""}
                    onChange={(e) => setTerminalKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Секретный пароль</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Секретный пароль"
                    value={apiKeys[p.id] ?? ""}
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Webhook Secret</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Webhook secret"
                    value={webhookSecrets[p.id] ?? ""}
                    onChange={(e) => setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
              </>
            ) : null}

            {/* alfabank */}
            {p.id === "alfabank" ? (
              <>
                <div className="space-y-1">
                  <Label>Логин мерчанта</Label>
                  <Input
                    placeholder="Логин мерчанта"
                    value={merchantLogins[p.id] ?? p.merchantLogin ?? ""}
                    onChange={(e) => setMerchantLogins((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Shop ID</Label>
                  <Input
                    placeholder="Shop ID"
                    value={shopIds[p.id] ?? p.shopId ?? ""}
                    onChange={(e) => setShopIds((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Пароль мерчанта</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Пароль мерчанта"
                    value={apiKeys[p.id] ?? ""}
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Webhook Secret</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Webhook secret"
                    value={webhookSecrets[p.id] ?? ""}
                    onChange={(e) => setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>URL шлюза (необязательно)</Label>
                  <Input
                    placeholder="https://... (необязательно)"
                    value={gatewayUrls[p.id] ?? p.gatewayUrl ?? ""}
                    onChange={(e) => setGatewayUrls((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
              </>
            ) : null}

            {/* cloudpayments */}
            {p.id === "cloudpayments" ? (
              <>
                <div className="space-y-1">
                  <Label>Public ID</Label>
                  <Input
                    placeholder="Public ID"
                    value={publicIds[p.id] ?? p.publicId ?? ""}
                    onChange={(e) => setPublicIds((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>API Secret</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="API Secret"
                    value={apiKeys[p.id] ?? ""}
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Webhook Secret</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Webhook secret"
                    value={webhookSecrets[p.id] ?? ""}
                    onChange={(e) => setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
              </>
            ) : null}
          </div>
        ))}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="button" disabled={pending} onClick={save}>
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
