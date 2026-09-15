'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { MediaPickerShell } from '@/shared/ui/doctor/media/MediaPickerShell';
import { MediaPickerPanel } from '@/shared/ui/doctor/media/MediaPickerPanel';
import type { MediaListItem } from '@/shared/ui/doctor/media/MediaPickerList';
import { MediaIdThumb } from '@/shared/ui/doctor/media/MediaIdThumb';

export type OrgBrandLogoChange = { mediaId: string; url: string } | null;

type Props = {
  /** Server-resolved published logo, or `null` when nothing is set (empty state). */
  initialMediaId: string | null;
  initialUrl: string | null;
  onChange: (next: OrgBrandLogoChange) => void;
  disabled?: boolean;
  /** Подпись пустого состояния квадрата предпросмотра. */
  emptyLabel?: string;
  /** Заголовок диалога выбора файла. */
  pickerTitle?: string;
  /** Префикс ключа панели выбора: два контрола на одной странице не должны делить состояние. */
  instanceKey?: string;
  /** Ограничение по размеру картинки для этого поля (см. `MediaPickerPanel.sourceGate`). */
  sourceGate?: (size: { width: number; height: number } | null) => string | null;
};

/**
 * UX-05 B2 — logo control for the clinic brand editing surface. Owner naming (2026-07-25,
 * BRANDING_DOMAIN_CONTRACT.md "Owner decisions on the brand editing UI"): the two actions are
 * «Установить» and «Очистить» — «Установить» also covers replacing an existing logo, there is no
 * separate replace action, and «Очистить» only unlinks the logo (the file stays in the library).
 *
 * Reuses the SAME picker/upload pipeline as the content library and exercise/recommendation media
 * pickers (`MediaPickerShell` + `MediaPickerPanel`, which itself calls `/api/media/upload`) — no
 * hand-rolled upload path. Only the two-button chrome here is new; `MediaLibraryPickerDialog`
 * (the shared component other forms use) is left untouched because its "Изменить" dropdown chrome
 * does not match the owner's exact two-action naming for this screen.
 *
 * Тот же контрол обслуживает и «Иконку приложения» (владелец 10.09.2026, вариант A): различаются
 * только подписи и заголовок диалога, поэтому это параметры, а не второй такой же компонент.
 */
export function OrgBrandLogoControl({
  initialMediaId,
  initialUrl,
  onChange,
  disabled = false,
  emptyLabel = 'Нет лого',
  pickerTitle = 'Логотип организации',
  instanceKey = 'org-brand-logo',
  sourceGate,
}: Props) {
  const [open, setOpen] = useState(false);
  // Состояние превью здесь не хранится вовсе: его знает `MediaIdThumb` по одному идентификатору и
  // сам доспрашивает дверь, пока файл считается (владелец 15.09.2026 — «по логотипам всё чинить»,
  // единым механизмом). Форме остаётся только выбранный файл и адрес для `onChange`.
  const [mediaId, setMediaId] = useState<string | null>(
    initialMediaId && initialUrl ? initialMediaId : null,
  );

  const handlePick = (item: MediaListItem) => {
    setMediaId(item.id);
    onChange({ mediaId: item.id, url: item.url });
    setOpen(false);
  };

  const handleClear = () => {
    setMediaId(null);
    onChange(null);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/30">
        <MediaIdThumb
          mediaId={mediaId}
          className="h-16 w-16"
          imgClassName="h-16 w-16 object-contain"
          sizes="64px"
          lazy={false}
          density="compact"
          labels={{ skipped: 'Без превью', failed: 'Ошибка превью' }}
          empty={
            <span className="px-1 text-center text-[10px] text-muted-foreground">{emptyLabel}</span>
          }
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Установить
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !mediaId}
          onClick={handleClear}
        >
          Очистить
        </Button>
      </div>

      <MediaPickerShell title={pickerTitle} open={open} onOpenChange={setOpen}>
        <MediaPickerPanel
          key={open ? `${instanceKey}-open` : `${instanceKey}-closed`}
          open={open}
          apiKind="image"
          kind="image"
          folderId={undefined}
          onPick={handlePick}
          exercisePicker={false}
          onPickerFolderIdChange={() => {}}
          showSort={false}
          showFolderScope={false}
          {...(sourceGate ? { sourceGate } : {})}
        />
      </MediaPickerShell>
    </div>
  );
}
