'use client';

import { DoctorDateTimePicker } from './DoctorDateTimePicker';

/**
 * Shared canonical date-only picker (react-day-picker, no time input).
 * value/onChange — строка "yyyy-MM-dd".
 * max — максимально допустимая дата (строка "yyyy-MM-dd"), например сегодня.
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  /** Максимальная допустимая дата (включительно), формат "yyyy-MM-dd". */
  max?: string;
};

export function DoctorDatePicker({
  value,
  onChange,
  disabled,
  placeholder = 'Выберите дату',
  testId,
  id,
  ariaLabel,
  className,
  max,
}: Props) {
  return (
    <DoctorDateTimePicker
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      mode="date"
      id={id}
      ariaLabel={ariaLabel}
      testId={testId}
      className={className}
      max={max}
    />
  );
}
