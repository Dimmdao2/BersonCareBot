"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PatientReminderRuleJson } from "@/app/api/patient/reminders/reminderPatientJson";
import type { ReminderLinkedObjectType } from "@/modules/reminders/types";

const CHANNEL_STORAGE_KEY = "bc_patient_reminder_delivery_pref";

export type ReminderDeliveryChannelPref = "telegram" | "max";

function subscribeMobileViewport(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMobileViewportSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}

function minutesToTimeInput(m: number): string {
  const h = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

function timeInputToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

function readChannelPref(): ReminderDeliveryChannelPref {
  if (typeof window === "undefined") return "telegram";
  try {
    const raw = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
    if (raw === "max" || raw === "telegram") return raw;
  } catch {
    /* ignore */
  }
  return "telegram";
}

function writeChannelPref(ch: ReminderDeliveryChannelPref) {
  try {
    window.localStorage.setItem(CHANNEL_STORAGE_KEY, ch);
  } catch {
    /* ignore */
  }
}

function toggleDayMask(mask: string, index: number): string {
  const chars = mask.padEnd(7, "0").slice(0, 7).split("");
  chars[index] = chars[index] === "1" ? "0" : "1";
  return chars.join("");
}

export type ReminderCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedObjectType: ReminderLinkedObjectType;
  /** Для `custom` при создании можно передать пустую строку. */
  linkedObjectId: string;
  /** Подпись в превью (комплекс, раздел, заголовок своего напоминания). */
  contextTitle: string;
  existingRule: PatientReminderRuleJson | null;
  onSaved: () => void;
};

const DEFAULT_INTERVAL = 60;
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 21 * 60;
const DEFAULT_MASK = "1111111";

export function ReminderCreateDialog({
  open,
  onOpenChange,
  linkedObjectType,
  linkedObjectId,
  contextTitle,
  existingRule,
  onSaved,
}: ReminderCreateDialogProps) {
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);

  const [channel, setChannel] = useState<ReminderDeliveryChannelPref>("telegram");
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_INTERVAL);
  const [startTime, setStartTime] = useState(minutesToTimeInput(DEFAULT_START));
  const [endTime, setEndTime] = useState(minutesToTimeInput(DEFAULT_END));
  const [daysMask, setDaysMask] = useState(DEFAULT_MASK);
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customText, setCustomText] = useState("");

  const isEdit = Boolean(existingRule);
  const isCustom = linkedObjectType === "custom";

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSyncWarning(null);
    setChannel(readChannelPref());
    if (existingRule) {
      setIntervalMinutes(existingRule.intervalMinutes ?? DEFAULT_INTERVAL);
      setStartTime(minutesToTimeInput(existingRule.windowStartMinute));
      setEndTime(minutesToTimeInput(existingRule.windowEndMinute));
      setDaysMask(/^[01]{7}$/.test(existingRule.daysMask) ? existingRule.daysMask : DEFAULT_MASK);
      setEnabled(existingRule.enabled);
      setCustomTitle(existingRule.customTitle?.trim() ?? "");
      setCustomText(existingRule.customText?.trim() ?? "");
    } else {
      setIntervalMinutes(DEFAULT_INTERVAL);
      setStartTime(minutesToTimeInput(DEFAULT_START));
      setEndTime(minutesToTimeInput(DEFAULT_END));
      setDaysMask(DEFAULT_MASK);
      setEnabled(true);
      setCustomTitle("");
      setCustomText("");
    }
  }, [open, existingRule]);

  const previewText = useMemo(() => {
    const ws = timeInputToMinutes(startTime);
    const we = timeInputToMinutes(endTime);
    if (ws == null || we == null) return "Проверьте время.";
    const daysOn = daysMask
      .split("")
      .map((c, i) => (c === "1" ? WEEKDAY_LABELS[i] : null))
      .filter(Boolean)
      .join(", ");
    return `${startTime}–${endTime}, каждые ${intervalMinutes} мин. Дни: ${daysOn || "не выбраны"}. Канал: ${
      channel === "telegram" ? "Telegram" : "MAX"
    }.`;
  }, [startTime, endTime, intervalMinutes, daysMask, channel]);

  const handleChannel = useCallback((next: ReminderDeliveryChannelPref) => {
    setChannel(next);
    writeChannelPref(next);
  }, []);

  const handleSubmit = async () => {
    setError(null);
    setSyncWarning(null);
    const ws = timeInputToMinutes(startTime);
    const we = timeInputToMinutes(endTime);
    if (ws == null || we == null) {
      setError("Укажите время в формате ЧЧ:ММ.");
      return;
    }
    if (ws >= we) {
      setError("Начало окна должно быть раньше конца.");
      return;
    }
    if (!/^[01]{7}$/.test(daysMask)) {
      setError("Неверная маска дней.");
      return;
    }
    if (!daysMask.includes("1")) {
      setError("Выберите хотя бы один день недели.");
      return;
    }
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
      setError("Интервал от 1 до 1440 минут.");
      return;
    }

    if (isCustom) {
      const t = customTitle.trim();
      if (t.length < 1 || t.length > 140) {
        setError("Заголовок: от 1 до 140 символов.");
        return;
      }
      if (customText.length > 2000) {
        setError("Текст не длиннее 2000 символов.");
        return;
      }
    }

    const schedule = {
      intervalMinutes,
      windowStartMinute: ws,
      windowEndMinute: we,
      daysMask,
    };

    setSubmitting(true);
    try {
      if (existingRule) {
        const body: Record<string, unknown> = {
          schedule,
          enabled,
        };
        if (isCustom) {
          body.customTitle = customTitle.trim();
          body.customText = customText.trim() ? customText.trim() : null;
        }
        const res = await fetch(`/api/patient/reminders/${encodeURIComponent(existingRule.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          syncWarning?: string;
        };
        if (!res.ok || !data.ok) {
          setError(data.error === "not_found" ? "Правило не найдено." : "Не удалось сохранить.");
          return;
        }
        if (data.syncWarning) setSyncWarning(data.syncWarning);
      } else {
        const body: Record<string, unknown> =
          linkedObjectType === "custom"
            ? {
                linkedObjectType: "custom",
                customTitle: customTitle.trim(),
                customText: customText.trim() ? customText.trim() : null,
                enabled: true,
                schedule,
                preferredDeliveryChannel: channel,
              }
            : {
                linkedObjectType,
                linkedObjectId,
                enabled: true,
                schedule,
                preferredDeliveryChannel: channel,
              };
        const res = await fetch("/api/patient/reminders/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          syncWarning?: string;
        };
        if (!res.ok || !data.ok) {
          if (data.error === "not_found") {
            setError("Свяжите аккаунт с ботом, чтобы создавать напоминания.");
          } else {
            setError("Не удалось создать напоминание.");
          }
          return;
        }
        if (data.syncWarning) setSyncWarning(data.syncWarning);
      }
      onOpenChange(false);
      onSaved();
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  const formId = "reminder-create-form";

  const body = (
    <div className="flex flex-col gap-4 px-1 pb-1">
      {isCustom ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-ctitle`}>Заголовок</Label>
            <Input
              id={`${formId}-ctitle`}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              maxLength={140}
              disabled={submitting}
              placeholder="Например: Выпить воду"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-ctext`}>Текст (необязательно)</Label>
            <Textarea
              id={`${formId}-ctext`}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              maxLength={2000}
              disabled={submitting}
              rows={3}
              placeholder="Короткое напоминание"
            />
          </div>
        </div>
      ) : null}

      {isEdit ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/40 px-3 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="reminder-enabled" className="text-sm">
              Напоминание включено
            </Label>
            <p className="text-xs text-muted-foreground">Можно временно отключить без удаления.</p>
          </div>
          <Switch
            id="reminder-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={submitting}
          />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-start`}>Окно: с</Label>
          <Input
            id={`${formId}-start`}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-end`}>до</Label>
          <Input
            id={`${formId}-end`}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-interval`}>Интервал (минуты)</Label>
        <Input
          id={`${formId}-interval`}
          type="number"
          min={1}
          max={1440}
          value={intervalMinutes}
          onChange={(e) => setIntervalMinutes(Number(e.target.value))}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label>Дни недели</Label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, i) => {
            const on = daysMask[i] === "1";
            return (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                className={cn("min-w-11", !on && "text-muted-foreground")}
                onClick={() => setDaysMask((m) => toggleDayMask(m, i))}
                disabled={submitting}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Канал</Label>
        <p className="text-xs text-muted-foreground">
          Выбор сохраняется на этом устройстве. Уведомления уходят в мессенджер, с которым связан ваш аккаунт.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={channel === "telegram" ? "default" : "outline"}
            size="sm"
            onClick={() => handleChannel("telegram")}
            disabled={submitting}
          >
            Telegram
          </Button>
          <Button
            type="button"
            variant={channel === "max" ? "default" : "outline"}
            size="sm"
            onClick={() => handleChannel("max")}
            disabled={submitting}
          >
            MAX
          </Button>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Предпросмотр
            </span>
            <Badge variant="secondary" className="font-normal">
              {isCustom ? (customTitle.trim() || "Заголовок") : contextTitle}
            </Badge>
          </div>
          <p className="text-sm text-foreground">{previewText}</p>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {syncWarning && !error ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{syncWarning}</p>
      ) : null}
    </div>
  );

  const title = isEdit
    ? "Изменить напоминание"
    : isCustom
      ? "Своё напоминание"
      : "Напоминание";

  const footer = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
        Отмена
      </Button>
      <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
      </Button>
    </div>
  );

  if (isMobileViewport) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-6">
          <SheetHeader className="px-0 text-left">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {body}
          <SheetFooter className="px-0">{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body}
        <DialogFooter className="gap-2 sm:gap-0">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
