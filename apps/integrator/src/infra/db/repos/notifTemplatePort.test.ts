import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  NOTIF_TEMPLATE_DEFAULTS,
  getNotifTemplate,
  notifTemplateKey,
  renderNotifTemplate,
  setNotifTemplate,
} from './notifTemplatePort.js';

function makeDb(queryFn: DbPort['query']): DbPort {
  return { query: queryFn, tx: vi.fn() as unknown as DbPort['tx'] };
}

function dbReturnsRow(valueJson: unknown): DbPort {
  return makeDb(
    vi.fn().mockResolvedValue({
      rows: [{ value_json: valueJson }],
      rowCount: 1,
    } as DbQueryResult<{ value_json: unknown }>),
  );
}

function dbReturnsEmpty(): DbPort {
  return makeDb(
    vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as DbQueryResult),
  );
}

function dbThrows(): DbPort {
  return makeDb(vi.fn().mockRejectedValue(new Error('db down')));
}

describe('notifTemplateKey', () => {
  it('formats key as notif_template:<event>:<audience>', () => {
    expect(notifTemplateKey('created', 'patient')).toBe('notif_template:created:patient');
    expect(notifTemplateKey('cancelled', 'doctor')).toBe('notif_template:cancelled:doctor');
    expect(notifTemplateKey('rescheduled', 'patient')).toBe('notif_template:rescheduled:patient');
  });
});

describe('getNotifTemplate — default fallback', () => {
  it('returns default when no DB row', async () => {
    const text = await getNotifTemplate('created', 'patient', dbReturnsEmpty());
    expect(text).toBe(NOTIF_TEMPLATE_DEFAULTS.created.patient);
  });

  it('returns default when DB throws', async () => {
    const text = await getNotifTemplate('rescheduled', 'doctor', dbThrows());
    expect(text).toBe(NOTIF_TEMPLATE_DEFAULTS.rescheduled.doctor);
  });

  it('returns default when value_json is null inside envelope', async () => {
    const db = dbReturnsRow({ value: null });
    const text = await getNotifTemplate('cancelled', 'patient', db);
    expect(text).toBe(NOTIF_TEMPLATE_DEFAULTS.cancelled.patient);
  });

  it('returns default when value_json has empty string inside envelope', async () => {
    const db = dbReturnsRow({ value: '   ' });
    const text = await getNotifTemplate('cancelled', 'doctor', db);
    expect(text).toBe(NOTIF_TEMPLATE_DEFAULTS.cancelled.doctor);
  });
});

describe('getNotifTemplate — DB override', () => {
  it('returns text from DB when row with non-empty value exists', async () => {
    const custom = 'Кастомный шаблон: {{date}}';
    const db = dbReturnsRow({ value: custom });
    const text = await getNotifTemplate('created', 'patient', db);
    expect(text).toBe(custom);
  });

  it('queries with correct key for each event/audience', async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 } as DbQueryResult);
    const db = makeDb(queryFn);
    await getNotifTemplate('rescheduled', 'doctor', db);
    const params = queryFn.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(params).toContain('notif_template:rescheduled:doctor');
  });
});

describe('setNotifTemplate', () => {
  it('calls db.query with INSERT ... ON CONFLICT UPDATE and correct key', async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 } as DbQueryResult);
    const db = makeDb(queryFn);
    await setNotifTemplate('cancelled', 'patient', 'My template', db);
    const sqlText = queryFn.mock.calls[0]?.[0] as string | undefined;
    const params = queryFn.mock.calls[0]?.[1] as unknown[] | undefined;
    expect(sqlText).toContain('ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE');
    expect(params).toContain('notif_template:cancelled:patient');
  });
});

describe('renderNotifTemplate', () => {
  it('replaces {{date}} and {{type}} in a simple template', () => {
    const result = renderNotifTemplate('Запись на {{date}}\n{{type}}', {
      date: '03.07.2026 в 10:00',
      type: 'Онлайн',
    });
    expect(result).toBe('Запись на 03.07.2026 в 10:00\nОнлайн');
  });

  it('replaces all six declared variables', () => {
    const tpl = '{{date}}|{{type}}|{{city}}|{{name}}|{{phone}}|{{reason}}';
    const result = renderNotifTemplate(tpl, {
      date: 'D',
      type: 'T',
      city: ' (C)',
      name: 'N',
      phone: 'P',
      reason: '\nR',
    });
    expect(result).toBe('D|T| (C)|N|P|\nR');
  });

  it('leaves placeholder empty when var is absent', () => {
    const result = renderNotifTemplate('{{date}}|{{city}}', { date: '01.01.2026' });
    expect(result).toBe('01.01.2026|');
  });

  it('patient/created default interpolated matches expected output (city present)', () => {
    const result = renderNotifTemplate(NOTIF_TEMPLATE_DEFAULTS.created.patient, {
      date: '03.07.2026 в 14:00',
      type: 'Очный приём',
      city: ' (Москва)',
    });
    expect(result).toBe('Запись подтверждена: 03.07.2026 в 14:00\nОчный приём (Москва)');
  });

  it('patient/created default interpolated matches expected output (city absent)', () => {
    const result = renderNotifTemplate(NOTIF_TEMPLATE_DEFAULTS.created.patient, {
      date: '03.07.2026 в 14:00',
      type: 'Онлайн',
      city: '',
    });
    expect(result).toBe('Запись подтверждена: 03.07.2026 в 14:00\nОнлайн');
  });

  it('patient/cancelled default interpolated with reason', () => {
    const result = renderNotifTemplate(NOTIF_TEMPLATE_DEFAULTS.cancelled.patient, {
      date: '03.07.2026 в 14:00',
      reason: '\nПричина: Болен',
    });
    expect(result).toBe('Запись на 03.07.2026 в 14:00 отменена.\nПричина: Болен');
  });

  it('patient/cancelled default interpolated without reason', () => {
    const result = renderNotifTemplate(NOTIF_TEMPLATE_DEFAULTS.cancelled.patient, {
      date: '03.07.2026 в 14:00',
      reason: '',
    });
    expect(result).toBe('Запись на 03.07.2026 в 14:00 отменена.');
  });

  it('doctor/created default interpolated matches expected output', () => {
    const result = renderNotifTemplate(NOTIF_TEMPLATE_DEFAULTS.created.doctor, {
      date: '03.07.2026 в 14:00',
      name: 'Иван Иванов',
      phone: '+79991234567',
    });
    expect(result).toBe('Новая запись: Иван Иванов, +79991234567\nДата: 03.07.2026 в 14:00');
  });
});
