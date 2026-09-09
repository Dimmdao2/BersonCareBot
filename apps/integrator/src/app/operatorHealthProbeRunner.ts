import type { DispatchPort } from '../kernel/contracts/index.js';
import { randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { z } from 'zod';
import { logger } from '../infra/observability/logger.js';
import { getMaxBotInfo } from '../integrations/max/client.js';
import {
  getMaxRuntimeConfig,
  getTelegramRuntimeConfig,
} from '../infra/adapters/integrationRuntimeConfig.js';
import { probeGoogleCalendarAccess } from '../integrations/google-calendar/probe.js';
import {
  getGoogleCalendarConfig,
  listGoogleCalendarProbeOrganizationIds,
} from '../integrations/google-calendar/runtimeConfig.js';
import { getBotInstance } from '../integrations/telegram/client.js';
import {
  OUTBOUND_PROVIDER_INCIDENT_DIRECTION,
  classifyOutboundProviderErrorClass,
  isPageOnFirstOccurrenceProviderErrorClass,
} from '@bersoncare/operator-db-schema';
import { reportOperatorFailure } from '../infra/operatorIncident/reportOperatorFailure.js';
import {
  recordOperatorOutboundProbeRun,
  getOperatorOutboundProbeLastCleanupAt,
  resolveOpenOperatorOutboundProbeIncidents,
} from '../infra/db/repos/operatorHealthDrizzle.js';
import { createDbPort } from '../infra/db/client.js';
import { parseSystemSettingInnerWithSchema } from '../infra/db/publicSystemSettings.js';
import { readOperatorHealthImapSettingValueJson } from '../infra/db/publicRestrictedSettings.js';
import { resolveSmtpOutboundConfig } from '../config/smtpOutbound.js';
import { sendMail } from '../integrations/email/mailer.js';
import type { PlatformDeliveryAudience } from '../infra/adapters/platformDeliveryAudience.js';
import {
  DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
  isOperatorHealthProbeQuiet,
  type OperatorHealthProbeConfig,
  type OperatorHealthProbeName,
} from './operatorHealthProbeSettings.js';

export type ProbeOutcome = 'ok' | 'fail' | 'skipped_not_configured';

const HEALTH_PROBE_SUBJECT_PREFIX = 'BCB-operator-health-v1:';
const HEALTH_PROBE_HEADER = 'X-BersonCare-Operator-Health-Probe';
const HEALTH_PROBE_HEADER_VALUE = 'v1';
const EMAIL_AUDIENCES: ReadonlyArray<{
  audience: PlatformDeliveryAudience;
  marker: 'therapygo' | 'therapysto';
}> = [
  { audience: 'patient', marker: 'therapygo' },
  { audience: 'staff', marker: 'therapysto' },
];

const operatorHealthImapSchema = z.object({
  address: z.string().trim().email(),
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65_535).default(993),
  login: z.string().trim().min(1),
  password: z.string().min(1),
  folder: z.string().trim().min(1).default('INBOX'),
});

type OperatorHealthImapConfig = z.infer<typeof operatorHealthImapSchema>;

const lastProbeAttemptAtMs = new Map<OperatorHealthProbeName, number>();

/** Test isolation for the process-local retry floor. */
export function resetOperatorHealthProbeAttemptFloorForTest(): void {
  lastProbeAttemptAtMs.clear();
}

function withProbeTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('probe_timeout')), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) =>
    globalThis.fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
}

function normalizedAddress(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function hasOwnedProbeHeader(headers: Buffer | undefined): boolean {
  return headers
    ?.toString('utf8')
    .toLowerCase()
    .includes(`${HEALTH_PROBE_HEADER.toLowerCase()}: ${HEALTH_PROBE_HEADER_VALUE}`) ?? false;
}

async function withImapMailbox<T>(input: {
  imap: OperatorHealthImapConfig;
  timeoutMs: number;
  run: (client: ImapFlow) => Promise<T>;
}): Promise<T> {
  const client = new ImapFlow({
    host: input.imap.host,
    port: input.imap.port,
    secure: true,
    auth: { user: input.imap.login, pass: input.imap.password },
    logger: false,
    connectionTimeout: input.timeoutMs,
    greetingTimeout: input.timeoutMs,
    socketTimeout: input.timeoutMs,
  });
  try {
    await withProbeTimeout(client.connect(), input.timeoutMs);
    return await input.run(client);
  } finally {
    await withProbeTimeout(
      client.logout().catch(() => {
        client.close();
      }),
      input.timeoutMs,
    ).catch(() => undefined);
  }
}

async function mailboxHasProbe(input: {
  imap: OperatorHealthImapConfig;
  timeoutMs: number;
  subject: string;
  senderAddress: string;
}): Promise<boolean> {
  return withImapMailbox({
    imap: input.imap,
    timeoutMs: input.timeoutMs,
    run: async (client) => {
      const lock = await withProbeTimeout(
        client.getMailboxLock(input.imap.folder, { readOnly: true }),
        input.timeoutMs,
      );
      try {
        const uids =
          (await withProbeTimeout(
          client.search({ subject: input.subject, header: { [HEALTH_PROBE_HEADER]: HEALTH_PROBE_HEADER_VALUE } }, { uid: true }),
          input.timeoutMs,
          )) || [];
        if (uids.length === 0) return false;
        const messages = await withProbeTimeout(
          client.fetchAll(uids, { envelope: true, headers: [HEALTH_PROBE_HEADER] }, { uid: true }),
          input.timeoutMs,
        );
        const expectedSender = normalizedAddress(input.senderAddress);
        return messages.some(
          (message) =>
            message.envelope?.subject === input.subject &&
            normalizedAddress(message.envelope?.from?.[0]?.address) === expectedSender &&
            hasOwnedProbeHeader(message.headers),
        );
      } finally {
        lock.release();
      }
    },
  });
}

async function cleanupOwnedProbeMessages(input: {
  imap: OperatorHealthImapConfig;
  timeoutMs: number;
  retentionMs: number;
  senderAddresses: readonly string[];
}): Promise<void> {
  await withImapMailbox({
    imap: input.imap,
    timeoutMs: input.timeoutMs,
    run: async (client) => {
      const lock = await withProbeTimeout(client.getMailboxLock(input.imap.folder), input.timeoutMs);
      try {
        const uids =
          (await withProbeTimeout(
          client.search({ header: { [HEALTH_PROBE_HEADER]: HEALTH_PROBE_HEADER_VALUE } }, { uid: true }),
          input.timeoutMs,
          )) || [];
        if (uids.length === 0) return;
        const messages = await withProbeTimeout(
          client.fetchAll(
            uids,
            { envelope: true, internalDate: true, headers: [HEALTH_PROBE_HEADER] },
            { uid: true },
          ),
          input.timeoutMs,
        );
        const allowedSenders = new Set(input.senderAddresses.map(normalizedAddress));
        const cutoff = Date.now() - input.retentionMs;
        const ownedOldUids = messages
          .filter(
            (message) =>
              message.envelope?.subject?.startsWith(HEALTH_PROBE_SUBJECT_PREFIX) &&
              hasOwnedProbeHeader(message.headers) &&
              allowedSenders.has(normalizedAddress(message.envelope?.from?.[0]?.address)) &&
              message.internalDate instanceof Date &&
              message.internalDate.getTime() < cutoff,
          )
          .map((message) => message.uid);
        if (ownedOldUids.length > 0) {
          await withProbeTimeout(client.messageDelete(ownedOldUids, { uid: true }), input.timeoutMs);
        }
      } finally {
        lock.release();
      }
    },
  });
}

export type OperatorHealthProbeRunResult = {
  max: ProbeOutcome;
  telegram: ProbeOutcome;
  google_calendar: ProbeOutcome;
  email?: ProbeOutcome;
  details: Record<string, string>;
};

async function runEmailRoundTripProbe(input: {
  config: OperatorHealthProbeConfig;
  details: Record<string, string>;
}): Promise<{ outcome: ProbeOutcome; audiences: Record<'patient' | 'staff', ProbeOutcome>; cleanupPerformed: boolean }> {
  const imapValue = await readOperatorHealthImapSettingValueJson(createDbPort()).catch(() => null);
  const imap =
    imapValue === null
      ? null
      : parseSystemSettingInnerWithSchema(imapValue, operatorHealthImapSchema);
  const audiences: Record<'patient' | 'staff', ProbeOutcome> = {
    patient: 'skipped_not_configured',
    staff: 'skipped_not_configured',
  };
  if (!imap) {
    input.details.email = 'skipped_not_configured';
    input.details.emailImap = 'skipped_not_configured';
    return { outcome: 'skipped_not_configured', audiences, cleanupPerformed: false };
  }

  const resolvedProfiles = await Promise.all(
    EMAIL_AUDIENCES.map(async ({ audience, marker }) => ({
      audience,
      marker,
      smtp: await resolveSmtpOutboundConfig(createDbPort(), audience),
    })),
  );
  const runId = randomUUID();
  for (const profile of resolvedProfiles) {
    if (!profile.smtp.configured) {
      input.details[`email.${profile.audience}`] = 'skipped_not_configured';
      continue;
    }
    const subject = `${HEALTH_PROBE_SUBJECT_PREFIX}${runId}:${profile.marker}`;
    try {
      const sent = await withProbeTimeout(
        sendMail(profile.smtp, {
          to: imap.address,
          subject,
          text: 'Platform SMTP delivery health probe.',
          timeoutMs: input.config.email.timeoutMs,
          headers: { [HEALTH_PROBE_HEADER]: HEALTH_PROBE_HEADER_VALUE },
        }),
        input.config.email.timeoutMs,
      );
      const recipient = normalizedAddress(imap.address);
      if (
        sent.rejected.some((address) => normalizedAddress(address) === recipient) ||
        !sent.accepted.some((address) => normalizedAddress(address) === recipient)
      ) {
        throw new Error('smtp_recipient_not_accepted');
      }

      const deadlineAt = Date.now() + input.config.email.roundTripDeadlineMs;
      let arrived = false;
      while (Date.now() < deadlineAt && !arrived) {
        const remainingMs = deadlineAt - Date.now();
        const timeoutMs = Math.max(1_000, Math.min(input.config.email.timeoutMs, remainingMs));
        arrived = await mailboxHasProbe({
          imap,
          timeoutMs,
          subject,
          senderAddress: profile.smtp.fromAddress,
        }).catch(() => false);
        if (!arrived && Date.now() < deadlineAt) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, deadlineAt - Date.now())));
        }
      }
      audiences[profile.audience] = arrived ? 'ok' : 'fail';
      input.details[`email.${profile.audience}`] = arrived ? 'ok' : 'round_trip_deadline_exceeded';
    } catch {
      audiences[profile.audience] = 'fail';
      input.details[`email.${profile.audience}`] = 'send_or_round_trip_failed';
    }
  }

  let cleanupPerformed = false;
  const lastCleanupAt = await getOperatorOutboundProbeLastCleanupAt().catch(() => null);
  const cleanupDue =
    lastCleanupAt === null || Date.now() - Date.parse(lastCleanupAt) >= input.config.email.cleanupIntervalMs;
  if (cleanupDue) {
    cleanupPerformed = true;
    await cleanupOwnedProbeMessages({
      imap,
      timeoutMs: input.config.email.timeoutMs,
      retentionMs: input.config.email.retentionMs,
      senderAddresses: resolvedProfiles
        .filter((profile) => profile.smtp.configured)
        .map((profile) => profile.smtp.fromAddress),
    }).then(
      () => {
        input.details.emailCleanup = 'ok';
      },
      () => {
        input.details.emailCleanup = 'failed';
      },
    );
  }

  const configured = resolvedProfiles.some((profile) => profile.smtp.configured);
  const outcome: ProbeOutcome = !configured
    ? 'skipped_not_configured'
    : Object.values(audiences).includes('fail')
      ? 'fail'
      : 'ok';
  input.details.email = outcome;
  return { outcome, audiences, cleanupPerformed };
}

/**
 * Синтетические пробы внешних каналов; при успехе — resolve открытых probe-инцидентов по префиксу.
 */
export async function runOperatorHealthProbes(input: {
  dispatchPort: DispatchPort;
  config?: OperatorHealthProbeConfig;
  probes?: readonly OperatorHealthProbeName[];
}): Promise<OperatorHealthProbeRunResult> {
  const config = input.config ?? DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG;
  if (isOperatorHealthProbeQuiet(config)) {
    return {
      max: 'skipped_not_configured',
      telegram: 'skipped_not_configured',
      google_calendar: 'skipped_not_configured',
      email: 'skipped_not_configured',
      details: { quietWindow: 'active' },
    };
  }
  const requestedProbes = input.probes ?? ['max', 'telegram', 'google_calendar', 'email'];
  const attemptStartedAtMs = Date.now();
  const probes = requestedProbes.filter((name) => {
    if (name !== 'email' && !config[name].enabled) return false;
    const lastAttemptAtMs = lastProbeAttemptAtMs.get(name);
    return (
      lastAttemptAtMs === undefined ||
      attemptStartedAtMs - lastAttemptAtMs >= config[name].intervalMs
    );
  });
  for (const name of probes) {
    // Mark before touching the provider: even a persistence failure must not make the 5-second
    // scheduler poll immediately repeat a probe that already consumed provider capacity.
    lastProbeAttemptAtMs.set(name, attemptStartedAtMs);
  }
  const shouldProbe = (name: OperatorHealthProbeName) =>
    probes.includes(name) && (name === 'email' || config[name].enabled);
  const details: Record<string, string> = {};
  let max: ProbeOutcome = 'skipped_not_configured';
  let telegram: ProbeOutcome = 'skipped_not_configured';
  let google_calendar: ProbeOutcome = 'skipped_not_configured';
  let email: ProbeOutcome = 'skipped_not_configured';
  let emailAudiences: Record<'patient' | 'staff', ProbeOutcome> | undefined;
  let cleanupPerformed = false;

  const maxRuntimeConfig = shouldProbe('max') ? await getMaxRuntimeConfig() : null;
  if (shouldProbe('max') && maxRuntimeConfig?.enabled) {
    const info = await withProbeTimeout(
      getMaxBotInfo({ apiKey: maxRuntimeConfig.apiKey, baseUrl: maxRuntimeConfig.baseUrl }),
      config.max.timeoutMs,
    ).catch(() => null);
    if (info === null) {
      max = 'fail';
      details.max = 'getMyInfo returned null';
    } else {
      max = 'ok';
      details.max = 'ok';
      const n = await resolveOpenOperatorOutboundProbeIncidents('max');
      if (n > 0) details.maxResolved = String(n);
    }
  } else if (shouldProbe('max')) {
    details.max = 'skipped_not_configured';
  }

  const telegramRuntimeConfig = shouldProbe('telegram') ? await getTelegramRuntimeConfig() : null;
  if (shouldProbe('telegram') && telegramRuntimeConfig?.enabled) {
    try {
      await withProbeTimeout((await getBotInstance()).api.getMe(), config.telegram.timeoutMs);
      telegram = 'ok';
      details.telegram = 'ok';
      const n = await resolveOpenOperatorOutboundProbeIncidents('telegram');
      if (n > 0) details.telegramResolved = String(n);
    } catch (err) {
      telegram = 'fail';
      const msg = err instanceof Error ? err.message : String(err);
      details.telegram = msg;
    }
  } else if (shouldProbe('telegram')) {
    details.telegram = 'skipped_not_configured';
  }

  if (shouldProbe('google_calendar')) {
    try {
      const organizationIds = await listGoogleCalendarProbeOrganizationIds();
      let gcalConfig: Awaited<ReturnType<typeof getGoogleCalendarConfig>> | null = null;
      let probedOrganizationId: string | null = null;
      for (const organizationId of organizationIds) {
        const candidate = await getGoogleCalendarConfig(organizationId);
        if (candidate.enabled && candidate.refreshToken?.trim()) {
          gcalConfig = candidate;
          probedOrganizationId = organizationId;
          break;
        }
      }
      const selectedConfig = gcalConfig;
      if (selectedConfig && probedOrganizationId) {
        await probeGoogleCalendarAccess(
          fetchWithTimeout(config.google_calendar.timeoutMs),
          async () => selectedConfig,
        );
        google_calendar = 'ok';
        details.google_calendar = 'ok';
        details.google_calendarConfiguredOrganizations = String(organizationIds.length);
        const n = await resolveOpenOperatorOutboundProbeIncidents('google_calendar');
        if (n > 0) details.google_calendarResolved = String(n);
      } else {
        details.google_calendar = 'skipped_not_configured';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'not_configured') {
        details.google_calendar = 'skipped_not_configured';
      } else {
        google_calendar = 'fail';
        details.google_calendar = msg;
      }
    }
  }

  if (shouldProbe('email')) {
    // This is deliberately an extension of this scheduler choke point: SMTP goes through the
    // existing audience resolver + mailer, and IMAP only proves the resulting delivery arrived.
    // Development is always a no-op, even if a developer accidentally populated the DB setting.
    if (process.env.NODE_ENV === 'development') {
      details.email = 'skipped_development';
    } else {
      const emailProbe = await runEmailRoundTripProbe({ config, details });
      email = emailProbe.outcome;
      emailAudiences = emailProbe.audiences;
      cleanupPerformed = emailProbe.cleanupPerformed;
      for (const audience of EMAIL_AUDIENCES) {
        if (emailAudiences[audience.audience] !== 'ok') continue;
        try {
          const resolved = await resolveOpenOperatorOutboundProbeIncidents('email', audience.audience);
          if (resolved > 0) details[`email.${audience.audience}Resolved`] = String(resolved);
        } catch {
          details[`email.${audience.audience}Resolve`] = 'failed';
        }
      }
    }
  }

  try {
    if (probes.length === 0) {
      logger.info({ requestedProbes }, 'operator_health_probes_suppressed_by_attempt_floor');
      return { max, telegram, google_calendar, email, details };
    }
    const streak = await recordOperatorOutboundProbeRun({
      max,
      telegram,
      google_calendar,
      email,
      ...(emailAudiences ? { emailAudiences } : {}),
      cleanupPerformed,
      probed: probes,
    });
    details.consecutiveFailRuns = String(streak.consecutiveFailRuns);
    const failures: Array<[OperatorHealthProbeName, ProbeOutcome, string, string, string]> = [
      ['max', max, 'max', 'max_probe_failed', 'MAX probe failed'],
      ['telegram', telegram, 'telegram', 'telegram_probe_failed', 'Telegram getMe probe failed'],
      [
        'google_calendar',
        google_calendar,
        'google_calendar',
        'google_calendar_probe_failed',
        'Google Calendar probe failed',
      ],
      [
        'email',
        email,
        'email',
        'email_patient_round_trip_failed',
        'TherapyGo SMTP round-trip probe failed',
      ],
      [
        'email',
        email,
        'email',
        'email_staff_round_trip_failed',
        'Therapysto SMTP round-trip probe failed',
      ],
    ];
    for (const [name, outcome, integration, probeErrorClass, title] of failures) {
      const audience =
        probeErrorClass === 'email_patient_round_trip_failed'
          ? 'patient'
          : probeErrorClass === 'email_staff_round_trip_failed'
            ? 'staff'
            : undefined;
      if (audience && emailAudiences?.[audience] !== 'fail') continue;
      if (outcome !== 'fail') continue;
      const detail = audience ? `platform_audience=${audience}` : details[name] ?? 'probe failed';

      // Один канал не должен топить отчёт по остальным: `open_or_touch_operator_probe_incident`
      // умеет отвергнуть незнакомую пару (integration, error_class) исключением (`23514`), и до
      // этой правки такое исключение рвало ВЕСЬ `for`, теряя отчёт по каналам, идущим следом за
      // отказавшим (порядок обхода — max, telegram, google_calendar). Каждая итерация теперь
      // изолирована: сбой репорта по одному каналу — warn и следующий канал, не потеря остальных.
      try {
        // Решение владельца 21.07: отказ провайдера по учётным данным/квоте пейджится с ПЕРВОГО
        // появления. Проба до этого складывала ЛЮБУЮ причину в один класс `<провайдер>_probe_failed`
        // и ждала трёх промахов подряд, поэтому телеграмный `401 Unauthorized` был неотличим от
        // таймаута и молчал столько же. Разбор текста ошибки — тот же, что у настоящей отправки;
        // отдельного словаря у пробы нет.
        const providerErrorClass = classifyOutboundProviderErrorClass(detail);
        if (isPageOnFirstOccurrenceProviderErrorClass(providerErrorClass)) {
          details[`${name}ProviderErrorClass`] = providerErrorClass;
          await reportOperatorFailure({
            dispatchPort: input.dispatchPort,
            direction: OUTBOUND_PROVIDER_INCIDENT_DIRECTION,
            integration,
            errorClass: providerErrorClass,
            errorDetail: detail,
            alertLines: [title, detail],
          });
          continue;
        }

        if (
          !audience &&
          (streak.consecutiveFailures[name] ?? 0) <
            config[name as Exclude<OperatorHealthProbeName, 'email'>].consecutiveFailures
        )
          continue;
        await reportOperatorFailure({
          dispatchPort: input.dispatchPort,
          direction: audience ? OUTBOUND_PROVIDER_INCIDENT_DIRECTION : 'outbound',
          integration,
          errorClass: probeErrorClass,
          errorDetail: detail,
          alertLines: [title, detail],
        });
      } catch (err) {
        logger.warn({ err, name, integration }, 'operator_health_probe_report_failure_failed');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'operator_health_probe_job_status_failed');
  }

  logger.info({ max, telegram, google_calendar, email, details }, 'operator_health_probes_done');
  return { max, telegram, google_calendar, email, details };
}
