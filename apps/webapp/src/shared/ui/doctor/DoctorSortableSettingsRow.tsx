'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flag, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import { doctorDnaFlatListRowClass } from '@/shared/ui/doctor/DoctorDnaFlatListRow';

type DoctorSortableSettingsRowProps = {
  id: string;
  label: string;
  disabled: boolean;
  active: boolean;
  isDefault: boolean;
  children: ReactNode;
  trailing?: ReactNode;
  onOpen: () => void;
  onActiveChange: (checked: boolean) => void;
};

/** Shared sortable row geometry for compact settings lists. */
export function DoctorSortableSettingsRow({
  id,
  label,
  disabled,
  active,
  isDefault,
  children,
  trailing,
  onOpen,
  onActiveChange,
}: DoctorSortableSettingsRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        doctorDnaFlatListRowClass,
        'gap-1 px-0 transition-colors hover:bg-muted focus-within:bg-muted',
        isDragging && 'bg-muted shadow-sm',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="-ml-3.5 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        aria-label={`Изменить порядок: ${label}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer flex-col self-stretch justify-center overflow-hidden text-left focus-visible:outline-none"
        onClick={onOpen}
      >
        {children}
      </button>

      <span
        className={cn(
          'flex shrink-0 flex-col items-end',
          trailing ? 'self-stretch justify-between py-0.5' : 'justify-center',
        )}
      >
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
        <span className="flex items-center">
          <Switch
            className="shrink-0"
            checked={active}
            disabled={disabled}
            aria-label={`${label} — включен`}
            onCheckedChange={onActiveChange}
          />
          <span className="ml-0.5 -mr-3.5 flex size-3 shrink-0 items-center justify-center">
            {isDefault ? (
              <Flag className="size-3 fill-primary text-primary" aria-label="По умолчанию" />
            ) : null}
          </span>
        </span>
      </span>
    </li>
  );
}
