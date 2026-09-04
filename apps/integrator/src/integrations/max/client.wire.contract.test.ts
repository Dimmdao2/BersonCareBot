import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sendMaxMessage } from './client.js';
import { isRecipientBlockedBotMessage } from '../../infra/delivery/recipientBotBlocked.js';

/**
 * Контракт «что наш вызов реально кладёт на провод» — настоящий SDK MAX против HTTP-сервера на
 * 127.0.0.1. Наружу не уходит ни один запрос, реальный ключ не нужен.
 *
 * Названный отказ, дорогой и молчаливый: остальные тесты MAX мокают `@maxhub/max-bot-api` целиком,
 * поэтому смена эндпоинта или формы тела внутри SDK для набора невидима — обновление 0.2.2 → 0.3.1
 * уже перенесло `setMyCommands` на другой путь, и ни один тест этого не заметил. Если очередной
 * апгрейд потеряет получателя или вырежет вложение клавиатуры, сообщения перестанут доходить (или
 * кнопка мини-приложения перестанет открываться), а прогон останется зелёным.
 *
 * Проверяется наше, а не чужое: адресат, текст и полезная нагрузка кнопки. Признак адресата
 * (`user_id` против `chat_id`) закрепляется намеренно — перепутать их значит доставить сообщение не
 * туда; HTTP-метод и путь остаются на усмотрение SDK и здесь не фиксируются.
 */

type Hit = { method: string; url: string; body: string };

type Boundary = {
  baseUrl: string;
  hits: Hit[];
  /** Следующий запрос получит 403 с телом «пользователь заблокировал бота». */
  blockNext(): void;
  close(): Promise<void>;
};

async function startMaxBoundary(): Promise<Boundary> {
  const hits: Hit[] = [];
  let blocked = false;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      hits.push({ method: req.method ?? '', url: req.url ?? '', body });
      if (blocked) {
        blocked = false;
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 'dialog.suspended', message: 'User blocked bot' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          message: {
            body: { mid: 'mid-1', seq: 1, text: 'ok' },
            recipient: { chat_type: 'dialog' },
            timestamp: 1,
          },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    hits,
    blockNext: () => {
      blocked = true;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let boundary: Boundary;
const config = () => ({ apiKey: 'local-boundary-key', baseUrl: boundary.baseUrl });

beforeEach(async () => {
  boundary = await startMaxBoundary();
});
afterEach(async () => {
  await boundary.close();
});

describe('MAX client: что уходит на провод', () => {
  it('доносит адресата и текст до платформы', async () => {
    await sendMaxMessage(config(), { userId: 42, text: 'Напоминание о визите' });

    expect(boundary.hits).toHaveLength(1);
    const [hit] = boundary.hits;
    expect(hit?.url).toContain('user_id=42');
    expect(JSON.parse(hit?.body ?? '{}')).toMatchObject({ text: 'Напоминание о визите' });
  });

  it('различает получателя-диалог и получателя-чат', async () => {
    await sendMaxMessage(config(), { userId: 42, text: 'диалог' });
    await sendMaxMessage(config(), { chatId: 7, text: 'чат' });

    const [toUser, toChat] = boundary.hits;
    expect(toUser?.url).toContain('user_id=42');
    expect(toUser?.url).not.toContain('chat_id');
    expect(toChat?.url).toContain('chat_id=7');
    expect(toChat?.url).not.toContain('user_id');
  });

  it('кнопка мини-приложения доходит с адресом, иначе открывать нечего', async () => {
    await sendMaxMessage(config(), {
      userId: 42,
      text: 'Открыть кабинет',
      extra: {
        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  {
                    type: 'open_app',
                    text: 'Открыть',
                    web_app: 'https://app.example.test/cabinet',
                    contact_id: 42,
                  },
                ],
              ],
            },
          },
        ] as never,
      },
    });

    const sent = JSON.parse(boundary.hits[0]?.body ?? '{}');
    expect(sent.attachments?.[0]?.payload?.buttons?.[0]?.[0]).toEqual({
      type: 'open_app',
      text: 'Открыть',
      web_app: 'https://app.example.test/cabinet',
      contact_id: 42,
    });
  });

  it('отказ «получатель заблокировал бота» остаётся распознаваемым, а не превращается в вечный retry', async () => {
    boundary.blockNext();

    const error = await sendMaxMessage(config(), { userId: 42, text: 'Напоминание' }).then(
      () => null,
      (e: unknown) => e as { name?: string; apiMessage?: string },
    );

    expect(error?.name).toBe('MaxSendError');
    expect(isRecipientBlockedBotMessage(error?.apiMessage ?? '')).toBe(true);
  });
});
