import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routePaths } from '@/app-layer/routes/paths';
import type { SerializedSupportMessage } from '@/modules/messaging/serializeSupportMessage';
import { PatientOrganizationContextProvider } from '@/shared/ui/patient/organization/PatientOrganizationContext';
import { PatientMessagesClient } from './PatientMessagesClient';

const polling = vi.hoisted(() => ({
  tick: null as null | (() => void | Promise<void>),
}));

vi.mock('@/modules/messaging/hooks/useMessagePolling', () => ({
  useMessagePolling: (onTick: () => void | Promise<void>, enabled: boolean) => {
    polling.tick = enabled ? onTick : null;
  },
}));

/**
 * Владелец (бриф этапа): «Patient support messages must use the same modal conversation
 * experience. The header identifies the doctor or clinic as plain text, never a link. If the
 * current support contract cannot prove an assigned doctor name, show the active clinic title;
 * do not invent or hardcode a person» + «preserve send/read/poll/read-only behavior».
 *
 * Отказы, которые ловят эти тесты:
 * 1. Обращение переехало в модалку, и отправка перестала уходить на сервер — пациент видит своё
 *    сообщение (или не видит) и считает, что написал в поддержку, а сообщения нет. Дорого и молчаливо.
 * 2. Открытие чата перестало помечать входящие прочитанными — счётчик непрочитанного не гаснет.
 * 3. В закрытом обращении снова появился composer — пациент пишет в тред, который отбивает сервер.
 * 4. В шапке снова появилось имя человека, которого контракт поддержки не отдаёт (до этого этапа
 *    там был захардкоженный «Чат с Дмитрием»), либо шапка стала ссылкой.
 *
 * Геометрию модалки (закреплённые шапка/подвал, скролл, затемнение) тесты не проверяют — живая приёмка.
 */

const conversationId = '11111111-1111-4111-8111-111111111111';
const organization = {
  organizationId: '99999999-9999-4999-8999-999999999999',
  title: 'Клиника Берсона',
};

const incoming = {
  id: 'msg-1',
  integratorMessageId: null,
  conversationId,
  senderRole: 'admin',
  messageType: 'text',
  text: 'Добрый день, чем помочь?',
  source: 'webapp',
  createdAt: '2026-09-01T08:00:00.000Z',
  readAt: null,
  deliveredAt: null,
  mediaUrl: null,
  mediaType: null,
} as unknown as SerializedSupportMessage;

const outgoing = {
  ...incoming,
  id: 'msg-2',
  senderRole: 'user',
  text: 'Не могу записаться на приём',
  createdAt: '2026-09-01T09:00:00.000Z',
} as unknown as SerializedSupportMessage;

const replaceMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app/patient/messages',
}));

type Call = { url: string; init?: RequestInit };

function stubMessagesApi(
  options: {
    readOnly?: boolean;
    pollMessages?: SerializedSupportMessage[];
    pollReadOnly?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    if (url.startsWith('/api/patient/messages/read')) {
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    if (url.startsWith('/api/patient/messages') && init?.method === 'POST') {
      const sent = JSON.parse(String(init.body)) as { text: string };
      return {
        ok: true,
        json: async () => ({ ok: true, message: { ...outgoing, id: 'msg-new', text: sent.text } }),
      } as unknown as Response;
    }
    if (url.startsWith('/api/patient/messages?conversationId=')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          conversationId,
          messages: options.pollMessages ?? [incoming],
          readOnly: options.pollReadOnly === true,
        }),
      } as unknown as Response;
    }
    if (url.startsWith('/api/patient/messages')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          conversationId,
          messages: [incoming],
          readOnly: options.readOnly === true,
        }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function renderChat() {
  return render(
    <PatientOrganizationContextProvider
      organization={organization}
      organizations={[organization]}
      checkContextChangeReceipt={false}
      navigate={vi.fn()}
    >
      <PatientMessagesClient />
    </PatientOrganizationContextProvider>,
  );
}

beforeEach(() => {
  replaceMock.mockClear();
  polling.tick = null;
  /* jsdom не реализует Element.scrollTo; тред сам себя скроллит вниз при монтировании. */
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('patient support chat в канонической модалке', () => {
  it('отправляет введённый текст на сервер и показывает его в треде', async () => {
    const calls = stubMessagesApi();
    renderChat();

    await screen.findByText('Добрый день, чем помочь?');
    fireEvent.change(screen.getByLabelText('Текст сообщения'), {
      target: { value: 'Не могу записаться на приём' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await screen.findByText('Не могу записаться на приём');
    const posted = calls.find(
      (c) => c.init?.method === 'POST' && c.url === '/api/patient/messages',
    );
    expect(posted).toBeDefined();
    expect(JSON.parse(String(posted!.init!.body))).toEqual({
      text: 'Не могу записаться на приём',
      conversationId,
    });
  });

  it('помечает обращение прочитанным при открытии', async () => {
    const calls = stubMessagesApi();
    renderChat();

    await screen.findByText('Добрый день, чем помочь?');
    await waitFor(() => {
      const read = calls.find((c) => c.url === '/api/patient/messages/read');
      expect(read?.init?.method).toBe('POST');
      expect(JSON.parse(String(read!.init!.body))).toEqual({ conversationId });
    });
  });

  it('в закрытом обращении не показывает форму отправки', async () => {
    stubMessagesApi({ readOnly: true });
    renderChat();

    await screen.findByText('Добрый день, чем помочь?');
    expect(screen.queryByLabelText('Текст сообщения')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument();
  });

  it('при опросе обновляет тред, помечает его прочитанным и применяет read-only', async () => {
    const reply = {
      ...incoming,
      id: 'msg-poll',
      text: 'Новое сообщение после опроса',
      createdAt: '2026-09-01T10:00:00.000Z',
    } as unknown as SerializedSupportMessage;
    const calls = stubMessagesApi({ pollMessages: [incoming, reply], pollReadOnly: true });
    renderChat();

    await screen.findByText('Добрый день, чем помочь?');
    expect(polling.tick).not.toBeNull();
    await act(async () => {
      await polling.tick?.();
    });

    expect(await screen.findByText('Новое сообщение после опроса')).toBeInTheDocument();
    expect(screen.queryByLabelText('Текст сообщения')).not.toBeInTheDocument();
    const pollRead = calls.filter(
      (call) => call.url === '/api/patient/messages/read' && call.init?.method === 'POST',
    );
    expect(pollRead.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(String(pollRead.at(-1)?.init?.body))).toEqual({ conversationId });
  });

  it('закрывает модалку на безопасный корень кабинета пациента', async () => {
    stubMessagesApi();
    renderChat();

    await screen.findByText('Добрый день, чем помочь?');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(replaceMock).toHaveBeenCalledWith(routePaths.patient);
  });

  it('в шапке показывает название активной клиники простым текстом, а не ссылкой', async () => {
    stubMessagesApi();
    renderChat();

    const title = await screen.findByText('Клиника Берсона');
    expect(title.closest('a')).toBeNull();

    const header = title.closest('[data-slot="dialog-header"], [data-slot="drawer-header"]');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).queryByRole('link')).toBeNull();
  });
});
