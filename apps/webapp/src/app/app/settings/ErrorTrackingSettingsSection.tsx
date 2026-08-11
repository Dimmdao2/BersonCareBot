'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/shared/ui/doctor/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { DoctorSectionActions } from '@/shared/ui/doctor/DoctorSection';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Switch } from '@/shared/ui/doctor/primitives/switch';

type Props = Readonly<{
  initialEnabled: boolean;
  hasStoredDsn: boolean;
}>;

export function ErrorTrackingSettingsSection({ initialEnabled, hasStoredDsn }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [dsn, setDsn] = useState('');
  const [stored, setStored] = useState(hasStoredDsn);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(): void {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch('/api/platform/error-tracking', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled, dsn }),
        });
        const body = (await response.json()) as {
          ok?: boolean;
          config?: { hasStoredDsn?: boolean };
          error?: string;
        };
        if (!response.ok || body.ok !== true) {
          setMessage(
            body.error === 'invalid_dsn'
              ? 'Укажите корректный HTTP(S) DSN'
              : 'Не удалось сохранить',
          );
          return;
        }
        setStored(body.config?.hasStoredDsn === true);
        setDsn('');
        setMessage('Сохранено. Новая конфигурация применяется после перезапуска процессов.');
      } catch {
        setMessage('Не удалось сохранить');
      }
    });
  }

  return (
    <Card className="border-border/80">
      <CardHeader>
        <CardTitle className="text-base">Error tracking</CardTitle>
        <p className="text-xs text-muted-foreground">
          Только серверные ошибки без пользовательских данных, логов и трассировки.
        </p>
      </CardHeader>
      <CardContent className="flex max-w-xl flex-col gap-4">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Включить отправку ошибок</span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={isPending}
            aria-label="Error tracking"
          />
        </label>
        <DoctorField
          label="DSN"
          htmlFor="error-tracking-dsn"
          width="lg"
          hint="При включении DSN нужно ввести заново. Выключение очищает сохранённый DSN."
        >
          <Input
            id="error-tracking-dsn"
            type="password"
            value={dsn}
            onChange={(event) => setDsn(event.target.value)}
            placeholder={
              stored ? 'DSN сохранён; введите новый для замены' : 'https://public@example.test/1'
            }
            disabled={isPending}
            autoComplete="off"
            spellCheck={false}
          />
        </DoctorField>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        <DoctorSectionActions>
          <Button
            type="button"
            onClick={save}
            disabled={isPending || (enabled && dsn.trim().length === 0)}
          >
            Сохранить
          </Button>
        </DoctorSectionActions>
      </CardContent>
    </Card>
  );
}
