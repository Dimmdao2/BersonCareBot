import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOKING_FORM_FIELD_KEY_PATTERN } from '@/modules/booking-form/fieldTypes';
import { BookingSoloFormFieldsSection } from './BookingSoloFormFieldsSection';

/**
 * Owner live pass 18.08 (L-4): adding a question with a Russian label answered 400 and the screen
 * printed the machine code `invalid_body` — the clinic owner could not add any question at all.
 *
 * The boundary fake below enforces the real stored contract `BOOKING_FORM_FIELD_KEY_PATTERN` —
 * the same constant the admin route validates with — so a key the server would refuse is refused
 * here too, and only a key it accepts can produce a visible question.
 */
type StoredField = {
  id: string;
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  isRequired: boolean;
  visibleToPatient: boolean;
  visibleToStaff: boolean;
  sortOrder: number;
  isActive: boolean;
};

function jsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function contractFake() {
  const stored: StoredField[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') return jsonResponse(200, { ok: true, fields: stored });
    const body = JSON.parse(String(init?.body)) as Omit<StoredField, 'id' | 'placeholder'> & {
      placeholder?: string;
    };
    if (!BOOKING_FORM_FIELD_KEY_PATTERN.test(body.fieldKey)) {
      return jsonResponse(400, { ok: false, error: 'invalid_body' });
    }
    if (stored.some((f) => f.fieldKey === body.fieldKey)) {
      return jsonResponse(409, { ok: false, error: 'field_key_already_exists' });
    }
    const field: StoredField = { ...body, id: `f${stored.length + 1}`, placeholder: null };
    stored.push(field);
    return jsonResponse(200, { ok: true, field });
  });
  return { fetchMock, stored };
}

afterEach(() => vi.unstubAllGlobals());

describe('booking form questions', () => {
  it('creates a question with a Russian label and shows it in the list', async () => {
    const { fetchMock, stored } = contractFake();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<BookingSoloFormFieldsSection />);

    fireEvent.change(await screen.findByPlaceholderText('Текст вопроса'), {
      target: { value: 'Жалоба пациента' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    // The patient preview lists saved questions as text; the «Текст вопроса» box only holds an
    // input value, so a question that was never stored cannot satisfy this.
    expect(await screen.findByText('Жалоба пациента')).toBeInTheDocument();
    expect(stored).toHaveLength(1);
  });

  it('keeps two questions with different Russian labels apart', async () => {
    const { fetchMock, stored } = contractFake();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<BookingSoloFormFieldsSection />);

    for (const label of ['Жалоба', 'Аллергии']) {
      fireEvent.change(await screen.findByPlaceholderText('Текст вопроса'), {
        target: { value: label },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
      expect(await screen.findByText(label)).toBeInTheDocument();
    }

    expect(stored.map((f) => f.fieldKey)).toHaveLength(2);
    expect(new Set(stored.map((f) => f.fieldKey)).size).toBe(2);
  });
});
