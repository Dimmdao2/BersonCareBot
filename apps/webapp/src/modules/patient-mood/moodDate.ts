import { DateTime } from "luxon";

export function getMoodDateForTimeZone(tz: string, now: DateTime = DateTime.now()): string {
  const moodDate = now.setZone(tz).toISODate();
  if (!moodDate) throw new Error("Unable to compute patient mood date");
  return moodDate;
}
