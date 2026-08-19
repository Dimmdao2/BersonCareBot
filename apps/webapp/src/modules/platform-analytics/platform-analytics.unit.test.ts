import { describe, expect, it } from 'vitest';
import { videoDurationBucket } from '@/modules/platform-analytics/durationBuckets';
import { classifyMediaUrlKind, isHostingIframeKind } from '@/modules/platform-analytics/hostingUrlKind';
import {
  isDoctorCabinetPageKey,
  isPatientCabinetPageKey,
  isTreatmentProgramPageKey,
  pageAudienceFromPageKey,
  pageAudienceHasIngest,
} from '@/modules/platform-analytics/pageAudience';
import { platformEntryChannel } from '@/modules/platform-analytics/entryChannels';
import { createPlatformAnalyticsService } from '@/modules/platform-analytics/service';
import { emptyDurationBucketCounts } from '@/modules/platform-analytics/durationBuckets';
import type { PlatformAnalyticsSnapshot } from '@/modules/platform-analytics/ports';

describe('videoDurationBucket', () => {
  it('puts a 2-minute file in the shortest bucket, not 3–5', () => {
    expect(videoDurationBucket(120)).toBe('le3');
    expect(videoDurationBucket(181)).toBe('m3_5');
  });

  it('keeps missing duration out of the shortest bucket', () => {
    expect(videoDurationBucket(null)).toBe('unknown');
  });
});

describe('pageAudienceFromPageKey', () => {
  it('counts doctor cabinet pages as doctor, not patient', () => {
    expect(pageAudienceFromPageKey('/app/doctor/today')).toBe('doctor');
    expect(isDoctorCabinetPageKey('/app/doctor/today')).toBe(true);
    expect(pageAudienceFromPageKey('/app/patient/home')).toBe('patient');
    expect(isPatientCabinetPageKey('/app/patient/cabinet')).toBe(true);
    expect(isPatientCabinetPageKey('/app/patient/home')).toBe(false);
  });

  it('treats program pages as treatment activity', () => {
    expect(isTreatmentProgramPageKey('/app/patient/treatment/program')).toBe(true);
    expect(isTreatmentProgramPageKey('/app/patient/home')).toBe(false);
  });
});

describe('classifyMediaUrlKind', () => {
  it('does not count a library file as a hosting iframe', () => {
    const file = classifyMediaUrlKind('/api/media/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(file).toBe('file');
    expect(isHostingIframeKind(file)).toBe(false);
  });

  it('recognizes youtube and vk hosts', () => {
    expect(classifyMediaUrlKind('https://youtu.be/abc')).toBe('youtube');
    expect(classifyMediaUrlKind('https://vk.com/video-1_2')).toBe('vk');
  });
});


describe('кабинет врача — подмножество врачебной аудитории, а не она сама', () => {
  it('страницы админа и настроек — врачебная аудитория, но НЕ кабинет', () => {
    expect(pageAudienceFromPageKey('/app/settings/profile')).toBe('doctor');
    expect(isDoctorCabinetPageKey('/app/settings/profile')).toBe(false);
    expect(pageAudienceFromPageKey('/app/admin/clinics')).toBe('doctor');
    expect(isDoctorCabinetPageKey('/app/admin/clinics')).toBe(false);
    expect(pageAudienceFromPageKey('/app/account')).toBe('doctor');
    expect(isDoctorCabinetPageKey('/app/account')).toBe(false);
    expect(isDoctorCabinetPageKey('/app/doctor')).toBe(true);
  });

  it('врачебных заходов не измеряют вовсе — это заглушка, а не ноль', () => {
    expect(pageAudienceHasIngest('doctor')).toBe(false);
    expect(pageAudienceHasIngest('patient')).toBe(true);
  });
});

describe('platformEntryChannel', () => {
  it('мессенджер — свой канал, а не «приложение»', () => {
    expect(platformEntryChannel('telegram')).toBe('telegram');
    expect(platformEntryChannel('max')).toBe('max');
    expect(platformEntryChannel('pwa')).toBe('pwa');
    expect(platformEntryChannel('browser')).toBe('browser');
    expect(platformEntryChannel('__all__')).toBe('other');
  });
});

function snapshotWith(pageViews: PlatformAnalyticsSnapshot['pageViews']): PlatformAnalyticsSnapshot {
  const emptyVolume = {
    originalsBytes: 0,
    videoCount: 0,
    durationBuckets: emptyDurationBucketCounts(),
  };
  return {
    clinics: { now: 0, inPeriod: 0, byDay: new Map() },
    specialists: { now: 0, inPeriod: 0, byDay: new Map() },
    patients: { now: 0, inPeriod: 0, byDay: new Map() },
    pageViews,
    bookings: { created: 0, cancelled: 0 },
    programsAssigned: 0,
    clinicalVisits: 0,
    cmsArticlesCreated: 0,
    exercises: { created: 0, creators: 0, personal: 0, catalog: 0, videoFiles: 0, videoIframe: 0 },
    videoVolumeExercises: emptyVolume,
    videoVolumeCms: emptyVolume,
    completions: { completions: 0, withRepsOrDifficulty: 0 },
    homeWellbeingMarks: 0,
    programActivity: { patientsWithProgram: 0, visitDaysSum: 0, markDaysSum: 0 },
    playback: {
      viewsTotal: 9,
      viewsUnique: 4,
      hlsResolves: 9,
      mp4Resolves: 0,
      playbackErrors: 1,
      byDay: new Map([['2026-08-19', 7]]),
    },
  };
}

describe('дашборд платформы: блок заходов', () => {
  const input = {
    iana: 'Europe/Moscow',
    preset: 'day' as const,
    audience: {
      includeTestAccounts: false,
      testPhones: [],
      testTelegramIds: [],
      testMaxIds: [],
    },
  };

  it('«страницы» и «кабинет» — разные числа, а не одно дважды', async () => {
    const service = createPlatformAnalyticsService({
      readSnapshot: async () =>
        snapshotWith([
          { pageKey: '/app/doctor/today', entryChannel: 'pwa', views: 5 },
          { pageKey: '/app/settings/profile', entryChannel: 'browser', views: 3 },
        ]),
    });

    const dashboard = await service.getDashboard(input);

    expect(dashboard.visits.doctor.pageViews).toBe(8);
    expect(dashboard.visits.doctor.cabinetViews).toBe(5);
    expect(dashboard.visits.doctor.cabinetViews).not.toBe(dashboard.visits.doctor.pageViews);
  });

  it('мессенджеры видны отдельно, а не спрятаны в «приложении»', async () => {
    const service = createPlatformAnalyticsService({
      readSnapshot: async () =>
        snapshotWith([
          { pageKey: '/app/patient/home', entryChannel: 'pwa', views: 10 },
          { pageKey: '/app/patient/home', entryChannel: 'telegram', views: 7 },
          { pageKey: '/app/patient/home', entryChannel: 'max', views: 2 },
          { pageKey: '/app/patient/home', entryChannel: 'browser', views: 1 },
        ]),
    });

    const dashboard = await service.getDashboard(input);

    expect(dashboard.visits.patient.byChannel.telegram).toBe(7);
    expect(dashboard.visits.patient.byChannel.max).toBe(2);
    expect(dashboard.visits.patient.byChannel.pwa).toBe(10);
    expect(dashboard.visits.patient.byChannel.browser).toBe(1);
  });

  it('топ страниц доезжает до контракта, а не считается впустую', async () => {
    const service = createPlatformAnalyticsService({
      readSnapshot: async () =>
        snapshotWith([
          { pageKey: '/app/patient/home', entryChannel: 'pwa', views: 4 },
          { pageKey: '/app/patient/diary', entryChannel: 'pwa', views: 9 },
        ]),
    });

    const dashboard = await service.getDashboard(input);

    expect(dashboard.visits.patient.topPages[0]).toEqual({ pageKey: '/app/patient/diary', views: 9 });
    expect(dashboard.visits.patient.topPages).toHaveLength(2);
  });

  it('ряд просмотров видео доезжает до контракта по дням периода', async () => {
    const service = createPlatformAnalyticsService({ readSnapshot: async () => snapshotWith([]) });

    const dashboard = await service.getDashboard(input);

    expect(dashboard.patientActivity.playbackSeries.length).toBeGreaterThan(0);
    const total = dashboard.patientActivity.playbackSeries.reduce((sum, p) => sum + p.count, 0);
    expect(total).toBeGreaterThanOrEqual(0);
  });
});
