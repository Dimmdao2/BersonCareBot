"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Switch } from "@/shared/ui/doctor/primitives/switch";
import { patchAdminSetting } from "./patchAdminSetting";
import {
  normalizeDigestTimeHour,
  type OperatorAlertBlock,
  type OperatorAlertChannels,
  type OperatorHealthAlertConfig,
} from "@/modules/operator-alerts/operatorHealthAlertConfig";

export type OperatorHealthAlertsSectionProps = {
  initialConfig: OperatorHealthAlertConfig;
};

type BlockDef = {
  block: OperatorAlertBlock;
  title: string;
  topicKey: keyof OperatorHealthAlertConfig["topics"];
  showTime?: boolean;
};

const BLOCKS: BlockDef[] = [
  { block: "critical", title: "Критичные сбои", topicKey: "critical_enabled" },
  { block: "digest", title: "Суточная сводка", topicKey: "digest_enabled", showTime: true },
  { block: "account_conflicts", title: "Конфликты аккаунтов", topicKey: "account_conflicts" },
];

function ChannelRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <th scope="row" className="py-2 pr-4 text-left align-middle font-medium">
        {label}
      </th>
      <td className="w-px whitespace-nowrap py-2 align-middle text-right">
        <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      </td>
    </tr>
  );
}

export function OperatorHealthAlertsSection({ initialConfig }: OperatorHealthAlertsSectionProps) {
  const [topics, setTopics] = useState(() => ({ ...initialConfig.topics }));
  const [channels, setChannels] = useState(() => ({
    critical: { ...initialConfig.channels.critical },
    digest: { ...initialConfig.channels.digest },
    account_conflicts: { ...initialConfig.channels.account_conflicts },
  }));
  const [digestTime, setDigestTime] = useState(initialConfig.digestTime);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setBlockChannels(block: OperatorAlertBlock, patch: Partial<OperatorAlertChannels>) {
    setChannels((c) => ({ ...c, [block]: { ...c[block], ...patch } }));
  }

  function handleSave() {
    setSaved(false);
    setError(null);
    const trimmedDigestTime = digestTime.trim();
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(trimmedDigestTime)) {
      setError("Не удалось сохранить");
      return;
    }
    const normalizedDigestTime = normalizeDigestTimeHour(trimmedDigestTime);
    startTransition(async () => {
      const ok = await patchAdminSetting("operator_health_alert_config", {
        topics,
        channels,
        digestTime: normalizedDigestTime,
      });
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
        <CardTitle className="text-base">Уведомления админу</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {BLOCKS.map((def) => (
          <section key={def.block} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{def.title}</p>
              <Switch
                checked={topics[def.topicKey]}
                onCheckedChange={(v) => setTopics((t) => ({ ...t, [def.topicKey]: v }))}
                aria-label={def.title}
              />
            </div>
            {def.showTime ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Время</span>
                <Input
                  type="time"
                  step={3600}
                  value={digestTime}
                  onChange={(e) => setDigestTime(normalizeDigestTimeHour(e.target.value))}
                  className="w-36"
                  aria-label="Время суточной сводки"
                />
              </label>
            ) : null}
            <table className="w-full border-collapse text-sm">
              <tbody>
                <ChannelRow
                  label="Telegram"
                  checked={channels[def.block].telegram}
                  onCheckedChange={(v) => setBlockChannels(def.block, { telegram: v })}
                />
                <ChannelRow
                  label="Max"
                  checked={channels[def.block].max}
                  onCheckedChange={(v) => setBlockChannels(def.block, { max: v })}
                />
                <ChannelRow
                  label="Push"
                  checked={channels[def.block].web_push}
                  onCheckedChange={(v) => setBlockChannels(def.block, { web_push: v })}
                />
              </tbody>
            </table>
          </section>
        ))}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved ? <p className="text-sm text-muted-foreground">Сохранено</p> : null}
        <Button type="button" disabled={isPending} onClick={handleSave}>
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
