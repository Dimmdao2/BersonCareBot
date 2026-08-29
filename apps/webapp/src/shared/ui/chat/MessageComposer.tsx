'use client';

import type { ChangeEventHandler, FocusEventHandler, ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';

export type MessageComposerTextareaProps = {
  ref?: Ref<HTMLTextAreaElement>;
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  placeholder: string;
  disabled: boolean;
  maxLength?: number;
  rows?: number;
  'aria-label': string;
};

export type MessageComposerSubmitProps = {
  type: 'button';
  disabled: boolean;
  onClick: () => void;
  'aria-label'?: string;
  children: ReactNode;
};

export type MessageComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  disabled?: boolean;
  disableSubmitWhenEmpty?: boolean;
  placeholder: string;
  ariaLabel: string;
  submitLabel: ReactNode;
  submittingLabel: ReactNode;
  submitAriaLabel?: string;
  maxLength?: number;
  rows?: number;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  renderTextarea: (props: MessageComposerTextareaProps) => ReactNode;
  renderSubmit: (props: MessageComposerSubmitProps) => ReactNode;
  /** Places the primary submit control inside the textarea row (chat-style composer). */
  submitInsideInput?: boolean;
  renderActions?: (submit: ReactNode, secondaryActions: ReactNode) => ReactNode;
  header?: ReactNode;
  leadingControl?: ReactNode;
  trailingControl?: ReactNode;
  status?: ReactNode;
  secondaryActions?: ReactNode;
  className?: string;
  inputRowClassName?: string;
  actionsClassName?: string;
};

/**
 * Shared chat/comments composer interaction and layout.
 *
 * Zone adapters provide their own patient/doctor textarea and button primitives;
 * this component owns trim validation, disabled/loading state, and stable slots.
 * Native textarea Enter and Shift+Enter behavior is intentionally left unchanged.
 */
export function MessageComposer({
  value,
  onValueChange,
  onSubmit,
  submitting,
  disabled = false,
  disableSubmitWhenEmpty = true,
  placeholder,
  ariaLabel,
  submitLabel,
  submittingLabel,
  submitAriaLabel,
  maxLength,
  rows,
  textareaRef,
  onFocus,
  onBlur,
  renderTextarea,
  renderSubmit,
  submitInsideInput = false,
  renderActions,
  header,
  leadingControl,
  trailingControl,
  status,
  secondaryActions,
  className,
  inputRowClassName,
  actionsClassName,
}: MessageComposerProps) {
  const controlsDisabled = submitting || disabled;
  const textarea = renderTextarea({
    ref: textareaRef,
    value,
    onChange: (event) => onValueChange(event.target.value),
    onFocus,
    onBlur,
    placeholder,
    disabled: controlsDisabled,
    maxLength,
    rows,
    'aria-label': ariaLabel,
  });
  const submit = renderSubmit({
    type: 'button',
    disabled: controlsDisabled || (disableSubmitWhenEmpty && value.trim().length === 0),
    onClick: () => void onSubmit(),
    'aria-label': submitAriaLabel,
    children: submitting ? submittingLabel : submitLabel,
  });

  return (
    <div className={className}>
      {header}
      {leadingControl || trailingControl || inputRowClassName || submitInsideInput ? (
        <div className={cn(inputRowClassName)}>
          {leadingControl}
          {textarea}
          {trailingControl}
          {submitInsideInput ? submit : null}
        </div>
      ) : (
        textarea
      )}
      {status}
      {submitInsideInput ? null : renderActions ? (
        renderActions(submit, secondaryActions)
      ) : secondaryActions || actionsClassName ? (
        <div className={actionsClassName}>
          {submit}
          {secondaryActions}
        </div>
      ) : (
        submit
      )}
    </div>
  );
}
