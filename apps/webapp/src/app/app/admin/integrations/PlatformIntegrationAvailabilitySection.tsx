'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import {
  PLATFORM_INTEGRATION_CATALOG,
  parsePlatformIntegrationAvailabilityEnvelope,
  type PlatformIntegrationAvailability,
  type PlatformIntegrationId,
} from '@/modules/system-settings/platformIntegrationAvailability';

const SETTING_KEY = 'platform_integration_availability' as const;

export function PlatformIntegrationAvailabilitySection() {
  const [availability, setAvailability] = useState<PlatformIntegrationAvailability | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<PlatformIntegrationId | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/platform/settings', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: Array<{ key?: string; valueJson?: unknown }>;
        };
        if (!active || !response.ok || !data.ok || !Array.isArray(data.settings)) {
          throw new Error('settings_unavailable');
        }
        const row = data.settings.find((setting) => setting.key === SETTING_KEY);
        setAvailability(parsePlatformIntegrationAvailabilityEnvelope(row?.valueJson));
        setLoaded(true);
      })
      .catch(() => {
        if (active) toast.error('Не удалось загрузить глобальные рубильники интеграций');
      });
    return () => {
      active = false;
    };
  }, []);

  async function updateIntegration(id: PlatformIntegrationId, enabled: boolean): Promise<void> {
    if (availability === null) return;
    const previous = availability;
    const next: PlatformIntegrationAvailability = {
      version: 1,
      integrations: { ...availability.integrations, [id]: enabled },
    };
    setAvailability(next);
    setSaving(id);
    try {
      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: SETTING_KEY, value: next }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error('save_failed');
    } catch {
      setAvailability(previous);
      toast.error('Не удалось сохранить рубильник интеграции');
    } finally {
      setSaving(null);
    }
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Доступность интеграций для клиник</DoctorSectionTitle>
      </DoctorSectionHeader>
      <p className="text-sm text-muted-foreground">
        Глобальный рубильник определяет, существует ли интеграция для клиник вообще. Выключенная
        интеграция не должна показываться и настраиваться в клинике. Включение разрешает будущий
        клинический экран, но не выдаёт клинике платформенные секреты и не обходит тариф:
        собственные креды клиника добавляет локально, когда тариф это разрешает.
      </p>
      {availability ? (
        <div className="grid gap-4 md:grid-cols-2">
          {PLATFORM_INTEGRATION_CATALOG.map((integration) => (
            <div key={integration.id} className="flex flex-col gap-1">
              <LabeledSwitch
                label={integration.label}
                hint={integration.clinicHint}
                checked={availability.integrations[integration.id]}
                disabled={!loaded || saving !== null}
                onCheckedChange={(enabled) => void updateIntegration(integration.id, enabled)}
              />
              {integration.implementation === 'declared' ? (
                <p className="text-xs text-amber-700">
                  Только объявлено: включение сохраняет выбор платформы, но синхронизация пока не
                  запустится.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </DoctorSection>
  );
}
