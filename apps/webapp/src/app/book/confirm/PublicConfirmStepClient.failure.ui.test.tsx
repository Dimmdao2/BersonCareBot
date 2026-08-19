import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicConfirmStepClient } from './PublicConfirmStepClient';

/**
 * Owner report 19.08: a public booker who books through `/book/{slug}` and a signed-in patient
 * both go through the same `ConfirmStepClient` — the fix wires the *success* screen through it too
 * (see `page.route.test.tsx` in `app/book/done`). This proves the other half the owner asked for:
 * "failure must stay visible too" — a public booker with no account and no session must see the
 * same on-screen rejection a signed-in patient sees, not silence and not a fabricated success.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/booking/public/form-fields')) {
        return Promise.resolve(Response.json({ ok: true, fields: [] }));
      }
      if (typeof url === 'string' && url.includes('/api/booking/memberships/available')) {
        return Promise.resolve(Response.json({ ok: true, packages: [] }));
      }
      if (typeof url === 'string' && url.includes('/api/booking/public/create')) {
        return Promise.resolve(
          Response.json({ ok: false, error: 'slot_overlap' }, { status: 409 }),
        );
      }
      throw new Error(`unexpected fetch: ${String(url)} ${init?.method}`);
    }),
  );
}

describe('public booking confirm — a failed create stays visible', () => {
  it('дано: слот уже занят на публичном шаге подтверждения → когда отправляется форма → тогда экран остаётся формой с видимой причиной отказа, а не редиректит на успех', async () => {
    stubFetch();
    const user = userEvent.setup();

    render(
      <PublicConfirmStepClient
        type="in_person"
        cityCode="moscow"
        cityTitle="Москва"
        branchId="b1111111-1111-4111-8111-111111111111"
        serviceId="s1111111-1111-4111-8111-111111111111"
        serviceTitle="Консультация невролога"
        slotStart="2026-08-20T07:00:00.000Z"
        slotEnd="2026-08-20T07:30:00.000Z"
        appDisplayTimeZone="Europe/Moscow"
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Фамилия')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Фамилия'), 'Иванов');
    await user.type(screen.getByLabelText('Имя'), 'Иван');
    await user.type(screen.getByLabelText('Телефон'), '+79990000000');
    await user.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(
      await screen.findByText('Это время уже занято. Выберите другой слот.'),
    ).toBeInTheDocument();
    // Still the confirm form — no silent success screen, no lost failure.
    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toBeInTheDocument();
  });
});
