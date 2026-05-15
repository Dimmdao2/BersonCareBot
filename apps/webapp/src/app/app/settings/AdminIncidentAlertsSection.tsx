"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import { patchAdminSetting } from "./patchAdminSetting";
import {
  ADMIN_INCIDENT_V1_TOPIC_KEYS,
  type AdminIncidentAlertConfig,
  type AdminIncidentTopicKey,
} from "@/modules/admin-incidents/adminIncidentAlertConfig";

const TOPIC_LABELS: Record<AdminIncidentTopicKey, string> = {
  channel_link: "Конфликт привязки канала",
  auto_merge_conflict: "Новый открытый конфликт автомержа",
  auto_merge_conflict_anomaly: "Аномалия автомержа (пустые кандидаты)",
  messenger_phone_bind_blocked: "Блокировка привязки телефона (мессенджер)",
  messenger_phone_bind_anomaly: "Аномалия привязки телефона (мессенджер)",
  system_health_db_guard: "Очередь синка в integrator (system health)",
};

export type AdminIncidentAlertsSectionProps = {
  initialConfig: AdminIncidentAlertConfig;
};

export function AdminIncidentAlertsSection({ initialConfig }: AdminIncidentAlertsSectionProps) {
  const [topics, setTopics] = useState<AdminIncidentAlertConfig["topics"]>(() => ({ ...initialConfig.topics }));
  const [channels, setChannels] = useState<AdminIncidentAlertConfig["channels"]>(() => ({
    ...initialConfig.channels,
  }));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const ok = await patchAdminSetting("admin_incident_alert_config", { topics, channels });
      if (!ok) {
        setError("Не удалось сохранить");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card className="mt-6 border-border/80">
      <CardHeader>
        <CardTitle className="text-base">Инциденты идентичности (внешняя доставка)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Telegram и Max — списки получателей в{" "}
          <code className="rounded bg-muted px-1">admin_telegram_ids</code> /{" "}
          <code className="rounded bg-muted px-1">admin_max_ids</code>. Качество данных интеграций и сценарии только
          внутри админки сюда не входят.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <p className="text-sm font-medium">Каналы</p>
          <LabeledSwitch
            checked={channels.telegram}
            onCheckedChange={(v) => setChannels((c) => ({ ...c, telegram: v }))}
            label="Telegram"
          />
          <LabeledSwitch
            checked={channels.max}
            onCheckedChange={(v) => setChannels((c) => ({ ...c, max: v }))}
            label="Max"
          />
        </section>
        <section className="flex flex-col gap-3">
          <p className="text-sm font-medium">Темы</p>
          <div className="flex flex-col gap-2">
            {ADMIN_INCIDENT_V1_TOPIC_KEYS.map((key) => (
              <LabeledSwitch
                key={key}
                checked={topics[key]}
                onCheckedChange={(v) => setTopics((t) => ({ ...t, [key]: v }))}
                label={TOPIC_LABELS[key]}
              />
            ))}
          </div>
        </section>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved ? <p className="text-sm text-muted-foreground">Сохранено</p> : null}
        <Button type="button" disabled={isPending} onClick={handleSave}>
          Сохранить уведомления
        </Button>
      </CardContent>
    </Card>
  );
}
