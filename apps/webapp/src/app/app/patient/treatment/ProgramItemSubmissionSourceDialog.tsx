"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Camera, FolderOpen, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PROGRAM_SUBMISSION_FILE_INPUT_ACCEPT } from "@/modules/media/programSubmissionUploadLimits";
import { uploadProgramSubmissionToDiscussion } from "@/app/app/patient/treatment/uploadProgramSubmissionToDiscussion";
import { cn } from "@/lib/utils";
import { patientPrimaryActionClass } from "@/shared/ui/patientVisual";

export type ProgramItemSubmissionSourceDialogHandle = {
  open: () => void;
};

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
      try {
        const result = await uploadProgramSubmissionToDiscussion({ instanceId, itemId, file });
        if (!result.ok) {
          onError?.(result.error);
          return;
        }
        await onUploaded?.();
      } catch {
        onError?.("network_error");
      } finally {
        setBusy(false);
        if (recordInputRef.current) recordInputRef.current.value = "";
        if (galleryInputRef.current) galleryInputRef.current.value = "";
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [busy, disabled, instanceId, itemId, onError, onUploaded],
  );

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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-lg border border-[var(--patient-border)] shadow-md sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Добавить фото или видео</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className={cn(patientPrimaryActionClass, "justify-start gap-2")}
              disabled={disabled || busy}
              onClick={() => recordInputRef.current?.click()}
            >
              <Camera className="size-4 shrink-0" aria-hidden />
              Записать
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start gap-2"
              disabled={disabled || busy}
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImageIcon className="size-4 shrink-0" aria-hidden />
              Галерея
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start gap-2"
              disabled={disabled || busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderOpen className="size-4 shrink-0" aria-hidden />
              Файлы
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
