import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormatStepClient } from './booking/FormatStepClient';
import { PatientTreatmentProgramsListClient } from './treatment/PatientTreatmentProgramsListClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe('patient flow after standalone intake removal', () => {
  it('keeps the existing online appointment choice without the retired questionnaire choices', () => {
    render(
      <FormatStepClient
        cities={[]}
        onlineLocation={{ id: 'online-location', cityCode: 'online', title: 'Онлайн' }}
        catalogError={null}
      />,
    );

    expect(screen.getByRole('link', { name: 'Онлайн-приём' })).toHaveAttribute(
      'href',
      '/app/patient/booking/service?cityCode=online&cityTitle=%D0%9E%D0%BD%D0%BB%D0%B0%D0%B9%D0%BD',
    );
    expect(screen.queryByRole('link', { name: 'Реабилитация онлайн' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Нутрициология онлайн' })).not.toBeInTheDocument();
  });

  it('does not replace the retired personal-program questionnaire button with another CTA', () => {
    render(
      <PatientTreatmentProgramsListClient
        hero={null}
        archived={[]}
        messagesHref="/app/patient/messages"
      />,
    );

    expect(screen.queryByRole('link', { name: 'Консультация' })).not.toBeInTheDocument();
  });
});
