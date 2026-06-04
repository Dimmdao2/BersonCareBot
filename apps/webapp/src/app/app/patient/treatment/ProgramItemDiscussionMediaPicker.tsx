"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/shared/ui/patient/primitives/button";
import {
  ProgramItemSubmissionSourceDialog,
  type ProgramItemSubmissionSourceDialogHandle,
} from "@/app/app/patient/treatment/ProgramItemSubmissionSourceDialog";
import { cn } from "@/lib/utils";
import { patientPrimaryActionClass } from "@/shared/ui/patient/patientVisual";

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
  const sourceDialogRef = useRef<ProgramItemSubmissionSourceDialogHandle>(null);

  useImperativeHandle(
    ref,
    () => ({
      openPicker: () => sourceDialogRef.current?.open(),
    }),
    [],
  );

  return (
    <>
      <ProgramItemSubmissionSourceDialog
        ref={sourceDialogRef}
        instanceId={instanceId}
        itemId={itemId}
        disabled={disabled}
        onUploaded={onUploaded}
        onError={onError}
      />
      {variant === "hidden" ?
        null
      : variant === "icon" ?
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={className}
          disabled={disabled}
          aria-label="Отправить фото или видео"
          onClick={() => sourceDialogRef.current?.open()}
        >
          <Camera className="size-4" aria-hidden />
        </Button>
      : <Button
          type="button"
          variant="outline"
          className={cn(patientPrimaryActionClass, className)}
          disabled={disabled}
          onClick={() => sourceDialogRef.current?.open()}
        >
          Фото или видео
        </Button>
      }
    </>
  );
});
