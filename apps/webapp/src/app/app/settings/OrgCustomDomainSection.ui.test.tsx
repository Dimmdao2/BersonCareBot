// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrgCustomDomainSection } from './OrgCustomDomainSection';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('OrgCustomDomainSection entitlement visibility', () => {
  it('shows the retained hostname but makes mutation controls unavailable in read-only access', () => {
    render(
      <OrgCustomDomainSection hostname="clinic.example.com" mutationAvailable={false} />,
    );

    expect(screen.getByText(/Собственный домен доступен только для просмотра/)).toBeVisible();
    expect(screen.getByLabelText('Доменное имя')).toHaveValue('clinic.example.com');
    expect(screen.getByLabelText('Доменное имя')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});
