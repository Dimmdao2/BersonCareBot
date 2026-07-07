"use client";

import { useCallback, useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { Recommendation } from "@/modules/recommendations/types";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import {
  VISIT_MANIPULATION_REFERENCE_CATEGORY_CODE,
  appendVisitCatalogText,
  formatRecommendationForVisit,
  visitCatalogOptionToText,
  type VisitCatalogOption,
} from "./visitCatalogText";

const fieldLabelClass = "text-xs font-semibold text-foreground";
const hintClass = "text-xs text-muted-foreground";

type ReferenceItemDto = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
};

async function loadDoctorReferenceItems(categoryCode: string): Promise<ReferenceItemDto[]> {
  const res = await fetch(`/api/doctor/references/${encodeURIComponent(categoryCode)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; items?: ReferenceItemDto[] };
  return data.ok && Array.isArray(data.items) ? data.items : [];
}

export function VisitCatalogTextarea({
  label,
  placeholder,
  value,
  onChange,
  catalog,
  rows,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  catalog: "manipulations" | "recommendations";
  rows?: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<VisitCatalogOption[]>([]);
  const textareaId = useId();
  const listId = useId();

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      if (catalog === "manipulations") {
        const items = await loadDoctorReferenceItems(VISIT_MANIPULATION_REFERENCE_CATEGORY_CODE);
        setOptions(items.map((item) => ({ id: item.id, title: item.title })));
        return;
      }
      const res = await fetch("/api/doctor/recommendations", {
        credentials: "include",
      });
      if (!res.ok) {
        setOptions([]);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; items?: Recommendation[] };
      setOptions((data.items ?? []).map(formatRecommendationForVisit));
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [catalog]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && options.length === 0) void loadOptions();
      return next;
    });
  };

  const insertOption = (option: VisitCatalogOption) => {
    onChange(appendVisitCatalogText(value, visitCatalogOptionToText(option)));
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={textareaId} className={fieldLabelClass}>
          {label}
        </label>
        <Button
          type="button"
          onClick={toggleOpen}
          title="Выбрать из справочника"
          aria-label={`Выбрать из справочника: ${label}`}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          variant="ghost"
          size="icon-xs"
          className="border border-primary/40 text-sm text-primary"
        >
          +
        </Button>
      </div>
      {open ? (
        <div
          id={listId}
          role="group"
          className="overflow-hidden rounded-lg border border-border bg-background"
        >
          {loading ? (
            <div className="px-2.5 py-1.5 text-xs text-muted-foreground">Загрузка…</div>
          ) : options.length > 0 ? (
            options.map((option, idx) => (
              <Button
                key={option.id}
                type="button"
                onClick={() => insertOption(option)}
                variant="ghost"
                className={cn(
                  "flex h-auto w-full min-w-0 flex-col items-start rounded-none",
                  "px-2.5 py-1.5 text-left whitespace-normal hover:bg-primary/10",
                  idx > 0 && "border-t border-border",
                )}
              >
                <span className="line-clamp-2 max-w-full break-words text-sm font-semibold text-foreground">
                  {option.title}
                </span>
                {option.meta ? (
                  <span className={cn(hintClass, "max-w-full break-words")}>{option.meta}</span>
                ) : null}
                {option.body ? (
                  <span className="line-clamp-2 max-w-full break-words text-xs text-muted-foreground">
                    {option.body}
                  </span>
                ) : null}
              </Button>
            ))
          ) : (
            <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
              В справочнике пока нет активных вариантов.
            </div>
          )}
        </div>
      ) : null}
      <Textarea
        id={textareaId}
        className="min-h-[38px]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
      />
    </div>
  );
}
