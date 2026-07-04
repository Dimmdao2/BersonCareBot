"use client";

/**
 * PatientPreviewPane — compact preview panel shown in the right column
 * when a patient row is clicked. Renders instantly from ClientListItem data
 * (no flash), then enriches with PatientCardHeader fetched from the API.
 *
 * Active channels shown in PRIMARY (blue); inactive in muted/grey.
 * «Открыть карточку» button is the ONLY navigation to the full patient card.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Mail, Send, Smartphone, Loader2, User, Heart, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import type { ClientListItem, PatientCardHeader } from "@/modules/doctor-clients/ports";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PatientPreviewPaneProps = {
  /** Currently selected patient list item (for instant render). Null = no selection. */
  patient: ClientListItem | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO date string to a human-readable DD.MM.YYYY */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

/** Copy text to clipboard silently. */
function copyToClipboard(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

type ChannelChipProps = {
  active: boolean;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
};

function ChannelChip({ active, label, onClick, children }: ChannelChipProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
          : "cursor-default border-border/40 bg-muted/30 text-muted-foreground/60",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Loaded detail section (shown after API response)
// ---------------------------------------------------------------------------

type DetailRowProps = {
  label: string;
  children: React.ReactNode;
};

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 text-sm text-foreground">{children}</span>
    </div>
  );
}

type PatientDetailProps = {
  header: PatientCardHeader;
  userId: string;
  /** App presence from the list item (PatientCardHeader has no app field). */
  hasApp: boolean;
};

function PatientDetail({ header, userId, hasApp }: PatientDetailProps) {
  const { identity, support, lastVisit, nextAppointment, totalVisits, cancellationsCount } = header;

  // Full name
  const fullName =
    [identity.lastName, identity.firstName].filter(Boolean).join(" ") || identity.displayName;
  const isDisplayNameDifferent =
    identity.displayName &&
    identity.displayName !== fullName &&
    identity.displayName !== identity.firstName;

  // Channel presence
  const hasTelegram =
    Boolean(identity.bindings.telegramId?.trim()) && !identity.bindings.telegramBotBlocked;
  const hasMax =
    Boolean(identity.bindings.maxId?.trim()) && !identity.bindings.maxBotBlocked;
  const hasPhone = Boolean(identity.phone?.trim());
  const hasEmail = Boolean(identity.email?.trim());

  return (
    <div className="space-y-2.5">
      {/* Name */}
      <div>
        <p className="font-semibold text-foreground leading-snug">{fullName}</p>
        {isDisplayNameDifferent && (
          <p className="text-xs text-muted-foreground">
            отображаемое: <span className="text-foreground/80">{identity.displayName}</span>
          </p>
        )}
        {(identity.birthDate || identity.age) && (
          <p className="text-xs text-muted-foreground">
            {identity.birthDate ? formatDate(identity.birthDate) : null}
            {identity.age ? ` · ${identity.age} лет` : null}
          </p>
        )}
      </div>

      {/* Channels */}
      <div className="flex flex-wrap gap-1.5">
        {hasPhone && (
          <ChannelChip
            active
            label={`Скопировать телефон: ${identity.phone}`}
            onClick={() => copyToClipboard(identity.phone ?? "")}
          >
            <Phone className="size-3" aria-hidden />
            <span className="font-mono text-[11px]">{identity.phone}</span>
          </ChannelChip>
        )}
        {hasTelegram && (
          <ChannelChip active label="Telegram подключён">
            <Send className="size-3" aria-hidden />
            <span>TG</span>
          </ChannelChip>
        )}
        {hasMax && (
          <ChannelChip active label="MAX подключён">
            <span className="text-[10px] font-bold leading-none">М</span>
            <span>MAX</span>
          </ChannelChip>
        )}
        {hasEmail && (
          <ChannelChip
            active
            label={`Написать на email: ${identity.email}`}
            onClick={() => {
              if (identity.email) window.open(`mailto:${identity.email}`, "_blank");
            }}
          >
            <Mail className="size-3" aria-hidden />
            <span className="max-w-[120px] truncate">{identity.email}</span>
          </ChannelChip>
        )}
        {/* Inactive channel indicators */}
        {!hasPhone && (
          <ChannelChip active={false} label="Телефон не указан">
            <Phone className="size-3" aria-hidden />
          </ChannelChip>
        )}
        {!hasTelegram && (
          <ChannelChip active={false} label="Telegram не подключён">
            <Send className="size-3" aria-hidden />
          </ChannelChip>
        )}
        {!hasMax && (
          <ChannelChip active={false} label="MAX не подключён">
            <span className="text-[10px] font-bold leading-none">М</span>
          </ChannelChip>
        )}
      </div>

      {/* Support */}
      {support.isOnSupport && (
        <DetailRow label="Сопровождение">
          <span className="inline-flex items-center gap-1 text-primary">
            <Heart className="size-3" aria-hidden />
            На сопровождении
            {support.supportMonthsApprox != null && ` · ${support.supportMonthsApprox} мес.`}
          </span>
        </DetailRow>
      )}

      {/* Flags */}
      {identity.isArchived && (
        <p className="text-xs text-muted-foreground">
          <Ban className="mr-0.5 inline size-3" aria-hidden />
          Архивный
        </p>
      )}

      {/* Visits summary */}
      <DetailRow label="Записей всего">
        <span>
          {totalVisits}
          {cancellationsCount > 0 && (
            <span className="ml-1.5 text-muted-foreground">· отмен: {cancellationsCount}</span>
          )}
        </span>
      </DetailRow>

      {/* Last visit */}
      {lastVisit && (
        <DetailRow label="Последний приём">
          <span>
            {formatDate(lastVisit.date)}
            {lastVisit.visitType && <span className="text-muted-foreground"> · {lastVisit.visitType}</span>}
            {lastVisit.city && <span className="text-muted-foreground"> · {lastVisit.city}</span>}
          </span>
        </DetailRow>
      )}

      {/* Next appointment */}
      {nextAppointment && (
        <DetailRow label="Следующая запись">
          <span>
            {formatDate(nextAppointment.date)}
            {nextAppointment.time && ` · ${nextAppointment.time}`}
          </span>
        </DetailRow>
      )}

      {/* App presence (from list item; PatientCardHeader has no app field) */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Smartphone className="size-3" aria-hidden />
        <span>Приложение:</span>
        <span className={cn("font-medium", hasApp ? "text-primary" : "text-muted-foreground")}>
          {hasApp ? "установлено" : "нет"}
        </span>
      </div>

      {/* Open full card */}
      <div className="pt-1">
        <Link
          href={routePaths.doctorPatientCard(userId)}
          className={cn(buttonVariants({ size: "sm" }), "h-7 px-3 text-xs")}
        >
          Открыть карточку
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientPreviewPane({ patient }: PatientPreviewPaneProps) {
  const [header, setHeader] = useState<PatientCardHeader | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  // Track which userId we last started loading to guard against stale responses
  const lastRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!patient) {
      setHeader(null);
      setIsLoading(false);
      setFetchError(false);
      lastRequestIdRef.current = null;
      return;
    }

    const userId = patient.userId;
    lastRequestIdRef.current = userId;
    setHeader(null);
    setFetchError(false);
    setIsLoading(true);

    const controller = new AbortController();

    fetch(`/api/doctor/patients/${encodeURIComponent(userId)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`fetch error: ${res.status}`);
        const data = (await res.json()) as { ok: boolean; header?: PatientCardHeader };
        if (!data.ok || !data.header) throw new Error("bad response");
        // Ignore stale responses (userId changed while we were loading)
        if (lastRequestIdRef.current !== userId) return;
        setHeader(data.header);
        setFetchError(false);
      })
      .catch((err: unknown) => {
        // Ignore abort errors (selection changed)
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (lastRequestIdRef.current !== userId) return;
        setFetchError(true);
      })
      .finally(() => {
        if (lastRequestIdRef.current === userId) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [patient]);

  // Placeholder when nothing selected
  if (!patient) {
    return (
      <div
        className={cn(
          "flex min-h-[180px] items-center justify-center rounded-lg border border-primary/20 bg-primary/5 p-4",
        )}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <User className="size-8 text-muted-foreground/40" aria-hidden />
          <p className="text-sm text-muted-foreground">Выберите пациента, чтобы открыть превью</p>
        </div>
      </div>
    );
  }

  // Instant render from list item while API loads
  const hasTelegram =
    Boolean(patient.bindings.telegramId?.trim()) && !patient.bindings.telegramBotBlocked;
  const hasMax =
    Boolean(patient.bindings.maxId?.trim()) && !patient.bindings.maxBotBlocked;
  const hasPhone = Boolean(patient.phone?.trim());

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/40 bg-primary/5 p-3",
        "max-h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-top,0px)_-_26rem)] overflow-y-auto",
      )}
    >
      {/* Always show name + quick channel chips instantly from list item */}
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <p className="font-semibold text-sm text-foreground leading-snug">{patient.displayName}</p>
        <div className="flex shrink-0 flex-wrap gap-1">
          <span
            className={cn(
              "inline-flex size-5 items-center justify-center rounded border text-[10px]",
              hasPhone
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/40 bg-muted/30 text-muted-foreground/50",
            )}
            title={hasPhone ? `Телефон: ${patient.phone}` : "Телефон не указан"}
          >
            <Phone className="size-2.5" aria-hidden />
          </span>
          <span
            className={cn(
              "inline-flex size-5 items-center justify-center rounded border text-[10px]",
              hasTelegram
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/40 bg-muted/30 text-muted-foreground/50",
            )}
            title={hasTelegram ? "Telegram подключён" : "Telegram не подключён"}
          >
            <Send className="size-2.5" aria-hidden />
          </span>
          <span
            className={cn(
              "inline-flex size-5 items-center justify-center rounded border text-[10px] font-bold leading-none",
              hasMax
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/40 bg-muted/30 text-muted-foreground/50",
            )}
            title={hasMax ? "MAX подключён" : "MAX не подключён"}
          >
            М
          </span>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          <span>Загрузка…</span>
        </div>
      )}

      {/* Error state */}
      {fetchError && !isLoading && (
        <div className="py-2">
          <p className="text-xs text-muted-foreground">Не удалось загрузить детали пациента.</p>
          <div className="mt-2">
            <Link
              href={routePaths.doctorPatientCard(patient.userId)}
              className={cn(buttonVariants({ size: "sm" }), "h-7 px-3 text-xs")}
            >
              Открыть карточку
            </Link>
          </div>
        </div>
      )}

      {/* Rich detail from API */}
      {header && !isLoading && (
        <PatientDetail header={header} userId={patient.userId} hasApp={patient.hasApp === true} />
      )}

      {/* Fallback open-card button when still loading (before API resolves) */}
      {!header && !isLoading && !fetchError && (
        <div className="mt-2">
          <Link
            href={routePaths.doctorPatientCard(patient.userId)}
            className={cn(buttonVariants({ size: "sm" }), "h-7 px-3 text-xs")}
          >
            Открыть карточку
          </Link>
        </div>
      )}
    </div>
  );
}
