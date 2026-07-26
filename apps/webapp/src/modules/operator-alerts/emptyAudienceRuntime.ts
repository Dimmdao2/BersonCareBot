import { logger } from "@/infra/logging/logger";
import type { EmptyAudienceEvent } from "./emptyAudience";

/**
 * Точка входа для доменного слоя (design D-b).
 *
 * Домен не имеет права звать app-layer напрямую, поэтому счётчик и fallback подключаются
 * регистрацией на краю (`buildAppDeps`), как это уже сделано для dedup-порта алертов.
 *
 * Важное свойство: даже БЕЗ зарегистрированного репортера событие не становится тихим —
 * структурированный лог пишется здесь и всегда. Незарегистрированный порт не должен
 * воспроизводить ровно ту ошибку, ради которой всё это и делается.
 */

export type EmptyAudienceReporter = (event: EmptyAudienceEvent) => Promise<void>;

let reporter: EmptyAudienceReporter | null = null;

export function registerEmptyAudienceReporter(next: EmptyAudienceReporter): void {
  reporter = next;
}

export function getEmptyAudienceReporter(): EmptyAudienceReporter | null {
  return reporter;
}

/** Только для тестов: вернуть реестр в исходное состояние. */
export function resetEmptyAudienceReporterForTests(): void {
  reporter = null;
}

export async function reportEmptyAudience(event: EmptyAudienceEvent): Promise<void> {
  logger.warn(
    {
      scope: "notification_delivery",
      event: "notification_audience_empty",
      topic: event.topic,
      severity: event.severity,
      channels: event.channels,
      ...(event.context ?? {}),
    },
    "notification resolved to an empty audience",
  );
  if (!reporter) {
    logger.warn(
      { scope: "notification_delivery", event: "empty_audience_reporter_unregistered", topic: event.topic },
      "empty audience reporter is not registered; only the log survives",
    );
    return;
  }
  try {
    await reporter(event);
  } catch (err) {
    logger.warn({ err, topic: event.topic }, "empty audience reporter failed");
  }
}

/** Fire-and-forget для мест, которые не могут ждать. */
export function reportEmptyAudienceBestEffort(event: EmptyAudienceEvent): void {
  void reportEmptyAudience(event).catch(() => undefined);
}
