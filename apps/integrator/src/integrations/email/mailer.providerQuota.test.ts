/**
 * Приёмочный шаг 1 из design D-i: «первая отправка падает и КЛАССИФИЦИРУЕТСЯ как отказ
 * провайдера по квоте/учётным данным».
 *
 * Проверяется на настоящем SMTP-диалоге, а не на подставленной строке ошибки: поднимается
 * локальный слушатель на эфемерном порту loopback, который ведёт себя ровно как SES при
 * исчерпанной суточной квоте — отвечает `220` на подключении и принимает всё вплоть до
 * `DATA`, а потом отбивает `454`. Именно поэтому проверка SMTP-баннера НЕ поймала бы
 * июльский отказ: порт отвечает нормально, отказ приходит только на DATA.
 *
 * Наружу ничего не уходит: слушатель — loopback, и он ничего не доставляет.
 */
import { createServer, type Server, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  classifyOutboundProviderErrorClass,
  isPageOnFirstOccurrenceProviderErrorClass,
} from '@bersoncare/operator-db-schema';
import { sendMail } from './mailer.js';
import { isOutgoingDeliveryDispatchErrorRetryable } from '../../infra/delivery/deliveryContract.js';
import type { ResolvedSmtpOutboundConfig } from '../../config/smtpOutbound.js';

/** Ответ, которым отбивается DATA. Меняется между сценариями. */
let dataRejection = '454 4.7.0 Throttling failure: Daily message quota exceeded';

function handleConnection(socket: Socket): void {
  let inData = false;
  socket.write('220 fake-provider ESMTP ready\r\n');
  socket.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (!line) continue;
      if (inData) {
        if (line === '.') {
          inData = false;
          socket.write(`${dataRejection}\r\n`);
        }
        continue;
      }
      const verb = line.slice(0, 4).toUpperCase();
      if (verb === 'EHLO' || verb === 'HELO') {
        socket.write('250-fake-provider\r\n250 AUTH PLAIN LOGIN\r\n');
      } else if (verb === 'AUTH') {
        socket.write('235 2.7.0 Authentication successful\r\n');
      } else if (verb === 'MAIL' || verb === 'RCPT') {
        socket.write('250 2.1.0 Ok\r\n');
      } else if (verb === 'DATA') {
        inData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
      } else if (verb === 'QUIT') {
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
      } else {
        socket.write('250 2.0.0 Ok\r\n');
      }
    }
  });
  socket.on('error', () => undefined);
}

let server: Server;
let port = 0;

function configFor(smtpPort: number, user: string): ResolvedSmtpOutboundConfig {
  return {
    configured: true,
    smtpHost: '127.0.0.1',
    smtpPort,
    smtpSecure: false,
    smtpUser: user,
    smtpPass: 'not-a-real-password',
    fromAddress: 'noreply@example.invalid',
  } as ResolvedSmtpOutboundConfig;
}

beforeAll(async () => {
  server = createServer(handleConnection);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('D-i step 1 — a broken mail path is classified, not silently retried', () => {
  it('classifies a real 454 daily-quota rejection as provider_quota_exhausted', async () => {
    dataRejection = '454 4.7.0 Throttling failure: Daily message quota exceeded';
    // Разный user → своя запись в кэше транспорта, сценарии не переиспользуют соединение.
    const error = await sendMail(configFor(port, 'quota-scenario'), {
      to: 'nobody@example.invalid',
      subject: 'acceptance',
      text: 'acceptance',
    }).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );

    expect(error, 'the provider must reject, not accept').not.toBeNull();
    expect(error).toContain('454');
    const errorClass = classifyOutboundProviderErrorClass(error);
    expect(errorClass).toBe('provider_quota_exhausted');
    expect(isPageOnFirstOccurrenceProviderErrorClass(errorClass)).toBe(true);
  });

  it('classifies a credit-exhaustion rejection as provider_credit_exhausted', async () => {
    dataRejection = '550 5.7.1 Maximum credits exceeded for this account';
    const error = await sendMail(configFor(port, 'credit-scenario'), {
      to: 'nobody@example.invalid',
      subject: 'acceptance',
      text: 'acceptance',
    }).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );

    expect(error).not.toBeNull();
    const errorClass = classifyOutboundProviderErrorClass(error);
    expect(errorClass).toBe('provider_credit_exhausted');
    expect(isPageOnFirstOccurrenceProviderErrorClass(errorClass)).toBe(true);
  });

  it('D-i step 7 — nothing is dropped: quota and credit failures stay retryable', () => {
    // D-f: «никогда не выбрасывать при отказе: удерживать и ретраить». Собственный класс
    // инцидента нужен не вместо ретрая, а ПОМИМО него — иначе тихий ретрай снова станет
    // единственным поведением. Сигналом о беде служит ВОЗРАСТ старейшей неотправленной
    // позиции (проверяется на стороне webapp), а не отсутствие ретрая.
    for (const message of [
      '454 4.7.0 Throttling failure: Daily message quota exceeded',
      '550 5.7.1 Maximum credits exceeded for this account',
      '535 5.7.8 Authentication failed',
    ]) {
      expect(isOutgoingDeliveryDispatchErrorRetryable(message)).toBe(true);
    }
    // Контраст: ошибки конфигурации/полезной нагрузки по-прежнему не ретраятся вечно.
    expect(isOutgoingDeliveryDispatchErrorRetryable('BAD_PAYLOAD')).toBe(false);
  });
});
