import { describe, expect, it, vi } from 'vitest';
import { fetchRubitimeRecordById, fetchRubitimeSchedule, removeRubitimeRecord, updateRubitimeRecord } from './client.js';

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

describe('fetchRubitimeSchedule', () => {
  it('calls api2/get-schedule with branch_id/cooperator_id/service_id and only_available=1', async () => {
    const scheduleData = {
      '2026-04-10': { '10:00': { available: true }, '11:00': { available: false } },
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', message: 'Success', data: scheduleData }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchRubitimeSchedule({
      params: { branchId: 1, cooperatorId: 2, serviceId: 3 },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://rubitime.ru/api2/get-schedule',
      expect.objectContaining({ method: 'POST' }),
    );
    const call = fetchImpl.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(call.body);
    expect(body.branch_id).toBe(1);
    expect(body.cooperator_id).toBe(2);
    expect(body.service_id).toBe(3);
    expect(body.only_available).toBe(1);
    // domain fields must NOT be in body
    expect(body.type).toBeUndefined();
    expect(body.category).toBeUndefined();
    expect(body.city).toBeUndefined();
    expect(result).toEqual(scheduleData);
  });

  it('throws RUBITIME_API_ERROR when Rubitime returns status error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'error', message: 'Forbidden' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      fetchRubitimeSchedule({ params: { branchId: 1, cooperatorId: 2, serviceId: 3 }, fetchImpl }),
    ).rejects.toThrow('RUBITIME_API_ERROR');
  });

  it(
    'throws RUBITIME_HTTP_* when HTTP status is non-ok after retries on 503',
    async () => {
      const fetchImpl = vi.fn().mockImplementation(
        () =>
          new Response('Service Unavailable', { status: 503, headers: { 'content-type': 'text/plain' } }),
      );
      await expect(
        fetchRubitimeSchedule({ params: { branchId: 1, cooperatorId: 2, serviceId: 3 }, fetchImpl }),
      ).rejects.toThrow('RUBITIME_HTTP_503');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
    10_000,
  );

  it('retries on HTTP 503 then succeeds (second attempt)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const scheduleData = { '2026-04-10': { '10:00': { available: true } } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(
        new Response('unavailable', { status: 503, headers: { 'content-type': 'text/plain' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', message: 'Success', data: scheduleData }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const p = fetchRubitimeSchedule({ params: { branchId: 1, cooperatorId: 2, serviceId: 3 }, fetchImpl });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual(scheduleData);
    vi.useRealTimers();
  });

  it('retries twice on HTTP 503 then succeeds (third attempt)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const scheduleData = { '2026-04-10': { '10:00': { available: true } } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(
        new Response('unavailable', { status: 503, headers: { 'content-type': 'text/plain' } }),
      )
      .mockResolvedValueOnce(
        new Response('unavailable', { status: 503, headers: { 'content-type': 'text/plain' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', message: 'Success', data: scheduleData }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const p = fetchRubitimeSchedule({ params: { branchId: 1, cooperatorId: 2, serviceId: 3 }, fetchImpl });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result).toEqual(scheduleData);
    vi.useRealTimers();
  });

  it('throws RUBITIME_INVALID_JSON when Rubitime returns non-JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('not json', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(
      fetchRubitimeSchedule({ params: { branchId: 1, cooperatorId: 2, serviceId: 3 }, fetchImpl }),
    ).rejects.toThrow('RUBITIME_INVALID_JSON');
  });
});
