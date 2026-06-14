-- Пол пациента (карточка: пол) + дата начала сопровождения (точный счётчик месяцев вместо приблизительного).
ALTER TABLE "platform_users" ADD COLUMN "gender" text;
ALTER TABLE "doctor_patient_support" ADD COLUMN "support_started_at" timestamptz;
