import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import {
  patientButtonDangerOutlineClass,
  patientButtonPrimaryClass,
  patientButtonSecondaryClass,
} from '@/shared/ui/patient/patientVisual';
import { buttonVariants as sharedButtonVariants } from '@/shared/ui/primitives/button-variants';

type SharedButtonVariants = VariantProps<typeof sharedButtonVariants>;

type PatientActionVariant = 'patient-primary' | 'patient-secondary' | 'patient-danger';
type PatientSize = 'patient-touch' | 'patient-compact';

export type ButtonVariants = {
  variant?: SharedButtonVariants['variant'] | PatientActionVariant;
  size?: SharedButtonVariants['size'] | PatientSize;
};

export type ButtonVariantProps = ButtonVariants & { className?: string };

const patientActionClasses: Record<PatientActionVariant, string> = {
  'patient-primary': patientButtonPrimaryClass,
  'patient-secondary': patientButtonSecondaryClass,
  'patient-danger': patientButtonDangerOutlineClass,
};

const patientSizeClasses: Record<PatientSize, string> = {
  'patient-touch': 'min-h-[var(--patient-touch)]',
  'patient-compact': 'min-h-10',
};

function isPatientActionVariant(
  variant: ButtonVariants['variant'],
): variant is PatientActionVariant {
  return variant != null && variant in patientActionClasses;
}

function isPatientSize(size: ButtonVariants['size']): size is PatientSize {
  return size != null && size in patientSizeClasses;
}

/**
 * Patient button classes. Global-compatible variants retain their shared implementation;
 * patient actions reuse the semantic patientVisual classes for Buttons and Links alike.
 *
 * `className` проходит через `cn` (tailwind-merge) на ОБОИХ ветках, как в общей обёртке
 * `shared/ui/primitives/button.tsx`: иначе утилиты варианта переживают собственные классы
 * вызова, и побеждает та, что стоит позже в сгенерированном CSS, а не та, что написана в
 * компоненте. Так шкала самочувствия получала `px-3` варианта поверх своего `p-0` и резала
 * эмодзи в вертикальную полоску 12×36.
 */
export function buttonVariants(props: ButtonVariantProps = {}): string {
  const { className, variant, size } = props;

  if (isPatientActionVariant(variant)) {
    return cn(
      patientActionClasses[variant],
      isPatientSize(size) && patientSizeClasses[size],
      className,
    );
  }

  return cn(
    sharedButtonVariants({ variant, size: isPatientSize(size) ? undefined : size }),
    className,
  );
}
