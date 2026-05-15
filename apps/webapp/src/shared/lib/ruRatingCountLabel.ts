/** Склонение «N оценка / оценки / оценок» (рус.). */
export function ruRatingCountLabel(count: number): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "оценок";
  if (mod10 === 1) return "оценка";
  if (mod10 >= 2 && mod10 <= 4) return "оценки";
  return "оценок";
}
