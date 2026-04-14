/**
 * Reads communication data (conversations, questions) from webapp GET /api/integrator/communication/*.
 * Used for admin product reads when readPort delegates to webapp.
 */
import { createHmac } from 'node:crypto';
import type { DbPort } from '../../kernel/contracts/index.js';
import { getAppBaseUrl } from '../../config/appBaseUrl.js';
import { integratorWebhookSecret } from '../../config/env.js';
import type {
  CommunicationReadsPort,
  CommunicationConversationListItem,
  CommunicationConversationDetail,
  CommunicationQuestionListItem,
} from '../../kernel/contracts/index.js';

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

type WebappConversationRow = {
  integratorConversationId?: string;
  source?: string;
  integratorUserId?: string | null;
  adminScope?: string;
  status?: string;
  openedAt?: string;
  lastMessageAt?: string;
  closedAt?: string | null;
  closeReason?: string | null;
  displayName?: string;
  phoneNormalized?: string | null;
  channelExternalId?: string | null;
  lastMessageText?: string | null;
  lastSenderRole?: string | null;
  userChatId?: string | null;
};

type WebappQuestionRow = {
  integratorQuestionId?: string;
  integratorConversationId?: string | null;
  text?: string;
  createdAt?: string;
  answered?: boolean;
  answeredAt?: string | null;
  displayName?: string;
  phoneNormalized?: string | null;
  channelExternalId?: string | null;
};

function toNull(s: string | null | undefined): string | null {
  return s === undefined || s === null ? null : s;
}

function mapConversation(row: WebappConversationRow): CommunicationConversationListItem {
  const id = typeof row.integratorConversationId === 'string' ? row.integratorConversationId : '';
  const displayName = typeof row.displayName === 'string' ? row.displayName : '';
  return {
    id,
    source: typeof row.source === 'string' ? row.source : '',
    user_identity_id: typeof row.integratorUserId === 'string' ? row.integratorUserId : (row.integratorUserId != null ? String(row.integratorUserId) : ''),
    admin_scope: typeof row.adminScope === 'string' ? row.adminScope : '',
    status: typeof row.status === 'string' ? row.status : 'open',
    opened_at: typeof row.openedAt === 'string' ? row.openedAt : '',
    last_message_at: typeof row.lastMessageAt === 'string' ? row.lastMessageAt : '',
    closed_at: toNull(typeof row.closedAt === 'string' ? row.closedAt : row.closedAt),
    close_reason: toNull(typeof row.closeReason === 'string' ? row.closeReason : row.closeReason),
    user_channel_id: typeof row.channelExternalId === 'string' ? row.channelExternalId : (row.channelExternalId ?? ''),
    user_chat_id: toNull(typeof row.userChatId === 'string' ? row.userChatId : row.userChatId),
    username: null,
    first_name: displayName || null,
    last_name: null,
    phone_normalized: toNull(typeof row.phoneNormalized === 'string' ? row.phoneNormalized : row.phoneNormalized),
    last_message_text: toNull(typeof row.lastMessageText === 'string' ? row.lastMessageText : row.lastMessageText),
    last_sender_role: toNull(typeof row.lastSenderRole === 'string' ? row.lastSenderRole : row.lastSenderRole),
  };
}

function mapConversationDetail(row: WebappConversationRow): CommunicationConversationDetail {
  const base = mapConversation(row);
  return { ...base, user_chat_id: toNull(typeof row.userChatId === 'string' ? row.userChatId : row.userChatId) };
}

function mapQuestion(row: WebappQuestionRow): CommunicationQuestionListItem {
  const id = typeof row.integratorQuestionId === 'string' ? row.integratorQuestionId : '';
  const displayName = typeof row.displayName === 'string' ? row.displayName : '';
  return {
    id,
    user_identity_id: '',
    conversation_id: toNull(typeof row.integratorConversationId === 'string' ? row.integratorConversationId : row.integratorConversationId),
    telegram_message_id: null,
    text: typeof row.text === 'string' ? row.text : '',
    created_at: typeof row.createdAt === 'string' ? row.createdAt : '',
    answered: Boolean(row.answered),
    answered_at: toNull(typeof row.answeredAt === 'string' ? row.answeredAt : row.answeredAt),
    user_channel_id: typeof row.channelExternalId === 'string' ? row.channelExternalId : (row.channelExternalId ?? ''),
    username: null,
    first_name: displayName || null,
    last_name: null,
  };
}

async function fetchCommunicationGet<T>(
  db: DbPort,
  pathname: string,
  search: string,
): Promise<{ ok: boolean; data?: T; status: number }> {
  const baseUrl = await getAppBaseUrl(db);
  const secret = integratorWebhookSecret();
  if (!baseUrl || !secret) {
    return { ok: false, status: 0 };
  }
  const url = `${baseUrl.replace(/\/$/, '')}${pathname}${search ? `?${search}` : ''}`;
  const canonicalGet = `GET ${pathname}${search ? `?${search}` : ''}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signGet(timestamp, canonicalGet, secret);
  const headers: Record<string, string> = {
    'X-Bersoncare-Timestamp': timestamp,
    'X-Bersoncare-Signature': signature,
  };
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; conversations?: WebappConversationRow[]; conversation?: WebappConversationRow; questions?: WebappQuestionRow[]; question?: { id: string; answered: boolean } | null };
    return { ok: res.ok && data.ok === true, data: data as T, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function createCommunicationReadsPort(deps: { db: DbPort }): CommunicationReadsPort {
  const { db } = deps;
  return {
    async listOpenConversations(params: { source?: string; limit?: number }) {
      const search = new URLSearchParams();
      if (params.source?.trim()) search.set('source', params.source.trim());
      if (params.limit != null && params.limit > 0) search.set('limit', String(params.limit));
      const result = await fetchCommunicationGet<{ conversations?: WebappConversationRow[] }>(
        db,
        '/api/integrator/communication/conversations',
        search.toString(),
      );
      if (!result.ok || !result.data?.conversations) return [];
      const rows = Array.isArray(result.data.conversations) ? result.data.conversations : [];
      return rows.map(mapConversation);
    },

    async getConversationById(integratorConversationId: string) {
      const pathname = `/api/integrator/communication/conversations/${encodeURIComponent(integratorConversationId)}`;
      const result = await fetchCommunicationGet<{ conversation?: WebappConversationRow }>(db, pathname, '');
      if (!result.ok || result.status === 404 || !result.data?.conversation) return null;
      return mapConversationDetail(result.data.conversation);
    },

    async listUnansweredQuestions(params: { limit?: number }) {
      const search = new URLSearchParams();
      if (params.limit != null && params.limit > 0) search.set('limit', String(params.limit));
      const result = await fetchCommunicationGet<{ questions?: WebappQuestionRow[] }>(
        db,
        '/api/integrator/communication/questions',
        search.toString(),
      );
      if (!result.ok || !result.data?.questions) return [];
      const rows = Array.isArray(result.data.questions) ? result.data.questions : [];
      return rows.map(mapQuestion);
    },

    async getQuestionByConversationId(integratorConversationId: string) {
      const pathname = `/api/integrator/communication/questions/by-conversation/${encodeURIComponent(integratorConversationId)}`;
      const result = await fetchCommunicationGet<{ question?: { id: string; answered: boolean } | null }>(
        db,
        pathname,
        '',
      );
      if (!result.ok) return null;
      const q = result.data?.question;
      if (q == null) return null;
      return { id: typeof q.id === 'string' ? q.id : String(q.id), answered: Boolean(q.answered) };
    },
  };
}
