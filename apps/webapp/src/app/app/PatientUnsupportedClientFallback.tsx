import { cn } from '@/lib/utils';
import {
  CLIENT_BOOT_FALLBACK_ID,
  buildClientBootWatchdogScript,
} from '@/modules/auth/clientBootWatchdog';
import {
  formatClientEnvironmentFact,
  toClientEnvironmentTelemetry,
  type ParsedClientEnvironment,
} from '@/modules/auth/supportedClientMatrix';
import {
  patientCardClass,
  patientInlineLinkClass,
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';

export function PatientUnsupportedClientFallback({
  client,
  entrySurface,
  failureTimeoutEnabled,
  supportContactHref,
}: {
  client: ParsedClientEnvironment;
  entrySurface: 'tg' | 'max' | 'browser';
  failureTimeoutEnabled: boolean;
  supportContactHref: string;
}) {
  const clientFact = formatClientEnvironmentFact(client);
  const watchdogScript = buildClientBootWatchdogScript({
    entrySurface,
    client: toClientEnvironmentTelemetry(client),
    failureTimeoutEnabled,
  });

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: watchdogScript }} />
      <section
        id={CLIENT_BOOT_FALLBACK_ID}
        className={cn(patientCardClass, patientInnerPageStackClass, 'text-left')}
        aria-live="polite"
        hidden
      >
        <h1 className={patientSectionTitleClass}>Что-то пошло не так на вашем устройстве</h1>
        <p>
          Мы очень хотим, чтобы у вас всё заработало. Похоже, приложению не удалось запуститься —
          возможно, стоит обновить браузер, операционную систему или попробовать открыть с другого
          устройства. Если не получится — напишите нам, мы поможем.
        </p>
        <a
          className={cn(patientInlineLinkClass, 'font-medium underline')}
          href={supportContactHref}
        >
          Связаться с поддержкой
        </a>
        {clientFact ? <p className={patientMutedTextClass}>{clientFact}</p> : null}
      </section>
    </>
  );
}
