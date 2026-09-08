'use client';

import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/patient/primitives/button';
import { PatientModal, PatientModalFooter } from '@/shared/ui/patient/PatientModal';
import { patientBodyTextClass } from '@/shared/ui/patient/patientVisual';

export function PatientConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  pending = false,
  destructive = false,
  nested = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  destructive?: boolean;
  nested?: boolean;
}) {
  return (
    <PatientModal open={open} onClose={onClose} title={title} size="sm" nested={nested}>
      <div className={patientBodyTextClass}>{children}</div>
      <PatientModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? 'destructive' : 'default'}
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? 'Подождите…' : confirmLabel}
        </Button>
      </PatientModalFooter>
    </PatientModal>
  );
}
