'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';

type SecretSettingInputProps<T extends string> = Readonly<{
  title: string;
  description: string;
  settingKey: T;
  configured: boolean;
  saveSetting: (key: T, value: string) => Promise<void>;
  configuredLabel?: string;
  unconfiguredLabel?: string;
  webhookPath?: string | null;
}>;

/** Write-only credential input shared by platform and clinic settings. */
export function SecretSettingInput<T extends string>({
  title,
  description,
  settingKey,
  configured,
  saveSetting,
  configuredLabel = 'Подключён',
  unconfiguredLabel = 'Не подключён',
  webhookPath,
}: SecretSettingInputProps<T>) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        <Input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={saved ? 'Сохранён — введите новый для замены' : 'Введите credential'}
          autoComplete="new-password"
          spellCheck={false}
          disabled={pending}
        />
        <Button
          type="button"
          size="sm"
          disabled={pending || value.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await saveSetting(settingKey, value.trim());
                setValue('');
                setSaved(true);
              } catch {
                setError('Не удалось сохранить credential');
              }
            })
          }
        >
          Сохранить
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {saved ? configuredLabel : unconfiguredLabel}
      </p>
      {webhookPath ? (
        <p className="break-all text-xs text-muted-foreground">
          Endpoint webhook: <code>{webhookPath}</code>
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
