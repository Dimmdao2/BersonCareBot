"use client";

import Link from "next/link";
import { EllipsisVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          triggerVariant === "icon"
            ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-muted"
            : "inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs hover:bg-muted"
        }
        aria-label="Действия и сведения"
      >
        {triggerVariant === "icon" ? (
          <EllipsisVertical className="size-4" />
        ) : (
          <>
            <EllipsisVertical className="size-4" />
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
                <Link className="text-primary underline" href={`/app/doctor/clients/${item.userId}`}>
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
