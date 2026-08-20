'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import type { AdminStatsTimePreset } from '@/modules/admin-platform-stats/types';
import type { PlatformAnalyticsDashboard } from '@/modules/platform-analytics/types';
import { VIDEO_DURATION_BUCKET_LABELS } from '@/modules/platform-analytics/types';
import { VIDEO_DURATION_BUCKETS } from '@/modules/platform-analytics/durationBuckets';
import {
  PLATFORM_ENTRY_CHANNELS,
  type PlatformEntryChannel,
} from '@/modules/platform-analytics/entryChannels';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { AnalyticsPeriodToolbar } from '@/app/app/doctor/analytics/clients/AnalyticsPeriodToolbar';
import { DoctorStatCard } from '@/app/app/doctor/analytics/clients/DoctorStatCard';
import {
  resolveAnalyticsPeriodLabel,
  validateCustomAnalyticsPeriod,
  ymdMinusDays,
  buildAdminStatsQuery,
  type AnalyticsPeriodValue,
} from '@/app/app/doctor/analytics/clients/analyticsPeriodUi';
import { PlatformAnalyticsLineChart } from './PlatformAnalyticsLineChart';
import { formatBytesAsMb } from '@/shared/lib/formatStorageMb';

/** Подписи — презентация, поэтому живут в UI, а не рядом с доменными типами. */
const ENTRY_CHANNEL_LABELS: Record<PlatformEntryChannel, string> = {
  pwa: 'Приложение',
  browser: 'Сайт',
  telegram: 'Telegram',
  max: 'MAX',
  other: 'Прочее',
};

function formatInt(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

function formatShare(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function formatAvg(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(1);
}

export function PlatformAnalyticsPageClient({
  calendarTodayYmd,
  displayIana,
}: {
  calendarTodayYmd: string;
  displayIana: string;
}) {
  const [preset, setPreset] = useState<AdminStatsTimePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState<AnalyticsPeriodValue>({
    preset: 'week',
    customFrom: '',
    customTo: '',
  });
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [data, setData] = useState<PlatformAnalyticsDashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const period = useMemo<AnalyticsPeriodValue>(
    () => ({ preset, customFrom, customTo }),
    [preset, customFrom, customTo],
  );
  const periodLabel = useMemo(
    () => resolveAnalyticsPeriodLabel(displayIana, appliedPeriod),
    [displayIana, appliedPeriod],
  );

  const applyPeriod = useCallback((next: AnalyticsPeriodValue) => {
    const err = validateCustomAnalyticsPeriod(next);
    if (err) {
      setPeriodError(err);
      return;
    }
    setPeriodError(null);
    // Загрузку помечаем здесь, в обработчике события, а не в эффекте: setState прямо в теле
    // эффекта вызывает каскад повторных отрисовок (react-hooks/set-state-in-effect).
    setLoading(true);
    setLoadError(null);
    setAppliedPeriod(next);
  }, []);

  const handlePresetChange = useCallback(
    (next: AdminStatsTimePreset) => {
      setPreset(next);
      if (next === 'custom') {
        const t = calendarTodayYmd.trim() || DateTime.now().setZone(displayIana).toISODate() || '';
        const from = ymdMinusDays(t, 6);
        setCustomFrom(from);
        setCustomTo(t);
        applyPeriod({ preset: 'custom', customFrom: from, customTo: t });
        return;
      }
      setCustomFrom('');
      setCustomTo('');
      applyPeriod({ preset: next, customFrom: '', customTo: '' });
    },
    [applyPeriod, calendarTodayYmd, displayIana],
  );

  useEffect(() => {
    let cancelled = false;
    const qs = buildAdminStatsQuery(appliedPeriod);
    void fetch(`/api/admin/platform-analytics?${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as PlatformAnalyticsDashboard;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Не удалось загрузить аналитику.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedPeriod]);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsPeriodToolbar
        period={period}
        periodLabel={periodLabel}
        periodError={periodError}
        onPresetChange={handlePresetChange}
        onCustomFromChange={(value) => {
          setCustomFrom(value);
          setPeriodError(null);
        }}
        onCustomToChange={(value) => {
          setCustomTo(value);
          setPeriodError(null);
        }}
        onApplyCustom={() => applyPeriod(period)}
      />
      {loadError ? <DoctorEmptyState>{loadError}</DoctorEmptyState> : null}
      {loading && !data ? <DoctorEmptyState>Загрузка…</DoctorEmptyState> : null}
      {data ? <DashboardBody data={data} /> : null}
    </div>
  );
}

function DashboardBody({ data }: { data: PlatformAnalyticsDashboard }) {
  const days = data.clients.clinics.series.map((p) => p.day);
  return (
    <>
      <DoctorSection>
        <DoctorSectionTitle>Клиенты платформы</DoctorSectionTitle>
        <DoctorMetricList>
          <DoctorStatCard id="clinics" title="Клиники сейчас" value={formatInt(data.clients.clinics.now)} />
          <DoctorStatCard
            id="specialists"
            title="Специалисты сейчас"
            value={formatInt(data.clients.specialists.now)}
          />
          <DoctorStatCard
            id="patients"
            title="Пациенты сейчас"
            value={formatInt(data.clients.patients.now)}
          />
        </DoctorMetricList>
        <PlatformAnalyticsLineChart
          days={days}
          series={[
            {
              def: { key: 'clinics', label: 'Новые клиники' },
              values: data.clients.clinics.series.map((p) => p.count),
            },
            {
              def: { key: 'specialists', label: 'Новые специалисты' },
              values: data.clients.specialists.series.map((p) => p.count),
            },
            {
              def: { key: 'patients', label: 'Новые пациенты' },
              values: data.clients.patients.series.map((p) => p.count),
            },
          ]}
        />
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionTitle>Заходы</DoctorSectionTitle>
        <VisitsAudienceBlock
          idPrefix="doc"
          audienceLabel="врачей"
          slice={data.visits.doctor}
          missingIngestNote={
            'Продуктовая аналитика собирается только в кабинете пациента: единственный приёмник ' +
            'событий закрыт пациентским гейтом, врачебной сессии некуда отправить заход. ' +
            'Чтобы здесь появились цифры, нужен приём событий в кабинете врача.'
          }
        />
        <VisitsAudienceBlock
          idPrefix="pat"
          audienceLabel="пациентов"
          slice={data.visits.patient}
          missingIngestNote={null}
        />
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionTitle>Запись</DoctorSectionTitle>
        <DoctorMetricList>
          <DoctorStatCard id="booked" title="Записались" value={formatInt(data.bookings.created)} />
          <DoctorStatCard id="cancelled" title="Отменили" value={formatInt(data.bookings.cancelled)} />
          <DoctorStatCard
            id="programs"
            title="Назначено программ"
            value={formatInt(data.programsAssigned)}
          />
          <DoctorStatCard
            id="visits"
            title="Визиты с карточками"
            value={formatInt(data.clinicalVisits)}
          />
        </DoctorMetricList>
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionTitle>Контент специалистов</DoctorSectionTitle>
        <DoctorMetricList>
          <DoctorStatCard
            id="cms"
            title="Статьи CMS"
            value={formatInt(data.cmsArticlesCreated)}
          />
          <DoctorStatCard
            id="ex-created"
            title="Упражнения"
            value={formatInt(data.exercises.created)}
          />
          <DoctorStatCard
            id="ex-avg"
            title="Среднее на создавшего"
            value={formatAvg(data.exercises.averagePerCreator)}
          />
          <DoctorStatCard
            id="ex-personal"
            title="С приёма"
            value={formatInt(data.exercises.personal)}
          />
          <DoctorStatCard
            id="ex-catalog"
            title="Общие"
            value={formatInt(data.exercises.catalog)}
          />
          <DoctorStatCard
            id="ex-file"
            title="Видео-файлы"
            value={formatInt(data.exercises.videoFiles)}
          />
          <DoctorStatCard
            id="ex-iframe"
            title="YouTube/RuTube/VK"
            value={formatInt(data.exercises.videoIframe)}
          />
        </DoctorMetricList>
      </DoctorSection>

      <VideoVolumeBlock title="Видео упражнений" idPrefix="ex-vol" slice={data.videoVolume.exercises} />
      <VideoVolumeBlock title="Видео CMS" idPrefix="cms-vol" slice={data.videoVolume.cms} />

      <DoctorSection>
        <DoctorSectionTitle>Активность пациентов</DoctorSectionTitle>
        <DoctorMetricList>
          <DoctorStatCard
            id="done"
            title="Отметки выполнения"
            value={formatInt(data.patientActivity.completions)}
          />
          <DoctorStatCard
            id="done-metrics"
            title="С повторениями/сложностью"
            value={formatInt(data.patientActivity.completionsWithRepsOrDifficulty)}
          />
          <DoctorStatCard
            id="mood"
            title="Самочувствие на главной"
            value={formatInt(data.patientActivity.homeWellbeingMarks)}
          />
          <DoctorStatCard id="symptom" title="Дневник симптома" value="—" />
          <DoctorStatCard
            id="prog-p"
            title="С программой"
            value={formatInt(data.patientActivity.programActivity.patientsWithProgram)}
          />
          <DoctorStatCard
            id="prog-visit"
            title="Дни захода на упражнения"
            value={formatAvg(data.patientActivity.programActivity.avgVisitDays)}
          />
          <DoctorStatCard
            id="prog-mark"
            title="Дни с отметкой"
            value={formatAvg(data.patientActivity.programActivity.avgMarkDays)}
          />
          <DoctorStatCard
            id="prog-share"
            title="Отметили из зашедших"
            value={formatShare(data.patientActivity.programActivity.avgMarkShareOfVisitDays)}
          />
          <DoctorStatCard
            id="vv-total"
            title="Просмотры видео"
            value={formatInt(data.patientActivity.videoViewsTotal)}
          />
          <DoctorStatCard
            id="vv-uniq"
            title="Уникальные просмотры"
            value={formatInt(data.patientActivity.videoViewsUnique)}
          />
          <DoctorStatCard
            id="hls"
            title="Выдача HLS"
            value={formatInt(data.patientActivity.hlsResolves)}
          />
          <DoctorStatCard
            id="mp4"
            title="Выдача MP4"
            value={formatInt(data.patientActivity.mp4Resolves)}
          />
          <DoctorStatCard
            id="perr"
            title="Ошибки воспроизведения"
            value={formatInt(data.patientActivity.playbackErrors)}
          />
          <DoctorStatCard id="iframe-shown" title="Показы iframe" value="—" />
        </DoctorMetricList>
        <DoctorSectionTitle>Выдачи видео по дням</DoctorSectionTitle>
        <PlatformAnalyticsLineChart
          days={data.patientActivity.playbackSeries.map((p) => p.day)}
          series={[
            {
              def: { key: 'playback', label: 'Выдачи видео' },
              values: data.patientActivity.playbackSeries.map((p) => p.count),
            },
          ]}
        />
      </DoctorSection>
    </>
  );
}

/**
 * Одна аудитория блока «Заходы»: страницы, кабинет, разрез входа (мессенджеры отдельной
 * величиной, не внутри «приложения») и топ страниц за период. Аудитория без приёма событий
 * показывает заглушку, а не ноль: ноль здесь означал бы «никто не заходил».
 */
function VisitsAudienceBlock({
  idPrefix,
  audienceLabel,
  slice,
  missingIngestNote,
}: {
  idPrefix: string;
  audienceLabel: string;
  slice: PlatformAnalyticsDashboard['visits']['patient'];
  missingIngestNote: string | null;
}) {
  if (!slice.ingestAvailable) {
    return (
      <div className="flex flex-col gap-2">
        <DoctorMetricList>
          <DoctorStatCard id={`${idPrefix}-pages`} title={`Страницы ${audienceLabel}`} value="—" />
          <DoctorStatCard id={`${idPrefix}-cabinet`} title={`Кабинет ${audienceLabel}`} value="—" />
        </DoctorMetricList>
        {missingIngestNote ? (
          <p className="text-xs text-muted-foreground">{missingIngestNote}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <DoctorMetricList>
        <DoctorStatCard
          id={`${idPrefix}-pages`}
          title={`Страницы ${audienceLabel}`}
          value={formatInt(slice.pageViews)}
        />
        <DoctorStatCard
          id={`${idPrefix}-cabinet`}
          title={`Кабинет ${audienceLabel}`}
          value={formatInt(slice.cabinetViews)}
        />
        {PLATFORM_ENTRY_CHANNELS.map((channel) => (
          <DoctorStatCard
            key={channel}
            id={`${idPrefix}-ch-${channel}`}
            title={ENTRY_CHANNEL_LABELS[channel]}
            value={formatInt(slice.byChannel[channel])}
          />
        ))}
      </DoctorMetricList>
      <TopPagesList idPrefix={idPrefix} audienceLabel={audienceLabel} slice={slice} />
    </div>
  );
}

function TopPagesList({
  idPrefix,
  audienceLabel,
  slice,
}: {
  idPrefix: string;
  audienceLabel: string;
  slice: PlatformAnalyticsDashboard['visits']['patient'];
}) {
  if (slice.topPages.length === 0) {
    return <DoctorEmptyState>Заходов {audienceLabel} за период нет.</DoctorEmptyState>;
  }
  return (
    <ul className={doctorDnaFlatListClass} data-testid={`${idPrefix}-top-pages`}>
      {slice.topPages.map((entry) => (
        <li key={entry.pageKey}>
          <div className={doctorDnaFlatListRowClass}>
            <span className={`${doctorDnaFlatListPrimaryClass} min-w-0 flex-1 truncate`}>
              {entry.pageKey}
            </span>
            <span className={doctorDnaFlatListMetaClass}>{formatInt(entry.views)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function VideoVolumeBlock({
  title,
  idPrefix,
  slice,
}: {
  title: string;
  idPrefix: string;
  slice: PlatformAnalyticsDashboard['videoVolume']['exercises'];
}) {
  return (
    <DoctorSection>
      <DoctorSectionTitle>{title}</DoctorSectionTitle>
      <DoctorMetricList>
        <DoctorStatCard id={`${idPrefix}-orig`} title="Оригиналы" value={formatBytesAsMb(slice.originalsBytes)} />
        <DoctorStatCard id={`${idPrefix}-n`} title="Роликов" value={formatInt(slice.videoCount)} />
        <DoctorStatCard
          id={`${idPrefix}-avg`}
          title="Среднее на ролик"
          value={slice.averageBytes == null ? '—' : formatBytesAsMb(slice.averageBytes)}
        />
        <DoctorStatCard id={`${idPrefix}-xcode`} title="Конвертация" value="—" />
      </DoctorMetricList>
      <DoctorMetricList>
        {VIDEO_DURATION_BUCKETS.map((bucket) => (
          <DoctorStatCard
            key={bucket}
            id={`${idPrefix}-${bucket}`}
            title={VIDEO_DURATION_BUCKET_LABELS[bucket]}
            value={formatInt(slice.durationBuckets[bucket])}
          />
        ))}
      </DoctorMetricList>
    </DoctorSection>
  );
}
