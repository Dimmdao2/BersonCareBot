"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loadReferenceItems, type ReferenceItemDto } from "@/modules/references/referenceCache";

export type ReferenceMultiSelectProps = {
  categoryCode: string;
  /** Selected `reference_items.id` values. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
  /** Multiple hidden inputs for FormData (same `name` → `getAll`). */
  name?: string;
  id?: string;
  placeholder?: string;
};

/**
 * Multi-select from a reference category: chips + dropdown (non-searchable list, `showAllOnFocus`-style).
 */
export function ReferenceMultiSelect({
  categoryCode,
  value,
  onChange,
  disabled = false,
  className,
  name,
  id,
  placeholder = "Добавить регион…",
}: ReferenceMultiSelectProps) {
  const [items, setItems] = useState<ReferenceItemDto[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "done">("loading");
  const [open, setOpen] = useState(false);
  const [listScrollOverflowBottom, setListScrollOverflowBottom] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoadState("loading");
    });
    void loadReferenceItems(categoryCode).then((list) => {
      if (!cancelled) {
        setItems(list);
        setLoadState("done");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [categoryCode]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.id, it.title);
    return m;
  }, [items]);

  const availableToPick = useMemo(() => items.filter((i) => !selectedSet.has(i.id)), [items, selectedSet]);

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
    const ro = new RO(() => queueMicrotask(updateListScrollOverflow));
    ro.observe(el);
    queueMicrotask(updateListScrollOverflow);
    return () => ro.disconnect();
  }, [open, availableToPick, updateListScrollOverflow]);

  const remove = useCallback(
    (rid: string) => {
      onChange(value.filter((x) => x !== rid));
    },
    [onChange, value],
  );

  const add = useCallback(
    (rid: string) => {
      if (selectedSet.has(rid)) return;
      onChange([...value, rid]);
      setOpen(false);
    },
    [onChange, selectedSet, value],
  );

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-2", className)}>
      {name
        ? value.map((rid) => <input key={rid} type="hidden" name={name} value={rid} />)
        : null}
      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 ? null : (
          value.map((rid) => (
            <span
              key={rid}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs"
            >
              <span className="truncate">{titleById.get(rid) ?? rid}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => remove(rid)}
                disabled={disabled}
                aria-label="Удалить"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loadState !== "done"}
          placeholder={loadState !== "done" ? "Загрузка…" : placeholder}
          value=""
          readOnly
          onClick={() => {
            if (loadState === "done" && !disabled) setOpen((o) => !o);
          }}
          onFocus={() => {
            if (loadState === "done" && !disabled) setOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
          }}
          className="w-full cursor-pointer caret-transparent"
          autoComplete="off"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground">
          <ChevronDown className="size-4" />
        </span>
        {open && availableToPick.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 w-full min-w-0">
            <div className="relative max-h-48 overflow-hidden rounded-md border border-border bg-background shadow-md">
              <ul
                ref={listboxRef}
                onScroll={updateListScrollOverflow}
                className="max-h-48 w-full overflow-auto"
                role="listbox"
              >
                {availableToPick.map((i) => (
                  <li key={i.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start rounded-none px-3 py-2 text-left text-sm font-normal"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(i.id);
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
      </div>
    </div>
  );
}
