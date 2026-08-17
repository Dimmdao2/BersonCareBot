import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ apiJson: vi.fn() }));

vi.mock('@/shared/lib/apiJson', () => ({ apiJson: fakes.apiJson }));

import { BookingPoliciesSection } from './BookingPoliciesSection';

describe('BookingPoliciesSection empty organization state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.apiJson.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/overview')) return { ok: true, specialists: [], services: [] };
      if (options?.method === 'POST') return { ok: true, policy: { id: 'saved-policy' } };
      return { ok: true, cancellationPolicies: [], reschedulePolicies: [] };
    });
  });

  it('offers a real organization cancellation draft and creates it without a fake id', async () => {
    render(<BookingPoliciesSection defaultKind="cancellation" />);

    const save = await screen.findByRole('button', { name: 'Сохранить отмену' });
    expect(screen.queryByText('Нет политики')).not.toBeInTheDocument();
    fireEvent.click(save);

    await waitFor(() =>
      expect(fakes.apiJson).toHaveBeenCalledWith(
        '/api/admin/booking-engine/policies',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const post = fakes.apiJson.mock.calls.find((call) => call[1]?.method === 'POST');
    const body = JSON.parse(String(post?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      kind: 'cancellation',
      scopeLevel: 'organization',
      scopeEntityId: null,
      title: 'Правила отмены клиники',
    });
    expect(body).not.toHaveProperty('id');
  });

  it('offers a real organization reschedule draft in the same empty state', async () => {
    render(<BookingPoliciesSection defaultKind="reschedule" lockKind />);

    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить перенос' }));

    await waitFor(() =>
      expect(fakes.apiJson).toHaveBeenCalledWith(
        '/api/admin/booking-engine/policies',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const post = fakes.apiJson.mock.calls.find((call) => call[1]?.method === 'POST');
    const body = JSON.parse(String(post?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      kind: 'reschedule',
      scopeLevel: 'organization',
      scopeEntityId: null,
      title: 'Правила переноса клиники',
    });
    expect(body).not.toHaveProperty('id');
  });

  it('reloads the created policy and sends its persisted id on a later edit', async () => {
    let savedPolicy: Record<string, unknown> | null = null;
    fakes.apiJson.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/overview')) return { ok: true, specialists: [], services: [] };
      if (options?.method === 'POST') {
        const submitted = JSON.parse(String(options.body)) as Record<string, unknown>;
        savedPolicy = {
          ...submitted,
          id: 'saved-cancellation-policy',
          organizationId: '11111111-1111-4111-8111-111111111111',
          scopeEntityId: '11111111-1111-4111-8111-111111111111',
          freeCancelHoursBefore: submitted.id ? submitted.freeCancelHoursBefore : 96,
        };
        return { ok: true, policy: savedPolicy };
      }
      return {
        ok: true,
        cancellationPolicies: savedPolicy ? [savedPolicy] : [],
        reschedulePolicies: [],
      };
    });

    render(<BookingPoliciesSection defaultKind="cancellation" lockKind />);

    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить отмену' }));
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue(96));

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '48' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить отмену' }));

    await waitFor(() => {
      const posts = fakes.apiJson.mock.calls.filter((call) => call[1]?.method === 'POST');
      expect(posts).toHaveLength(2);
      expect(JSON.parse(String(posts[1]?.[1]?.body))).toMatchObject({
        id: 'saved-cancellation-policy',
        kind: 'cancellation',
        freeCancelHoursBefore: 48,
      });
    });
  });
});
