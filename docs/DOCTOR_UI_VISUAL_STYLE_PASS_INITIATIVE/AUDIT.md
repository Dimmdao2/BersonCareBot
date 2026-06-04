# AUDIT — baseline отклонений (2026-06-04)

Снимок `rg` по doctor-зоне на старте style pass. Micro-роль (`text-[10px]`/`text-[11px]` для бейджей/календаря/осей графиков/mono) — **допустима** (§B.1), в таблицу нарушений не входит.

## Chrome-размеры текста (нарушения §B.1) → цель

| Файл | Текущее | Цель | Фаза |
|---|---|---|---|
| `analytics/clients/DoctorStatCard.tsx` | `text-3xl` (KPI) | `doctorMetricValueClass` (`text-2xl`) | 2 |
| `audit-log/page.tsx` | `text-xl` h1 + (header) | `doctorPageTitleClass` | 2 |
| `booking-merge/page.tsx` | `mb-6 text-xl` h1 | `doctorPageTitleClass`, без `mb-6` | 2 |
| `treatment-program-promo/page.tsx` | `mb-2 text-xl` h1 | `doctorPageTitleClass` | 2 |
| `patient-home/page.tsx` | `text-xl` h1 | `doctorPageTitleClass` | 2 |
| `health-archive/page.tsx` | `mb-6 text-xl` h1 | `doctorPageTitleClass` | 2 |
| `analytics/notifications/page.tsx` | `mb-6 text-xl` h1 | `doctorPageTitleClass` | 2 |
| `admin/app-settings/page.tsx` | `mb-6 text-xl` h1 | `doctorPageTitleClass` | 2 |
| `admin/integrations/page.tsx` | `mb-6 text-xl` h1 | `doctorPageTitleClass` | 2 |
| `admin/auth/page.tsx` | `mb-6 text-xl` h1 | `doctorPageTitleClass` | 2 |
| `admin/technical/page.tsx` | `mb-6 text-xl` h1 | `doctorPageTitleClass` | 2 |
| `admin/booking/layout.tsx` | `text-xl` h1 | `doctorPageTitleClass` | 2 |
| `system-health/page.tsx` | `mb-6 text-xl` h1 | `doctorPageTitleClass` | 2 |
| `material-ratings/MaterialContentStatsClient.tsx` | `text-xl font-bold` (метрика) | `doctorMetricValueClass` | 2 |
| `analytics/shared/ReminderSendsHourlyClockChart.tsx` | `text-lg` (метрика) | `text-base`/Metric | 2 |
| `analytics/shared/PushOpensAnalyticsCard.tsx` | `text-lg` (метрика) | `text-base` | 2 |
| `patient-home/PatientHomeMoodIconsPanel.tsx` | `text-lg` (число) | `text-base` | 2 |
| `content/ContentPreview.tsx` | `text-lg` (h4) | `text-base` (нормализовано) | 2 ✅ |
| `shared/ui/doctor/SegmentRouteError.tsx` | `text-lg` h2 | `text-base` | 2 |
| `shared/ui/doctor/shell/DoctorHeader.tsx` | `text-[13px]` (заголовок) | `text-sm` | 2 |

## Плотность / отступы (нарушения §B.3)

| Файл | Текущее | Цель | Фаза |
|---|---|---|---|
| admin/ops `page.tsx` (см. выше) | `mb-6`, `space-y-6` | `doctorPageStackClass` / `gap-3` | 2 |

## Хардкод-цвета навигации (§A.2)

| Файл | Текущее | Цель | Фаза |
|---|---|---|---|
| `shared/ui/doctor/shell/DoctorMenuAccordion.tsx` | `bg-[#7ea1d1]` active, `bg-white`/`hover:bg-zinc-100/90` | `bg-primary/10..15`, `text-primary`, `hover:bg-muted` | 3 |

## Радиусы (§A.3)

| Файл | Текущее | Цель | Фаза |
|---|---|---|---|
| (по `rg "rounded-2xl"`) | — | привести к 4 уровням | 3 |

## Контролы (§B.2)

| Файл | Текущее | Цель | Фаза |
|---|---|---|---|
| `shared/ui/doctor/primitives/input.tsx` | `rounded-lg`, `h-[32px]` | `rounded-md`, 32px (без изм. высоты) | 1 |
