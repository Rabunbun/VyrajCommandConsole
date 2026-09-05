"use client";

import { useState } from "react";
import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type { FittingDragSource } from "@/components/fitting/fitting-ui-types";
import type { CargoHoldAttemptResult } from "@/components/fitting/use-fitting-state";
import type {
  CargoHoldAnalysis,
  CargoValidationIssue
} from "@/lib/fitting/types";
import type {
  DamageTypeStatistics,
  EffectiveFitAnalysis,
  EffectiveStatistic
} from "@/lib/fitting/dogma";

type StatisticRow = {
  detail?: string;
  label: string;
  value: string;
};

type FitStatisticsProps = {
  cargoAnalysis: CargoHoldAnalysis;
  cargoWarnings: CargoValidationIssue[];
  dragSource: FittingDragSource | null;
  effectiveAnalysis: EffectiveFitAnalysis | null;
  isCargoDragOver: boolean;
  isEffectiveAnalysisLoading: boolean;
  onAddCargo: (typeId: number) => Promise<CargoHoldAttemptResult>;
  onCargoDragOverChange: (isOver: boolean) => void;
  onClearCargo: () => Promise<CargoHoldAttemptResult>;
  onDecrementCargo: (typeId: number) => Promise<CargoHoldAttemptResult>;
  onDropCargo: () => void;
  onRemoveCargo: (typeId: number) => Promise<CargoHoldAttemptResult>;
};

export function FitStatistics({
  cargoAnalysis,
  cargoWarnings,
  dragSource,
  effectiveAnalysis,
  isCargoDragOver,
  isEffectiveAnalysisLoading,
  onAddCargo,
  onCargoDragOverChange,
  onClearCargo,
  onDecrementCargo,
  onDropCargo,
  onRemoveCargo
}: FitStatisticsProps) {
  const statisticSections = createStatisticSections(
    effectiveAnalysis,
    isEffectiveAnalysisLoading
  );
  const analysisBadge = isEffectiveAnalysisLoading
    ? "Calculating"
    : effectiveAnalysis?.profileStale
      ? "Effective · Stale"
      : effectiveAnalysis
        ? "Effective"
        : "Base Data";

  return (
    <aside className="fitting-panel fit-statistics" aria-labelledby="fit-statistics-title">
      <div className="fitting-panel-heading">
        <h2 className="section-title" id="fit-statistics-title">
          Fit Statistics
        </h2>
        <span className="badge">{analysisBadge}</span>
      </div>

      <CargoHoldPanel
        analysis={cargoAnalysis}
        dragSource={dragSource}
        effectiveCapacity={effectiveAnalysis?.capacities.cargo ?? null}
        isDragOver={isCargoDragOver}
        onAdd={onAddCargo}
        onClear={onClearCargo}
        onDecrement={onDecrementCargo}
        onDragOverChange={onCargoDragOverChange}
        onDrop={onDropCargo}
        onRemove={onRemoveCargo}
        warnings={cargoWarnings}
      />

      <div className="fit-stat-section-list">
        {statisticSections.map((section) => (
          <section className="fit-stat-section" key={section.title}>
            <h3 className="fit-stat-title">{section.title}</h3>
            <dl className="fit-stat-list">
              {section.rows.map((row) => (
                <div className="fit-stat-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    <strong>{row.value}</strong>
                    {row.detail ? <small>{row.detail}</small> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </aside>
  );
}

function CargoHoldPanel({
  analysis,
  dragSource,
  effectiveCapacity,
  isDragOver,
  onAdd,
  onClear,
  onDecrement,
  onDragOverChange,
  onDrop,
  onRemove,
  warnings
}: {
  analysis: CargoHoldAnalysis;
  dragSource: FittingDragSource | null;
  effectiveCapacity: EffectiveStatistic | null;
  isDragOver: boolean;
  onAdd: (typeId: number) => Promise<CargoHoldAttemptResult>;
  onClear: () => Promise<CargoHoldAttemptResult>;
  onDecrement: (typeId: number) => Promise<CargoHoldAttemptResult>;
  onDragOverChange: (isOver: boolean) => void;
  onDrop: () => void;
  onRemove: (typeId: number) => Promise<CargoHoldAttemptResult>;
  warnings: CargoValidationIssue[];
}) {
  const [pendingTypeId, setPendingTypeId] = useState<number | "all" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const cargoDragActive = dragSource?.kind === "browser-cargo";
  const authoritativeCapacity =
    effectiveCapacity?.status === "available"
      ? effectiveCapacity.effective
      : analysis.baseCapacity;
  const overCapacityBy =
    authoritativeCapacity === null
      ? 0
      : Math.max(0, analysis.usedVolume - authoritativeCapacity);

  async function perform(
    operation: () => Promise<CargoHoldAttemptResult>,
    pending: number | "all"
  ) {
    if (pendingTypeId !== null) {
      return;
    }

    setPendingTypeId(pending);
    setFeedback(null);
    const result = await operation();
    setPendingTypeId(null);
    setFeedback(result.ok ? null : result.message);
  }

  return (
    <section
      aria-labelledby="fitting-cargo-hold-title"
      className="fitting-cargo-hold"
      data-drag-active={isDragOver}
      data-drag-target={cargoDragActive}
      onDragEnter={(event) => {
        if (cargoDragActive) {
          event.preventDefault();
          onDragOverChange(true);
        }
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;

        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }

        onDragOverChange(false);
      }}
      onDragOver={(event) => {
        if (cargoDragActive) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          onDragOverChange(true);
        }
      }}
      onDrop={(event) => {
        if (!cargoDragActive) {
          return;
        }

        event.preventDefault();
        onDragOverChange(false);
        onDrop();
      }}
    >
      <div className="fitting-cargo-hold-heading">
        <div>
          <strong id="fitting-cargo-hold-title">Cargo Hold</strong>
          <small>
            {effectiveCapacity?.status === "available"
              ? `Effective · Base ${formatVolume(analysis.baseCapacity)} m³`
              : "Base / Unmodified · Effective unavailable"}
          </small>
        </div>
        <span>
          {formatVolume(analysis.usedVolume)} / {formatVolume(authoritativeCapacity)} m³
        </span>
      </div>

      <div className="fitting-cargo-hold-list">
        {analysis.entries.length ? (
          analysis.entries.map((entry) => {
            const pending = pendingTypeId === entry.typeId;

            return (
              <div className="fitting-cargo-hold-entry" key={entry.typeId}>
                <EveModuleIcon typeId={entry.typeId} typeName={entry.typeName} />
                <span>
                  <strong>{entry.typeName}</strong>
                  <small>
                    ×{entry.quantity} · {formatVolume(entry.quantity * entry.volume)} m³
                  </small>
                </span>
                <span className="fitting-cargo-hold-actions">
                  <button
                    aria-label={`Remove one ${entry.typeName}`}
                    disabled={pendingTypeId !== null}
                    onClick={() => void perform(() => onDecrement(entry.typeId), entry.typeId)}
                    type="button"
                  >
                    −1
                  </button>
                  <button
                    aria-label={`Add one ${entry.typeName}`}
                    disabled={pendingTypeId !== null}
                    onClick={() => void perform(() => onAdd(entry.typeId), entry.typeId)}
                    type="button"
                  >
                    {pending ? "…" : "+1"}
                  </button>
                  <button
                    disabled={pendingTypeId !== null}
                    onClick={() => void perform(() => onRemove(entry.typeId), entry.typeId)}
                    type="button"
                  >
                    Remove
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <div className="fitting-empty-note">
            {cargoDragActive ? "Drop cargo here to add one." : "No cargo carried."}
          </div>
        )}
      </div>

      {analysis.entries.length ? (
        <button
          className="fitting-cargo-clear"
          disabled={pendingTypeId !== null}
          onClick={() => void perform(onClear, "all")}
          type="button"
        >
          {pendingTypeId === "all" ? "Clearing…" : "Clear Cargo"}
        </button>
      ) : null}

      {overCapacityBy > Number.EPSILON ? (
        <div className="fitting-cargo-warning" role="status">
          {formatVolume(overCapacityBy)} m³ over effective capacity — soft warning only
        </div>
      ) : effectiveCapacity?.status === "available" ? (
        <div className="fitting-cargo-note">
          Passive Dogma capacity applied. Cargo contents do not modify capacity.
        </div>
      ) : warnings[0] ? (
        <div className="fitting-cargo-note" role="status">
          {warnings[0].message}
        </div>
      ) : (
        <div className="fitting-cargo-note">
          Effective cargo capacity is unavailable.
        </div>
      )}

      {feedback ? (
        <div className="fitting-empty-note" data-tone="error" role="alert">
          {feedback}
        </div>
      ) : null}
    </section>
  );
}

function createStatisticSections(
  analysis: EffectiveFitAnalysis | null,
  loading: boolean
) {
  if (!analysis) {
    const value = loading ? "Calculating…" : "—";
    return [
      { title: "Defense", rows: placeholderRows(["Shield", "Armor", "Hull"], value) },
      { title: "Targeting", rows: placeholderRows(["Lock Range", "Scan Resolution", "Sensors", "Signature"], value) },
      { title: "Navigation", rows: placeholderRows(["Maximum Velocity", "Mass", "Inertia", "Align Time", "Warp Speed"], value) },
      { title: "Deferred", rows: placeholderRows(["DPS", "Capacitor"], "Deferred") }
    ];
  }

  return [
    {
      title: `Defense · ${formatSectionStatus(analysis.defense.status)}`,
      rows: [
        layerRow("Shield", analysis.defense.shield.hitpoints, analysis.defense.shield.resistances),
        layerRow("Armor", analysis.defense.armor.hitpoints, analysis.defense.armor.resistances),
        layerRow("Hull", analysis.defense.hull.hitpoints, analysis.defense.hull.resistances),
        statisticRow("Shield Recharge", analysis.defense.shieldRechargeTime, (value) => `${formatNumber(value / 1000)} s`),
        statisticRow("Peak Recharge", analysis.defense.peakShieldRecharge, (value) => `${formatNumber(value)} HP/s`)
      ]
    },
    {
      title: `Targeting · ${formatSectionStatus(analysis.targeting.status)}`,
      rows: [
        statisticRow("Lock Range", analysis.targeting.maxTargetRange, (value) => `${formatNumber(value / 1000)} km`),
        statisticRow("Scan Resolution", analysis.targeting.scanResolution, (value) => `${formatNumber(value)} mm`),
        sensorStrengthRow(analysis),
        statisticRow("Signature Radius", analysis.targeting.signatureRadius, (value) => `${formatNumber(value)} m`)
      ]
    },
    {
      title: `Navigation · ${formatSectionStatus(analysis.navigation.status)}`,
      rows: [
        statisticRow("Maximum Velocity", analysis.navigation.maxVelocity, (value) => `${formatNumber(value)} m/s`),
        statisticRow("Mass", analysis.navigation.mass, (value) => `${formatNumber(value)} kg`),
        statisticRow("Inertia", analysis.navigation.agility, formatNumber),
        statisticRow("Align Time", analysis.navigation.alignTime, (value) => `${formatNumber(value)} s`),
        statisticRow("Warp Speed", analysis.navigation.warpSpeed, (value) => `${formatNumber(value)} AU/s`)
      ]
    },
    {
      title: `Capacity · ${formatSectionStatus(analysis.capacities.status)}`,
      rows: [
        statisticRow("Cargo", analysis.capacities.cargo, (value) => `${formatNumber(value)} m³`),
        statisticRow("Drone Bay", analysis.capacities.droneBay, (value) => `${formatNumber(value)} m³`),
        statisticRow("Bandwidth", analysis.capacities.droneBandwidth, (value) => `${formatNumber(value)} Mbit/s`)
      ]
    },
    { title: "Deferred", rows: placeholderRows(["DPS", "Capacitor"], "Deferred") }
  ];
}

function placeholderRows(labels: string[], value: string): StatisticRow[] {
  return labels.map((label) => ({ label, value }));
}

function statisticRow(
  label: string,
  statistic: EffectiveStatistic,
  format: (value: number) => string
): StatisticRow {
  if (statistic.status === "unavailable" || statistic.effective === null) {
    return {
      label,
      value: statistic.diagnostics.some((item) => item.code.includes("special-handler"))
        ? "Unsupported"
        : "Unavailable"
    };
  }

  return {
    detail:
      statistic.base !== null && !nearlyEqual(statistic.base, statistic.effective)
        ? `Base ${format(statistic.base)}`
        : undefined,
    label,
    value: format(statistic.effective)
  };
}

function layerRow(
  label: string,
  hitpoints: EffectiveStatistic,
  resistances: DamageTypeStatistics
): StatisticRow {
  const hp = statisticRow(label, hitpoints, (value) => `${formatNumber(value)} HP`);
  return {
    ...hp,
    detail: `${hp.detail ? `${hp.detail} · ` : ""}${formatResistances(resistances)}`
  };
}

function formatResistances(resistances: DamageTypeStatistics) {
  const entries = [
    ["EM", resistances.em],
    ["TH", resistances.thermal],
    ["KI", resistances.kinetic],
    ["EX", resistances.explosive]
  ] as const;
  if (entries.some(([, value]) => value.effective === null)) {
    return "Resists unavailable";
  }
  return entries
    .map(([label, value]) => `${label} ${formatNumber((value.effective as number) * 100)}%`)
    .join(" · ");
}

function sensorStrengthRow(analysis: EffectiveFitAnalysis): StatisticRow {
  const entries = [
    ["Grav", analysis.targeting.sensorStrengths.gravimetric],
    ["Ladar", analysis.targeting.sensorStrengths.ladar],
    ["Mag", analysis.targeting.sensorStrengths.magnetometric],
    ["Radar", analysis.targeting.sensorStrengths.radar]
  ] as const;
  const available = entries.filter(([, value]) => value.effective !== null);
  if (available.length !== entries.length) {
    return { label: "Sensor Strength", value: "Unavailable" };
  }
  const nonzero = available.filter(([, value]) => (value.effective ?? 0) > 0);
  return {
    label: "Sensor Strength",
    value: nonzero.length
      ? nonzero.map(([label, value]) => `${label} ${formatNumber(value.effective as number)}`).join(" · ")
      : "None"
  };
}

function formatSectionStatus(status: "available" | "partial" | "unavailable") {
  return status === "available" ? "Effective" : status === "partial" ? "Partial" : "Unavailable";
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatVolume(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
