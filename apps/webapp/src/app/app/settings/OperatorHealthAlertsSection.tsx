'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import { patchAdminSettingWithResult } from './patchAdminSetting';
import {
  normalizeDigestTimeHour,
  type OperatorAlertBlock,
  type OperatorAlertChannels,
  type OperatorHealthAlertConfig,
} from '@/modules/operator-alerts/operatorHealthAlertConfig';
import {
  normalizeOperatorAlertFallbackEmail,
  type OperatorAlertFallbackEmailError,
} from '@/modules/operator-alerts/operatorAlertFallbackEmail';

export type OperatorHealthAlertsSectionProps = {
  initialConfig: OperatorHealthAlertConfig;
  initialFallbackEmail: string;
};

type BlockDef = {
  block: OperatorAlertBlock;
  title: string;
  topicKey: keyof OperatorHealthAlertConfig['topics'];
  showTime?: boolean;
};

const BLOCKS: BlockDef[] = [
  { block: 'critical', title: 'Критичные сбои', topicKey: 'critical_enabled' },
  { block: 'digest', title: 'Суточная сводка', topicKey: 'digest_enabled', showTime: true },
  { block: 'account_conflicts', title: 'Конфликты аккаунтов', topicKey: 'account_conflicts' },
  { block: 'support', title: 'Обращения в поддержку', topicKey: 'support_enabled' },
];

function ChannelRow({
  label,
  ariaLabel,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  label: string;
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <th scope="row" className="py-2 pr-4 text-left align-middle font-medium">
        {label}
      </th>
      <td className="w-px whitespace-nowrap py-2 align-middle text-right">
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-label={ariaLabel}
        />
      </td>
    </tr>
  );
}

function fallbackEmailErrorMessage(error: OperatorAlertFallbackEmailError): string {
  if (error === 'required') return 'Укажите резервный e-mail для операторских алертов.';
  if (error === 'too_long') return 'Резервный e-mail не должен быть длиннее 320 символов.';
  return 'Укажите корректный резервный e-mail для операторских алертов.';
}

const REQUIRED_CRITICAL_CHANNELS: OperatorAlertChannels = {
  telegram: true,
  max: true,
  web_push: true,
  sms: true,
  email: true,
};

export function OperatorHealthAlertsSection({
  initialConfig,
  initialFallbackEmail,
}: OperatorHealthAlertsSectionProps) {
  const [topics, setTopics] = useState(() => ({
    ...initialConfig.topics,
    critical_enabled: true,
  }));
  const [channels, setChannels] = useState(() => ({
    critical: { ...REQUIRED_CRITICAL_CHANNELS },
    digest: { ...initialConfig.channels.digest },
    account_conflicts: { ...initialConfig.channels.account_conflicts },
    support: { ...initialConfig.channels.support },
  }));
  const [digestTime, setDigestTime] = useState(initialConfig.digestTime);
  const [fallbackEmail, setFallbackEmail] = useState(initialFallbackEmail);
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
      setError('Укажите корректное время суточной сводки.');
      return;
    }
    const checkedFallbackEmail = normalizeOperatorAlertFallbackEmail(fallbackEmail);
    if (!checkedFallbackEmail.ok) {
      setError(fallbackEmailErrorMessage(checkedFallbackEmail.error));
      return;
    }
    const normalizedDigestTime = normalizeDigestTimeHour(trimmedDigestTime);
    startTransition(async () => {
      const alertsResult = await patchAdminSettingWithResult('operator_health_alert_config', {
        topics,
        channels,
        digestTime: normalizedDigestTime,
      });
      if (!alertsResult.ok) {
        setError(alertsResult.error ?? 'Не удалось сохранить настройки операторских алертов.');
        return;
      }
      const fallbackResult = await patchAdminSettingWithResult(
        'operator_alert_fallback_email',
        checkedFallbackEmail.value,
      );
      if (!fallbackResult.ok) {
        setError(fallbackResult.error ?? 'Не удалось сохранить резервный e-mail.');
        return;
      }
      setFallbackEmail(checkedFallbackEmail.value);
      setSaved(true);
    });
  }

  return (
    <Card className="mt-6 border-border/80">
      <CardHeader>
        <CardTitle className="text-base">Уведомления админу</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Резервный e-mail</span>
          <Input
            type="email"
            maxLength={320}
            required
            value={fallbackEmail}
            onChange={(event) => setFallbackEmail(event.target.value)}
            aria-label="Резервный e-mail операторских алертов"
          />
        </label>
        {!fallbackEmail.trim() ? (
          <p className="text-sm text-destructive" role="alert">
            Резервный e-mail не настроен: уведомление с пустой аудиторией останется без резервной
            доставки.
          </p>
        ) : null}
        {BLOCKS.map((def) => (
          <section key={def.block} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{def.title}</p>
              <Switch
                checked={def.block === 'critical' ? true : topics[def.topicKey]}
                disabled={def.block === 'critical'}
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
                  ariaLabel={`${def.title} — Telegram`}
                  checked={def.block === 'critical' ? true : channels[def.block].telegram}
                  disabled={def.block === 'critical'}
                  onCheckedChange={(v) => setBlockChannels(def.block, { telegram: v })}
                />
                <ChannelRow
                  label="Max"
                  ariaLabel={`${def.title} — Max`}
                  checked={def.block === 'critical' ? true : channels[def.block].max}
                  disabled={def.block === 'critical'}
                  onCheckedChange={(v) => setBlockChannels(def.block, { max: v })}
                />
                <ChannelRow
                  label="Push"
                  ariaLabel={`${def.title} — Push`}
                  checked={def.block === 'critical' ? true : channels[def.block].web_push}
                  disabled={def.block === 'critical'}
                  onCheckedChange={(v) => setBlockChannels(def.block, { web_push: v })}
                />
                <ChannelRow
                  label="SMS"
                  ariaLabel={`${def.title} — SMS`}
                  checked={def.block === 'critical' ? true : channels[def.block].sms}
                  disabled={def.block === 'critical'}
                  onCheckedChange={(v) => setBlockChannels(def.block, { sms: v })}
                />
                <ChannelRow
                  label="E-mail"
                  ariaLabel={`${def.title} — E-mail`}
                  checked={def.block === 'critical' ? true : channels[def.block].email}
                  disabled={def.block === 'critical'}
                  onCheckedChange={(v) => setBlockChannels(def.block, { email: v })}
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
