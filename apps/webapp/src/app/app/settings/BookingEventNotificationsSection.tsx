"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  defaultBookingLifecycleNotificationsSettings,
  type BookingLifecycleNotificationEventKey,
  type BookingLifecycleNotificationsSettings,
} from "@/modules/booking-notifications/settings";
import { patchAdminSetting } from "./patchAdminSetting";

const EVENT_LABELS: Record<BookingLifecycleNotificationEventKey, string> = {
  "booking.created": "Новая запись",
  "booking.cancelled": "Отмена",
  "booking.rescheduled": "Перенос",
  "booking.payment_captured": "Оплата",
};

export function BookingEventNotificationsSection() {
  const [settings, setSettings] = useState<BookingLifecycleNotificationsSettings>(
    defaultBookingLifecycleNotificationsSettings(),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    const json = (await res.json()) as {
      ok?: boolean;
      settings?: Array<{ key: string; valueJson: unknown }>;
    };
    if (!json.ok) {
      setError("load_failed");
      return;
    }
    const row = json.settings?.find((s) => s.key === "booking_lifecycle_notifications");
    const inner =
      row?.valueJson && typeof row.valueJson === "object" && "value" in (row.valueJson as object)
        ? (row.valueJson as { value: unknown }).value
        : row?.valueJson;
    const { parseBookingLifecycleNotificationsSettings } = await import(
      "@/modules/booking-notifications/settings"
    );
    setSettings(parseBookingLifecycleNotificationsSettings(inner ?? null));
    setError(null);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function updateEvent(
    key: BookingLifecycleNotificationEventKey,
    patch: Partial<BookingLifecycleNotificationsSettings["events"][BookingLifecycleNotificationEventKey]>,
  ) {
    setSettings((prev) => ({
      events: {
        ...prev.events,
        [key]: { ...prev.events[key], ...patch },
      },
    }));
  }

  function save() {
    startTransition(async () => {
      const ok = await patchAdminSetting("booking_lifecycle_notifications", { events: settings.events });
      if (!ok) setError("Не удалось сохранить");
      else await load();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Уведомления по записям</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {(Object.keys(EVENT_LABELS) as BookingLifecycleNotificationEventKey[]).map((key) => {
          const row = settings.events[key];
          return (
            <div key={key} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
              <p className="text-sm font-medium sm:col-span-2">{EVENT_LABELS[key]}</p>
              <div className="flex items-center gap-2">
                <Switch checked={row.enabled} onCheckedChange={(v) => updateEvent(key, { enabled: v })} />
                <Label>Включено</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={row.notifyPatient}
                  disabled={!row.enabled}
                  onCheckedChange={(v) => updateEvent(key, { notifyPatient: v })}
                />
                <Label>Пациент</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={row.notifyStaff}
                  disabled={!row.enabled}
                  onCheckedChange={(v) => updateEvent(key, { notifyStaff: v })}
                />
                <Label>Персонал</Label>
              </div>
            </div>
          );
        })}
        <Button type="button" disabled={pending} onClick={save}>
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
