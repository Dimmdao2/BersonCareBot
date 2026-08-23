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
  secondaryValue?: ReactNode;
  layout?: 'default' | 'today-mobile-grid';
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
  secondaryValue,
  layout = 'default',
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

  const label = (
    <p
      className={cn(
        doctorMetricLabelClass,
        layout === 'today-mobile-grid' && 'text-xs text-foreground/85',
        selected && 'text-primary',
      )}
    >
      {title}
    </p>
  );
  const valueNode = (
    <div className={cn(doctorMetricValueClass, selected && 'text-primary', valueClassName)}>
      {value}
    </div>
  );
  const hintNode = hint ? (
    <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>
  ) : null;
  const inner =
    layout === 'today-mobile-grid' ? (
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_3.25ch_4.25ch] items-baseline gap-x-1.5 md:block">
        {label}
        <div className="contents md:mt-0.5 md:flex md:w-full md:items-baseline md:justify-start md:gap-1">
          <div className="col-start-2 text-right">{valueNode}</div>
          {secondaryValue !== undefined ? (
            <div className="col-start-3 flex items-baseline justify-end gap-0.5 font-semibold tabular-nums text-foreground/75">
              <span aria-hidden className="text-sm font-normal text-muted-foreground">
                /
              </span>
              <span className="text-[18px] leading-none">{secondaryValue}</span>
            </div>
          ) : null}
        </div>
        {hint ? <div className="col-span-full">{hintNode}</div> : null}
      </div>
    ) : (
      <>
        {label}
        <div className="mt-0.5">{valueNode}</div>
        {hintNode}
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
