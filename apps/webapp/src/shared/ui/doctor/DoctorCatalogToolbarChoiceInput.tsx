"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOCTOR_CATALOG_TOOLBAR_FILTER_WRAP_CLASS } from "@/shared/ui/doctor/doctorCatalogToolbarFilterClasses";

export type DoctorCatalogToolbarChoiceOption = { value: string; label: string };

export type DoctorCatalogToolbarChoiceInputProps = {
  id?: string;
  /** Для GET-формы: скрытое поле с актуальным значением. */
  name?: string;
  options: DoctorCatalogToolbarChoiceOption[];
  value: string;
  onValueChange: (next: string) => void;
  "aria-label": string;
  disabled?: boolean;
  className?: string;
};

/**
 * Выбор фиксированного значения через тот же визуал, что у полей «Регион» / «Тип»: `Input` + выпадающий список.
 */
export function DoctorCatalogToolbarChoiceInput({
  id: propId,
  name,
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  disabled = false,
  className,
}: DoctorCatalogToolbarChoiceInputProps) {
  const genId = useId();
  const id = propId ?? `${genId}-choice`;
  const listboxId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={cn(DOCTOR_CATALOG_TOOLBAR_FILTER_WRAP_CLASS, "relative", className)}>
      {name ? <input type="hidden" name={name} value={value} readOnly tabIndex={-1} /> : null}
      <div className="relative w-full">
        <Input
          id={id}
          readOnly
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled}
          value={selectedLabel}
          placeholder={selectedLabel ? undefined : "Выберите…"}
          className="w-full cursor-pointer pr-9"
          autoComplete="off"
          onClick={() => {
            if (!disabled) setOpen((o) => !o);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!disabled) setOpen((o) => !o);
            }
          }}
        />
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        {open && !disabled ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-background shadow-md"
          >
            {options.map((o) => (
              <li
                key={o.value.length ? o.value : "__empty"}
                role="presentation"
                className={cn(o.value === value && "bg-muted/50")}
              >
                <Button
                  type="button"
                  variant="ghost"
                  role="option"
                  aria-selected={o.value === value}
                  className="h-auto w-full justify-start rounded-none px-3 py-2 text-left text-sm font-normal"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onValueChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
