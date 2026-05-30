"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDoctorClientSearchQueryAllowed } from "@/modules/doctor-clients/clientSearchMatch";
import { cn } from "@/lib/utils";

export type CalendarPatientOption = {
  id: string;
  displayName: string;
  phone: string | null;
};

type Props = {
  value: CalendarPatientOption | null;
  onChange: (value: CalendarPatientOption | null) => void;
  disabled?: boolean;
};

function formatPatientLabel(option: CalendarPatientOption): string {
  return option.phone ? `${option.displayName} · ${option.phone}` : option.displayName;
}

function queryLooksLikePhone(query: string): boolean {
  const digits = query.replace(/\D/g, "");
  return digits.length >= 3 && digits.length >= query.replace(/\s/g, "").length * 0.5;
}

export function DoctorCalendarPatientSearch({ value, onChange, disabled }: Props) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CalendarPatientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const displayValue = open ? query : value ? formatPatientLabel(value) : query;

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!isDoctorClientSearchQueryAllowed(trimmed)) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/doctor/clients/search?q=${encodeURIComponent(trimmed)}&limit=20`);
      const data = (await res.json()) as { ok?: boolean; clients?: CalendarPatientOption[] };
      setResults(data.ok ? (data.clients ?? []) : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void search(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, search]);

  useEffect(() => {
    setActiveIdx((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(ev.target as Node)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (option: CalendarPatientOption) => {
    onChange(option);
    setQuery("");
    setOpen(false);
    setResults([]);
    setCreateOpen(false);
    setCreateError(null);
  };

  const clear = () => {
    onChange(null);
    setQuery("");
    setResults([]);
  };

  const openCreate = () => {
    const trimmed = query.trim();
    if (queryLooksLikePhone(trimmed)) {
      setNewPhone(trimmed);
      setNewName("");
    } else {
      setNewName(trimmed);
      setNewPhone("");
    }
    setNewEmail("");
    setCreateError(null);
    setCreateOpen(true);
    setOpen(false);
  };

  const createPatient = async () => {
    const phone = newPhone.trim();
    if (!phone) {
      setCreateError("Укажите телефон");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/doctor/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: newName.trim() || undefined,
          phone,
          email: newEmail.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        client?: CalendarPatientOption;
      };
      if (!res.ok || !data.ok || !data.client) {
        setCreateError(
          data.error === "invalid_phone" ? "Неверный телефон"
          : data.error === "invalid_email" ? "Неверный email"
          : data.error === "email_conflict" ? "Email уже занят"
          : "Не удалось создать",
        );
        return;
      }
      pick(data.client);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
    } catch {
      setCreateError("Ошибка сети");
    } finally {
      setCreating(false);
    }
  };

  const minQueryHint =
    query.trim().replace(/\D/g, "").length >= 3 ? "Минимум 2 символа"
    : query.trim().length >= 2 ? null
    : "Минимум 2 символа или 3 цифры телефона";

  return (
    <div ref={rootRef} className="relative min-w-0 space-y-2">
      <Label htmlFor={inputId}>Пациент</Label>
      <Input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        disabled={disabled || creating}
        placeholder="Имя или телефон…"
        value={displayValue}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          if (value) onChange(null);
          setOpen(true);
          setCreateOpen(false);
        }}
        onFocus={() => {
          setOpen(true);
          if (value) {
            setQuery("");
            onChange(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            return;
          }
          if (e.key === "ArrowDown" && results.length > 0) {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === "ArrowUp" && results.length > 0) {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter" && open && results[activeIdx]) {
            e.preventDefault();
            pick(results[activeIdx]!);
          }
          if (e.key === "Backspace" && !query && value) {
            clear();
          }
        }}
        autoComplete="off"
      />
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
        >
          {loading ? <p className="px-3 py-2 text-muted-foreground">Поиск…</p> : null}
          {!loading && isDoctorClientSearchQueryAllowed(query.trim()) && results.length === 0 ? (
            <button
              type="button"
              className="flex w-full cursor-pointer px-3 py-2 text-left hover:bg-muted"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={openCreate}
            >
              Новый пациент…
            </button>
          ) : null}
          {!loading && minQueryHint && !value ? (
            <p className="px-3 py-2 text-muted-foreground">{minQueryHint}</p>
          ) : null}
          {results.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              className={cn(
                "flex w-full cursor-pointer px-3 py-2 text-left hover:bg-muted",
                idx === activeIdx && "bg-muted",
              )}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => pick(item)}
            >
              {formatPatientLabel(item)}
            </button>
          ))}
        </div>
      ) : null}

      {!createOpen && !value ? (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs"
          disabled={disabled || creating}
          onClick={() => {
            setCreateOpen(true);
            setCreateError(null);
          }}
        >
          Новый пациент
        </Button>
      ) : null}

      {createOpen ? (
        <div className="space-y-2 rounded-md border border-border p-2">
          <Input
            placeholder="Имя"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
            aria-label="Имя пациента"
          />
          <Input
            placeholder="Телефон"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            disabled={creating}
            aria-label="Телефон пациента"
          />
          <Input
            type="email"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={creating}
            aria-label="Email пациента"
          />
          {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={creating} onClick={() => void createPatient()}>
              {creating ? "Создание…" : "Создать и выбрать"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={creating}
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
