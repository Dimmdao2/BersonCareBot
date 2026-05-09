"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dumbbell, FileText, Flame, Sparkles, Trash2 } from "lucide-react";
import { reminderRuleToPatientJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { routePaths } from "@/app-layer/routes/paths";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { patientCardClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ReminderCreateDialog } from "@/modules/reminders/components/ReminderCreateDialog";
import type { ReminderRule, ReminderCategory } from "@/modules/reminders/types";
import { toggleReminderCategory, patchPatientReminderScheduleBundle } from "./actions";

const CATEGORY_LABELS: Record<ReminderCategory, string> = {
  appointment: "Запись на приём",
  lfk: "ЛФК",
  chat: "Чат",
  important: "Важные сообщения",
  broadcast: "Рассылки по темам",
};

export type PersonalReminderIconKind = "lfk" | "warmup" | "page" | "custom";

export type PersonalReminderRowVM = {
  rule: ReminderRule;
  label: string;
  iconKind: PersonalReminderIconKind;
  stats: { done: number; skipped: number; snoozed: number };
};

function minutesToTime(m: number): string {
  const capped = Math.min(Math.max(0, m), 1440);
  const h = Math.floor(capped / 60)
    .toString()
    .padStart(2, "0");
  const min = (capped % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

function formatScheduleSummary(rule: ReminderRule): string {
  if (rule.scheduleType === "slots_v1" && rule.scheduleData?.timesLocal?.length) {
    const times = rule.scheduleData.timesLocal.join(", ");
    const q =
      rule.quietHoursStartMinute != null && rule.quietHoursEndMinute != null
        ? ` Тихие часы: ${minutesToTime(rule.quietHoursStartMinute)}–${minutesToTime(rule.quietHoursEndMinute)}.`
        : "";
    return `Слоты: ${times}.${q}`;
  }
  const q =
    rule.quietHoursStartMinute != null && rule.quietHoursEndMinute != null
      ? ` Тихие часы: ${minutesToTime(rule.quietHoursStartMinute)}–${minutesToTime(rule.quietHoursEndMinute)}.`
      : "";
  return `${minutesToTime(rule.windowStartMinute)}–${minutesToTime(rule.windowEndMinute)}, каждые ${rule.intervalMinutes ?? "—"} мин.${q}`;
}

const WEEKDAY_TOGGLE_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

function toggleDayMaskStr(mask: string, index: number): string {
  const chars = mask.padEnd(7, "0").slice(0, 7).split("");
  chars[index] = chars[index] === "1" ? "0" : "1";
  return chars.join("");
}

function legacyEditFormFromRule(rule: ReminderRule) {
  return {
    intervalMinutes: rule.intervalMinutes ?? 60,
    windowStartMinute: rule.windowStartMinute,
    windowEndMinute: rule.windowEndMinute,
    daysMask: /^[01]{7}$/.test(rule.daysMask) ? rule.daysMask : "1111111",
    quietEnabled:
      rule.quietHoursStartMinute != null && rule.quietHoursEndMinute != null,
    quietStart: rule.quietHoursStartMinute ?? 0,
    quietEnd: rule.quietHoursEndMinute ?? 1320,
  };
}

function TypeIcon({ kind }: { kind: PersonalReminderIconKind }) {
  const cls = "size-5 shrink-0 text-primary";
  switch (kind) {
    case "lfk":
      return <Dumbbell className={cls} aria-hidden />;
    case "warmup":
      return <Flame className={cls} aria-hidden />;
    case "page":
      return <FileText className={cls} aria-hidden />;
    default:
      return <Sparkles className={cls} aria-hidden />;
  }
}

function LegacyCategoryRuleCard({ rule }: { rule: ReminderRule }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(() => legacyEditFormFromRule(rule));

  const openEdit = () => {
    setForm(legacyEditFormFromRule(rule));
    setEditOpen(true);
  };

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
    if (form.windowStartMinute >= form.windowEndMinute) {
      setError("Начало окна должно быть меньше конца.");
      return;
    }
    if (!/^[01]{7}$/.test(form.daysMask) || !form.daysMask.includes("1")) {
      setError("Выберите дни недели.");
      return;
    }
    startTransition(async () => {
      const res = await patchPatientReminderScheduleBundle({
        ruleId: rule.id,
        schedule: {
          scheduleType: "interval_window",
          intervalMinutes: form.intervalMinutes,
          windowStartMinute: form.windowStartMinute,
          windowEndMinute: form.windowEndMinute,
          daysMask: form.daysMask,
          quietHoursStartMinute: form.quietEnabled ? form.quietStart : null,
          quietHoursEndMinute: form.quietEnabled ? form.quietEnd : null,
        },
      });
      if (!res.ok) setError(res.error);
      else {
        if (res.syncWarning) setSyncWarning(res.syncWarning);
        setEditOpen(false);
      }
    });
  };

  return (
    <Card className={cn(patientCardClass, "mb-3")}>
      <CardHeader className="px-4 pb-2 pt-4">
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
          <p className={cn(patientMutedTextClass, "mb-2 text-xs")}>
            Расписание: {formatScheduleSummary(rule)}
          </p>

          {!editOpen ? (
            <Button variant="outline" size="sm" onClick={openEdit} disabled={isPending}>
              Изменить расписание
            </Button>
          ) : (
            <div className="mt-2 flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs">Окно: начало (мин от полуночи)</Label>
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
                <div>
                  <Label className="mb-1 block text-xs">Окно: конец (мин 1–1440)</Label>
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
                <Label className="mb-1 block text-xs">Интервал (минуты)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={form.intervalMinutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, intervalMinutes: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Дни недели</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_TOGGLE_LABELS.map((label, i) => {
                    const on = form.daysMask[i] === "1";
                    return (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        className={cn("min-w-11", !on && "text-muted-foreground")}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            daysMask: toggleDayMaskStr(f.daysMask, i),
                          }))
                        }
                        disabled={isPending}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/80 px-3 py-2">
                <Switch
                  id={`quiet-${rule.id}`}
                  checked={form.quietEnabled}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, quietEnabled: checked }))
                  }
                  disabled={isPending}
                />
                <Label htmlFor={`quiet-${rule.id}`} className="text-xs font-normal">
                  Тихие часы
                </Label>
              </div>
              {form.quietEnabled ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs">Тихие: с (мин)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1439}
                      value={form.quietStart}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, quietStart: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">Тихие: до (мин)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={form.quietEnd}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, quietEnd: Number(e.target.value) }))
                      }
                    />
                  </div>
                </div>
              ) : null}
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

function PersonalReminderCard({
  row,
  onEdit,
  onPatched,
}: {
  row: PersonalReminderRowVM;
  onEdit: () => void;
  onPatched: () => void;
}) {
  const { rule, label, iconKind, stats } = row;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const patchEnabled = (checked: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/patient/reminders/${encodeURIComponent(rule.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) setError("Не удалось обновить");
      else onPatched();
    });
  };

  const handleDelete = () => {
    if (!window.confirm("Удалить это напоминание?")) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/patient/reminders/${encodeURIComponent(rule.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) setError("Не удалось удалить");
      else onPatched();
    });
  };

  return (
    <Card className={cn(patientCardClass, "mb-3 overflow-hidden")}>
      <CardHeader className="space-y-0 px-4 pb-2 pt-4">
        <div className="flex items-start gap-3">
          <TypeIcon kind={iconKind} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-medium leading-tight">{label}</CardTitle>
              <Switch
                checked={rule.enabled}
                onCheckedChange={patchEnabled}
                disabled={isPending}
                aria-label={`Включить: ${label}`}
              />
            </div>
            <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>{formatScheduleSummary(rule)}</p>
            <div className={cn(patientMutedTextClass, "mt-2 flex flex-wrap gap-2 text-xs")}>
              <span>
                <span className="font-medium text-[var(--patient-text-primary)]">{stats.done}</span> выполнено
              </span>
              <span>
                <span className="font-medium text-[var(--patient-text-primary)]">{stats.skipped}</span> пропущено
              </span>
              <span>
                <span className="font-medium text-[var(--patient-text-primary)]">{stats.snoozed}</span> отложено
              </span>
              <Badge variant="outline" className="font-normal">
                за 30 дней
              </Badge>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={isPending}>
                Изменить расписание
              </Button>
              <Link
                href={routePaths.patientReminderJournal(rule.id)}
                className="inline-flex h-8 items-center justify-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Полный журнал
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={isPending}
              >
                <Trash2 className="mr-1 size-4" aria-hidden />
                Удалить
              </Button>
            </div>
            {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

export function ReminderRulesClient({
  personalRows,
  legacyRules,
  unseenCount = 0,
}: {
  personalRows: PersonalReminderRowVM[];
  legacyRules: ReminderRule[];
  unseenCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [editRow, setEditRow] = useState<PersonalReminderRowVM | null>(null);

  const refresh = () => router.refresh();

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

  const openEditForRow = (row: PersonalReminderRowVM) => {
    setEditRow(row);
  };

  const renderEditDialog = () => {
    if (!editRow) return null;
    const r = editRow.rule;
    const lt = r.linkedObjectType;
    const json = reminderRuleToPatientJson(r);
    if (lt === "custom") {
      return (
        <ReminderCreateDialog
          open={Boolean(editRow)}
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          linkedObjectType="custom"
          linkedObjectId=""
          contextTitle={editRow.label}
          existingRule={json}
          onSaved={() => {
            setEditRow(null);
            refresh();
          }}
        />
      );
    }
    if (lt === "lfk_complex" && r.linkedObjectId) {
      return (
        <ReminderCreateDialog
          open={Boolean(editRow)}
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          linkedObjectType="lfk_complex"
          linkedObjectId={r.linkedObjectId}
          contextTitle={editRow.label}
          existingRule={json}
          onSaved={() => {
            setEditRow(null);
            refresh();
          }}
        />
      );
    }
    if (lt === "content_section" && r.linkedObjectId) {
      return (
        <ReminderCreateDialog
          open={Boolean(editRow)}
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          linkedObjectType="content_section"
          linkedObjectId={r.linkedObjectId}
          contextTitle={editRow.label}
          existingRule={json}
          onSaved={() => {
            setEditRow(null);
            refresh();
          }}
        />
      );
    }
    if (lt === "content_page" && r.linkedObjectId) {
      return (
        <ReminderCreateDialog
          open={Boolean(editRow)}
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          linkedObjectType="content_page"
          linkedObjectId={r.linkedObjectId}
          contextTitle={editRow.label}
          existingRule={json}
          onSaved={() => {
            setEditRow(null);
            refresh();
          }}
        />
      );
    }
    if (lt === "rehab_program" && r.linkedObjectId) {
      return (
        <ReminderCreateDialog
          open={Boolean(editRow)}
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          linkedObjectType="rehab_program"
          linkedObjectId={r.linkedObjectId}
          contextTitle={editRow.label}
          existingRule={json}
          onSaved={() => {
            setEditRow(null);
            refresh();
          }}
        />
      );
    }
    return null;
  };

  const isEmpty = personalRows.length === 0 && legacyRules.length === 0;

  return (
    <div>
      {unseenCount > 0 && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn(patientMutedTextClass, "text-xs")}>Непросмотрено: {unseenCount}</p>
          <Button size="sm" variant="outline" onClick={handleMarkAllSeen} disabled={isPending}>
            Отметить все как просмотренные
          </Button>
        </div>
      )}

      <div className="mb-4">
        <Button type="button" className="w-full sm:w-auto" onClick={() => setCustomOpen(true)}>
          Создать напоминание
        </Button>
      </div>

      <ReminderCreateDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        linkedObjectType="custom"
        linkedObjectId=""
        contextTitle="Своё напоминание"
        existingRule={null}
        onSaved={() => {
          setCustomOpen(false);
          refresh();
        }}
      />

      {isEmpty ? (
        <p className={cn(patientMutedTextClass, "py-4 text-center")}>
          Пока нет напоминаний. Добавьте своё или дождитесь настроек от врача.
        </p>
      ) : null}

      {personalRows.length > 0 ? (
        <>
          <h2 className="mb-2 text-sm font-semibold text-[var(--patient-text-primary)]">Мои напоминания</h2>
          {personalRows.map((row) => (
            <PersonalReminderCard
              key={row.rule.id}
              row={row}
              onEdit={() => openEditForRow(row)}
              onPatched={refresh}
            />
          ))}
        </>
      ) : null}

      {legacyRules.length > 0 ? (
        <>
          <h2 className="mb-2 mt-4 text-sm font-semibold text-[var(--patient-text-primary)]">Категории от врача</h2>
          <p className={cn(patientMutedTextClass, "mb-3 text-xs")}>
            Общие напоминания по типам сообщений. Управляются врачом и синхронизируются с ботом.
          </p>
          {legacyRules.map((r) => (
            <LegacyCategoryRuleCard key={r.id} rule={r} />
          ))}
        </>
      ) : null}

      {renderEditDialog()}
    </div>
  );
}
