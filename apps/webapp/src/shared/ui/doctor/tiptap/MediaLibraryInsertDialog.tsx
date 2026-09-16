'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/shared/ui/doctor/tiptap/primitives/button';
import { ImagePlusIcon } from '@/shared/ui/doctor/tiptap/icons/image-plus-icon';
import { MediaPickerPanel } from '@/shared/ui/doctor/media/MediaPickerPanel';
import { MediaPickerShell } from '@/shared/ui/doctor/media/MediaPickerShell';
import type { MediaListItem } from '@/shared/ui/doctor/media/MediaPickerList';
import { notificationText } from '@/shared/notifications/notificationText';

export type MediaLibraryInsertPickMeta = Pick<MediaListItem, 'kind' | 'mimeType'>;

type Props = {
  onInsert: (url: string, filename: string, meta?: MediaLibraryInsertPickMeta) => void;
  disabled?: boolean;
};

export function MediaLibraryInsertDialog({ onInsert, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [folderScope, setFolderScope] = useState<string | null | undefined>(undefined);
  const [pickError, setPickError] = useState<string | null>(null);

  const handlePicked = useCallback(
    (item: MediaListItem) => {
      const imagePreviewUrl = item.previewMdUrl?.trim() || item.previewSmUrl?.trim();
      if (item.kind === 'image' && (item.previewStatus !== 'ready' || !imagePreviewUrl)) {
        setPickError(notificationText.mediaImagePreviewPending);
        return;
      }
      if (item.kind === 'video' && (item.previewStatus !== 'ready' || !imagePreviewUrl)) {
        setPickError(notificationText.mediaVideoPreviewPending);
        return;
      }
      setPickError(null);
      onInsert(item.url, item.filename, {
        kind: item.kind,
        mimeType: item.mimeType,
      });
      setOpen(false);
    },
    [onInsert],
  );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        tooltip="Добавить из библиотеки или загрузить"
        aria-label="Добавить из библиотеки или загрузить"
        onClick={() => setOpen(true)}
      >
        <ImagePlusIcon className="tiptap-button-icon" />
        <span className="tiptap-button-text">Добавить</span>
      </Button>
      <MediaPickerShell
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setPickError(null);
        }}
        title="Библиотека файлов"
      >
        <div className="flex min-h-0 flex-col gap-2">
          <MediaPickerPanel
            key={open ? 'insert-open' : 'insert-closed'}
            open={open}
            apiKind="all"
            folderId={folderScope}
            kind="all"
            onPick={handlePicked}
            exercisePicker={false}
            onPickerFolderIdChange={setFolderScope}
            showSort
          />
          {pickError ? (
            <p className="m-0 text-sm text-destructive" role="alert">
              {pickError}
            </p>
          ) : null}
        </div>
      </MediaPickerShell>
    </>
  );
}
