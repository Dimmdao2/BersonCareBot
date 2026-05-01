"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { routePaths } from "@/app-layer/routes/paths";
import type { StatsPeriod } from "@/modules/diaries/stats/periodWindow";
import type { LfkSession } from "@/modules/diaries/types";
import { JournalMonthNav } from "../../JournalMonthNav";
import { deleteLfkJournalSession, updateLfkJournalSession } from "../actions";
import { patientListItemClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function LfkJournalClient(props: {
  sessions: LfkSession[];
  complexes: { id: string; title: string }[];
  activeComplexId: string;
  monthYm: string;
  period: StatsPeriod;
  offset: number;
}) {
  const { sessions, complexes, activeComplexId, monthYm, period, offset } = props;
  const router = useRouter();
  const [editSession, setEditSession] = useState<LfkSession | null>(null);
  const [pending, startTransition] = useTransition();

  const complexHref = (id: string) => {
    const p = new URLSearchParams();
    p.set("complexId", id);
    p.set("month", monthYm);
    p.set("period", period);
    p.set("offset", String(offset));
    return `${routePaths.diaryLfkJournal}?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${routePaths.diary}?tab=lfk`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex text-xs")}
        >
          ← К статистике
        </Link>
      </div>

      {complexes.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className={patientMutedTextClass}>Комплекс</span>
          <select
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-[200px]"
            value={activeComplexId}
            onChange={(e) => {
              router.push(complexHref(e.target.value));
            }}
          >
            {complexes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Период (календарный месяц)</span>
        <JournalMonthNav
          basePath={routePaths.diaryLfkJournal}
          monthYm={monthYm}
          period={period}
          offset={offset}
          complexId={activeComplexId}
        />
      </div>

      {sessions.length === 0 ? (
        <p className={patientMutedTextClass}>За этот месяц занятий нет.</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {sessions.map((s) => (
            <li
              key={s.id}
              className={cn(patientListItemClass, "flex flex-wrap items-start justify-between gap-2")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{s.complexTitle ?? "ЛФК"}</strong>
                  <Badge variant="secondary" className="font-normal">
                    Завершен
                  </Badge>
                </div>
                <div className={patientMutedTextClass}>
                  {new Date(s.completedAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-sm">
                  {s.durationMinutes != null ? <span>{s.durationMinutes} мин</span> : null}
                  {s.difficulty0_10 != null ? <span>Сложн. {s.difficulty0_10}/10</span> : null}
                  {s.pain0_10 != null ? <span>Боль {s.pain0_10}/10</span> : null}
                </div>
                {s.comment ? <p className="mt-1 text-sm">{s.comment}</p> : null}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                  aria-label="Действия"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditSession(s)}>Редактировать</DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      if (!window.confirm("Удалить эту запись?")) return;
                      startTransition(async () => {
                        const fd = new FormData();
                        fd.set("sessionId", s.id);
                        const res = await deleteLfkJournalSession(fd);
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
          ))}
        </ul>
      )}

      <Dialog open={editSession !== null} onOpenChange={(o) => !o && setEditSession(null)}>
        <DialogContent className="border border-[var(--patient-border)] shadow-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать занятие</DialogTitle>
          </DialogHeader>
          {editSession ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                const form = ev.currentTarget;
                const fd = new FormData(form);
                const local = fd.get("completedAtLocal");
                if (typeof local !== "string" || !local) {
                  toast.error("Укажите дату и время");
                  return;
                }
                fd.set("completedAt", new Date(local).toISOString());
                fd.set("sessionId", editSession.id);
                startTransition(async () => {
                  const res = await updateLfkJournalSession(fd);
                  if (res.ok) {
                    toast.success("Сохранено");
                    setEditSession(null);
                    router.refresh();
                  } else {
                    toast.error("Не удалось сохранить");
                  }
                });
              }}
            >
              <label className="flex flex-col gap-1">
                <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Дата и время</span>
                <Input
                  type="datetime-local"
                  name="completedAtLocal"
                  required
                  defaultValue={toDatetimeLocalValue(editSession.completedAt)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Длительность (мин)</span>
                <Input
                  type="number"
                  name="durationMinutes"
                  min={1}
                  max={600}
                  placeholder="—"
                  defaultValue={editSession.durationMinutes ?? ""}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Сложность 0–10</span>
                <Input
                  type="number"
                  name="difficulty0_10"
                  min={0}
                  max={10}
                  placeholder="—"
                  defaultValue={editSession.difficulty0_10 ?? ""}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Боль 0–10</span>
                <Input
                  type="number"
                  name="pain0_10"
                  min={0}
                  max={10}
                  placeholder="—"
                  defaultValue={editSession.pain0_10 ?? ""}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Комментарий</span>
                <textarea
                  name="comment"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={3}
                  maxLength={200}
                  defaultValue={editSession.comment ?? ""}
                />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditSession(null)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={pending}>
                  Сохранить
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
