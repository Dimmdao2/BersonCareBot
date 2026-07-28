'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { DoctorColorPicker } from '@/shared/ui/doctor/DoctorColorPicker';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import {
  BOOKING_LOCATION_PALETTE_SETTING_KEY,
  DEFAULT_BOOKING_LOCATION_PALETTE,
  normalizeLocationHexColor,
  resolveBookingLocationPalette,
  type BookingLocationPalette,
} from '@/modules/booking-engine/locationPalette';

export function PlatformLocationPaletteSection() {
  const [palette, setPalette] = useState<BookingLocationPalette>(DEFAULT_BOOKING_LOCATION_PALETTE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

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
        const setting = data.settings.find(
          (item) => item.key === BOOKING_LOCATION_PALETTE_SETTING_KEY,
        );
        setPalette(resolveBookingLocationPalette(setting?.valueJson));
        setLoaded(true);
      })
      .catch(() => {
        if (active) toast.error('Не удалось загрузить цвета локаций');
      });
    return () => {
      active = false;
    };
  }, []);

  function updatePhysicalColor(index: number, value: string): void {
    const color = normalizeLocationHexColor(value);
    if (!color) return;
    setPalette((current) => ({
      ...current,
      physicalPalette: current.physicalPalette.map((item, itemIndex) =>
        itemIndex === index ? color : item,
      ),
    }));
  }

  function addPhysicalColor(): void {
    setPalette((current) => ({
      ...current,
      physicalPalette: [
        ...current.physicalPalette,
        DEFAULT_BOOKING_LOCATION_PALETTE.physicalPalette[
          current.physicalPalette.length % DEFAULT_BOOKING_LOCATION_PALETTE.physicalPalette.length
        ]!,
      ],
    }));
  }

  function removePhysicalColor(index: number): void {
    setPalette((current) =>
      current.physicalPalette.length <= 5
        ? current
        : {
            ...current,
            physicalPalette: current.physicalPalette.filter((_, itemIndex) => itemIndex !== index),
          },
    );
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const response = await fetch('/api/platform/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: BOOKING_LOCATION_PALETTE_SETTING_KEY, value: palette }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error('save_failed');
      toast.success('Цвета локаций сохранены');
    } catch {
      toast.error('Не удалось сохранить цвета локаций');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Цвета новых локаций</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Обычные локации</Label>
          <div className="flex flex-wrap gap-3">
            {palette.physicalPalette.map((color, index) => (
              <div key={`${index}-${color}`} className="flex items-center gap-1.5">
                <DoctorColorPicker
                  className="h-10 w-14"
                  label={`Цвет обычной локации ${index + 1}`}
                  value={color}
                  disabled={!loaded || saving}
                  onChange={(next) => updatePhysicalColor(index, next)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Удалить цвет обычной локации ${index + 1}`}
                  disabled={!loaded || saving || palette.physicalPalette.length <= 5}
                  onClick={() => removePhysicalColor(index)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!loaded || saving}
            onClick={addPhysicalColor}
          >
            Добавить цвет
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="booking-online-default-color">Онлайн</Label>
          <DoctorColorPicker
            id="booking-online-default-color"
            className="h-10 w-14"
            label="Цвет онлайн-локации"
            value={palette.online}
            disabled={!loaded || saving}
            onChange={(next) => {
              const online = normalizeLocationHexColor(next);
              if (online) setPalette((current) => ({ ...current, online }));
            }}
          />
        </div>
        <Button type="button" disabled={!loaded || saving} onClick={() => void save()}>
          Сохранить цвета
        </Button>
      </div>
    </DoctorSection>
  );
}
