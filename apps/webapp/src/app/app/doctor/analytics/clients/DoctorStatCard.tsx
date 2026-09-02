import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import {
  doctorInlineMetricValueClass,
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
import { doctorClientPrimaryOutlineActionClass } from '@/app/app/doctor/clients/doctorClientCardChrome';

type Props = {
  id: string;
  title: string;
  value: ReactNode;
  secondaryValue?: ReactNode;
  tone?: 'neutral' | 'warning';
  hint?: string;
  tooltip?: string;
  selected?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
  valueClassName?: string;
  testId?: string;
  valuePlacement?: 'responsive' | 'inline';
  actionIcon?: ReactNode;
  actionLabel?: string;
  onActionClick?: () => void;
};

export function DoctorStatCard({
  id,
  title,
  value,
  secondaryValue,
  tone = 'neutral',
  hint,
  tooltip,
  selected,
  href,
  onClick,
  className,
  valueClassName,
  testId,
  valuePlacement = 'responsive',
  actionIcon,
  actionLabel,
  onActionClick,
}: Props) {
  const shellClass = cn(
    tone === 'warning' ? doctorStatCardShellWarningClass : doctorStatCardShellClass,
    (href || onClick) && doctorStatCardInteractiveClass,
    selected &&
      'border-primary/35 bg-primary/15 text-primary ring-1 ring-primary/25 hover:border-primary/40 hover:bg-primary/20',
    className,
  );

  const label = <p className={cn(doctorMetricLabelClass, selected && 'text-primary')}>{title}</p>;
  const valueNode = (
    <div className={cn(doctorMetricValueClass, selected && 'text-primary', valueClassName)}>
      {value}
    </div>
  );
  const hintNode = hint ? (
    <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>
  ) : null;
  const metric = (
    <div className="flex items-baseline gap-0.5">
      {valueNode}
      {secondaryValue !== undefined ? (
        <div className="flex items-baseline gap-0.5 font-semibold tabular-nums text-foreground/75">
          <span aria-hidden className="text-sm font-normal text-muted-foreground">
            /
          </span>
          <span className={doctorInlineMetricValueClass}>{secondaryValue}</span>
        </div>
      ) : null}
    </div>
  );
  const inner =
    valuePlacement === 'inline' ? (
      <div className="w-full min-w-0">
        <div className="flex items-baseline gap-2">
          {label}
          {metric}
        </div>
        {hintNode}
      </div>
    ) : (
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-1.5 md:block">
        {label}
        <div className="col-start-2 flex items-baseline justify-end gap-0.5 md:mt-0.5 md:w-full md:justify-start md:gap-1">
          {metric}
        </div>
        {hint ? <div className="col-span-full">{hintNode}</div> : null}
      </div>
    );

  if (actionIcon && actionLabel && onActionClick) {
    return (
      <article
        className={cn(shellClass, 'grid grid-cols-[minmax(0,1fr)_auto] overflow-hidden p-0')}
      >
        <Button
          id={id}
          type="button"
          variant="ghost"
          className={cn(
            doctorInteractiveSurfaceButtonClass,
            'w-full justify-start rounded-none p-2.5 text-left',
          )}
          onClick={onClick}
          data-testid={testId}
        >
          {inner}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            doctorClientPrimaryOutlineActionClass,
            'm-1.5 h-auto min-w-9 self-stretch px-2',
          )}
          aria-label={actionLabel}
          onClick={onActionClick}
        >
          {actionIcon}
        </Button>
      </article>
    );
  }

  let trigger: ReactElement;

  if (href) {
    trigger = (
      <Link id={id} href={href} className={shellClass} data-testid={testId}>
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
        data-testid={testId}
      >
        {inner}
      </Button>
    );
  } else {
    trigger = (
      <article
        id={id}
        className={shellClass}
        tabIndex={tooltip ? 0 : undefined}
        data-testid={testId}
      >
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
