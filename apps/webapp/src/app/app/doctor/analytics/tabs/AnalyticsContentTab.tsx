"use client";

import Link from "next/link";

import { MaterialContentStatsClient } from "@/app/app/doctor/material-ratings/MaterialContentStatsClient";

/**
 * Вкладка «Контент» агрегированной аналитики.
 *
 * Показывает платформенные метрики материалов (`MaterialContentStatsClient`,
 * самозагрузка через API). Подробная постраничная таблица оценок по каждому
 * материалу остаётся на отдельном маршруте `/app/doctor/material-ratings`
 * (ссылка ниже), чтобы не тянуть серверный рендер таблицы в клиентский шелл.
 */
export function AnalyticsContentTab() {
  return (
    <div className="flex flex-col gap-6">
      <MaterialContentStatsClient />
      <p className="text-sm">
        <Link
          className="text-primary underline-offset-2 hover:underline"
          href="/app/doctor/material-ratings"
        >
          Подробная таблица оценок материалов →
        </Link>
      </p>
    </div>
  );
}
