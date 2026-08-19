import { describe, expect, it } from 'vitest';
import { videoDurationBucket } from '@/modules/platform-analytics/durationBuckets';
import { classifyMediaUrlKind, isHostingIframeKind } from '@/modules/platform-analytics/hostingUrlKind';
import {
  isDoctorCabinetPageKey,
  isPatientCabinetPageKey,
  isTreatmentProgramPageKey,
  pageAudienceFromPageKey,
} from '@/modules/platform-analytics/pageAudience';

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
