import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import {
  doctorMetricLabelClass,
  doctorMetricValueClass,
  doctorInteractiveSurfaceButtonClass,
  doctorStatCardInteractiveClass,
  doctorStatCardShellClass,
  doctorStatCardShellWarningClass,
} from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/doctor/primitives/tooltip';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  title: string;
  value: ReactNode;
  tone?: 'neutral' | 'warning';
  hint?: string;
  tooltip?: string;
  selected?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
  valueClassName?: string;
};

export function DoctorStatCard({
  id,
  title,
  value,
  tone = 'neutral',
  hint,
  tooltip,
  selected,
  href,
  onClick,
  className,
  valueClassName,
}: Props) {
  const shellClass = cn(
    tone === 'warning' ? doctorStatCardShellWarningClass : doctorStatCardShellClass,
    (href || onClick) && doctorStatCardInteractiveClass,
    selected &&
      'border-primary/35 bg-primary/15 text-primary ring-1 ring-primary/25 hover:border-primary/40 hover:bg-primary/20',
    className,
  );

  const inner = (
    <>
      <p className={cn(doctorMetricLabelClass, selected && 'text-primary')}>{title}</p>
      <div
        className={cn('mt-0.5', doctorMetricValueClass, selected && 'text-primary', valueClassName)}
      >
        {value}
      </div>
      {hint ? (
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </>
  );

  let trigger: ReactElement;

  if (href) {
    trigger = (
      <Link id={id} href={href} className={shellClass}>
        {inner}
      </Link>
    );
  } else if (onClick) {
    trigger = (
      <Button
        id={id}
        type="button"
        variant="ghost"
        className={cn(
          doctorInteractiveSurfaceButtonClass,
          shellClass,
          'w-full justify-start text-left',
        )}
        onClick={onClick}
        aria-pressed={selected}
      >
        {inner}
      </Button>
    );
  } else {
    trigger = (
      <article id={id} className={shellClass} tabIndex={tooltip ? 0 : undefined}>
        {inner}
      </article>
    );
  }

  if (!tooltip) return trigger;

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
