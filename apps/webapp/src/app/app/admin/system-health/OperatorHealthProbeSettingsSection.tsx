'use client';

import { useEffect, useState } from 'react';
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
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import { OPERATOR_HEALTH_PROBE_DEFAULT_VALUE } from '@/modules/system-settings/operatorHealthProbeConfig';

type ProbeName = 'max' | 'telegram' | 'google_calendar';
type ProbeConfig = {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  consecutiveFailures: number;
};
type Config = Record<ProbeName, ProbeConfig> & { quietUntil: string | null };
type Imap = {
  address: string;
  host: string;
  port: number;
  login: string;
  folder: string;
  hasStoredPassword: boolean;
};

const defaults: Config = {
  max: { ...OPERATOR_HEALTH_PROBE_DEFAULT_VALUE.max },
  telegram: { ...OPERATOR_HEALTH_PROBE_DEFAULT_VALUE.telegram },
  google_calendar: { ...OPERATOR_HEALTH_PROBE_DEFAULT_VALUE.google_calendar },
  quietUntil: null,
};
const labels: Record<ProbeName, string> = {
  max: 'MAX',
  telegram: 'Telegram',
  google_calendar: 'Google Calendar',
};
const emptyImap: Imap = {
  address: '',
  host: '',
  port: 993,
  login: '',
  folder: 'INBOX',
  hasStoredPassword: false,
};

function settingValue(settings: Array<{ key: string; valueJson: unknown }>, key: string): unknown {
  const row = settings.find((item) => item.key === key)?.valueJson;
  return row !== null && typeof row === 'object' && 'value' in row
    ? (row as Record<string, unknown>).value
    : null;
}

function asConfig(value: unknown): Config {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  const config = { ...defaults } as Config;
  for (const name of Object.keys(labels) as ProbeName[]) {
    const candidate = raw[name];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const p = candidate as Record<string, unknown>;
      config[name] = {
        enabled: p.enabled === true,
        intervalMs: typeof p.intervalMs === 'number' ? p.intervalMs : defaults[name].intervalMs,
        timeoutMs: typeof p.timeoutMs === 'number' ? p.timeoutMs : defaults[name].timeoutMs,
        consecutiveFailures:
          typeof p.consecutiveFailures === 'number'
            ? p.consecutiveFailures
            : defaults[name].consecutiveFailures,
      };
    }
  }
  config.quietUntil = typeof raw.quietUntil === 'string' ? raw.quietUntil : null;
  return config;
}

function asImap(value: unknown): Imap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyImap;
  const raw = value as Record<string, unknown>;
  return {
    address: typeof raw.address === 'string' ? raw.address : '',
    host: typeof raw.host === 'string' ? raw.host : '',
    port: typeof raw.port === 'number' ? raw.port : 993,
    login: typeof raw.login === 'string' ? raw.login : '',
    folder: typeof raw.folder === 'string' && raw.folder ? raw.folder : 'INBOX',
    hasStoredPassword: raw.hasStoredPassword === true,
  };
}

const minutes = (milliseconds: number) => String(milliseconds / 60_000);

export function OperatorHealthProbeSettingsSection() {
  const [config, setConfig] = useState<Config>(defaults);
  const [imap, setImap] = useState<Imap>(emptyImap);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiJson<{ ok?: boolean; settings: Array<{ key: string; valueJson: unknown }> }>(
      '/api/admin/settings',
      { credentials: 'include' },
    )
      .then(({ settings }) => {
        setConfig(asConfig(settingValue(settings, 'operator_health_probe_config')));
        setImap(asImap(settingValue(settings, 'operator_health_imap')));
      })
      .catch(() =>
        setError(
          'Не удалось загрузить настройки проб. Обновите страницу и проверьте права глобального администратора.',
        ),
      );
  }, []);

  async function saveProbes() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await apiJson('/api/admin/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'operator_health_probe_config', value: { value: config } }),
      });
      setSaved('Настройки проб сохранены.');
    } catch (e) {
      setError(
        `Настройки проб не сохранены: ${e instanceof Error ? e.message : 'проверьте значения и повторите'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetProbes() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await apiJson('/api/admin/settings', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'operator_health_probe_config' }),
      });
      setConfig(defaults);
      setSaved('Сброшено: снова действуют значения по умолчанию из кода.');
    } catch (e) {
      setError(`Не удалось сбросить настройки: ${e instanceof Error ? e.message : 'повторите'}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveImap() {
    const port = Number.parseInt(String(imap.port), 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('Порт IMAP должен быть числом от 1 до 65535. Исправьте порт и сохраните снова.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await apiJson('/api/admin/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'operator_health_imap',
          value: { value: { ...imap, port, password } },
        }),
      });
      setPassword('');
      setImap((value) => ({
        ...value,
        port,
        hasStoredPassword: value.hasStoredPassword || password.trim().length > 0,
      }));
      setSaved('Параметры служебного IMAP-ящика сохранены.');
    } catch (e) {
      setError(
        `IMAP-настройки не сохранены: ${e instanceof Error ? e.message : 'проверьте поля и повторите'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Пробы каналов и служебный IMAP-ящик</CardTitle>
        <CardDescription>
          Параметры меняются без релиза. Таймаут 1–60 секунд, период 5–60 минут и подтверждение от 2
          до 10 подряд предотвращают ложные тревоги и нагрузку на провайдера.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {(['max', 'telegram', 'google_calendar'] as ProbeName[]).map((name) => (
          <div key={name} className="rounded-md border border-border/60 p-3 space-y-3">
            <LabeledSwitch
              label={`${labels[name]}: проба включена`}
              hint={`Текущее: ${config[name].enabled ? 'включена' : 'выключена'}. По умолчанию: ${defaults[name].enabled ? 'включена' : 'выключена'}.`}
              checked={config[name].enabled}
              disabled={busy}
              onCheckedChange={(enabled) =>
                setConfig((value) => ({ ...value, [name]: { ...value[name], enabled } }))
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs font-medium">
                Период, минут{' '}
                <Input
                  type="number"
                  min={5}
                  max={60}
                  value={minutes(config[name].intervalMs)}
                  disabled={busy}
                  onChange={(e) =>
                    setConfig((value) => ({
                      ...value,
                      [name]: { ...value[name], intervalMs: Number(e.target.value) * 60_000 },
                    }))
                  }
                />
                <span className="text-muted-foreground">
                  По умолчанию: {minutes(defaults[name].intervalMs)} мин
                </span>
              </label>
              <label className="space-y-1 text-xs font-medium">
                Таймаут, секунд{' '}
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={String(config[name].timeoutMs / 1000)}
                  disabled={busy}
                  onChange={(e) =>
                    setConfig((value) => ({
                      ...value,
                      [name]: { ...value[name], timeoutMs: Number(e.target.value) * 1000 },
                    }))
                  }
                />
                <span className="text-muted-foreground">
                  По умолчанию: {defaults[name].timeoutMs / 1000} с
                </span>
              </label>
              <label className="space-y-1 text-xs font-medium">
                Провалов до тревоги{' '}
                <Input
                  type="number"
                  min={2}
                  max={10}
                  value={String(config[name].consecutiveFailures)}
                  disabled={busy}
                  onChange={(e) =>
                    setConfig((value) => ({
                      ...value,
                      [name]: { ...value[name], consecutiveFailures: Number(e.target.value) },
                    }))
                  }
                />
                <span className="text-muted-foreground">
                  По умолчанию: {defaults[name].consecutiveFailures}
                </span>
              </label>
            </div>
          </div>
        ))}
        <div className="rounded-md border border-border/60 p-3 text-sm">
          <p className="font-medium">Rubitime</p>
          <p className="text-muted-foreground">
            Проба сейчас выведена из эксплуатации и не запускается; переключатель и параметры
            намеренно не показаны.
          </p>
        </div>
        <label className="block max-w-sm space-y-1 text-xs font-medium">
          Окно тишины до{' '}
          <Input
            type="datetime-local"
            value={config.quietUntil ? config.quietUntil.slice(0, 16) : ''}
            disabled={busy}
            onChange={(e) =>
              setConfig((value) => ({
                ...value,
                quietUntil: e.target.value ? new Date(e.target.value).toISOString() : null,
              }))
            }
          />
          <span className="text-muted-foreground">
            Текущее: {config.quietUntil ?? 'не установлено'}. По умолчанию: не установлено.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => void saveProbes()} disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить пробы'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void resetProbes()}
            disabled={busy}
          >
            Сбросить на дефолт
          </Button>
        </div>
        <div className="border-t border-border pt-5 space-y-3">
          <p className="text-sm font-medium">Служебный ящик для будущей IMAP-пробы</p>
          <p className="text-xs text-muted-foreground">
            IMAP, не POP3: чтение не забирает письма и позволяет искать их в папке. Проба в этой
            поставке не строится.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                [
                  ['Адрес', 'address', 'email'],
                  ['IMAP host', 'host', 'text'],
                ],
                [
                  ['Порт', 'port', 'number'],
                  ['Логин', 'login', 'text'],
                ],
                [['Папка', 'folder', 'text']],
              ] as Array<Array<[string, keyof Imap, string]>>
            )
              .flat()
              .map(([label, key, type]) => (
                <label key={key} className="space-y-1 text-xs font-medium">
                  {label}
                  <Input
                    type={type}
                    value={String(imap[key] ?? '')}
                    disabled={busy}
                    onChange={(e) =>
                      setImap((value) => ({
                        ...value,
                        [key]: key === 'port' ? Number(e.target.value) : e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            <label className="space-y-1 text-xs font-medium">
              Пароль
              <Input
                type="password"
                value={password}
                autoComplete="new-password"
                disabled={busy}
                placeholder={imap.hasStoredPassword ? '(оставьте пустым, чтобы не менять)' : ''}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void saveImap()}
            disabled={busy}
          >
            {busy ? 'Сохранение…' : 'Сохранить IMAP'}
          </Button>
        </div>
        {saved ? <p className="text-sm text-green-600">{saved}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
