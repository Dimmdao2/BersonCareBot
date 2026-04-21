"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PickerSearchFieldProps = {
  id?: string;
  label: string;
  /** Классы для подписи над полем (например `sr-only`, чтобы скрыть визуально). */
  labelClassName?: string;
  placeholder?: string;
  value: string;
  onValueChange: (next: string) => void;
  className?: string;
  inputClassName?: string;
};

/**
 * Подпись + поле поиска для модалок выбора (медиатека, справочник упражнений и т.д.).
 */
export function PickerSearchField({
  id,
  label,
  labelClassName,
  placeholder,
  value,
  onValueChange,
  className,
  inputClassName,
}: PickerSearchFieldProps) {
  return (
    <label className={cn("flex min-w-[16rem] flex-1 flex-col gap-1 text-sm", className)}>
      <span className={cn("text-xs text-muted-foreground", labelClassName)}>{label}</span>
      <Input
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        lang="ru"
        className={inputClassName}
      />
    </label>
  );
}
