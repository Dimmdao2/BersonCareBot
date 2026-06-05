import { describe, expect, it } from 'vitest';
import { buildRubitimeDedupFingerprint, hashRubitimeRecordPayload } from './rubitimePayloadHash.js';
import type { RubitimeIncomingPayload } from './connector.js';

describe('rubitimePayloadHash', () => {
  it('changes hash when record body changes', () => {
    const a = hashRubitimeRecordPayload({ status: 1 });
    const b = hashRubitimeRecordPayload({ status: 2 });
    expect(a).not.toBe(b);
  });

  it('includes payloadHash in dedup fingerprint', () => {
    const incoming: RubitimeIncomingPayload = {
      entity: 'record',
      action: 'updated',
      recordId: '1',
      record: { comment: 'x' },
    };
    const fp = buildRubitimeDedupFingerprint(incoming);
    expect(fp.payloadHash).toBe(hashRubitimeRecordPayload({ comment: 'x' }));
  });
});
