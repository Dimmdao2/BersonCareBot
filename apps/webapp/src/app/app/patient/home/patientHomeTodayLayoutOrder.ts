import type { PatientHomeTodayLayoutBlock } from "./PatientHomeTodayLayout";

/**
 * Блок «Сегодня выполнено» сразу под самочувствием, затем объединённый SOS + запись.
 * Без `progress` в массиве ведёт себя как вставка split только после mood.
 */
export function insertProgressThenSosBookingSplitAfterMood(
  blocks: PatientHomeTodayLayoutBlock[],
  split: PatientHomeTodayLayoutBlock | null,
): PatientHomeTodayLayoutBlock[] {
  let next = [...blocks];

  const progressIdx = next.findIndex((b) => b.code === "progress");
  const progressBlock = progressIdx !== -1 ? next.splice(progressIdx, 1)[0] : null;

  const moodIdx = next.findIndex((b) => b.code === "mood_checkin");
  if (progressBlock && moodIdx !== -1) {
    next.splice(moodIdx + 1, 0, progressBlock);
  } else if (progressBlock) {
    next.push(progressBlock);
  }

  if (!split) return next;

  const moodIdx2 = next.findIndex((b) => b.code === "mood_checkin");
  const insertSplit =
    moodIdx2 === -1 ? next.length
    : next[moodIdx2 + 1]?.code === "progress" ? moodIdx2 + 2
    : moodIdx2 + 1;

  next.splice(insertSplit, 0, split);
  return next;
}

/** Mobile DOM order: «Мой план» сразу под приветствием (wide viewport — по `md:order-*` в разметке). */
export function prependPlanBlock(blocks: PatientHomeTodayLayoutBlock[]): PatientHomeTodayLayoutBlock[] {
  const idx = blocks.findIndex((b) => b.code === "plan");
  if (idx <= 0) return blocks;
  const next = [...blocks];
  const [plan] = next.splice(idx, 1);
  return [plan, ...next];
}

/** «Разминка» и «полезный пост» сразу после «Мой план» (для `sm` сетки и мобильного DOM); если плана нет — в начало. */
export function moveDailyWarmupAndUsefulPostImmediatelyAfterPlan(
  blocks: PatientHomeTodayLayoutBlock[],
): PatientHomeTodayLayoutBlock[] {
  const warmup = blocks.find((b) => b.code === "daily_warmup");
  const useful = blocks.find((b) => b.code === "useful_post");
  if (!warmup && !useful) return [...blocks];

  const rest = blocks.filter((b) => b.code !== "daily_warmup" && b.code !== "useful_post");
  const planIdx = rest.findIndex((b) => b.code === "plan");
  const insertAt = planIdx >= 0 ? planIdx + 1 : 0;
  const pair: PatientHomeTodayLayoutBlock[] = [];
  if (warmup) pair.push(warmup);
  if (useful) pair.push(useful);
  const next = [...rest];
  next.splice(insertAt, 0, ...pair);
  return next;
}

/**
 * Mobile DOM order: «Как ваше сегодня?» между постом дня и записью.
 * Desktop порядок карточек задаётся `PatientHomeTodayLayout` (`md:order`), не DOM.
 */
export function insertMoodBetweenUsefulPostAndBooking(
  blocks: PatientHomeTodayLayoutBlock[],
): PatientHomeTodayLayoutBlock[] {
  const moodIdx = blocks.findIndex((b) => b.code === "mood_checkin");
  if (moodIdx === -1) return blocks;

  const next = [...blocks];
  const [mood] = next.splice(moodIdx, 1);

  const usefulIdx = next.findIndex((b) => b.code === "useful_post");
  const bookingIdx = next.findIndex((b) => b.code === "booking");

  const insertAt =
    usefulIdx !== -1 ? usefulIdx + 1
    : bookingIdx !== -1 ? bookingIdx
    : next.length;

  next.splice(insertAt, 0, mood);
  return next;
}

export function reorderPatientHomeLayoutBlocks(blocks: PatientHomeTodayLayoutBlock[]): PatientHomeTodayLayoutBlock[] {
  return insertMoodBetweenUsefulPostAndBooking(
    moveDailyWarmupAndUsefulPostImmediatelyAfterPlan(prependPlanBlock(blocks)),
  );
}

/**
 * Блок «Следующее напоминание» сразу под «Сегодня выполнено» (DOM для mobile; на lg см. `desktopBlockLayout`).
 * Без `progress` в массиве порядок не меняется.
 */
export function moveNextReminderAfterProgress(blocks: PatientHomeTodayLayoutBlock[]): PatientHomeTodayLayoutBlock[] {
  const reminderIdx = blocks.findIndex((b) => b.code === "next_reminder");
  if (reminderIdx === -1) return blocks;
  const progressIdx = blocks.findIndex((b) => b.code === "progress");
  if (progressIdx === -1) return blocks;

  const next = [...blocks];
  const [reminder] = next.splice(reminderIdx, 1);
  const progressIdxAfter = next.findIndex((b) => b.code === "progress");
  if (progressIdxAfter === -1) {
    next.splice(Math.min(reminderIdx, next.length), 0, reminder);
    return next;
  }
  next.splice(progressIdxAfter + 1, 0, reminder);
  return next;
}
