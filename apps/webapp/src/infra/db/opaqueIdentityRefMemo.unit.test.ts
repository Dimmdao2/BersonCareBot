import { describe, expect, it } from 'vitest';
import { opaqueIdentityRefMemoKey } from '@/infra/db/portContextRuntime';

const USER_A = 'c0000000-0000-4000-8000-0000000000c3';
const USER_B = 'd0000000-0000-4000-8000-0000000000d4';

/**
 * Что ловит: ключ памяти непрозрачной ссылки личности, переставший различать человека, пул или вид
 * ссылки. Разрешение выполняется под pre_session-capability СВОЕГО пула, то есть под своими правами:
 * ключ без пула отдал бы ссылку, полученную правами одного пула, в другой, а ключ без физического
 * id — ссылку одного человека другому. И то и другое выглядело бы как исправная страница с чужой
 * личностью в claims порт-контекста.
 *
 * D15b/7a Ш4 (22.08): к этому добавился ВИД. С этого шага пациент за один запрос спрашивает ДВЕ
 * ссылки — акторскую и субъектную, — и это единственное, чем они отличаются на входе. Ключ без вида
 * вернул бы второй поездке ответ первой, и в `subject_ref` уехала бы акторская ссылка: ровно та
 * подмена, ради запрета которой (Ш5) весь раздел и затеян, только совершённая своими руками и без
 * единого признака поломки на экране.
 */
describe('opaque identity ref memo key', () => {
  it('separates people asking through the same pool', () => {
    expect(opaqueIdentityRefMemoKey('staff', USER_A, 'actor')).not.toEqual(
      opaqueIdentityRefMemoKey('staff', USER_B, 'actor'),
    );
  });

  it('separates pools asking about the same person', () => {
    const keys = new Set([
      opaqueIdentityRefMemoKey('staff', USER_A, 'actor'),
      opaqueIdentityRefMemoKey('patient', USER_A, 'actor'),
      opaqueIdentityRefMemoKey('globalAdmin', USER_A, 'actor'),
    ]);
    expect(keys.size).toBe(3);
  });

  it('separates the kinds of reference of one and the same person in one and the same pool', () => {
    expect(opaqueIdentityRefMemoKey('patient', USER_A, 'actor')).not.toEqual(
      opaqueIdentityRefMemoKey('patient', USER_A, 'subject'),
    );
  });

  it('gives one and the same key to the same person, pool and kind', () => {
    expect(opaqueIdentityRefMemoKey('staff', USER_A, 'actor')).toEqual(
      opaqueIdentityRefMemoKey('staff', USER_A, 'actor'),
    );
  });
});
