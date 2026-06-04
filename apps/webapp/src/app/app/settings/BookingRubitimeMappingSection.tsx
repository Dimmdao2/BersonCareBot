"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { apiJson } from "@/app/app/settings/bookingSoloAdminApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { RubitimeMappingRow, RubitimeMappingStatusCode } from "@/modules/rubitime-mapping/types";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { getDoctorSectionItemClass } from "@/shared/ui/doctorVisual";
import { cn } from "@/lib/utils";

const MAPPING_BASE = "/api/admin/booking-engine/rubitime-mapping";
const CATALOG_BASE = "/api/admin/booking-catalog";

type CatalogBranch = { id: string; title: string; isActive: boolean };
type CatalogService = { id: string; title: string; durationMinutes: number; isActive: boolean };
type CatalogSpecialist = { id: string; branchId: string; fullName: string; isActive: boolean };
type CatalogBranchService = {
  id: string;
  branchId: string;
  serviceId: string;
  specialistId: string;
  rubitimeServiceId: string;
  isActive: boolean;
};

const STATUS_LABELS: Record<RubitimeMappingStatusCode, string> = {
  unmapped: "Не настроено",
  ssa_missing: "Нет доступности",
  reverse_missing: "Нет обратной связи",
  branch_unmapped: "Филиал не сопоставлен",
  specialist_unmapped: "Специалист не сопоставлен",
  service_unmapped: "Услуга не сопоставлена",
  legacy_inactive: "Отключено в Rubitime",
  duration_mismatch: "Конфликт длительности",
  price_mismatch: "Конфликт цены",
  mapped_ok: "Связано",
};

const ISSUE_LABELS: Record<string, string> = {
  duration_mismatch: "Длительность",
  price_mismatch: "Цена",
};

function statusTone(status: RubitimeMappingStatusCode, issues: string[]): "default" | "urgent" | "neutral" {
  if (status === "mapped_ok" && issues.length === 0) return "default";
  if (status === "mapped_ok") return "neutral";
  if (status === "legacy_inactive") return "neutral";
  return "urgent";
}

export function BookingRubitimeMappingSection() {
  const [rows, setRows] = useState<RubitimeMappingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [mappedOk, setMappedOk] = useState(0);
  const [problems, setProblems] = useState(0);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<RubitimeMappingRow | null>(null);
  const [legacyBranches, setLegacyBranches] = useState<CatalogBranch[]>([]);
  const [legacyServices, setLegacyServices] = useState<CatalogService[]>([]);
  const [legacySpecialists, setLegacySpecialists] = useState<CatalogSpecialist[]>([]);
  const [legacyBranchServices, setLegacyBranchServices] = useState<CatalogBranchService[]>([]);
  const [legacyBranchId, setLegacyBranchId] = useState("");
  const [legacyServiceId, setLegacyServiceId] = useState("");
  const [legacySpecialistId, setLegacySpecialistId] = useState("");
  const [rubitimeServiceId, setRubitimeServiceId] = useState("");

  const loadCatalog = useCallback(async () => {
    const [bRes, sRes, spRes, bsRes] = await Promise.all([
      apiJson<{ ok: boolean; branches?: CatalogBranch[] }>(`${CATALOG_BASE}/branches`),
      apiJson<{ ok: boolean; services?: CatalogService[] }>(`${CATALOG_BASE}/services`),
      apiJson<{ ok: boolean; specialists?: CatalogSpecialist[] }>(`${CATALOG_BASE}/specialists`),
      apiJson<{ ok: boolean; branchServices?: CatalogBranchService[] }>(`${CATALOG_BASE}/branch-services`),
    ]);
    setLegacyBranches((bRes.branches ?? []).filter((b) => b.isActive));
    setLegacyServices((sRes.services ?? []).filter((s) => s.isActive));
    setLegacySpecialists((spRes.specialists ?? []).filter((s) => s.isActive));
    setLegacyBranchServices((bsRes.branchServices ?? []).filter((bs) => bs.isActive));
  }, []);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = problemsOnly ? "?problemsOnly=true" : "";
      const data = await apiJson<{
        ok: boolean;
        total: number;
        mappedOk: number;
        problems: number;
        rows: RubitimeMappingRow[];
      }>(`${MAPPING_BASE}${qs}`);
      setRows(data.rows);
      setTotal(data.total);
      setMappedOk(data.mappedOk);
      setProblems(data.problems);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [problemsOnly]);

  useEffect(() => {
    void loadMappings();
  }, [loadMappings]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const specialistsForBranch = useMemo(
    () => legacySpecialists.filter((s) => s.branchId === legacyBranchId),
    [legacySpecialists, legacyBranchId],
  );

  function openEdit(row: RubitimeMappingRow) {
    setEditRow(row);
    const existing = row.branchServiceId
      ? legacyBranchServices.find((bs) => bs.id === row.branchServiceId)
      : undefined;
    setLegacyBranchId(existing?.branchId ?? "");
    setLegacyServiceId(existing?.serviceId ?? "");
    setLegacySpecialistId(existing?.specialistId ?? "");
    setRubitimeServiceId(existing?.rubitimeServiceId ?? "");
    setActionError(null);
    setDialogOpen(true);
  }

  function saveLink() {
    if (!editRow) return;
    setActionError(null);
    startTransition(async () => {
      try {
        await apiJson(`${MAPPING_BASE}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId: editRow.branchId,
            serviceId: editRow.serviceId,
            legacyBranchId,
            legacyServiceId,
            legacySpecialistId,
            rubitimeServiceId: rubitimeServiceId.trim(),
          }),
        });
        setDialogOpen(false);
        setEditRow(null);
        await loadMappings();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "link_failed");
      }
    });
  }

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <DoctorSectionTitle>Связи локация × услуга</DoctorSectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={problemsOnly} onCheckedChange={setProblemsOnly} />
              <span className="text-muted-foreground">Только проблемы</span>
            </label>
            <Button variant="default" size="sm" onClick={() => void loadMappings()} disabled={loading}>
              {loading ? "Загрузка…" : "Обновить"}
            </Button>
          </div>
        </DoctorSectionHeader>

        <ul className="m-0 grid list-none gap-2 p-0 text-sm sm:grid-cols-3">
          <li className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Всего пар</span>
            <span className="font-semibold tabular-nums">{total}</span>
          </li>
          <li className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Связано</span>
            <span className="font-semibold tabular-nums">{mappedOk}</span>
          </li>
          <li className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
            <span className="text-muted-foreground">Проблемы</span>
            <span className="font-semibold tabular-nums text-destructive">{problems}</span>
          </li>
        </ul>

        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

        {rows.length === 0 && !loading ? (
          <DoctorEmptyState>
            {problemsOnly ? "Нет проблемных связей." : "Нет пар локация × услуга с доступностью."}
          </DoctorEmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.map((row) => (
              <li
                key={`${row.branchId}:${row.serviceId}`}
                className={cn(
                  getDoctorSectionItemClass(statusTone(row.status, row.issues)),
                  "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {row.branchTitle} · {row.serviceTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.rubitimeBranchTitle ?? "—"} · {row.rubitimeSpecialistName ?? "—"} ·{" "}
                    {row.rubitimeServiceTitle ?? "—"}
                  </p>
                  {row.issues.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.issues.map((i) => ISSUE_LABELS[i] ?? i).join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={row.status === "mapped_ok" && row.issues.length === 0 ? "secondary" : "outline"}>
                    {STATUS_LABELS[row.status]}
                  </Badge>
                  <Button variant="default" size="sm" onClick={() => openEdit(row)}>
                    Настроить
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Настроить связь Rubitime</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <p className="text-sm text-muted-foreground">
              {editRow.branchTitle} · {editRow.serviceTitle}
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <Label>Rubitime филиал</Label>
              <Select value={legacyBranchId} onValueChange={(v) => setLegacyBranchId(v ?? "")}>
                <SelectTrigger
                  displayLabel={legacyBranches.find((b) => b.id === legacyBranchId)?.title}
                >
                  <SelectValue placeholder="Выберите филиал" />
                </SelectTrigger>
                <SelectContent>
                  {legacyBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Rubitime специалист</Label>
              <Select
                value={legacySpecialistId}
                onValueChange={(v) => setLegacySpecialistId(v ?? "")}
                disabled={!legacyBranchId}
              >
                <SelectTrigger
                  displayLabel={specialistsForBranch.find((s) => s.id === legacySpecialistId)?.fullName}
                >
                  <SelectValue placeholder="Выберите специалиста" />
                </SelectTrigger>
                <SelectContent>
                  {specialistsForBranch.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Rubitime услуга</Label>
              <Select value={legacyServiceId} onValueChange={(v) => setLegacyServiceId(v ?? "")}>
                <SelectTrigger displayLabel={legacyServices.find((s) => s.id === legacyServiceId)?.title}>
                  <SelectValue placeholder="Выберите услугу" />
                </SelectTrigger>
                <SelectContent>
                  {legacyServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} · {s.durationMinutes} мин
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rubitime-service-id">Rubitime service id</Label>
              <Input
                id="rubitime-service-id"
                value={rubitimeServiceId}
                onChange={(e) => setRubitimeServiceId(e.target.value)}
                placeholder="ID услуги в Rubitime"
              />
            </div>
            {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isPending || !legacyBranchId || !legacyServiceId || !legacySpecialistId || !rubitimeServiceId.trim()}
              onClick={saveLink}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
