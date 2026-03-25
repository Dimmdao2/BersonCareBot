"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleReminderCategory, updateReminderRule } from "./actions";
import type { ReminderRule, ReminderCategory } from "@/modules/reminders/types";

const CATEGORY_LABELS: Record<ReminderCategory, string> = {
  appointment: "Запись на приём",
  lfk: "ЛФК",
  chat: "Чат",
  important: "Важные сообщения",
  broadcast: "Рассылки по темам",
};

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

function RuleCard({ rule }: { rule: ReminderRule }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    intervalMinutes: rule.intervalMinutes ?? 60,
    windowStartMinute: rule.windowStartMinute,
    windowEndMinute: rule.windowEndMinute,
    daysMask: rule.daysMask,
  });

  const handleToggle = (checked: boolean) => {
    setError(null);
    setSyncWarning(null);
    startTransition(async () => {
      const res = await toggleReminderCategory(rule.category, checked);
      if (!res.ok) setError(res.error);
      else if (res.syncWarning) setSyncWarning(res.syncWarning);
    });
  };

  const handleSave = () => {
    setError(null);
    setSyncWarning(null);
    startTransition(async () => {
      const res = await updateReminderRule({
        ruleId: rule.id,
        intervalMinutes: form.intervalMinutes,
        windowStartMinute: form.windowStartMinute,
        windowEndMinute: form.windowEndMinute,
        daysMask: form.daysMask,
      });
      if (!res.ok) setError(res.error);
      else {
        if (res.syncWarning) setSyncWarning(res.syncWarning);
        setEditOpen(false);
      }
    });
  };

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-medium leading-tight">
            {CATEGORY_LABELS[rule.category] ?? rule.category}
          </CardTitle>
          <Switch
            checked={rule.enabled}
            onCheckedChange={handleToggle}
            disabled={isPending}
            aria-label={`Включить напоминания: ${CATEGORY_LABELS[rule.category]}`}
          />
        </div>
      </CardHeader>

      {rule.enabled && (
        <CardContent className="px-4 pb-4 pt-0">
          <p className="text-xs text-muted-foreground mb-2">
            Расписание:{" "}
            {minutesToTime(rule.windowStartMinute)}–{minutesToTime(rule.windowEndMinute)},{" "}
            каждые {rule.intervalMinutes ?? "—"} мин.
          </p>

          {!editOpen ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={isPending}
            >
              Изменить расписание
            </Button>
          ) : (
            <div className="flex flex-col gap-3 mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-xs mb-1 block">Тихие часы: начало (мин. от полуночи)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1439}
                    value={form.windowStartMinute}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, windowStartMinute: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs mb-1 block">Тихие часы: конец</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.windowEndMinute}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, windowEndMinute: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Интервал (минуты)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.intervalMinutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, intervalMinutes: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={isPending}>
                  Сохранить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditOpen(false);
                    setError(null);
                  }}
                  disabled={isPending}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          {syncWarning && !error && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{syncWarning}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function ReminderRulesClient({
  rules,
  unseenCount = 0,
}: {
  rules: ReminderRule[];
  unseenCount?: number;
}) {
  const [isPending, startTransition] = useTransition();

  const handleMarkAllSeen = () => {
    startTransition(async () => {
      try {
        await fetch("/api/patient/reminders/mark-seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
      } catch {
        /* ignore */
      }
    });
  };

  if (rules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Напоминания ещё не настроены врачом. Обратитесь за помощью через чат.
      </p>
    );
  }

  return (
    <div>
      {unseenCount > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Непросмотрено: {unseenCount}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkAllSeen}
            disabled={isPending}
          >
            Отметить все как просмотренные
          </Button>
        </div>
      )}
      {rules.map((r) => (
        <RuleCard key={r.id} rule={r} />
      ))}
    </div>
  );
}
