"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaFolderRecord } from "@/modules/media/types";
import { cn } from "@/lib/utils";
import { mediaFolderPathLabel, sortMediaFoldersByPathRu } from "./mediaFolderScopeUtils";

/** `undefined` — все папки в выдаче API; `null` — только корень; uuid — конкретная папка. */
export type MediaFolderScopeValue = string | null | undefined;

export type MediaLibraryFolderScopeSelectProps = {
  id?: string;
  value: MediaFolderScopeValue;
  onChange: (next: MediaFolderScopeValue) => void;
  folders: MediaFolderRecord[];
  foldersLoaded: boolean;
  /** Если `false`, в списке только «Корень» и папки (без «Все папки»). По умолчанию `true`. */
  allowAllFolders?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
  triggerClassName?: string;
};

function selectItemValue(value: MediaFolderScopeValue): string {
  if (value === undefined) return "__all__";
  if (value === null) return "__root__";
  return value;
}

function scopeFromSelectItem(v: string): MediaFolderScopeValue {
  if (v === "__all__") return undefined;
  if (v === "__root__") return null;
  return v;
}

function displayLabel(
  value: MediaFolderScopeValue,
  folders: MediaFolderRecord[],
  foldersLoaded: boolean,
): string {
  if (value === undefined) return "Все папки";
  if (value === null) return "Корень";
  const f = folders.find((x) => x.id === value);
  if (f) return mediaFolderPathLabel(f, folders);
  return foldersLoaded ? value : "Загрузка…";
}

/**
 * Общий выбор области библиотеки по папкам (все / корень / папка).
 * Данные папок передаёт родитель (например из `useFlatMediaFolders`), чтобы один источник
 * совпадал у модалок и полноэкранной библиотеки.
 */
export function MediaLibraryFolderScopeSelect({
  id,
  value,
  onChange,
  folders,
  foldersLoaded,
  allowAllFolders = true,
  disabled,
  className,
  label = "Папка",
  triggerClassName,
}: MediaLibraryFolderScopeSelectProps) {
  const sorted = sortMediaFoldersByPathRu(folders);
  const internalValue = selectItemValue(value);
  const labelText = displayLabel(value, folders, foldersLoaded);

  return (
    <div className={cn("flex min-w-[10rem] flex-1 flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select
        value={internalValue}
        disabled={disabled}
        onValueChange={(v) => {
          if (v == null || typeof v !== "string") return;
          onChange(scopeFromSelectItem(v));
        }}
      >
        <SelectTrigger id={id} size="sm" className={cn("w-full max-w-full min-w-0 text-left", triggerClassName)}>
          <SelectValue placeholder={label}>{labelText}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allowAllFolders ? <SelectItem value="__all__">Все папки</SelectItem> : null}
          <SelectItem value="__root__">Корень</SelectItem>
          {sorted.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {mediaFolderPathLabel(f, folders)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
