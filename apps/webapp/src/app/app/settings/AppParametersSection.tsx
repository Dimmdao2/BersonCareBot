'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorField } from '@/shared/ui/doctor/DoctorField';
import { isValidSupportContactSetting } from '@/lib/url/isValidSupportContactSetting';
import { isValidIanaTimeZoneId } from '@/shared/timezone/ianaTimezonesForAdminUi';
import { patchAdminSetting } from './patchAdminSetting';
import { DoctorTimezoneSelect } from '@/shared/ui/doctor/DoctorTimezoneSelect';

export type AppParametersSectionProps = {
  supportContactUrl: string;
  appDisplayTimezone: string;
};

export function AppParametersSection({
  supportContactUrl,
  appDisplayTimezone,
}: AppParametersSectionProps) {
  const [support, setSupport] = useState(supportContactUrl);
  const [timezone, setTimezone] = useState(appDisplayTimezone);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const supportRaw = support.trim();
        if (supportRaw.length > 0 && !isValidSupportContactSetting(supportRaw)) {
          setError('Ссылка поддержки: укажите путь /app/… или URL https://… (http допустим в dev)');
          return;
        }
        const tzRaw = timezone.trim() || 'Europe/Moscow';
        if (!isValidIanaTimeZoneId(tzRaw)) {
          setError('Таймзона: выберите валидную зону IANA из списка');
          return;
        }
        const results = await Promise.all([
          patchAdminSetting('support_contact_url', supportRaw),
          patchAdminSetting('app_display_timezone', tzRaw),
        ]);
        if (results.some((r) => !r)) {
          setError('Не удалось сохранить часть настроек');
          return;
        }
        setSaved(true);
      } catch {
        setError('Ошибка при сохранении');
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Параметры приложения</CardTitle>
        <p className="text-xs text-muted-foreground">
          Значения хранятся в БД (<code className="rounded bg-muted px-1">system_settings</code>,
          scope admin), применяются без передеплоя.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Контакты и поддержка</p>
          <DoctorField
            label="Support contact (путь или URL)"
            htmlFor="app-support-contact"
            width="lg"
            hint="Путь вида /app/… (форма в приложении) или внешняя ссылка https://… Пустое — дефолт из кода."
          >
            <Input
              id="app-support-contact"
              type="text"
              placeholder="/app/patient/support или https://t.me/…"
              value={support}
              onChange={(e) => setSupport(e.target.value)}
              disabled={isPending}
            />
          </DoctorField>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Таймзона отображения записей</p>
          <div className="max-w-lg">
            <DoctorTimezoneSelect
              instanceId="app-display-timezone"
              inputId="app-display-timezone"
              aria-label="Таймзона приложения"
              value={timezone}
              onChange={setTimezone}
              disabled={isPending}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            IANA-зона для времени слотов и записей в кабинете. По умолчанию — Europe/Moscow.
          </span>
        </section>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
