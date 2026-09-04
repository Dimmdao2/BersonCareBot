'use client';

import type { HTMLAttributes } from 'react';
import type { ActionFailureFields } from '@/shared/http/apiResponse';
import { cn } from '@/lib/utils';

/** Same wording as `DataLoadFailureNotice` — one phrase in this app for one thing. */
const SUPPORT_REF_LABEL = 'Код для поддержки';

/**
 * The support reference for a failed server action, or `null` when the door could name the failure
 * and there is nothing filed to look up. Callers that can only show one line (toast, `title`) join
 * it themselves; the component below puts it on its own line.
 */
export function actionFailureSupportRef(failure: ActionFailureFields): string | null {
  return failure.correlationId ? `${SUPPORT_REF_LABEL}: ${failure.correlationId}` : null;
}

/** One line for surfaces that have no room for two — the toast in `TemplateEditor`. */
export function actionFailureLine(failure: ActionFailureFields): string {
  const ref = actionFailureSupportRef(failure);
  return ref ? `${failure.error} · ${ref}` : failure.error;
}

/**
 * The inline failure line under a doctor-zone form or dialog. The action's own copy is rendered
 * unchanged — a tariff refusal or a validation sentence is what the person actually needs — and the
 * reference appears only for the failure the door could not name, which is the one case where the
 * screen says nothing an operator can act on.
 */
export function ActionFailureText({
  failure,
  className,
  ...rest
}: {
  failure: ActionFailureFields | null;
  className?: string;
} & Omit<HTMLAttributes<HTMLParagraphElement>, 'children' | 'className'>) {
  if (!failure) return null;
  const supportRef = actionFailureSupportRef(failure);
  return (
    <p className={cn('text-sm text-destructive', className)} role="alert" {...rest}>
      {failure.error}
      {supportRef ? (
        <span className="mt-1 block font-mono text-xs text-muted-foreground select-all">
          {supportRef}
        </span>
      ) : null}
    </p>
  );
}
