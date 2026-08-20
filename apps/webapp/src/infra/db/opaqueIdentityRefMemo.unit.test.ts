import { describe, expect, it } from 'vitest';
import { opaqueIdentityRefMemoKey } from '@/infra/db/portContextRuntime';

const USER_A = 'c0000000-0000-4000-8000-0000000000c3';
const USER_B = 'd0000000-0000-4000-8000-0000000000d4';

/**
 * Что ловит: ключ памяти непрозрачной ссылки личности, переставший различать человека или пул.
 * Разрешение выполняется под pre_session-capability СВОЕГО пула, то есть под своими правами:
 * ключ без пула отдал бы ссылку, полученную правами одного пула, в другой, а ключ без физического
 * id — ссылку одного человека другому. И то и другое выглядело бы как исправная страница с чужой
 * личностью в claims порт-контекста.
 */
describe('opaque identity ref memo key', () => {
  it('separates people asking through the same pool', () => {
    expect(opaqueIdentityRefMemoKey('staff', USER_A)).not.toEqual(
      opaqueIdentityRefMemoKey('staff', USER_B),
    );
  });

  it('separates pools asking about the same person', () => {
    const keys = new Set([
      opaqueIdentityRefMemoKey('staff', USER_A),
      opaqueIdentityRefMemoKey('patient', USER_A),
      opaqueIdentityRefMemoKey('globalAdmin', USER_A),
    ]);
    expect(keys.size).toBe(3);
  });

  it('gives one and the same key to the same person and pool', () => {
    expect(opaqueIdentityRefMemoKey('staff', USER_A)).toEqual(
      opaqueIdentityRefMemoKey('staff', USER_A),
    );
  });
});
