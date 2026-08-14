import { NextResponse } from 'next/server';
import {
  parseReminderStatsWindowHours,
  type ContentEngagementStatsResponse,
} from '@/app-layer/stats/loadAdminReminderStats';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

function deferredDoctorContentStats(
  windowHours: number,
  displayTimezone: string,
): ContentEngagementStatsResponse {
  const emptyPlaybackEvents = {
    hls_fatal: 0,
    video_error: 0,
    hls_import_failed: 0,
    playback_refetch_failed: 0,
    playback_refetch_exception: 0,
    hls_js_unsupported: 0,
  };
  return {
    windowHours,
    displayTimezone,
    peopleWithNotifications: { currentPeopleCount: 0, daily: [], channelSegmentsToday: [] },
    reminderSendsLast24hClock: [],
    occurrenceHistoryHourly: [],
    occurrenceHistoryDaily: [],
    pushOpensSummary: { opened: 0, sent: 0, openRate: 0 },
    pushOpensHourly: [],
    pushOpensDaily: [],
    practiceBySource: {},
    practiceTopPages: [],
    warmupVideoTopPages: [],
    warmupVideoEstimatedWatchMinutes: 0,
    videoPlaybackEstimatedWatchMinutes: 0,
    promoExerciseVideoTopItems: [],
    promoExerciseVideoCount: 0,
    assignedExerciseVideoTopItems: [],
    assignedExerciseVideoCount: 0,
    videoPlayback: {
      byDelivery: { hls: 0, mp4: 0, file: 0 },
      fallbackTotal: 0,
      totalResolutions: 0,
      uniquePlaybackPairsFirstSeenInWindow: 0,
    },
    videoPlaybackClient: {
      windowHours,
      totalErrors: 0,
      totalErrorsLast1h: 0,
      byEvent: emptyPlaybackEvents,
      byEventLast1h: { ...emptyPlaybackEvents },
      byDelivery: { hls: 0, mp4: 0, file: 0 },
      recent: [],
      likelyLooping: false,
    },
    reminderRulesEnabledCount: 0,
  };
}

export async function GET(req: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const windowHours = parseReminderStatsWindowHours(url.searchParams.get('windowHours'));
  // Doctor-level engagement attribution is intentionally deferred. Returning a closed empty
  // projection avoids both the former cross-clinic aggregate and direct staff reads of protected
  // playback telemetry until the specialist-scoped named aggregate is designed.
  return NextResponse.json(
    deferredDoctorContentStats(windowHours, await getAppDisplayTimeZone()),
  );
}
