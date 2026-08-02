import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ listBroadcastAuditAction: vi.fn() }));

vi.mock('../../broadcasts/actions', () => ({ listBroadcastAuditAction: fakes.listBroadcastAuditAction }));
vi.mock('../../broadcasts/BroadcastForm', () => ({
  BroadcastForm: () => <div data-testid="broadcast-form" />,
}));
vi.mock('../../broadcasts/BroadcastAuditLog', () => ({
  BroadcastAuditLog: () => <div data-testid="broadcast-history" />,
  BroadcastAuditEntryDetail: () => <div data-testid="broadcast-detail" />,
}));
vi.mock('../../broadcasts/BroadcastDeliveryArchiveClient', () => ({
  BroadcastDeliveryArchiveClient: () => <div data-testid="broadcast-error-history" />,
}));
vi.mock('@/shared/ui/doctor/catalog/CatalogSplitLayout', () => ({
  CatalogSplitLayout: ({ left, right }: { left: ReactNode; right: ReactNode }) => (
    <>{left}{right}</>
  ),
}));
vi.mock('@/shared/ui/doctor/primitives/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => <button {...props}>{children}</button>,
}));
vi.mock('@/shared/ui/doctor/doctorVisual', () => ({
  doctorSectionCardClass: 'card',
  doctorSectionTitleClass: 'title',
}));
vi.mock('@/shared/ui/doctor/doctorWorkspaceLayout', () => ({
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE: 'layout',
}));

import { BroadcastsTab } from './BroadcastsTab';

describe('BroadcastsTab tariff access', () => {
  beforeEach(() => {
    fakes.listBroadcastAuditAction.mockReset().mockResolvedValue([]);
  });

  it('keeps sent-mailing history readable but omits new-mailing controls when mutations are denied', async () => {
    render(
      <BroadcastsTab
        deepLinkParams={{}}
        onDeepLinkChange={vi.fn()}
        mailingsMutationAvailable={false}
      />,
    );

    await waitFor(() => expect(fakes.listBroadcastAuditAction).toHaveBeenCalledWith(50));
    expect(screen.getByText('Журнал рассылок')).toBeInTheDocument();
    expect(screen.getByTestId('broadcast-history')).toBeInTheDocument();
    expect(screen.queryByTestId('broadcast-form')).not.toBeInTheDocument();
  });
});
