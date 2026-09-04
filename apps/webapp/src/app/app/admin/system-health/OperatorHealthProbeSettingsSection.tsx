'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import {
  OPERATOR_HEALTH_PROBE_DEFAULT_VALUE,
  OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_DURATION_MS,
} from '@/modules/system-settings/operatorHealthProbeConfig';

type ProbeName = 'max' | 'telegram' | 'google_calendar';
type ProbeConfig = {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  consecutiveFailures: number;
};
type EmailProbeConfig = {
  intervalMs: number;
  timeoutMs: number;
  roundTripDeadlineMs: number;
  retentionMs: number;
  cleanupIntervalMs: number;
};
type Config = Record<ProbeName, ProbeConfig> & {
  email: EmailProbeConfig;
  quietWindowMaxDurationMs: number;
  quietUntil: string | null;
};
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
  email: { ...OPERATOR_HEALTH_PROBE_DEFAULT_VALUE.email },
  quietWindowMaxDurationMs: OPERATOR_HEALTH_PROBE_DEFAULT_VALUE.quietWindowMaxDurationMs,
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
  const mail = raw.email;
  if (mail && typeof mail === 'object' && !Array.isArray(mail)) {
    const email = mail as Record<string, unknown>;
    config.email = {
      intervalMs:
        typeof email.intervalMs === 'number' ? email.intervalMs : defaults.email.intervalMs,
      timeoutMs: typeof email.timeoutMs === 'number' ? email.timeoutMs : defaults.email.timeoutMs,
      roundTripDeadlineMs:
        typeof email.roundTripDeadlineMs === 'number'
          ? email.roundTripDeadlineMs
          : defaults.email.roundTripDeadlineMs,
      retentionMs:
        typeof email.retentionMs === 'number' ? email.retentionMs : defaults.email.retentionMs,
      cleanupIntervalMs:
        typeof email.cleanupIntervalMs === 'number'
          ? email.cleanupIntervalMs
          : defaults.email.cleanupIntervalMs,
    };
  }
  config.quietWindowMaxDurationMs =
    typeof raw.quietWindowMaxDurationMs === 'number'
      ? raw.quietWindowMaxDurationMs
      : defaults.quietWindowMaxDurationMs;
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
const hours = (milliseconds: number) => String(milliseconds / 3_600_000);

export function OperatorHealthProbeSettingsSection() {
  const [config, setConfig] = useState<Config>(defaults);
  const [imap, setImap] = useState<Imap>(emptyImap);
  const [password, setPassword] = useState('');
  /** Только отказ первичного чтения и валидация поля; исход действий уходит во всплывающее уведомление. */
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // Owner 27.07: «ЗНАЧЕНИЕ ПО УМОЛЧАНИЮ 2 часа» — the field opens pre-filled, the cap (24 h) is separate.
  const [quietAmount, setQuietAmount] = useState(
    String(OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_DURATION_MS / 3_600_000),
  );
  const [quietUnit, setQuietUnit] = useState<'minutes' | 'hours'>('hours');

  useEffect(() => {
    void apiJson<{ ok?: boolean; settings: Array<{ key: string; valueJson: unknown }> }>(
      '/api/admin/settings',
      { credentials: 'include' },
    )
      .then(({ settings }) => {
        const nextConfig = asConfig(settingValue(settings, 'operator_health_probe_config'));
        setConfig(nextConfig);
        if (nextConfig.quietUntil) {
          const remaining = Math.max(0, Date.parse(nextConfig.quietUntil) - Date.now());
          setQuietUnit(remaining >= 3_600_000 && remaining % 3_600_000 === 0 ? 'hours' : 'minutes');
          setQuietAmount(
            remaining >= 3_600_000 && remaining % 3_600_000 === 0
              ? hours(remaining)
              : minutes(remaining),
          );
        }
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
    try {
      await apiJson('/api/admin/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'operator_health_probe_config', value: { value: config } }),
      });
      toast.success('Настройки проб сохранены.');
    } catch (e) {
      toast.error(
        `Настройки проб не сохранены: ${e instanceof Error ? e.message : 'проверьте значения и повторите'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetProbes() {
    setBusy(true);
    try {
      await apiJson('/api/admin/settings', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'operator_health_probe_config' }),
      });
      setConfig(defaults);
      setQuietAmount(String(OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_DURATION_MS / 3_600_000));
      setResetConfirmOpen(false);
      toast.success('Сброшено: снова действуют значения по умолчанию из кода.');
    } catch (e) {
      toast.error(`Не удалось сбросить настройки: ${e instanceof Error ? e.message : 'повторите'}`);
    } finally {
      setBusy(false);
    }
  }

  function updateQuietWindow(amount: string, unit: 'minutes' | 'hours') {
    setQuietAmount(amount);
    setQuietUnit(unit);
    const value = Number(amount);
    const durationMs =
      Number.isFinite(value) && value > 0 ? value * (unit === 'hours' ? 3_600_000 : 60_000) : 0;
    setConfig((current) => ({
      ...current,
      quietUntil: durationMs > 0 ? new Date(Date.now() + durationMs).toISOString() : null,
    }));
  }

  async function saveImap() {
    const port = Number.parseInt(String(imap.port), 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('Порт IMAP должен быть числом от 1 до 65535. Исправьте порт и сохраните снова.');
      return;
    }
    setBusy(true);
    setError(null);
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
      toast.success('Параметры служебного IMAP-ящика сохранены.');
    } catch (e) {
      toast.error(
        `IMAP-настройки не сохранены: ${e instanceof Error ? e.message : 'проверьте поля и повторите'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Настройка проб каналов</CardTitle>
        <CardDescription>
          Здесь живут параметры проб и служебного IMAP-ящика; показания здоровья системы находятся
          на отдельном экране.
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
        <div className="rounded-md border border-border/60 p-3 space-y-3">
          <p className="text-sm font-medium">Почтовая проба</p>
          <p className="text-xs text-muted-foreground">
            Настройки сохранены заранее; сама проба почты ещё не запущена.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ['Период, минут', 'intervalMs', 5, 60, minutes],
                ['Таймаут, секунд', 'timeoutMs', 30, 120, (v: number) => String(v / 1000)],
                ['Письмо не дошло за, минут', 'roundTripDeadlineMs', 1, 15, minutes],
                [
                  'Хранить служебную почту, дней',
                  'retentionMs',
                  1,
                  30,
                  (v: number) => String(v / 86_400_000),
                ],
                [
                  'Очищать раз в, дней',
                  'cleanupIntervalMs',
                  1,
                  7,
                  (v: number) => String(v / 86_400_000),
                ],
              ] as const
            ).map(([label, key, min, max, format]) => (
              <label key={key} className="space-y-1 text-xs font-medium">
                {label}
                <Input
                  type="number"
                  min={min}
                  max={max}
                  value={format(config.email[key])}
                  disabled={busy}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    const multiplier =
                      key === 'timeoutMs'
                        ? 1_000
                        : key === 'retentionMs' || key === 'cleanupIntervalMs'
                          ? 86_400_000
                          : 60_000;
                    setConfig((current) => ({
                      ...current,
                      email: { ...current.email, [key]: value * multiplier },
                    }));
                  }}
                />
                <span className="text-muted-foreground">
                  По умолчанию: {format(defaults.email[key])}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium">Окно тишины</p>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={Math.floor(
                config.quietWindowMaxDurationMs / (quietUnit === 'hours' ? 3_600_000 : 60_000),
              )}
              value={quietAmount}
              placeholder="Например, 10"
              disabled={busy}
              onChange={(event) => updateQuietWindow(event.target.value, quietUnit)}
            />
            <Select
              value={quietUnit}
              onValueChange={(value) =>
                updateQuietWindow(quietAmount, value as 'minutes' | 'hours')
              }
            >
              <SelectTrigger aria-label="Единица окна тишины" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Минуты</SelectItem>
                <SelectItem value="hours">Часы</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Текущее: {config.quietUntil ?? 'не установлено'}. Пустое значение снимает тишину;
            потолок задаётся в настройках и ограничен сервером.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => void saveProbes()} disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить пробы'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сбросить настройки проб?</DialogTitle>
            <DialogDescription>
              Будут удалены сохранённые параметры MAX, Telegram, Google Calendar, почтовой пробы и
              окна тишины. Снова начнут действовать значения по умолчанию из кода: внешние пробы раз
              в 10 минут, почтовая — раз в 15 минут, тишина выключена.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetConfirmOpen(false)}
              disabled={busy}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void resetProbes()}
              disabled={busy}
            >
              {busy ? 'Сброс…' : 'Сбросить на дефолт'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
