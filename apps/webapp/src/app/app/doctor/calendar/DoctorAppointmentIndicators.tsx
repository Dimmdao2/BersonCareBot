import {
  BadgeCheck,
  CreditCardCheck,
  CreditCardMinus,
  CreditCardX,
  ReceiptText,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppointmentDeliveryFormat } from '@/modules/booking-engine/types';

type Props = {
  deliveryFormat?: AppointmentDeliveryFormat | null;
  hasPackage?: boolean;
  appointmentStatus?: string | null;
  paymentStatus?: string | null;
  paymentAmountMinor?: number | null;
  totalMinor?: number | null;
  manualPaidMinor?: number | null;
  prepaymentRequiredMinor?: number | null;
  prepaymentPaidMinor?: number | null;
  prepaymentPending?: boolean;
  prepaymentExpired?: boolean;
  className?: string;
};

type Indicator = {
  icon: LucideIcon;
  label: string;
  className: string;
};

function paymentIndicator(props: Props): Indicator | null {
  if (props.prepaymentExpired) {
    return {
      icon: CreditCardX,
      label: 'Отменена из-за неоплаты',
      className: 'text-destructive',
    };
  }

  const onlinePaid = ['succeeded', 'captured', 'paid'].includes(props.paymentStatus ?? '')
    ? (props.paymentAmountMinor ?? props.prepaymentPaidMinor ?? 0)
    : 0;
  const paidMinor = onlinePaid + (props.manualPaidMinor ?? 0);
  const fullyPaid =
    props.appointmentStatus === 'paid' ||
    (props.totalMinor != null && props.totalMinor > 0 && paidMinor >= props.totalMinor);
  if (fullyPaid) {
    return {
      icon: ReceiptText,
      label: 'Полностью оплачено',
      className: 'text-emerald-700',
    };
  }

  if (
    (props.prepaymentPaidMinor ?? 0) > 0 ||
    ['succeeded', 'captured'].includes(props.paymentStatus ?? '')
  ) {
    return {
      icon: CreditCardCheck,
      label: 'Предоплата внесена',
      className: 'text-emerald-700',
    };
  }

  if (
    props.prepaymentPending ||
    (props.prepaymentRequiredMinor ?? 0) > (props.prepaymentPaidMinor ?? 0) ||
    ['pending', 'processing', 'requires_action'].includes(props.paymentStatus ?? '')
  ) {
    return {
      icon: CreditCardMinus,
      label: 'Ожидает предоплату',
      className: 'text-amber-700',
    };
  }

  return null;
}

function IndicatorSlot({ indicator }: { indicator: Indicator | null }) {
  if (!indicator) return <span className="size-4" aria-hidden />;
  const Icon = indicator.icon;
  return (
    <span
      className={cn('inline-flex size-4 items-center justify-center', indicator.className)}
      title={indicator.label}
      aria-label={indicator.label}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

/** Fixed-width appointment facts: format, membership and payment never shift between rows. */
export function DoctorAppointmentIndicators(props: Props) {
  return (
    <span className={cn('grid shrink-0 grid-cols-3 gap-1.5', props.className)}>
      <IndicatorSlot
        indicator={
          props.deliveryFormat === 'online'
            ? { icon: Video, label: 'Онлайн-приём', className: 'text-primary' }
            : null
        }
      />
      <IndicatorSlot
        indicator={
          props.hasPackage
            ? { icon: BadgeCheck, label: 'По абонементу', className: 'text-primary' }
            : null
        }
      />
      <IndicatorSlot indicator={paymentIndicator(props)} />
    </span>
  );
}
