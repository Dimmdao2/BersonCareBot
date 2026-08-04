'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { isDoctorClientSearchQueryAllowed } from '@/modules/doctor-clients/clientSearchMatch';
import { cn } from '@/lib/utils';
import { doctorInteractiveSurfaceButtonClass } from '@/shared/ui/doctor/doctorVisual';
import { formatDoctorFio } from '@/shared/lib/fio';

export type CalendarPatientOption = {
  id: string | null;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  patronymic?: string | null;
  phone: string | null;
  email?: string | null;
  isNew?: boolean;
};

type Props = {
  value: CalendarPatientOption | null;
  onChange: (value: CalendarPatientOption | null) => void;
  disabled?: boolean;
  /** Calendar new-patient booking commits the card together with the appointment. */
  deferNewPatientCreation?: boolean;
};

function formatPatientLabel(option: CalendarPatientOption): string {
  const name = formatDoctorFio(
    {
      lastName: option.lastName ?? null,
      firstName: option.firstName ?? null,
      patronymic: option.patronymic ?? null,
    },
    option.displayName,
  );
  return option.phone ? `${name} · ${option.phone}` : name;
}

function queryLooksLikePhone(query: string): boolean {
  const digits = query.replace(/\D/g, '');
  return digits.length >= 3 && digits.length >= query.replace(/\s/g, '').length * 0.5;
}

export function DoctorCalendarPatientSearch({
  value,
  onChange,
  disabled,
  deferNewPatientCreation = false,
}: Props) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CalendarPatientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLastName, setNewLastName] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newPatronymic, setNewPatronymic] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const createRequestIdRef = useRef(crypto.randomUUID());
  const createInFlightRef = useRef(false);

  const displayValue = open ? query : value ? formatPatientLabel(value) : query;

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!isDoctorClientSearchQueryAllowed(trimmed)) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/doctor/clients/search?q=${encodeURIComponent(trimmed)}&limit=20`,
      );
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
      setQuery('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (option: CalendarPatientOption) => {
    onChange(option);
    setQuery('');
    setOpen(false);
    setResults([]);
    setCreateOpen(false);
    setCreateError(null);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setResults([]);
  };

  const openCreate = () => {
    createRequestIdRef.current = crypto.randomUUID();
    createInFlightRef.current = false;
    const trimmed = query.trim();
    if (queryLooksLikePhone(trimmed)) {
      setNewPhone(trimmed);
      setNewLastName('');
    } else {
      setNewLastName(trimmed);
      setNewPhone('');
    }
    setNewFirstName('');
    setNewPatronymic('');
    setNewEmail('');
    setCreateError(null);
    setCreateOpen(true);
    setOpen(false);
  };

  const submitNewPatient = async () => {
    if (createInFlightRef.current) return;
    const lastName = newLastName.trim();
    const firstName = newFirstName.trim();
    const phone = newPhone.trim();
    if (!lastName || !firstName) {
      setCreateError('Укажите фамилию и имя');
      return;
    }
    if (!phone && newEmail.trim()) {
      setCreateError('Для email укажите телефон или оставьте оба контакта пустыми');
      return;
    }
    setCreateError(null);
    if (deferNewPatientCreation) {
      const patronymic = newPatronymic.trim() || null;
      pick({
        id: null,
        displayName: formatDoctorFio({ lastName, firstName, patronymic }),
        lastName,
        firstName,
        patronymic,
        phone: phone || null,
        email: newEmail.trim() || null,
        isNew: true,
      });
      setNewLastName('');
      setNewFirstName('');
      setNewPatronymic('');
      setNewPhone('');
      setNewEmail('');
      return;
    }

    createInFlightRef.current = true;
    setCreating(true);
    try {
      const response = await fetch('/api/doctor/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: createRequestIdRef.current,
          lastName,
          firstName,
          patronymic: newPatronymic.trim() || null,
          phone: phone || null,
          email: newEmail.trim() || null,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        client?: CalendarPatientOption;
      };
      if (!response.ok || !data.ok || !data.client) {
        setCreateError(
          data.message
            ? data.message
            : data.error === 'invalid_fio'
              ? 'Укажите фамилию и имя'
              : data.error === 'invalid_phone'
                ? 'Неверный телефон'
                : data.error === 'invalid_email'
                  ? 'Неверный email'
                  : data.error === 'email_conflict'
                    ? 'Email уже занят'
                    : 'Не удалось создать',
        );
        return;
      }
      pick(data.client);
      createRequestIdRef.current = crypto.randomUUID();
      setNewLastName('');
      setNewFirstName('');
      setNewPatronymic('');
      setNewPhone('');
      setNewEmail('');
    } catch {
      setCreateError('Ошибка сети');
    } finally {
      createInFlightRef.current = false;
      setCreating(false);
    }
  };

  const minQueryHint =
    query.trim().replace(/\D/g, '').length >= 3
      ? 'Минимум 2 символа'
      : query.trim().length >= 2
        ? null
        : 'Минимум 2 символа или 3 цифры телефона';

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
            setQuery('');
            onChange(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery('');
            return;
          }
          if (e.key === 'ArrowDown' && results.length > 0) {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === 'ArrowUp' && results.length > 0) {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          }
          if (e.key === 'Enter' && open && results[activeIdx]) {
            e.preventDefault();
            pick(results[activeIdx]!);
          }
          if (e.key === 'Backspace' && !query && value) {
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
            <Button
              type="button"
              variant="ghost"
              className={cn(
                doctorInteractiveSurfaceButtonClass,
                'w-full justify-start px-3 py-2 text-left hover:bg-muted',
              )}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={openCreate}
            >
              Новый пациент…
            </Button>
          ) : null}
          {!loading && minQueryHint && !value ? (
            <p className="px-3 py-2 text-muted-foreground">{minQueryHint}</p>
          ) : null}
          {results.map((item, idx) => (
            <Button
              key={item.id ?? `${item.displayName}:${item.phone ?? ''}`}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={idx === activeIdx}
              className={cn(
                'h-auto w-full justify-start px-3 py-2 text-left',
                idx === activeIdx && 'bg-muted',
              )}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => pick(item)}
            >
              {formatPatientLabel(item)}
            </Button>
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
            placeholder="Фамилия"
            value={newLastName}
            onChange={(e) => setNewLastName(e.target.value)}
            disabled={disabled || creating}
            aria-label="Фамилия пациента"
          />
          <Input
            placeholder="Имя"
            value={newFirstName}
            onChange={(e) => setNewFirstName(e.target.value)}
            disabled={disabled || creating}
            aria-label="Имя пациента"
          />
          <Input
            placeholder="Отчество (если есть)"
            value={newPatronymic}
            onChange={(e) => setNewPatronymic(e.target.value)}
            disabled={disabled || creating}
            aria-label="Отчество пациента"
          />
          <Input
            placeholder="Телефон (если есть)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            disabled={disabled || creating}
            aria-label="Телефон пациента"
          />
          <Input
            type="email"
            placeholder="Email (если есть)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={disabled || creating}
            aria-label="Email пациента"
          />
          {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled || creating}
              onClick={() => void submitNewPatient()}
            >
              {creating
                ? 'Создание…'
                : deferNewPatientCreation
                  ? 'Выбрать нового'
                  : 'Создать и выбрать'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || creating}
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
