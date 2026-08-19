import assert from 'node:assert/strict';
import test from 'node:test';

import { portTypedArgsForFunctionIdentity } from '../dist/portContext.js';

/**
 * Что ловит: именно тот отказ, который 19.08 держал письмо-подтверждение записи не поставленным в
 * очередь ни разу. Миграция 0033 объявила `app.enqueue_outbound_message(...)` с шестым аргументом
 * `jsonb`; `portTypedArgsForFunctionIdentity` типа `jsonb` не поддерживает (клиент не может
 * воспроизвести канонические байты `jsonb_send`) и бросает раньше запроса к базе — вызывающий код
 * (`pgOutboundMessageQueue.ts`) никогда не доходил до `runWebappSql`. Миграция 0036 сменила тип
 * аргумента на `text` с разбором `::jsonb` внутри тела корня; этот тест доказывает, что реальная
 * (не замоканная) сборка типизированных аргументов для этой сигнатуры больше не бросает.
 */
test('builds typed args for the enqueue_outbound_message text-content signature without throwing', () => {
  const args = portTypedArgsForFunctionIdentity(
    'app.enqueue_outbound_message(uuid,text,text,text,text,text,integer)',
    [
      'b0000000-0000-4000-8000-0000000000b0',
      'booking.confirmation',
      'bk-1',
      'email',
      'person@example.test',
      JSON.stringify({ text: 'Ваша запись подтверждена.' }),
      6,
    ],
  );
  assert.equal(args.length, 7);
  assert.equal(args[5].typeTag, 'text@1');
});

/**
 * Что ловит: возврат к жёстко объявленному `jsonb` порт-аргументу где бы то ни было в декларации.
 * Это не деталь одной функции — это структурное ограничение подписанного транскрипта вызова
 * (`app.hash_port_typed_args`): `jsonb` в список поддерживаемых типов НЕ должен попасть, потому что
 * для него нет канонического байтового представления, которое клиент может воспроизвести.
 */
test('still refuses a jsonb-typed port argument identity', () => {
  assert.throws(
    () =>
      portTypedArgsForFunctionIdentity('app.enqueue_outbound_message(uuid,text,text,text,text,jsonb,integer)', [
        'b0000000-0000-4000-8000-0000000000b0',
        'booking.confirmation',
        'bk-1',
        'email',
        'person@example.test',
        '{}',
        6,
      ]),
    /uses unsupported port argument type jsonb/,
  );
});
