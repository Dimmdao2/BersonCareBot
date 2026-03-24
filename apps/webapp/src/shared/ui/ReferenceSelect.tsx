"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loadReferenceItems, type ReferenceItemDto } from "@/modules/references/referenceCache";

export type ReferenceSelectProps = {
  categoryCode: string;
  /** Selected reference item id, or null. */
  value: string | null;
  onChange: (refId: string | null, label: string) => void;
  placeholder?: string;
  /** Allow typing a custom label (stored via onChange with refId = null). */
  allowFreeText?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
};

/** Выпадающий список значений справочника с поиском; данные кэшируются в sessionStorage. */
export function ReferenceSelect({
  categoryCode,
  value,
  onChange,
  placeholder = "Выберите…",
  allowFreeText = false,
  disabled = false,
  className,
  name,
  id,
}: ReferenceSelectProps) {
  const [items, setItems] = useState<ReferenceItemDto[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "done">("loading");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
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

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const it = items.find((i) => i.id === value);
    return it?.title ?? "";
  }, [items, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.title.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
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
      {open && filtered.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-background shadow-md"
          role="listbox"
        >
          {filtered.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(i.id, i.title);
                  setQuery("");
                  setOpen(false);
                }}
              >
                {i.title}
              </button>
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
