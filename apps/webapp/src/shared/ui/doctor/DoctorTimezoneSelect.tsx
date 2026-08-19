'use client';

import { useMemo } from 'react';
import type { StylesConfig } from 'react-select';
import TimezoneSelect, { type ITimezone, type ITimezoneOption } from 'react-timezone-select';
import { mergePatientTimezoneSelectLabels } from '@/shared/timezone/patientTimezoneSelectLabels';

/**
 * Styles for react-timezone-select adapted to the doctor Shadcn theme.
 * Uses standard Shadcn CSS custom properties so it matches the rest of the UI.
 */
export const doctorTimezoneSelectStyles: StylesConfig<ITimezone, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    borderRadius: 'calc(var(--radius) - 2px)',
    borderColor: state.isFocused ? 'var(--ring)' : 'var(--border)',
    backgroundColor: 'var(--background)',
    boxShadow: state.isFocused
      ? '0 0 0 2px color-mix(in oklch, var(--ring), transparent 80%)'
      : 'none',
    cursor: 'pointer',
    opacity: state.isDisabled ? 0.5 : 1,
    '&:hover': { borderColor: 'var(--border)' },
    fontSize: '0.875rem',
  }),
  menuPortal: (base) => ({ ...base, zIndex: 60 }),
  menu: (base) => ({
    ...base,
    borderRadius: 'calc(var(--radius) - 2px)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    backgroundColor: 'var(--popover)',
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.12)',
    fontSize: '0.875rem',
  }),
  menuList: (base) => ({ ...base, padding: 0 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? 'var(--accent)' : 'var(--popover)',
    color: state.isFocused ? 'var(--accent-foreground)' : 'var(--popover-foreground)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    lineHeight: 1.4,
  }),
  singleValue: (base) => ({
    ...base,
    color: 'var(--foreground)',
    fontSize: '0.875rem',
  }),
  placeholder: (base) => ({
    ...base,
    color: 'var(--muted-foreground)',
    fontSize: '0.875rem',
  }),
  input: (base) => ({
    ...base,
    color: 'var(--foreground)',
    fontSize: '0.875rem',
  }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: 'var(--muted-foreground)',
    transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : undefined,
    transition: 'transform 0.15s ease',
  }),
};

export type DoctorTimezoneSelectProps = {
  /** Stable id for SSR hydration (react-select requirement). */
  instanceId: string;
  /** Id of the inner input — pair with a `<label htmlFor>` when the control has a visible label. */
  inputId?: string;
  'aria-label'?: string;
  value: string;
  onChange: (iana: string) => void;
  disabled?: boolean;
};

/**
 * Единый выбор пояса на staff-поверхностях: пояс филиала (физическое место) и пояс приложения
 * (настройка глобального админа). У ЧЕЛОВЕКА пояс не настраивается — §34 канона владельца
 * (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`): он определяется устройством при входе.
 */
export function DoctorTimezoneSelect({
  instanceId,
  inputId,
  value,
  onChange,
  disabled,
  ...rest
}: DoctorTimezoneSelectProps) {
  const timezones = useMemo(
    () => mergePatientTimezoneSelectLabels(value.trim() || 'Europe/Moscow'),
    [value],
  );
  return (
    /* react-timezone-select/react-select value types conflict at TS level; runtime is correct */
    <TimezoneSelect
      instanceId={instanceId}
      inputId={inputId}
      aria-label={rest['aria-label']}
      value={(value.trim() || 'Europe/Moscow') as never}
      onChange={(tz: ITimezoneOption) => onChange(tz.value)}
      timezones={timezones}
      labelStyle="original"
      displayValue="UTC"
      isDisabled={disabled}
      isSearchable
      styles={doctorTimezoneSelectStyles as never}
      menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
      menuPosition="fixed"
      maxMenuHeight={280}
    />
  );
}
