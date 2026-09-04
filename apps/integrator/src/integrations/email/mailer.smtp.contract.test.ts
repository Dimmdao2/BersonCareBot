import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sendMail } from './mailer.js';
import type { ResolvedSmtpOutboundConfig } from '../../config/smtpOutbound.js';

/**
 * Контракт `sendMail` с SMTP-сервером на реальном сокете (127.0.0.1, наружу ничего не уходит).
 *
 * Названный отказ, дорогой и молчаливый: учёт доставки строится на `accepted`/`rejected`, которые
 * `mailer` берёт из ответа nodemailer. Если апгрейд библиотеки поменяет их форму — вернёт пустые
 * списки, склеит принятых с отвергнутыми или потеряет `messageId` — письмо о записи к врачу будет
 * помечено доставленным, хотя сервер получателя его отверг, и никто этого не заметит до неявки
 * пациента. До этого файла `mailer.ts` не был покрыт ничем: `deliveryAdapter.unit.test.ts` мокает
 * сам `sendMail`, поэтому транспорт целиком выпадал из набора.
 *
 * Приёмник — минимальный SMTP на `node:net`: это внешняя граница (§10b «Заглушки допустимы на
 * внешних границах»), а не подделка нашего кода. Порт эфемерный, время и локаль не участвуют.
 */

type Sink = {
  port: number;
  /** Строки DATA последней принятой сессии. */
  message(): string;
  /** Тело односоставного письма с раскодированным transfer-encoding. */
  bodyText(): string;
  close(): Promise<void>;
};

/** Письмо приходит закодированным; нас интересует, что увидит получатель, а не как это упаковано. */
function decodeSinglePartBody(raw: string): string {
  const split = raw.indexOf('\n\n');
  if (split < 0) return raw;
  const headers = raw.slice(0, split);
  const body = raw.slice(split + 2);
  const encoding = /^Content-Transfer-Encoding:\s*(\S+)/im.exec(headers)?.[1]?.toLowerCase();
  if (encoding === 'base64') return Buffer.from(body.replace(/\n/g, ''), 'base64').toString('utf8');
  if (encoding === 'quoted-printable') {
    return body
      .replace(/=\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_m, hex: string) => Buffer.from(hex, 'hex').toString('binary'));
  }
  return body;
}

/** Принимает всех, кроме адресов с `blocked@` — их отвергает постоянной ошибкой 550. */
async function startSmtpSink(): Promise<Sink> {
  let lastMessage: string[] = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    const lines: string[] = [];
    socket.write('220 sink.invalid ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        const at = buffer.indexOf('\r\n');
        if (at < 0) break;
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            lastMessage = [...lines];
            socket.write('250 2.0.0 Ok: queued as SINK1\r\n');
          } else {
            lines.push(line);
          }
          continue;
        }
        const command = line.toUpperCase();
        if (command.startsWith('EHLO')) socket.write('250-sink.invalid\r\n250 8BITMIME\r\n');
        else if (command.startsWith('RCPT TO'))
          socket.write(
            line.includes('blocked@') ? '550 5.1.1 No such user\r\n' : '250 2.1.5 Ok\r\n',
          );
        else if (command === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else socket.write('250 2.0.0 Ok\r\n');
      }
    });
    socket.on('error', () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    message: () => lastMessage.join('\n'),
    bodyText: () => decodeSinglePartBody(lastMessage.join('\n')),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let sink: Sink;
const config = (): ResolvedSmtpOutboundConfig => ({
  configured: true,
  smtpHost: '127.0.0.1',
  smtpPort: sink.port,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  fromAddress: 'clinic@example.test',
  senderDisplayName: 'Клиника',
});

beforeEach(async () => {
  sink = await startSmtpSink();
});
afterEach(async () => {
  await sink.close();
});

describe('sendMail: контракт с SMTP-сервером', () => {
  it('разделяет принятых и отвергнутых получателей и возвращает messageId', async () => {
    const result = await sendMail(config(), {
      to: ['ok@example.test', 'blocked@example.test'],
      subject: 'Запись подтверждена',
      text: 'Ждём вас',
    });

    expect(result.accepted).toEqual(['ok@example.test']);
    expect(result.rejected).toEqual(['blocked@example.test']);
    expect(result.messageId).toMatch(/^<.+>$/);
  });

  it('доносит до письма reply-to, вложение и отправителя с именем', async () => {
    await sendMail(config(), {
      to: 'ok@example.test',
      subject: 'Запись подтверждена',
      text: 'Ждём вас',
      replyTo: 'reply@example.test',
      attachments: [
        {
          filename: 'booking.ics',
          content: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
          contentType: 'text/calendar',
        },
      ],
    });

    const raw = sink.message();
    expect(raw).toMatch(/^Reply-To: .*reply@example\.test/im);
    expect(raw).toMatch(/^From: .*clinic@example\.test/im);
    expect(raw).toMatch(/booking\.ics/i);
    expect(raw).toMatch(/text\/calendar/i);
  });

  it('текст доходит до тела письма, а незаданные поля не превращаются в заголовки', async () => {
    const result = await sendMail(config(), {
      to: 'ok@example.test',
      subject: 'Только текст',
      text: 'Приём в четверг в 10:00',
    });

    const raw = sink.message();
    expect(result.accepted).toEqual(['ok@example.test']);
    expect(raw).toMatch(/Content-Type: text\/plain/i);
    expect(sink.bodyText()).toContain('Приём в четверг в 10:00');
    expect(raw).not.toMatch(/^Reply-To:/im);
    expect(raw).not.toMatch(/^Content-Type: text\/html/im);
    expect(raw).not.toMatch(/undefined/);
  });

  it('без конфигурации не ходит в сеть и отдаёт пустой результат', async () => {
    const result = await sendMail(
      { ...config(), configured: false },
      { to: 'ok@example.test', subject: 'Тишина', text: 'Ждём вас' },
    );

    expect(result).toEqual({ accepted: [], rejected: [] });
  });
});
