'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Camera, FolderOpen, ImageIcon } from 'lucide-react';
import { Button } from '@/shared/ui/patient/primitives/button';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import {
  MIN_PROGRAM_SUBMISSION_VIDEO_DURATION_SECONDS,
  PROGRAM_SUBMISSION_FILE_INPUT_ACCEPT,
} from '@/modules/media/programSubmissionUploadLimits';
import { uploadProgramSubmissionToDiscussion } from '@/app/app/patient/treatment/uploadProgramSubmissionToDiscussion';
import { waitForProgramSubmissionMediaReady } from '@/app/app/patient/treatment/uploadProgramSubmissionMedia';
import { attachProgramItemDiscussionMedia } from '@/app/app/patient/treatment/attachProgramItemDiscussionMedia';
import { cn } from '@/lib/utils';
import { patientPrimaryActionClass } from '@/shared/ui/patient/patientVisual';
import { useNativeRuntime } from '@/shared/hooks/useNativeRuntime';
import {
  captureDeviceMedia,
  isNativeDeviceMediaAvailable,
  pickDeviceMediaFromGallery,
  type DeviceMediaPickResult,
} from '@/shared/lib/deviceMedia';
import { deviceMediaMultipartUpload } from '@/shared/lib/media/deviceMediaMultipartUpload';

export type ProgramItemSubmissionSourceDialogHandle = {
  open: () => void;
};

/**
 * iOS Safari bug workaround: after the native file picker closes, the browser sometimes
 * leaves the viewport scaled. Temporarily setting maximum-scale=1 forces a zoom reset.
 */
function resetIosMobileZoom() {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const original = meta.content;
  if (original.includes('maximum-scale=1')) return;
  meta.content = original + ',maximum-scale=1';
  requestAnimationFrame(() => {
    meta.content = original;
  });
}

/**
 * Выбор источника файла поверх обсуждения: маленькая модалка следующего слоя.
 * Второе затемнение не рисуется (общий стек слоёв {@link PatientModal}), а обсуждение под ней
 * остаётся смонтированным — закрытие возвращает в тот же тред с сохранённым черновиком.
 */
export const ProgramItemSubmissionSourceDialog = forwardRef<
  ProgramItemSubmissionSourceDialogHandle,
  {
    instanceId: string;
    itemId: string;
    disabled?: boolean;
    onUploaded?: () => void | Promise<void>;
    onError?: (message: string) => void;
  }
>(function ProgramItemSubmissionSourceDialog(props, ref) {
  const { instanceId, itemId, disabled, onUploaded, onError } = props;
  const nativeRuntime = useNativeRuntime();
  const nativeMediaAvailable = isNativeDeviceMediaAvailable(nativeRuntime);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const recordInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        if (disabled || busy) return;
        setOpen(true);
      },
    }),
    [busy, disabled],
  );

  const processFile = useCallback(
    async (file: File | null) => {
      if (!file || disabled || busy) return;
      setBusy(true);
      setOpen(false);
      resetIosMobileZoom();
      try {
        const result = await uploadProgramSubmissionToDiscussion({ instanceId, itemId, file });
        if (!result.ok) {
          onError?.(result.error);
          return;
        }
        await onUploaded?.();
      } catch {
        onError?.('network_error');
      } finally {
        setBusy(false);
        if (recordInputRef.current) recordInputRef.current.value = '';
        if (galleryInputRef.current) galleryInputRef.current.value = '';
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [busy, disabled, instanceId, itemId, onError, onUploaded],
  );

  /**
   * Native selection (M5-01/M5-04): большое видео остаётся native content URI и стримится через
   * тот же multipart-путь, что уже авторизован для этой submission-двери; duration/access/attach
   * поведение — то же, что и у browser-пути выше (`processFile`).
   */
  const processNativeSelection = useCallback(
    async (pick: DeviceMediaPickResult, fallback: () => void) => {
      if (pick.outcome === 'unavailable') {
        fallback();
        return;
      }
      if (pick.outcome === 'cancelled' || disabled || busy) return;
      const { selection } = pick;
      const isVideo = selection.kind === 'video';
      setBusy(true);
      setOpen(false);
      resetIosMobileZoom();
      try {
        if (isVideo) {
          if (selection.durationSeconds === null) {
            onError?.('video_metadata_unavailable');
            return;
          }
          if (selection.durationSeconds < MIN_PROGRAM_SUBMISSION_VIDEO_DURATION_SECONDS) {
            onError?.('video_too_short');
            return;
          }
        }
        const { mediaId } = await deviceMediaMultipartUpload({
          selection,
          begin: {
            url: '/api/patient/media/program-submission/presign',
            extraBody: {
              instanceId,
              ...(isVideo ? { durationSeconds: selection.durationSeconds } : {}),
            },
          },
          signal: new AbortController().signal,
          onProgress: () => {},
        });
        if (isVideo) {
          const ready = await waitForProgramSubmissionMediaReady(mediaId, instanceId);
          if (!ready) {
            onError?.('video_processing_timeout');
            return;
          }
        }
        const attached = await attachProgramItemDiscussionMedia({ instanceId, itemId, mediaFileId: mediaId });
        if (!attached.ok) {
          onError?.(attached.error);
          return;
        }
        await onUploaded?.();
      } catch {
        onError?.('network_error');
      } finally {
        setBusy(false);
      }
    },
    [busy, disabled, instanceId, itemId, onError, onUploaded],
  );

  async function onRecordPress() {
    if (disabled || busy) return;
    if (nativeMediaAvailable) {
      await processNativeSelection(await captureDeviceMedia('photo'), () => recordInputRef.current?.click());
      return;
    }
    recordInputRef.current?.click();
  }

  async function onGalleryPress() {
    if (disabled || busy) return;
    if (nativeMediaAvailable) {
      await processNativeSelection(await pickDeviceMediaFromGallery({ requiresDuration: true }), () =>
        galleryInputRef.current?.click(),
      );
      return;
    }
    galleryInputRef.current?.click();
  }

  async function onFilesPress() {
    if (disabled || busy) return;
    if (nativeMediaAvailable) {
      await processNativeSelection(await pickDeviceMediaFromGallery({ requiresDuration: true }), () =>
        fileInputRef.current?.click(),
      );
      return;
    }
    fileInputRef.current?.click();
  }

  return (
    <>
      <input
        ref={recordInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void processFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void processFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={PROGRAM_SUBMISSION_FILE_INPUT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void processFile(e.target.files?.[0] ?? null)}
      />
      <PatientModal
        open={open}
        onClose={() => setOpen(false)}
        title="Добавить фото или видео"
        size="sm"
      >
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className={cn(patientPrimaryActionClass, 'justify-start gap-2')}
            disabled={disabled || busy}
            onClick={() => void onRecordPress()}
          >
            <Camera className="size-4 shrink-0" aria-hidden />
            Записать
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            disabled={disabled || busy}
            onClick={() => void onGalleryPress()}
          >
            <ImageIcon className="size-4 shrink-0" aria-hidden />
            Галерея
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2"
            disabled={disabled || busy}
            onClick={() => void onFilesPress()}
          >
            <FolderOpen className="size-4 shrink-0" aria-hidden />
            Файлы
          </Button>
        </div>
      </PatientModal>
    </>
  );
});
