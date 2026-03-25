import { describe, expect, it, vi } from 'vitest';
import { fetchRubitimeRecordById, removeRubitimeRecord, updateRubitimeRecord } from './client.js';

describe('fetchRubitimeRecordById', () => {
  it('fetches booking data by record id from Rubitime API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'ok',
      message: 'Success',
      data: {
        id: 321,
        phone: '+79990001122',
        record: '2026-03-10 12:30:00',
        status: 0,
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await fetchRubitimeRecordById({
      recordId: '321',
      fetchImpl,
    });

    expect(result).toMatchObject({
      id: 321,
      phone: '+79990001122',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://rubitime.ru/api2/get-record',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on Rubitime API error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'error',
      message: 'Not found',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(fetchRubitimeRecordById({
      recordId: '404',
      fetchImpl,
    })).rejects.toThrow('RUBITIME_API_ERROR');
  });
});

describe('updateRubitimeRecord / removeRubitimeRecord', () => {
  it('posts update-record with merged patch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', message: 'Success', data: { id: 50 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await updateRubitimeRecord({
      recordId: '50',
      data: { status: 0 },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://rubitime.ru/api2/update-record',
      expect.objectContaining({ method: 'POST' }),
    );
    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall).toBeDefined();
    const second = firstCall![1] as { body: string };
    const body = JSON.parse(second.body);
    expect(body.id).toBe(50);
    expect(body.status).toBe(0);
  });

  it('posts remove-record', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', message: 'Success', data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await removeRubitimeRecord({ recordId: '99', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://rubitime.ru/api2/remove-record',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
