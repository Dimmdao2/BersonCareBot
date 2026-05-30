"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROGRAM_SUBMISSION_FILE_INPUT_ACCEPT } from "@/modules/media/programSubmissionUploadLimits";
import {
  uploadProgramSubmissionMedia,
  waitForProgramSubmissionMediaReady,
} from "@/app/app/patient/treatment/uploadProgramSubmissionMedia";
import { attachProgramItemDiscussionMedia } from "@/app/app/patient/treatment/attachProgramItemDiscussionMedia";
import { cn } from "@/lib/utils";
import { patientPrimaryActionClass } from "@/shared/ui/patientVisual";

export type ProgramItemDiscussionMediaPickerHandle = {
  openPicker: () => void;
};

export const ProgramItemDiscussionMediaPicker = forwardRef<
  ProgramItemDiscussionMediaPickerHandle,
  {
    instanceId: string;
    itemId: string;
    disabled?: boolean;
    onUploaded?: () => void | Promise<void>;
    onError?: (message: string) => void;
    className?: string;
    variant?: "icon" | "button" | "hidden";
  }
>(function ProgramItemDiscussionMediaPicker(props, ref) {
  const { instanceId, itemId, disabled, onUploaded, onError, className, variant = "icon" } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const openPicker = useCallback(() => {
    if (disabled || busy) return;
    inputRef.current?.click();
  }, [busy, disabled]);

  useImperativeHandle(ref, () => ({ openPicker }), [openPicker]);

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file || disabled || busy) return;
      setBusy(true);
      try {
        const uploaded = await uploadProgramSubmissionMedia(file);
        if (!uploaded.ok) {
          onError?.(uploaded.error);
          return;
        }
        if (uploaded.isVideo) {
          const ready = await waitForProgramSubmissionMediaReady(uploaded.mediaId);
          if (!ready) {
            onError?.("video_processing_timeout");
            return;
          }
        }
        const attached = await attachProgramItemDiscussionMedia({
          instanceId,
          itemId,
          mediaFileId: uploaded.mediaId,
        });
        if (!attached.ok) {
          onError?.(attached.error);
          return;
        }
        await onUploaded?.();
      } catch {
        onError?.("network_error");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [busy, disabled, instanceId, itemId, onError, onUploaded],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={PROGRAM_SUBMISSION_FILE_INPUT_ACCEPT}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
      {variant === "hidden" ?
        null
      : variant === "icon" ?
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={className}
          disabled={disabled || busy}
          aria-label="Отправить фото или видео"
          onClick={openPicker}
        >
          <Camera className="size-4" aria-hidden />
        </Button>
      : <Button
          type="button"
          variant="outline"
          className={cn(patientPrimaryActionClass, className)}
          disabled={disabled || busy}
          onClick={openPicker}
        >
          {busy ? "Загрузка..." : "Фото или видео"}
        </Button>
      }
    </>
  );
});
