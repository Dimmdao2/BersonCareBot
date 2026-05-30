"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { patchAdminSetting } from "./patchAdminSetting";

type ProviderRow = {
  id: string;
  label: string;
  enabled: boolean;
  webhookSecret?: string;
  shopId?: string;
  apiKey?: string;
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
            {p.id === "mock" || p.id === "yookassa" ? (
              <Input
                type="password"
                autoComplete="off"
                placeholder="Webhook secret"
                value={webhookSecrets[p.id] ?? ""}
                onChange={(e) => setWebhookSecrets((prev) => ({ ...prev, [p.id]: e.target.value }))}
              />
            ) : null}
            {p.id === "yookassa" ? (
              <>
                <Input
                  placeholder="Shop ID"
                  value={shopIds[p.id] ?? p.shopId ?? ""}
                  onChange={(e) => setShopIds((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="Секретный ключ API"
                  value={apiKeys[p.id] ?? ""}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
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
