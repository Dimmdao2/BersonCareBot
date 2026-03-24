"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FieldType = "text" | "phone" | "email";

export type InlineEditFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  type?: FieldType;
  emptyLabel?: string;
  /** Вызывается при «Сохранить»; при ошибке можно throw — покажем сообщение. */
  onSave: (next: string) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
};

export function InlineEditField({
  label,
  value,
  placeholder = "",
  type = "text",
  emptyLabel = "не указано",
  onSave,
  className,
  disabled = false,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const trimmed = value.trim();
  const isEmpty = !trimmed;
  const inputType = type === "email" ? "email" : type === "phone" ? "tel" : "text";
  const inputMode = type === "phone" ? "tel" : type === "email" ? "email" : undefined;

  const handleSave = () => {
    setError(null);
    const next = draft.trim();
    startTransition(async () => {
      try {
        await onSave(next);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось сохранить");
      }
    });
  };

  const handleCancel = () => {
    setDraft(value);
    setError(null);
    setEditing(false);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</span>
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-xs"
            disabled={disabled}
            onClick={() => {
              setEditing(true);
              setDraft(value);
              setError(null);
            }}
          >
            {isEmpty ? "Добавить" : "Изменить"}
          </Button>
        ) : null}
      </div>

      {!editing ? (
        <p className="text-foreground min-h-[1.25rem] text-sm">{isEmpty ? emptyLabel : value}</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type={inputType}
            inputMode={inputMode}
            autoComplete={type === "email" ? "email" : type === "phone" ? "tel" : "name"}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending || disabled}
            className="max-w-md"
            aria-invalid={!!error}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={handleSave} disabled={pending || disabled}>
              {pending ? "…" : "Сохранить"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={pending}>
              Отмена
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
