"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  /** For enum-like filters, opening should reveal every option instead of filtering by the selected label. */
  showAllOnFocus?: boolean;
  /** Dropdown-only mode: no text editing/caret, only pick from list. */
  searchable?: boolean;
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
  showAllOnFocus = false,
  searchable = true,
}: ReferenceSelectProps) {
  const [remoteItems, setRemoteItems] = useState<ReferenceItemDto[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "done">(() =>
    prefetchedItems || !categoryCode ? "done" : "loading",
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [listScrollOverflowBottom, setListScrollOverflowBottom] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const blurInput = useCallback(() => {
    queueMicrotask(() => {
      rootRef.current?.querySelector<HTMLInputElement>('input[data-slot="input"]')?.blur();
    });
  }, []);

  const items = useMemo(
    () => prefetchedItems ?? (categoryCode ? remoteItems : []),
    [prefetchedItems, categoryCode, remoteItems],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setQuery("");
      setOpen(false);
    });
  }, [value]);

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

  const updateListScrollOverflow = useCallback(() => {
    const el = listboxRef.current;
    if (!el) return;
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    setListScrollOverflowBottom(maxScrollTop > 4 && el.scrollTop < maxScrollTop - 4);
  }, []);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => setListScrollOverflowBottom(false));
      return;
    }
    const el = listboxRef.current;
    if (!el) return;
    const RO = typeof globalThis.ResizeObserver === "function" ? globalThis.ResizeObserver : null;
    if (!RO) {
      queueMicrotask(updateListScrollOverflow);
      return;
    }
    const ro = new RO(() => {
      queueMicrotask(updateListScrollOverflow);
    });
    ro.observe(el);
    queueMicrotask(updateListScrollOverflow);
    return () => ro.disconnect();
  }, [open, filtered, clearOptionLabel, updateListScrollOverflow]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={hiddenSubmitValue} /> : null}
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        disabled={disabled || loadState !== "done"}
        placeholder={loadState !== "done" ? "Загрузка…" : placeholder}
        value={open && searchable ? query : selectedLabel}
        onChange={(e) => {
          if (!searchable) return;
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          if (allowFreeText) {
            onChange(null, v);
          }
        }}
        onClick={() => {
          if (!searchable && loadState === "done" && !disabled) {
            setOpen(true);
            setQuery(showAllOnFocus ? "" : "");
          }
        }}
        onFocus={() => {
          setOpen(true);
          setQuery(showAllOnFocus || !searchable ? "" : selectedLabel);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
        className={cn("w-full", !searchable && "cursor-pointer caret-transparent")}
        readOnly={!searchable}
        autoComplete="off"
      />
      {open && (clearOptionLabel || filtered.length > 0) ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 w-full min-w-0">
          <div className="relative max-h-48 overflow-hidden rounded-md border border-border bg-background shadow-md">
            <ul
              ref={listboxRef}
              onScroll={updateListScrollOverflow}
              className="max-h-48 w-full overflow-auto"
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
                      if (!searchable) blurInput();
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
                      if (!searchable) blurInput();
                    }}
                  >
                    {i.title}
                  </Button>
                </li>
              ))}
            </ul>
            {listScrollOverflowBottom ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex justify-center pb-1 pt-8"
                aria-hidden
              >
                <div className="absolute inset-0 bg-gradient-to-t from-background from-25% via-background/70 to-transparent" />
                <ChevronDown className="relative size-4 shrink-0 text-muted-foreground opacity-80" strokeWidth={2.25} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {allowFreeText && !value && query.trim() ? (
        <p className="mt-1 text-xs text-muted-foreground">Свободный ввод: «{query.trim()}»</p>
      ) : null}
    </div>
  );
}
