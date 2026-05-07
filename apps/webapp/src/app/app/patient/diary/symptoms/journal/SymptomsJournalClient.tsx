"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, useMemo } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { routePaths } from "@/app-layer/routes/paths";
import type { StatsPeriod } from "@/modules/diaries/stats/periodWindow";
import type { SymptomEntry } from "@/modules/diaries/types";
import { JournalMonthNav } from "../../JournalMonthNav";
import { deleteSymptomJournalEntry, updateSymptomJournalEntry } from "../actions";
import { isSymptomJournalEntryEditable } from "../symptomJournalEditWindow";
import { patientListItemClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function SymptomsJournalClient(props: {
  entries: SymptomEntry[];
  trackings: { id: string; symptomTitle: string }[];
  activeTrackingId: string;
  monthYm: string;
  period: StatsPeriod;
  offset: number;
}) {
  const { entries, trackings, activeTrackingId, monthYm, period, offset } = props;
  const router = useRouter();
  const [editEntry, setEditEntry] = useState<SymptomEntry | null>(null);
  const [pending, startTransition] = useTransition();

  const symptomJournalTrackingSelectItems = useMemo(
    () => Object.fromEntries(trackings.map((t) => [t.id, t.symptomTitle])),
    [trackings],
  );

  const trackingHref = (id: string) => {
    const p = new URLSearchParams();
    p.set("trackingId", id);
    p.set("month", monthYm);
    p.set("period", period);
    p.set("offset", String(offset));
    return `${routePaths.diarySymptomsJournal}?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${routePaths.diary}?tab=symptoms`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex text-xs")}
        >
          ← К статистике
        </Link>
      </div>

      {trackings.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={patientMutedTextClass}>Симптом</span>
          <Select
            value={activeTrackingId}
            onValueChange={(id) => {
              if (id != null) router.push(trackingHref(id));
            }}
            items={symptomJournalTrackingSelectItems}
          >
            <SelectTrigger className="h-10 w-full min-w-[200px] rounded-xl border border-input bg-background px-3 text-base shadow-none focus-visible:ring-2 focus-visible:ring-ring">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {trackings.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.symptomTitle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Период (календарный месяц)</span>
        <JournalMonthNav
          basePath={routePaths.diarySymptomsJournal}
          monthYm={monthYm}
          period={period}
          offset={offset}
          trackingId={activeTrackingId}
        />
      </div>

      {entries.length === 0 ? (
        <p className={patientMutedTextClass}>За этот месяц записей нет.</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {entries.map((e) => {
            const canEdit = isSymptomJournalEntryEditable(e.recordedAt);
            return (
            <li
              key={e.id}
              className={cn(patientListItemClass, "flex flex-wrap items-start justify-between gap-2")}
            >
              <div className="min-w-0 flex-1">
                <strong>{e.symptomTitle ?? "—"}</strong> — {e.value0_10}/10 ·{" "}
                {e.entryType === "daily" ? "за день" : "в моменте"}
                <div className={patientMutedTextClass}>
                  {new Date(e.recordedAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                {e.notes ? <p className="mt-1 text-sm">{e.notes}</p> : null}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                  aria-label="Действия"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit ? (
                    <DropdownMenuItem onClick={() => setEditEntry(e)}>Редактировать</DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled title="Редактирование доступно в течение 24 часов с момента времени записи">
                      Редактировать
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      if (!window.confirm("Удалить эту запись?")) return;
                      startTransition(async () => {
                        const fd = new FormData();
                        fd.set("entryId", e.id);
                        const res = await deleteSymptomJournalEntry(fd);
                        if (res.ok) {
                          toast.success("Запись удалена");
                          router.refresh();
                        } else {
                          toast.error("Не удалось удалить");
                        }
                      });
                    }}
                  >
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editEntry !== null} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent className="border border-[var(--patient-border)] shadow-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать запись</DialogTitle>
          </DialogHeader>
          {editEntry ? (
            !isSymptomJournalEntryEditable(editEntry.recordedAt) ? (
              <>
                <p className={patientMutedTextClass}>
                  Редактирование доступно только в течение 24 часов с момента времени записи.
                </p>
                <DialogFooter>
                  <Button type="button" onClick={() => setEditEntry(null)}>
                    Закрыть
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const form = ev.currentTarget;
                  const fd = new FormData(form);
                  const local = fd.get("recordedAtLocal");
                  if (typeof local !== "string" || !local) {
                    toast.error("Укажите дату и время");
                    return;
                  }
                  fd.set("recordedAt", new Date(local).toISOString());
                  fd.set("entryId", editEntry.id);
                  startTransition(async () => {
                    const res = await updateSymptomJournalEntry(fd);
                    if (res.ok) {
                      toast.success("Сохранено");
                      setEditEntry(null);
                      router.refresh();
                    } else {
                      toast.error("Не удалось сохранить");
                    }
                  });
                }}
              >
                <label className="flex flex-col gap-1">
                  <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Интенсивность (0–10)</span>
                  <Input
                    type="number"
                    name="value"
                    min={0}
                    max={10}
                    required
                    defaultValue={editEntry.value0_10}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Дата и время</span>
                  <Input
                    type="datetime-local"
                    name="recordedAtLocal"
                    required
                    defaultValue={toDatetimeLocalValue(editEntry.recordedAt)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Заметки</span>
                  <Textarea name="notes" rows={3} defaultValue={editEntry.notes ?? ""} />
                </label>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditEntry(null)}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={pending}>
                    Сохранить
                  </Button>
                </DialogFooter>
              </form>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
