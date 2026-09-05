'use client';

export const DOCTOR_TASKS_CHANGED_EVENT = 'bersoncare:doctor-tasks-changed';
export const DOCTOR_EXERCISE_COMMENTS_CHANGED_EVENT =
  'bersoncare:doctor-exercise-comments-changed';

export function notifyDoctorTasksChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DOCTOR_TASKS_CHANGED_EVENT));
}

export function notifyDoctorExerciseCommentsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DOCTOR_EXERCISE_COMMENTS_CHANGED_EVENT));
}
