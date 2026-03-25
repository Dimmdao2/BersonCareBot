import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import nock from 'nock';
import fetch from 'node-fetch';
import { fetchRubitimeRecordById } from './client.js';

describe('rubitime client nock', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('calls rubitime api2/get-record via HTTP (network blocked except nock)', async () => {
    nock('https://rubitime.ru')
      .post('/api2/get-record')
      .reply(200, {
        status: 'ok',
        message: 'Success',
        data: { id: 42, phone: '+79990001122' },
      });

    const result = await fetchRubitimeRecordById({
      recordId: '42',
      fetchImpl: fetch as unknown as typeof globalThis.fetch,
    });

    expect(result).toMatchObject({ id: 42, phone: '+79990001122' });
  });
});
