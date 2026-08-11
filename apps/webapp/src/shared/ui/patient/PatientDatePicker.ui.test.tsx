import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientDatePicker } from './PatientDatePicker';

afterEach(cleanup);

describe('PatientDatePicker', () => {
  it('renders the selected date in Russian without a native date input', () => {
    render(<PatientDatePicker value="2026-08-11" onChange={vi.fn()} ariaLabel="Дата занятия" />);

    expect(screen.getByRole('button', { name: 'Дата занятия' })).toHaveTextContent(
      '11 августа 2026',
    );
    expect(screen.queryByDisplayValue('2026-08-11')).not.toBeInTheDocument();
  });
});
