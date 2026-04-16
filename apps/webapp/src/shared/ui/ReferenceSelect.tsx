"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loadReferenceItems, type ReferenceItemDto } from "@/modules/references/referenceCache";

export type ReferenceSelectProps = {
  /** Required unless `prefetchedItems` is provided (then fetch is skipped). */
  categoryCode?: string;
  /** Static list: no API call; `value` / hidden submit follow `valueMatch` / `submitField`. */
  prefetchedItems?: ReferenceItemDto[];
  /** How `value` matches an item (default: id). */
  valueMatch?: "id" | "code";
  /** What goes into the hidden input when the form submits (default: id). */
  submitField?: "id" | "code";
  /** Selected item id or code per `valueMatch`, or null. */
  value: string | null;
  onChange: (nextValue: string | null, label: string) => void;
  placeholder?: string;
  /** Allow typing a custom label (stored via onChange with refId = null). */
  allowFreeText?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
  /** Первый пункт списка: сбрасывает значение (например «Все» в фильтрах). */
  clearOptionLabel?: string;
};

/** Выпадающий список значений справочника с поиском; данные кэшируются в sessionStorage. */
export function ReferenceSelect({
  categoryCode,
  prefetchedItems,
  valueMatch = "id",
  submitField = "id",
  value,
  onChange,
  placeholder = "Выберите…",
  allowFreeText = false,
  disabled = false,
  className,
  name,
  id,
  clearOptionLabel,
}: ReferenceSelectProps) {
  const [remoteItems, setRemoteItems] = useState<ReferenceItemDto[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "done">(() =>
    prefetchedItems || !categoryCode ? "done" : "loading",
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => prefetchedItems ?? (categoryCode ? remoteItems : []),
    [prefetchedItems, categoryCode, remoteItems],
  );

  useEffect(() => {
    if (prefetchedItems || !categoryCode) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoadState("loading");
    });
    void loadReferenceItems(categoryCode).then((list) => {
      if (!cancelled) {
        setRemoteItems(list);
        setLoadState("done");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [categoryCode, prefetchedItems]);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const it = items.find((i) => (valueMatch === "code" ? i.code === value : i.id === value));
    return it?.title ?? "";
  }, [items, value, valueMatch]);

  const hiddenSubmitValue = useMemo(() => {
    if (!value) return "";
    const it = items.find((i) => (valueMatch === "code" ? i.code === value : i.id === value));
    if (!it) return "";
    return submitField === "code" ? it.code : it.id;
  }, [items, value, valueMatch, submitField]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.title.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={hiddenSubmitValue} /> : null}
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        disabled={disabled || loadState !== "done"}
        placeholder={loadState !== "done" ? "Загрузка…" : placeholder}
        value={open ? query : selectedLabel}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          if (allowFreeText) {
            onChange(null, v);
          }
        }}
        onFocus={() => {
          setOpen(true);
          setQuery(selectedLabel);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
        className="w-full"
        autoComplete="off"
      />
      {open && (clearOptionLabel || filtered.length > 0) ? (
        <ul
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-background shadow-md"
          role="listbox"
        >
          {clearOptionLabel ? (
            <li key="__clear">
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start rounded-none px-3 py-2 text-left text-sm font-normal"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(null, "");
                  setQuery("");
                  setOpen(false);
                }}
              >
                {clearOptionLabel}
              </Button>
            </li>
          ) : null}
          {filtered.map((i) => (
            <li key={i.id}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start rounded-none px-3 py-2 text-left text-sm font-normal"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(valueMatch === "code" ? i.code : i.id, i.title);
                  setQuery("");
                  setOpen(false);
                }}
              >
                {i.title}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {allowFreeText && !value && query.trim() ? (
        <p className="mt-1 text-xs text-muted-foreground">Свободный ввод: «{query.trim()}»</p>
      ) : null}
    </div>
  );
}
