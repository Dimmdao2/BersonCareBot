"use client";

import Link from "next/link";
import { doctorClientProfileHref } from "../../clients/doctorClientProfileHref";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/doctor/primitives/dropdown-menu";

export type MediaItemForMenu = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  filename: string;
  displayName?: string | null;
  size: number;
  userId?: string | null;
  uploadedByName?: string | null;
  createdAt: string;
  url: string;
};

type Props = {
  item: MediaItemForMenu;
  resolutionText?: string | null;
  copied: boolean;
  deleting: boolean;
  onCopyUrl: () => void;
  onRename: () => void;
  onMoveFolder: () => void;
  onDelete: () => void;
  /** Просмотр в лайтбоксе (для списков; в плитке обычно только для `file`) */
  onOpenPreview?: () => void;
  formatSize: (bytes: number) => string;
  formatDate: (iso: string) => string;
  /** `icon` — только иконка в плитке; `label` — для мобильного списка */
  triggerVariant?: "icon" | "label";
};

export function MediaCardActionsMenu({
  item,
  resolutionText,
  copied,
  deleting,
  onCopyUrl,
  onRename,
  onMoveFolder,
  onDelete,
  onOpenPreview,
  formatSize,
  formatDate,
  triggerVariant = "icon",
}: Props) {
  const previewLabel = item.kind === "file" ? "Предпросмотр" : "Просмотр";
  const [menuOpen, setMenuOpen] = useState(false);
  const [usageLines, setUsageLines] = useState<string[] | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState(false);

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) {
      setUsageLines(null);
      setUsageLoading(false);
      setUsageError(false);
      return;
    }

    setUsageLoading(true);
    setUsageError(false);
    setUsageLines(null);
    void fetch(`/api/admin/media/${item.id}/usage-summary`, { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; lines?: string[]; total?: number };
        if (!res.ok || !data.ok) throw new Error("usage_failed");
        if ((data.total ?? 0) === 0) {
          setUsageLines(["Не используется"]);
        } else {
          setUsageLines(data.lines ?? []);
        }
      })
      .catch(() => {
        setUsageLines(null);
        setUsageError(true);
      })
      .finally(() => {
        setUsageLoading(false);
      });
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
      <DropdownMenuTrigger
        className={
          triggerVariant === "icon"
            ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-muted"
            : "inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs hover:bg-muted"
        }
        aria-label="Действия и сведения"
      >
        {triggerVariant === "icon" ? (
          <MoreHorizontal className="size-3" />
        ) : (
          <>
            <MoreHorizontal className="size-3" />
            Меню
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onCopyUrl}>{copied ? "URL скопирован" : "Скопировать URL"}</DropdownMenuItem>
          {onOpenPreview ? <DropdownMenuItem onClick={onOpenPreview}>{previewLabel}</DropdownMenuItem> : null}
          {item.kind === "file" ? (
            <DropdownMenuItem
              onClick={() => {
                window.open(item.url, "_blank", "noopener,noreferrer");
              }}
            >
              Открыть в новой вкладке
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onRename}>Переименовать</DropdownMenuItem>
          <DropdownMenuItem onClick={onMoveFolder}>Папка…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Сведения</DropdownMenuLabel>
          <div className="max-w-[16rem] space-y-1 px-2 py-1.5 text-xs text-muted-foreground">
            <p>
              {item.kind} · {formatSize(item.size)}
            </p>
            <p>Разрешение: {resolutionText ?? "—"}</p>
            <p>
              Загрузил:{" "}
              {item.userId ? (
                <Link
                  className="text-primary underline"
                  href={doctorClientProfileHref(item.userId, { profileListScope: "appointments" })}
                >
                  {item.uploadedByName?.trim() || item.userId}
                </Link>
              ) : (
                "неизвестно"
              )}
            </p>
            <p>{formatDate(item.createdAt)}</p>
            {item.displayName?.trim() ? (
              <p className="truncate" title={item.filename}>
                Файл: {item.filename}
              </p>
            ) : null}
            <p className="pt-1 font-medium text-foreground">Использование</p>
            {usageLoading ? (
              <p>Загрузка…</p>
            ) : usageError ? (
              <p>Не удалось загрузить</p>
            ) : usageLines && usageLines.length > 0 ? (
              <ul className="list-none space-y-0.5 p-0">
                {usageLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={deleting} onClick={onDelete}>
            {deleting ? "Удаление..." : "Удалить"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
