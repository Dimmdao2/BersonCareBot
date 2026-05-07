"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TemplateOption = { id: string; title: string };

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
    setAssignError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setSearch("");
    setSelectedTpl("");
    setAssignError(null);
  }

  async function assign() {
    if (!selectedTpl || disabled) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-program-instances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: selectedTpl }),
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
        <Button
          type="button"
          onClick={openModal}
          disabled={disabled || templates.length === 0}
        >
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
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeModal(); }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Выберите шаблон программы лечения</DialogTitle>
          </DialogHeader>

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
                    <span className="ml-2 shrink-0 text-primary" aria-hidden="true">✓</span>
                  )}
                </li>
              ))
            )}
          </ul>

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
              disabled={!selectedTpl || assigning || disabled}
              onClick={() => void assign()}
            >
              {assigning ? "Назначение…" : "Назначить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
