import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: vi.fn(), error: vi.fn() },
}));

/**
 * The doctor Select is a pointer-driven listbox: committing a value needs real pointer events that
 * jsdom does not deliver, and driving it here would be testing the primitive, not this panel
 * (AGENTS.md §10a — the changeable form is accepted live). It is replaced by the plain control with
 * the same contract — same `id` for its label, same value, same `onValueChange` — so what the test
 * actually exercises is the panel's own logic: what it posts and what it does with the answer.
 */
vi.mock('@/shared/ui/doctor/primitives/select', async () => {
  const React = await import('react');
  type Element = { props?: Record<string, unknown> };
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      children?: React.ReactNode;
    }) => {
      const parts = React.Children.toArray(children) as Element[];
      const trigger = parts.find((part) => part.props?.id);
      const content = parts.find((part) => !part.props?.id);
      return (
        <select
          id={trigger?.props?.id as string | undefined}
          value={value ?? ''}
          onChange={(event) => onValueChange?.(event.target.value)}
        >
          {(content?.props?.children as React.ReactNode) ?? null}
        </select>
      );
    },
    SelectTrigger: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

import { DoctorClientMembershipsPanel } from './DoctorClientMembershipsPanel';

const PATIENT_ID = '0194c2c5-1d75-7a42-8b64-a9b49aa52ba3';
const CATALOG_ID = '44444444-4444-4444-8444-444444444444';

afterEach(() => vi.unstubAllGlobals());

/** Answers the panel's reads, then the sale POST; `salePost` decides what the sale returned. */
function stubApi(salePost: () => unknown, options?: { catalogPriceMinor?: number }) {
  const postBodies: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      postBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return { ok: true, json: async () => salePost() };
    }
    if (url.startsWith('/api/doctor/booking-engine/patient-packages')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          packages: [],
          onlinePaymentAvailable: true,
          patientChatAvailable: false,
          cashLedgerAvailable: true,
        }),
      };
    }
    if (url.startsWith('/api/doctor/booking-engine/services')) {
      return { ok: true, json: async () => ({ ok: true, services: [] }) };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        packages: [
          { id: CATALOG_ID, title: 'Каталожный', priceMinor: options?.catalogPriceMinor ?? 250000 },
        ],
      }),
    };
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fetchMock);
  return { postBodies };
}

/** Both create forms carry a «Способ оплаты» label, so each control is addressed by its own id. */
function control(id: string): HTMLSelectElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`control_not_rendered:${id}`);
  return element as HTMLSelectElement;
}

async function pickTemplate() {
  await screen.findByLabelText('Шаблон');
  fireEvent.change(control('pkg-catalog'), { target: { value: CATALOG_ID } });
}

function chooseMethod(method: string) {
  fireEvent.change(control('pkg-catalog-method'), { target: { value: method } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Назначить' }));
}

describe('membership sale — a failed hand-off is not a finished sale', () => {
  it('keeps the host surface open and names the server reason when no pay link was issued', async () => {
    const onCreated = vi.fn();
    stubApi(() => ({
      ok: true,
      package: { id: 'package-1', status: 'offered', checkoutUrl: null },
      paymentLinkError: 'payment_provider_unavailable',
      cashLedgerRecorded: false,
    }));

    render(<DoctorClientMembershipsPanel platformUserId={PATIENT_ID} onCreated={onCreated} />);
    await pickTemplate();
    chooseMethod('link');
    submit();

    // The doctor has to be able to read this, so the host modal must not have closed over it.
    expect(await screen.findByText(/Платёжный провайдер не настроен/)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('does not claim the package is waiting for payment when it is not', async () => {
    stubApi(() => ({
      ok: true,
      package: { id: 'package-1', status: 'offered', checkoutUrl: null },
      paymentLinkError: 'payment_provider_unavailable',
      cashLedgerRecorded: false,
    }));

    render(<DoctorClientMembershipsPanel platformUserId={PATIENT_ID} onCreated={vi.fn()} />);
    await pickTemplate();
    chooseMethod('link');
    submit();

    expect(await screen.findByText(/текущий статус — предложен/)).toBeInTheDocument();
    expect(screen.queryByText(/ждёт оплаты/)).not.toBeInTheDocument();
  });

  it('releases the host surface once a cash sale has nothing left to hand over', async () => {
    const onCreated = vi.fn();
    stubApi(() => ({
      ok: true,
      package: { id: 'package-1', status: 'active', checkoutUrl: null },
      paymentLinkError: null,
      cashLedgerRecorded: true,
    }));

    render(<DoctorClientMembershipsPanel platformUserId={PATIENT_ID} onCreated={onCreated} />);
    await pickTemplate();
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('retries the same sale attempt under one key instead of selling twice', async () => {
    const { postBodies } = stubApi(() => ({ ok: false, error: 'create_failed' }));

    render(<DoctorClientMembershipsPanel platformUserId={PATIENT_ID} onCreated={vi.fn()} />);
    await pickTemplate();
    submit();
    await waitFor(() => expect(postBodies).toHaveLength(1));
    // The doctor reads the error and presses again — the case `disabled={pending}` never covered.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Назначить' })).toBeEnabled());
    submit();
    await waitFor(() => expect(postBodies).toHaveLength(2));

    expect(postBodies[0]!.saleIdempotencyKey).toEqual(expect.any(String));
    expect(postBodies[0]!.saleIdempotencyKey).toBe(postBodies[1]!.saleIdempotencyKey);
  });

  it('never states the paid amount or the resulting status itself', async () => {
    const { postBodies } = stubApi(() => ({
      ok: true,
      package: { id: 'package-1', status: 'active', checkoutUrl: null },
      paymentLinkError: null,
      cashLedgerRecorded: true,
    }));

    render(<DoctorClientMembershipsPanel platformUserId={PATIENT_ID} onCreated={vi.fn()} />);
    await pickTemplate();
    submit();
    await waitFor(() => expect(postBodies).toHaveLength(1));

    expect(postBodies[0]).not.toHaveProperty('paidAmountMinor');
    expect(postBodies[0]).not.toHaveProperty('activateImmediately');
    expect(postBodies[0]).not.toHaveProperty('sendForPayment');
    expect(postBodies[0]).toMatchObject({ saleMethod: 'cash' });
  });

  it('does not offer a pay link for a template there is nothing to invoice for', async () => {
    stubApi(() => ({ ok: true, package: { id: 'p', status: 'active' } }), {
      catalogPriceMinor: 0,
    });

    render(<DoctorClientMembershipsPanel platformUserId={PATIENT_ID} onCreated={vi.fn()} />);
    await pickTemplate();

    await waitFor(() =>
      expect(
        [...control('pkg-catalog-method').querySelectorAll('option')].map((o) =>
          o.getAttribute('value'),
        ),
      ).not.toContain('link'),
    );
  });
});
