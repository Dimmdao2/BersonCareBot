"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type TemplateOption = { id: string; title: string };

type AssignMode = "template" | "blank";

export function PatientTreatmentProgramsPanel(props: {
  patientUserId: string;
  templates: TemplateOption[];
  disabled?: boolean;
  profileListScope?: string;
  /**
   * Список с RSC — без второго round-trip и «Загрузка…», пока не сработает клиентский fetch.
   * После назначения программы панель по-прежнему обновляется через API.
   */
  initialInstances?: TreatmentProgramInstanceSummary[];
}) {
  const { patientUserId, templates, disabled, profileListScope, initialInstances } = props;
  const serverProvidedList = initialInstances !== undefined;
  const scopeQs = profileListScope
    ? `?scope=${encodeURIComponent(profileListScope)}`
    : "";
  const [items, setItems] = useState<TreatmentProgramInstanceSummary[] | null>(() =>
    serverProvidedList ? initialInstances : null,
  );
  const [loading, setLoading] = useState(!serverProvidedList);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<AssignMode>("template");
  /** Необязательный заголовок инстанса при `kind: "blank"` (сервер подставит дефолт, если пусто). */
  const [blankTitle, setBlankTitle] = useState("");
  const [search, setSearch] = useState("");
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-program-instances`,
      );
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        items?: TreatmentProgramInstanceSummary[];
      };
      if (!res.ok || !data.ok || !data.items) {
        setLoadError("Не удалось загрузить программы");
        setItems([]);
        return;
      }
      setItems(data.items);
    } catch {
      setLoadError("Не удалось загрузить программы");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [patientUserId]);

  useEffect(() => {
    if (serverProvidedList) return;
    void load();
  }, [load, serverProvidedList]);

  function openModal() {
    setSearch("");
    setSelectedTpl("");
    setBlankTitle("");
    setAssignError(null);
    setAssignMode(templates.length === 0 ? "blank" : "template");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setSearch("");
    setSelectedTpl("");
    setBlankTitle("");
    setAssignError(null);
    setAssignMode("template");
  }

  async function assignFromTemplate() {
    if (!selectedTpl || disabled || assigning) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-program-instances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "from_template", templateId: selectedTpl }),
        },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setAssignError(data?.error ?? "Ошибка назначения");
        return;
      }
      toast.success("Программа лечения назначена");
      closeModal();
      await load();
    } catch {
      setAssignError("Ошибка назначения");
    } finally {
      setAssigning(false);
    }
  }

  async function assignBlank() {
    if (disabled || assigning) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const trimmedBlankTitle = blankTitle.trim();
      const body =
        trimmedBlankTitle.length > 0
          ? { kind: "blank" as const, title: trimmedBlankTitle }
          : { kind: "blank" as const };
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-program-instances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setAssignError(data?.error ?? "Ошибка назначения");
        return;
      }
      toast.success("Программа лечения назначена");
      closeModal();
      await load();
    } catch {
      setAssignError("Ошибка назначения");
    } finally {
      setAssigning(false);
    }
  }

  const filtered = templates.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button type="button" onClick={openModal} disabled={disabled}>
          Назначить программу лечения
        </Button>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Назначенные программы
        </p>
        {loadError ? (
          <p className="text-sm text-destructive" role="alert">
            {loadError}
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : !items?.length ? (
          <p className="text-sm text-muted-foreground">Пока нет назначенных программ.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((row) => (
              <li key={row.id} className="rounded-lg border border-border bg-card px-3 py-2">
                <Link
                  href={`/app/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-programs/${encodeURIComponent(row.id)}${scopeQs}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {row.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {row.status === "completed" ? "завершена" : "активна"}
                  {row.templateId == null ? " · без шаблона" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeModal(); }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Назначить программу лечения</DialogTitle>
          </DialogHeader>

          <div
            className="grid h-9 grid-cols-2 overflow-hidden rounded-md border border-input p-px"
            role="radiogroup"
            aria-label="Способ назначения"
          >
            <button
              type="button"
              role="radio"
              aria-checked={assignMode === "template"}
              disabled={templates.length === 0}
              className={cn(
                "text-xs font-medium transition-colors disabled:opacity-50",
                assignMode === "template"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-foreground hover:bg-muted/60",
              )}
              onClick={() => {
                setAssignMode("template");
                setAssignError(null);
              }}
            >
              Из шаблона
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={assignMode === "blank"}
              className={cn(
                "text-xs font-medium transition-colors",
                assignMode === "blank"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-foreground hover:bg-muted/60",
              )}
              onClick={() => {
                setAssignMode("blank");
                setAssignError(null);
              }}
            >
              Пустой план
            </button>
          </div>

          {assignMode === "blank" ? (
            <Input
              id="tp-blank-instance-title"
              value={blankTitle}
              onChange={(e) => setBlankTitle(e.target.value)}
              placeholder="Название программы (необязательно)"
              disabled={assigning || !!disabled}
              maxLength={2000}
              className="text-sm"
              aria-label="Название программы, необязательно"
            />
          ) : null}

          {assignMode === "template" ? (
            <>
              <input
                type="text"
                placeholder="Поиск по названию"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />

              <ul className="mt-1 flex flex-col gap-1" role="listbox" aria-label="Шаблоны программ">
                {filtered.length === 0 ? (
                  <li className="py-2 text-sm text-muted-foreground">Ничего не найдено</li>
                ) : (
                  filtered.map((t) => (
                    <li
                      key={t.id}
                      role="option"
                      aria-selected={selectedTpl === t.id}
                      onClick={() => setSelectedTpl(t.id)}
                      className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                        selectedTpl === t.id ? "bg-accent text-accent-foreground font-medium" : ""
                      }`}
                    >
                      <span className="break-words">{t.title}</span>
                      {selectedTpl === t.id && (
                        <span className="ml-2 shrink-0 text-primary" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : null}

          {assignError ? (
            <p className="text-sm text-destructive" role="alert">
              {assignError}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={closeModal}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={
                assigning ||
                disabled ||
                (assignMode === "template" && (!selectedTpl || templates.length === 0))
              }
              onClick={() =>
                void (assignMode === "template" ? assignFromTemplate() : assignBlank())
              }
            >
              {assigning
                ? "Назначение…"
                : assignMode === "blank"
                  ? "Создать пустой план"
                  : "Назначить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
