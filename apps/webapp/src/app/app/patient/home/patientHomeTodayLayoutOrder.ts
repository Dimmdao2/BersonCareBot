import type { PatientHomeTodayLayoutBlock } from "./PatientHomeTodayLayout";

/** Объединённый SOS + запись — сразу после блока самочувствия (mobile DOM order). */
export function insertSosBookingSplitAfterMood(
  blocks: PatientHomeTodayLayoutBlock[],
  split: PatientHomeTodayLayoutBlock | null,
): PatientHomeTodayLayoutBlock[] {
  if (!split) return blocks;
  const moodIdx = blocks.findIndex((b) => b.code === "mood_checkin");
  const insertAt = moodIdx !== -1 ? moodIdx + 1 : blocks.length;
  const next = [...blocks];
  next.splice(insertAt, 0, split);
  return next;
}

/** Mobile DOM order: «Мой план» сразу под приветствием (desktop — по `lg:order-*` в разметке). */
export function prependPlanBlock(blocks: PatientHomeTodayLayoutBlock[]): PatientHomeTodayLayoutBlock[] {
  const idx = blocks.findIndex((b) => b.code === "plan");
  if (idx <= 0) return blocks;
  const next = [...blocks];
  const [plan] = next.splice(idx, 1);
  return [plan, ...next];
}

/**
 * Mobile DOM order: «Как ваше сегодня?» между постом дня и записью.
 * Desktop порядок карточек задаётся `PatientHomeTodayLayout` (`lg:order`), не DOM.
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
  return insertMoodBetweenUsefulPostAndBooking(prependPlanBlock(blocks));
}
