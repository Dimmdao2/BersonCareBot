"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CreatableComboboxItem = { value: string; label: string };

export type CreatableComboboxInputProps = {
  id?: string;
  /** Имя скрытого поля для native form submit (value = выбранный `value`). */
  name?: string;
  items: CreatableComboboxItem[];
  value: string | null;
  onChange: (value: string | null, label: string) => void;
  onCreate: (rawLabel: string) => Promise<CreatableComboboxItem>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * Поле с подсказками + «+ Добавить …» (B2.5). Без cmdk: выпадающий слой под полем ввода.
 */
export function CreatableComboboxInput({
  id,
  name,
  items,
  value,
  onChange,
  onCreate,
  placeholder = "Начните ввод…",
  disabled,
  className,
  "aria-label": ariaLabel,
}: CreatableComboboxInputProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = `${id ?? "ccb"}-listbox`;

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    return items.find((i) => i.value === value)?.label ?? value;
  }, [items, value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(s) || i.value.toLowerCase().includes(s),
    );
  }, [items, q]);

  const trimmedQ = q.trim();
  const exactHit = useMemo(
    () => items.find((i) => i.label.toLowerCase() === trimmedQ.toLowerCase() || i.value === trimmedQ),
    [items, trimmedQ],
  );

  const showCreate =
    trimmedQ.length > 0 && !exactHit && !filtered.some((i) => i.label.toLowerCase() === trimmedQ.toLowerCase());

  const listLen = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => {
    setActiveIdx((i) => (listLen === 0 ? 0 : Math.min(i, listLen - 1)));
  }, [listLen, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(ev.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = useCallback(
    (item: CreatableComboboxItem) => {
      setErr(null);
      onChange(item.value, item.label);
      setQ("");
      setOpen(false);
    },
    [onChange],
  );

  const tryCreate = useCallback(async () => {
    if (!trimmedQ || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await onCreate(trimmedQ);
      pick(created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось создать";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }, [busy, onCreate, pick, trimmedQ]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (listLen === 0 ? 0 : (i + 1) % listLen));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (listLen === 0 ? 0 : (i - 1 + listLen) % listLen));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (listLen === 0) return;
      if (showCreate && activeIdx === filtered.length) {
        void tryCreate();
        return;
      }
      const it = filtered[activeIdx];
      if (it) pick(it);
    }
  };

  const displayValue = open ? q : selectedLabel;

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      {name ? <input type="hidden" name={name} value={value ?? ""} readOnly /> : null}
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        disabled={disabled || busy}
        placeholder={placeholder}
        value={displayValue}
        onChange={(ev) => {
          setErr(null);
          setQ(ev.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full"
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
        >
          {filtered.length === 0 && !showCreate ? (
            <p className="px-3 py-2 text-muted-foreground">Нет совпадений</p>
          ) : null}
          {filtered.map((it, idx) => (
            <button
              key={it.value}
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              className={cn(
                "flex w-full cursor-pointer px-3 py-2 text-left hover:bg-muted",
                idx === activeIdx && "bg-muted",
              )}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => pick(it)}
            >
              {it.label}
            </button>
          ))}
          {showCreate ? (
            <button
              type="button"
              role="option"
              aria-selected={activeIdx === filtered.length}
              className={cn(
                "flex w-full cursor-pointer px-3 py-2 text-left text-primary hover:bg-muted",
                activeIdx === filtered.length && "bg-muted",
              )}
              onMouseEnter={() => setActiveIdx(filtered.length)}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => void tryCreate()}
              disabled={busy}
            >
              {busy ? "Создание…" : `+ Добавить «${trimmedQ}»`}
            </button>
          ) : null}
        </div>
      ) : null}
      {err ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {err}
        </p>
      ) : null}
    </div>
  );
}
