// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PatientOrganizationContextBar,
  PatientOrganizationContextProvider,
} from './PatientOrganizationContext';

vi.mock('next/navigation', () => ({ usePathname: () => '/app/patient' }));

const organization = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  title: 'Клиника без тарифа',
};

describe('PatientOrganizationContextBar branding presentation', () => {
  it('renders the resolver-provided brand name, then the platform/core fallback after branding is disabled', () => {
    const renderContext = (title: string) =>
      render(
        <PatientOrganizationContextProvider
          organization={{ ...organization, title }}
          organizations={[organization]}
          checkContextChangeReceipt={false}
        >
          <PatientOrganizationContextBar />
        </PatientOrganizationContextProvider>,
      );

    const view = renderContext('Бренд клиники');
    expect(screen.getByTestId('patient-organization-context')).toHaveTextContent('Бренд клиники');

    view.rerender(
      <PatientOrganizationContextProvider
        organization={organization}
        organizations={[organization]}
        checkContextChangeReceipt={false}
      >
        <PatientOrganizationContextBar />
      </PatientOrganizationContextProvider>,
    );

    expect(screen.getByTestId('patient-organization-context')).toHaveTextContent(
      'Клиника без тарифа',
    );
    expect(screen.queryByText('Бренд клиники')).not.toBeInTheDocument();
  });
});
