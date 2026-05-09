"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Activity, Dumbbell, FileText, Flame, Sparkles, Trash2 } from "lucide-react";
import { reminderRuleToPatientJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { routePaths } from "@/app-layer/routes/paths";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  patientHeroBookingSectionClass,
  patientListItemClass,
  patientMutedTextClass,
  patientSectionTitleNormalClass,
} from "@/shared/ui/patientVisual";
import { Switch } from "@/components/ui/switch";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReminderCreateDialog } from "@/modules/reminders/components/ReminderCreateDialog";
import type { ReminderRule, ReminderCategory } from "@/modules/reminders/types";
import { clampIntervalMinutes } from "@/modules/reminders/reminderIntervalBounds";
import { formatReminderMinuteOfDayToHhMm } from "@/modules/reminders/reminderScheduleFormat";
import { summarizeReminderForCalendarDay } from "@/modules/reminders/summarizeReminderForCalendarDay";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { toggleReminderCategory } from "./actions";
import { LegacyReminderScheduleDialog } from "./LegacyReminderScheduleDialog";

const CATEGORY_LABELS: Record<ReminderCategory, string> = {
  appointment: "Запись на приём",
  lfk: "Уведомления по занятиям",
  chat: "Чат",
  important: "Важные сообщения",
  broadcast: "Рассылки по темам",
};

export type PersonalReminderIconKind = "lfk" | "rehab" | "warmup" | "page" | "custom";

export type PersonalReminderRowVM = {
  rule: ReminderRule;
  label: string;
  iconKind: PersonalReminderIconKind;
  stats: { done: number; skipped: number; snoozed: number };
};

function formatScheduleSummary(rule: ReminderRule): string {
  if (rule.scheduleType === "slots_v1" && rule.scheduleData?.timesLocal?.length) {
    const times = rule.scheduleData.timesLocal.join(", ");
    const df = rule.scheduleData.dayFilter;
    const dayHint =
      df === "weekdays"
        ? "Пн–Пт"
        : df === "weekly_mask"
          ? "по выбранным дням"
          : df === "every_n_days"
            ? "по графику «раз в N дней»"
            : "";
    const q =
      rule.quietHoursStartMinute != null && rule.quietHoursEndMinute != null
        ? ` Тихие часы: ${formatReminderMinuteOfDayToHhMm(rule.quietHoursStartMinute)}–${formatReminderMinuteOfDayToHhMm(rule.quietHoursEndMinute)}.`
        : "";
    return `Слоты: ${times}${dayHint ? `. ${dayHint}` : ""}.${q}`;
  }
  const q =
    rule.quietHoursStartMinute != null && rule.quietHoursEndMinute != null
      ? ` Тихие часы: ${formatReminderMinuteOfDayToHhMm(rule.quietHoursStartMinute)}–${formatReminderMinuteOfDayToHhMm(rule.quietHoursEndMinute)}.`
      : "";
  const interval = clampIntervalMinutes(rule.intervalMinutes ?? 60);
  return `${formatReminderMinuteOfDayToHhMm(rule.windowStartMinute)}–${formatReminderMinuteOfDayToHhMm(rule.windowEndMinute)}, каждые ${interval} мин.${q}`;
}

function TypeIcon({ kind }: { kind: PersonalReminderIconKind }) {
  const cls = "size-5 shrink-0 text-primary";
  switch (kind) {
    case "lfk":
      return <Dumbbell className={cls} aria-hidden />;
    case "rehab":
      return <Activity className={cls} aria-hidden />;
    case "warmup":
      return <Flame className={cls} aria-hidden />;
    case "page":
      return <FileText className={cls} aria-hidden />;
    default:
      return <Sparkles className={cls} aria-hidden />;
  }
}

function LegacyCategoryRuleCard({ rule }: { rule: ReminderRule }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const handleToggle = (checked: boolean) => {
    setError(null);
    setSyncWarning(null);
    startTransition(async () => {
      const res = await toggleReminderCategory(rule.category, checked);
      if (!res.ok) setError(res.error);
      else if (res.syncWarning) setSyncWarning(res.syncWarning);
    });
  };

  return (
    <Card className={cn(patientListItemClass, "mb-3")}>
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

          <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)} disabled={isPending}>
            Изменить расписание
          </Button>

          <LegacyReminderScheduleDialog
            rule={rule}
            categoryLabel={CATEGORY_LABELS[rule.category] ?? rule.category}
            open={scheduleOpen}
            onOpenChange={setScheduleOpen}
            onSaved={() => {
              setScheduleOpen(false);
              refresh();
            }}
          />

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
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  const confirmDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/patient/reminders/${encodeURIComponent(rule.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Не удалось удалить");
        return;
      }
      setDeleteOpen(false);
      onPatched();
    });
  };

  return (
    <>
    <Card className={cn(patientListItemClass, "mb-3 overflow-hidden")}>
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
                className={cn(
                  buttonVariants({ variant: "link", size: "sm" }),
                  "h-auto min-h-8 px-2 py-1 text-primary",
                )}
              >
                Журнал
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
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

    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent className="border-[var(--patient-border)] bg-[var(--patient-card-bg)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Удалить напоминание?</DialogTitle>
          <DialogDescription>Это действие нельзя отменить.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={isPending}>
            Отмена
          </Button>
          <Button type="button" variant="destructive" onClick={confirmDelete} disabled={isPending}>
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export function ReminderRulesClient({
  personalRows,
  legacyRules,
  unseenCount = 0,
  activeProgram = null,
  warmupsSectionAvailable = false,
  warmupsSectionTitle = "Разминки",
  rehabRuleForBlock = null,
  warmupRuleForBlock = null,
  rehabBlockStats = null,
  warmupBlockStats = null,
  calendarDateKey = "",
  patientCalendarDayIana = "Europe/Moscow",
}: {
  personalRows: PersonalReminderRowVM[];
  legacyRules: ReminderRule[];
  unseenCount?: number;
  activeProgram?: { id: string; title: string } | null;
  warmupsSectionAvailable?: boolean;
  warmupsSectionTitle?: string;
  rehabRuleForBlock?: ReminderRule | null;
  warmupRuleForBlock?: ReminderRule | null;
  rehabBlockStats?: { done: number; skipped: number; snoozed: number } | null;
  warmupBlockStats?: { done: number; skipped: number; snoozed: number } | null;
  calendarDateKey?: string;
  patientCalendarDayIana?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [editRow, setEditRow] = useState<PersonalReminderRowVM | null>(null);
  const [rehabDialogOpen, setRehabDialogOpen] = useState(false);
  const [warmupDialogOpen, setWarmupDialogOpen] = useState(false);
  const [blockDeleteTarget, setBlockDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const refresh = () => router.refresh();

  const hiddenIds = new Set<string>();
  if (rehabRuleForBlock) hiddenIds.add(rehabRuleForBlock.id);
  if (warmupRuleForBlock) hiddenIds.add(warmupRuleForBlock.id);
  const personalRowsMain = personalRows.filter((row) => !hiddenIds.has(row.rule.id));

  const rehabSummary =
    activeProgram ?
      rehabRuleForBlock ?
        summarizeReminderForCalendarDay(rehabRuleForBlock, calendarDateKey, patientCalendarDayIana)
      : ""
    : "";

  const rehabCalendarLine =
    activeProgram ?
      rehabRuleForBlock ?
        rehabSummary
      : "Настройте время, и бот напомнит"
    : "";

  const warmupSummary =
    warmupsSectionAvailable ?
      warmupRuleForBlock ?
        summarizeReminderForCalendarDay(warmupRuleForBlock, calendarDateKey, patientCalendarDayIana)
      : ""
    : "";

  const warmupCalendarLine =
    warmupsSectionAvailable ?
      warmupRuleForBlock ?
        warmupSummary
      : "Настройте время, и бот напомнит"
    : "";

  const [blockPending, startBlock] = useTransition();

  const patchRuleEnabled = (ruleId: string, checked: boolean) => {
    startBlock(async () => {
      const res = await fetch(`/api/patient/reminders/${encodeURIComponent(ruleId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) toast.error("Не удалось обновить");
      else refresh();
    });
  };

  const confirmBlockDelete = () => {
    if (!blockDeleteTarget) return;
    const id = blockDeleteTarget.id;
    startBlock(async () => {
      const res = await fetch(`/api/patient/reminders/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        toast.error("Не удалось удалить");
        return;
      }
      setBlockDeleteTarget(null);
      refresh();
    });
  };

  const handleMarkAllSeen = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/patient/reminders/mark-seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (!res.ok || !data.ok) {
          toast.error("Не удалось обновить статус.");
          return;
        }
        toast.success("Отмечено как просмотренные.");
        refresh();
      } catch {
        toast.error("Сеть недоступна.");
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

  const showEmptyHint =
    personalRowsMain.length === 0 &&
    legacyRules.length === 0 &&
    !activeProgram &&
    !warmupsSectionAvailable;

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

      {activeProgram ? (
        <section id="patient-reminders-rehab" className={cn(patientHeroBookingSectionClass, "mb-4 !gap-3")}>
          <h2 className={patientSectionTitleNormalClass}>Программа реабилитации</h2>
          <p className={cn(patientMutedTextClass, "text-sm")}>Активная программа: {activeProgram.title}</p>
          <p className={cn(patientMutedTextClass, "text-sm")}>Сегодня: {rehabCalendarLine}</p>
          {rehabRuleForBlock ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--patient-text-primary)]">{formatScheduleSummary(rehabRuleForBlock)}</p>
              {rehabBlockStats ? (
                <div className={cn(patientMutedTextClass, "flex flex-wrap gap-2 text-xs")}>
                  <span>
                    <span className="font-medium text-[var(--patient-text-primary)]">{rehabBlockStats.done}</span> выполнено
                  </span>
                  <span>
                    <span className="font-medium text-[var(--patient-text-primary)]">{rehabBlockStats.skipped}</span> пропущено
                  </span>
                  <span>
                    <span className="font-medium text-[var(--patient-text-primary)]">{rehabBlockStats.snoozed}</span> отложено
                  </span>
                  <Badge variant="outline" className="font-normal">
                    за 30 дней
                  </Badge>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-[var(--patient-text-primary)]">Включено</span>
                <Switch
                  checked={rehabRuleForBlock.enabled}
                  onCheckedChange={(c) => patchRuleEnabled(rehabRuleForBlock.id, c)}
                  disabled={blockPending}
                  aria-label="Включить напоминание программы"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={routePaths.patientReminderJournal(rehabRuleForBlock.id)}
                  className={cn(
                    buttonVariants({ variant: "link", size: "sm" }),
                    "h-auto min-h-8 px-2 py-1 text-primary",
                  )}
                >
                  Журнал
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={blockPending}
                  onClick={() =>
                    setBlockDeleteTarget({ id: rehabRuleForBlock.id, title: activeProgram.title })
                  }
                >
                  Удалить
                </Button>
              </div>
            </div>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setRehabDialogOpen(true)}>
            {rehabRuleForBlock ? "Изменить" : "Создать напоминание"}
          </Button>
          <ReminderCreateDialog
            open={rehabDialogOpen}
            onOpenChange={setRehabDialogOpen}
            linkedObjectType="rehab_program"
            linkedObjectId={activeProgram.id}
            contextTitle={activeProgram.title}
            existingRule={rehabRuleForBlock ? reminderRuleToPatientJson(rehabRuleForBlock) : null}
            onSaved={() => {
              setRehabDialogOpen(false);
              refresh();
            }}
          />
        </section>
      ) : null}

      {warmupsSectionAvailable ? (
        <section id="patient-reminders-warmups" className={cn(patientHeroBookingSectionClass, "mb-4 !gap-3")}>
          <h2 className={patientSectionTitleNormalClass}>{warmupsSectionTitle}</h2>
          <p className={cn(patientMutedTextClass, "text-sm")}>Сегодня: {warmupCalendarLine}</p>
          {warmupRuleForBlock ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--patient-text-primary)]">{formatScheduleSummary(warmupRuleForBlock)}</p>
              {warmupBlockStats ? (
                <div className={cn(patientMutedTextClass, "flex flex-wrap gap-2 text-xs")}>
                  <span>
                    <span className="font-medium text-[var(--patient-text-primary)]">{warmupBlockStats.done}</span> выполнено
                  </span>
                  <span>
                    <span className="font-medium text-[var(--patient-text-primary)]">{warmupBlockStats.skipped}</span> пропущено
                  </span>
                  <span>
                    <span className="font-medium text-[var(--patient-text-primary)]">{warmupBlockStats.snoozed}</span> отложено
                  </span>
                  <Badge variant="outline" className="font-normal">
                    за 30 дней
                  </Badge>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-[var(--patient-text-primary)]">Включено</span>
                <Switch
                  checked={warmupRuleForBlock.enabled}
                  onCheckedChange={(c) => patchRuleEnabled(warmupRuleForBlock.id, c)}
                  disabled={blockPending}
                  aria-label={`Включить: ${warmupsSectionTitle}`}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={routePaths.patientReminderJournal(warmupRuleForBlock.id)}
                  className={cn(
                    buttonVariants({ variant: "link", size: "sm" }),
                    "h-auto min-h-8 px-2 py-1 text-primary",
                  )}
                >
                  Журнал
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={blockPending}
                  onClick={() =>
                    setBlockDeleteTarget({ id: warmupRuleForBlock.id, title: warmupsSectionTitle })
                  }
                >
                  Удалить
                </Button>
              </div>
            </div>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setWarmupDialogOpen(true)}>
            {warmupRuleForBlock ? "Изменить" : "Создать напоминание"}
          </Button>
          <ReminderCreateDialog
            open={warmupDialogOpen}
            onOpenChange={setWarmupDialogOpen}
            linkedObjectType="content_section"
            linkedObjectId={DEFAULT_WARMUPS_SECTION_SLUG}
            contextTitle={warmupsSectionTitle}
            existingRule={warmupRuleForBlock ? reminderRuleToPatientJson(warmupRuleForBlock) : null}
            onSaved={() => {
              setWarmupDialogOpen(false);
              refresh();
            }}
          />
        </section>
      ) : null}

      {personalRowsMain.length > 0 ? (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className={patientSectionTitleNormalClass}>Мои напоминания</h2>
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setCustomOpen(true)}>
              Создать
            </Button>
          </div>
          {personalRowsMain.map((row) => (
            <PersonalReminderCard
              key={row.rule.id}
              row={row}
              onEdit={() => openEditForRow(row)}
              onPatched={refresh}
            />
          ))}
        </>
      ) : null}

      {personalRowsMain.length === 0 ? (
        <div className="mb-4 mt-2">
          <Button type="button" className="w-full sm:w-auto" onClick={() => setCustomOpen(true)}>
            Создать напоминание
          </Button>
        </div>
      ) : null}

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

      {showEmptyHint ? (
        <p className={cn(patientMutedTextClass, "py-4 text-center")}>
          Пока нет напоминаний. Добавьте своё или дождитесь настроек клиники.
        </p>
      ) : null}

      {legacyRules.length > 0 ? (
        <>
          <h2 className="mb-2 mt-4 text-sm font-semibold text-[var(--patient-text-primary)]">Системные уведомления</h2>
          <p className={cn(patientMutedTextClass, "mb-3 text-xs")}>
            Напоминания по типам сообщений клиники. Расписание можно настроить под себя.
          </p>
          {legacyRules.map((r) => (
            <LegacyCategoryRuleCard key={r.id} rule={r} />
          ))}
        </>
      ) : null}

      <Dialog
        open={blockDeleteTarget != null}
        onOpenChange={(o) => {
          if (!o) setBlockDeleteTarget(null);
        }}
      >
        <DialogContent className="border-[var(--patient-border)] bg-[var(--patient-card-bg)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить напоминание?</DialogTitle>
            <DialogDescription>
              {blockDeleteTarget?.title
                ? `«${blockDeleteTarget.title}» — это действие нельзя отменить.`
                : "Это действие нельзя отменить."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBlockDeleteTarget(null)} disabled={blockPending}>
              Отмена
            </Button>
            <Button type="button" variant="destructive" onClick={confirmBlockDelete} disabled={blockPending}>
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {renderEditDialog()}
    </div>
  );
}
