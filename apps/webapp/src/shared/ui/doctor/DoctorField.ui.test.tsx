import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorField } from './DoctorField';

afterEach(cleanup);

describe('DoctorField', () => {
  it('keeps the label, control and hint associated as one field', () => {
    render(
      <DoctorField label="SMTP host" htmlFor="smtp-host" hint="Адрес сервера">
        <Input id="smtp-host" />
      </DoctorField>,
    );

    expect(screen.getByLabelText('SMTP host')).toBeVisible();
    expect(screen.getByText('Адрес сервера')).toBeVisible();
  });
});
