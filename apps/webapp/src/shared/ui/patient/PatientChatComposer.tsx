'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageComposer } from '@/shared/ui/chat/MessageComposer';
import { Button } from '@/shared/ui/patient/primitives/button';
import { Textarea } from '@/shared/ui/patient/primitives/textarea';

type PatientChatComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  disabled?: boolean;
  placeholder: string;
  ariaLabel: string;
  submitAriaLabel: string;
  maxLength?: number;
  leadingControl?: ReactNode;
  status?: ReactNode;
  className?: string;
};

/** Patient-zone adapter for the established doctor chat composer behavior and geometry. */
export function PatientChatComposer({
  value,
  onValueChange,
  onSubmit,
  submitting,
  disabled = false,
  placeholder,
  ariaLabel,
  submitAriaLabel,
  maxLength = 4000,
  leadingControl,
  status,
  className,
}: PatientChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const verticalChrome =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom) +
      Number.parseFloat(styles.borderTopWidth) +
      Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * 10 + verticalChrome;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value]);

  return (
    <MessageComposer
      value={value}
      onValueChange={onValueChange}
      onSubmit={onSubmit}
      submitting={submitting}
      disabled={disabled}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      submitLabel={<ArrowUp className="size-4" aria-hidden />}
      submittingLabel={<ArrowUp className="size-4" aria-hidden />}
      submitAriaLabel={submitAriaLabel}
      maxLength={maxLength}
      rows={1}
      textareaRef={textareaRef}
      submitInsideInput
      leadingControl={leadingControl}
      status={status}
      inputRowClassName="relative flex items-end gap-2"
      className={cn(
        'flex shrink-0 flex-col gap-2 border-t border-[var(--patient-border)] bg-[var(--patient-card-bg)] py-3',
        className,
      )}
      renderTextarea={(props) => (
        <Textarea
          {...props}
          className="min-h-10 flex-1 resize-none rounded-[var(--patient-chat-composer-radius)] py-2 pr-10 pl-3 leading-5"
        />
      )}
      renderSubmit={(props) => (
        <Button
          {...props}
          size="icon"
          className="absolute right-[var(--patient-chat-composer-submit-inline-offset)] bottom-[var(--patient-chat-composer-submit-block-offset)] size-[var(--patient-chat-composer-submit-size)] rounded-full p-0"
        />
      )}
    />
  );
}
