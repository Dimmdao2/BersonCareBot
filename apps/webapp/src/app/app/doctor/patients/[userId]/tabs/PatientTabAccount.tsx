"use client";

/**
 * PatientTabAccount — Wave 3 full UI.
 *
 * Blocks (per wireframe #pp-account + backlog §6):
 *   LEFT column: Личные данные · Контакты и каналы · Сопровождение и статус · Платежи и расчёты
 *  RIGHT column: Репутация записи · Блокировки и доступ · Администрирование
 *
 * Owner rules:
 *  #2 — Платежи: real-looking UI (summary KPIs + payment list + «+ Внести наличные»);
 *       acquiring/ЮKassa/ЮMoney integration pending → clearly marked TODO(backend).
 *  #3 — Hidden name: displayName bold + smaller firstName+lastName below (same pattern as header).
 *
 * Mock data used where no endpoint exists → marked // TODO(backend).
 */

import { useState } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorMetricLabelClass,
  doctorMetricValueClass,
  doctorStatCardShellClass,
  doctorStatCardShellWarningClass,
  doctorHistoryRowClass,
  doctorSectionItemClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

// TODO(backend): payment model — real data would come from a payments port
type MockPayment = {
  id: string;
  label: string;
  amount: number;
  date: string;
  kind: "membership" | "session" | "cash";
};

// ---------------------------------------------------------------------------
// Mock data (realistic Russian content)
// TODO(backend): replace with real payments port once model is built
// ---------------------------------------------------------------------------

const MOCK_PAYMENTS: MockPayment[] = [
  { id: "p1", label: "Абонемент · 10 приёмов", amount: 36000, kind: "membership", date: "14.05.2026" },
  { id: "p2", label: "Отдельный приём · 60 мин", amount: 4000, kind: "session", date: "22.01.2026" },
  { id: "p3", label: "Абонемент · 10 приёмов", amount: 36000, kind: "membership", date: "12.02.2025" },
];

const MOCK_TOTAL = MOCK_PAYMENTS.reduce((s, p) => s + p.amount, 0); // 76 000
const MOCK_MEMBERSHIPS_TOTAL = MOCK_PAYMENTS.filter((p) => p.kind === "membership").reduce((s, p) => s + p.amount, 0);
const MOCK_SESSIONS_TOTAL = MOCK_PAYMENTS.filter((p) => p.kind === "session" || p.kind === "cash").reduce(
  (s, p) => s + p.amount,
  0,
);

// TODO(backend): audit log entries
const MOCK_AUDIT = [
  { id: "a1", text: "Объединён с «Антонов Е.» (дубль из MAX)", date: "02.06" },
  { id: "a2", text: "Статус → «На сопровождении»", date: "12.02" },
  { id: "a3", text: "Создан из Telegram-бота", date: "18.09.25" },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtRub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* silent */
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Section card wrapper with title row */
function SectionCard({
  title,
  titleRight,
  children,
  className,
}: {
  title: string;
  titleRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(doctorSectionCardClass, className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={doctorSectionTitleClass}>{title}</span>
        {titleRight && <span className="ml-auto">{titleRight}</span>}
      </div>
      {children}
    </div>
  );
}

/** Compact key–value table row */
function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="py-0.5 pr-3 text-xs text-muted-foreground w-[42%] align-top">{label}</td>
      <td className="py-0.5 text-xs text-foreground align-top">{children}</td>
    </tr>
  );
}

/** Channel binding row */
function ChannelRow({
  icon,
  label,
  value,
  hint,
  status,
  actionIcon,
  onAction,
  warning,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  status: "active" | "problem" | "none";
  actionIcon?: string;
  onAction?: () => void;
  warning?: boolean;
}) {
  const chipStyles =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
      : status === "problem"
        ? "bg-destructive/10 text-destructive border border-destructive/20"
        : "bg-muted text-muted-foreground border border-border";
  const chipText = status === "active" ? "подключён" : status === "problem" ? "не подтв." : "нет";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
        warning
          ? "border-orange-200 bg-orange-50/60"
          : "border-border bg-background",
      )}
    >
      <span className="w-5 flex-none text-center text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono leading-tight text-foreground truncate">{value}</div>
        <div className={cn(doctorSectionSubtitleClass, "text-[11px]")}>{hint ?? label}</div>
      </div>
      <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", chipStyles)}>
        {chipText}
      </span>
      {actionIcon && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted/30 text-[11px] text-muted-foreground hover:bg-muted cursor-pointer"
        >
          {actionIcon}
        </button>
      )}
    </div>
  );
}

/** Mini KPI stat card */
function StatCard({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className={cn(alert ? doctorStatCardShellWarningClass : doctorStatCardShellClass)}>
      <div className={cn(doctorMetricLabelClass, "mb-0.5")}>{label}</div>
      <div className={cn(doctorMetricValueClass, "text-base")}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientTabAccount({ userId, header }: Props) {
  const [showCashModal, setShowCashModal] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const identity = header?.identity;
  const support = header?.support;
  const cancellationsCount = header?.cancellationsCount ?? 0;
  const reschedulesCount = header?.reschedulesCount ?? 0;
  const totalVisits = header?.totalVisits ?? 0;

  // Derived channel info from header
  const hasTelegram = Boolean(identity?.bindings?.telegramId);
  const hasMax = Boolean(identity?.bindings?.maxId);
  const hasEmail = Boolean(identity?.email);
  const telegramId = identity?.bindings?.telegramId ?? null;
  const maxId = identity?.bindings?.maxId ?? null;
  // TODO(backend): channelBindingDates not in PatientCardHeader — would need ClientIdentity
  // TODO(backend): PWA/push status not in PatientCardHeader

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
      {/* ====================================================================
          LEFT COLUMN
      ==================================================================== */}
      <div className="flex flex-col gap-3">

        {/* ── 1. Личные данные ─────────────────────────────────────── */}
        <SectionCard
          title="Личные данные"
          titleRight={
            <button
              type="button"
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              ✎ изменить
            </button>
          }
        >
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              {/* displayName — owner #3: bold primary name */}
              <KVRow label="Отображаемое имя">
                <span className="font-semibold">{identity?.displayName ?? "—"}</span>
              </KVRow>
              {/* Hidden real name — owner #3: smaller under displayName */}
              {(identity?.firstName || identity?.lastName) ? (
                <KVRow label="ФИО (скрытое)">
                  <span className="text-muted-foreground text-[11px]">
                    {[identity?.lastName, identity?.firstName].filter(Boolean).join(" ")}
                  </span>
                </KVRow>
              ) : (
                <KVRow label="ФИО (скрытое)">
                  <span className="text-muted-foreground text-[11px]">не указано</span>
                </KVRow>
              )}
              {/* Phone */}
              <KVRow label="Телефон">
                {identity?.phone ? (
                  <button
                    type="button"
                    title="Скопировать"
                    onClick={() => copyText(identity.phone!)}
                    className="font-mono text-[11px] hover:text-primary cursor-pointer"
                  >
                    {identity.phone} ⧉
                  </button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </KVRow>
              {/* Email */}
              <KVRow label="Email">
                {identity?.email ? (
                  <span className="font-mono text-[11px]">{identity.email}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </KVRow>
              {/* Birth date — TODO(backend) */}
              <KVRow label="Дата рождения">
                {/* TODO(backend): birthDate not yet in PatientCardHeader; no schema field */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
              {/* Gender — TODO(backend) */}
              <KVRow label="Пол">
                {/* TODO(backend): gender field not in schema */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
            </tbody>
          </table>
          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            ФИО видит только специалист, пациенту показывается отображаемое имя.
          </p>
        </SectionCard>

        {/* ── 2. Контакты и каналы ─────────────────────────────────── */}
        <SectionCard
          title="Контакты и каналы"
          titleRight={
            <button type="button" className="text-xs text-primary hover:underline cursor-pointer">
              + добавить
            </button>
          }
        >
          <div className="flex flex-col gap-1.5">
            {/* Phone */}
            <ChannelRow
              icon="📞"
              label="Телефон"
              value={identity?.phone ?? "—"}
              hint="основной телефон"
              status={identity?.phone ? "active" : "none"}
              actionIcon="⧉"
              onAction={() => copyText(identity?.phone ?? "")}
            />

            {/* Telegram */}
            <ChannelRow
              icon="✈️"
              label="Telegram"
              value={
                hasTelegram
                  ? `id ${telegramId}`
                  : "не привязан"
              }
              hint="Telegram"
              status={hasTelegram ? "active" : "none"}
              actionIcon={hasTelegram ? "💬" : "＋"}
            />

            {/* MAX */}
            <ChannelRow
              icon="Ⓜ️"
              label="MAX"
              value={hasMax ? `id ${maxId}` : "не привязан"}
              hint="MAX"
              status={hasMax ? "active" : "none"}
              actionIcon={hasMax ? "💬" : "＋"}
            />

            {/* Email */}
            {hasEmail ? (
              <ChannelRow
                icon="✉️"
                label="Email"
                value={identity?.email ?? "—"}
                hint={
                  // TODO(backend): emailVerifiedAt not in PatientCardHeader; assume unverified display
                  "Email · статус неизвестен"
                }
                status="problem"
                warning
                actionIcon="✉️"
                onAction={() => window.open(`mailto:${identity?.email}`, "_blank")}
              />
            ) : (
              <ChannelRow
                icon="✉️"
                label="Email"
                value="не указан"
                hint="Email"
                status="none"
                actionIcon="＋"
              />
            )}

            {/* PWA / App — TODO(backend) */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-2.5 py-1.5">
              <span className="w-5 flex-none text-center text-sm">📲</span>
              <div className="flex-1 min-w-0">
                {/* TODO(backend): PWA install / push status not tracked in current schema */}
                <div className="text-xs text-muted-foreground leading-tight">данные недоступны</div>
                <div className={cn(doctorSectionSubtitleClass, "text-[11px]")}>приложение пациента</div>
              </div>
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                нет данных
              </span>
            </div>
          </div>
          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            <span className="text-emerald-600 font-medium">подключён</span> → иконка активна и кликабельна ·{" "}
            <span className="text-destructive font-medium">проблема</span> — подсвечена.
          </p>
        </SectionCard>

        {/* ── 3. Сопровождение и статус ────────────────────────────── */}
        <SectionCard
          title="Сопровождение и статус"
          titleRight={
            support?.isOnSupport ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                ★ На сопровождении
              </span>
            ) : undefined
          }
        >
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              <KVRow label="Lifecycle">
                {/* TODO(backend): lifecycle derived from segments; only isOnSupport available now */}
                {support?.isOnSupport ? (
                  <span>
                    <b>На сопровождении</b>
                    {support.supportMonthsApprox != null && (
                      <> · {support.supportMonthsApprox} мес</>
                    )}{" "}
                    <span className="text-muted-foreground text-[10px]">
                      (подписчик → новый → <b>на сопровождении</b> → бывший)
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {/* TODO(backend): derive from segment flags */}
                    не на сопровождении
                  </span>
                )}
              </KVRow>
              <KVRow label="Сопровождение с">
                {/* TODO(backend): support start date not in PatientCardHeader */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
              <KVRow label="Программа">
                {/* TODO(backend): activeTreatmentProgram name/stage not in PatientCardHeader */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
              <KVRow label="Абонемент">
                {/* TODO(backend): membership details not in PatientCardHeader */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
              <KVRow label="Источник">
                {/* TODO(backend): registration source not in schema */}
                <span className="text-muted-foreground">
                  {identity?.bindings?.telegramId
                    ? "Telegram-бот"
                    : identity?.bindings?.maxId
                      ? "MAX-бот"
                      : "—"}
                </span>
              </KVRow>
            </tbody>
          </table>
          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            lifecycle — расчётный статус из сегментов «Пациентов». Смена сопровождения и абонемента — отсюда.
          </p>
        </SectionCard>

        {/* ── 4. Платежи и расчёты ─────────────────────────────────── */}
        {/* Owner #2: real-looking payments block. Backend model pending. */}
        <SectionCard
          title="Платежи и расчёты"
          titleRight={
            <button type="button" className="text-xs text-muted-foreground hover:text-primary cursor-pointer">
              вся история →
            </button>
          }
        >
          {/* KPI summary */}
          {/* TODO(backend): replace MOCK totals with real payment aggregates from payments port */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Всего принесено" value={fmtRub(MOCK_TOTAL)} />
            <StatCard label="Абонементы" value={fmtRub(MOCK_MEMBERSHIPS_TOTAL)} />
            <StatCard label="Отдельные приёмы" value={fmtRub(MOCK_SESSIONS_TOTAL)} />
          </div>

          {/* Recent payments list */}
          {/* TODO(backend): replace MOCK_PAYMENTS with real list from payments port */}
          <div className="flex flex-col gap-1">
            {MOCK_PAYMENTS.map((p) => (
              <div
                key={p.id}
                className={cn(
                  doctorHistoryRowClass,
                  "flex items-center gap-2 text-xs",
                )}
              >
                <span className="flex-none">
                  {p.kind === "membership" ? "💳" : p.kind === "cash" ? "💵" : "💳"}
                </span>
                <span className="flex-1 truncate">{p.label}</span>
                <span className="font-semibold tabular-nums whitespace-nowrap">{fmtRub(p.amount)}</span>
                <span className={cn(doctorSectionSubtitleClass, "whitespace-nowrap pl-2")}>{p.date}</span>
              </div>
            ))}
          </div>

          {/* Manual cash entry CTA */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCashModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer transition-colors"
            >
              💵 Внести наличные
            </button>
            {/* TODO(backend): acquiring integration (ЮKassa / ЮMoney) pending */}
            <span className="text-[11px] text-muted-foreground">
              Эквайринг (ЮKassa/ЮMoney) — интеграция планируется
            </span>
          </div>

          {/* Manual cash mini-modal (inline) */}
          {showCashModal && (
            <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-2 shadow-sm">
              <p className={cn(doctorSectionTitleClass, "text-xs")}>Внести наличные</p>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                  <label className="text-[11px] text-muted-foreground">Сумма, ₽</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="4 000"
                    className="h-7 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                  <label className="text-[11px] text-muted-foreground">Назначение</label>
                  <input
                    type="text"
                    placeholder="Отдельный приём · 60 мин"
                    className="h-7 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCashModal(false)}
                  className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // TODO(backend): POST /api/doctor/patients/:userId/payments { kind:'cash', amount, label }
                    setShowCashModal(false);
                  }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
              <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
                {/* TODO(backend): payments model + manual cash endpoint */}
                Сохранение пока недоступно — модель платежей в разработке.
              </p>
            </div>
          )}

          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            Учёт оплат: абонементы + отдельные приёмы. Эквайринг (интеграция банка / ЮKassa) — следующий этап.
          </p>
        </SectionCard>
      </div>

      {/* ====================================================================
          RIGHT COLUMN
      ==================================================================== */}
      <div className="flex flex-col gap-3">

        {/* ── 5. Репутация записи ──────────────────────────────────── */}
        <SectionCard
          title="Репутация записи"
          titleRight={
            <span className={cn(doctorSectionSubtitleClass, "text-[11px]")}>переехало из «Записей»</span>
          }
        >
          {/* KPI grid */}
          <div className="grid grid-cols-4 gap-1.5">
            <StatCard label="Визитов" value={totalVisits} />
            <StatCard label="Отмен" value={cancellationsCount} alert={cancellationsCount >= 2} />
            {/* TODO(backend): noShow count not in PatientCardHeader */}
            <StatCard label="Неявок" value="—" />
            <StatCard label="Переносов" value={reschedulesCount} alert={reschedulesCount >= 3} />
          </div>

          {/* Reputation flag */}
          {reschedulesCount >= 3 && (
            <div className={cn(doctorSectionItemClass, "flex items-center gap-2 text-xs")}>
              <span className="text-destructive flex-none">⚑</span>
              <span className="flex-1">
                Отметка «склонен к переносам» — {reschedulesCount} переноса за 3 мес
              </span>
              <button
                type="button"
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                ✎ снять
              </button>
            </div>
          )}
          {cancellationsCount >= 2 && (
            <div className={cn(doctorSectionItemClass, "flex items-center gap-2 text-xs border-destructive/30 bg-destructive/5")}>
              <span className="text-destructive flex-none">⚑</span>
              <span className="flex-1">
                Отметка «склонен к отменам» — {cancellationsCount} отмены
              </span>
              <button
                type="button"
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                ✎ снять
              </button>
            </div>
          )}

          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            Неявки/отмены/переносы — по факту из записей. Метки репутации ставятся вручную или по порогу.
          </p>
        </SectionCard>

        {/* ── 6. Блокировки и доступ ───────────────────────────────── */}
        <SectionCard title="Блокировки и доступ">
          <div className="flex flex-col gap-1.5">
            {/* Telegram bot status */}
            <div className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}>
              <span className="flex-none">✈️</span>
              <span className="flex-1">Telegram-бот</span>
              {hasTelegram ? (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                  активен
                </span>
              ) : (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  не привязан
                </span>
              )}
            </div>

            {/* MAX bot — TODO(backend): blocked-by-user flag not in header */}
            <div className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}>
              <span className="flex-none">Ⓜ️</span>
              <span className="flex-1">
                {hasMax ? "MAX-бот" : "MAX-бот не привязан"}
                {/* TODO(backend): hasMax=true but blocked-by-user flag not tracked */}
              </span>
              {hasMax ? (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                  активен
                </span>
              ) : (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  нет
                </span>
              )}
            </div>

            {/* Exercise comments — TODO(backend): commentsEnabled from ClientSupportProfile */}
            <div className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}>
              <span className="flex-none">💬</span>
              <span className="flex-1">Комментарии к упражнениям</span>
              {/* TODO(backend): commentsEnabled — from getClientSupport; not in PatientCardHeader */}
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                разрешены
              </span>
            </div>

            {/* Content access */}
            <div className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}>
              <span className="flex-none">🛡️</span>
              <span className="flex-1">Контент «только для залогиненных»</span>
              <span className={cn(doctorSectionSubtitleClass, "text-[10px]")}>доступ открыт</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {/* TODO(backend): POST /api/doctor/patients/:userId/block */}
            <button
              type="button"
              className={cn(
                "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors",
                identity?.isBlocked
                  ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "border-border bg-muted/30 text-foreground hover:bg-muted",
              )}
            >
              {identity?.isBlocked ? "⛔ Снять блокировку" : "Ограничить доступ"}
            </button>

            {/* TODO(backend): POST /api/doctor/patients/:userId/archive */}
            {!archiveConfirm ? (
              <button
                type="button"
                onClick={() => setArchiveConfirm(true)}
                className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors",
                  identity?.isArchived
                    ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-border bg-muted/30 text-foreground hover:bg-muted",
                )}
              >
                {identity?.isArchived ? "Вернуть из архива" : "В архив"}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                Подтвердить?{" "}
                <button
                  type="button"
                  onClick={() => {
                    // TODO(backend): call setUserArchived(userId, true)
                    setArchiveConfirm(false);
                  }}
                  className="underline cursor-pointer"
                >
                  Да
                </button>{" "}
                <button
                  type="button"
                  onClick={() => setArchiveConfirm(false)}
                  className="text-muted-foreground underline cursor-pointer"
                >
                  Нет
                </button>
              </span>
            )}
          </div>

          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            Блокировки бота — со стороны пациента (только индикатор). Архив и ограничение — действия специалиста.
          </p>
        </SectionCard>

        {/* ── 7. Администрирование ─────────────────────────────────── */}
        <SectionCard title="Администрирование">
          {/* Technical IDs */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Технические идентификаторы
          </p>
          <table className="w-full border-separate border-spacing-0 mb-1">
            <tbody>
              <KVRow label="ID пациента">
                <span className="font-mono text-[11px]">
                  {userId.slice(0, 12)}…{userId.slice(-4)}{" "}
                  <button
                    type="button"
                    title="Скопировать"
                    onClick={() => copyText(userId)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-muted/30 text-[10px] hover:bg-muted cursor-pointer ml-0.5 align-middle"
                  >
                    ⧉
                  </button>
                </span>
              </KVRow>
              <KVRow label="Rubitime ID">
                {/* TODO(backend): rubitime_id not in PatientCardHeader; would come from ClientIdentity / rubitime sync */}
                <span className="font-mono text-[11px] text-muted-foreground">—</span>
              </KVRow>
              {telegramId && (
                <KVRow label="Telegram ID">
                  <span className="font-mono text-[11px]">{telegramId}</span>
                </KVRow>
              )}
              <KVRow label="Регистрация">
                {/* TODO(backend): identity.createdAt not in PatientCardHeader; available in ClientIdentity */}
                <span className="text-muted-foreground">—</span>
              </KVRow>
            </tbody>
          </table>

          {/* Merge */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Объединение (merge)
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-2.5 py-2 mb-1">
            <span className="flex-none">🔗</span>
            <span className="flex-1 text-[11px] text-muted-foreground">
              Найти и объединить дубль этого пациента (записи, чаты, файлы перейдут сюда)
            </span>
            {/* TODO(backend): link to existing merge-patients flow */}
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted cursor-pointer whitespace-nowrap"
            >
              Объединить
            </button>
          </div>

          {/* Audit log */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            История изменений (audit)
          </p>
          {/* TODO(backend): real audit log from entity_comments or audit_log table */}
          <div className="flex flex-col gap-1">
            {MOCK_AUDIT.map((entry) => (
              <div
                key={entry.id}
                className={cn(doctorHistoryRowClass, "flex items-center gap-2 text-xs")}
              >
                <span className="flex-none text-muted-foreground">•</span>
                <span className="flex-1 text-muted-foreground">{entry.text}</span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">{entry.date}</span>
              </div>
            ))}
          </div>

          <p className={cn(doctorSectionSubtitleClass, "text-[11px]")}>
            Merge и audit — текущая логика «Мердж пациентов» и журнала, перенесённая в карточку.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
