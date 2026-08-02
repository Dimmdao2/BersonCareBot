// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrgBrandingSection } from './OrgBrandingSection';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./brandingActions', () => ({ saveOrgBranding: vi.fn() }));
vi.mock('./OrgBrandLogoControl', () => ({
  OrgBrandLogoControl: ({ disabled }: { disabled: boolean }) => (
    <button type="button" disabled={disabled}>
      Изменить логотип
    </button>
  ),
}));

describe('OrgBrandingSection entitlement visibility', () => {
  it('shows the retained brand but makes every branding mutation control unavailable in read-only access', () => {
    render(
      <OrgBrandingSection
        brandingMutationAvailable={false}
        coreDisplayName="Клиника"
        publishedDisplayName="Бренд клиники"
        publishedLogoMediaId={null}
        publishedLogoUrl={null}
      />,
    );

    expect(screen.getByText(/Брендирование доступно только для просмотра/)).toBeVisible();
    expect(screen.getByLabelText('Название клиники')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Изменить логотип' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});
