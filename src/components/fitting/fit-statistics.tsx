"use client";

import { useState } from "react";
import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type { FittingDragSource } from "@/components/fitting/fitting-ui-types";
import type { CargoHoldAttemptResult } from "@/components/fitting/use-fitting-state";
import type {
  CargoHoldAnalysis,
  CargoValidationIssue
} from "@/lib/fitting/types";

const statisticSections = [
  { title: "Offense", rows: [["DPS", "—"], ["Volley", "—"]] },
  {
    title: "Defense",
    rows: [["Effective Hitpoints", "—"], ["Shield", "—"], ["Armor", "—"], ["Hull", "—"]]
  },
  { title: "Capacitor", rows: [["Stability", "—"], ["Duration", "—"]] },
  {
    title: "Targeting",
    rows: [["Lock Range", "—"], ["Scan Resolution", "—"], ["Max Targets", "—"]]
  },
  {
    title: "Navigation",
    rows: [["Maximum Velocity", "—"], ["Align Time", "—"], ["Signature Radius", "—"]]
  }
];

type FitStatisticsProps = {
  cargoAnalysis: CargoHoldAnalysis;
  cargoWarnings: CargoValidationIssue[];
  dragSource: FittingDragSource | null;
  isCargoDragOver: boolean;
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
  isCargoDragOver,
  onAddCargo,
  onCargoDragOverChange,
  onClearCargo,
  onDecrementCargo,
  onDropCargo,
  onRemoveCargo
}: FitStatisticsProps) {
  return (
    <aside className="fitting-panel fit-statistics" aria-labelledby="fit-statistics-title">
      <div className="fitting-panel-heading">
        <h2 className="section-title" id="fit-statistics-title">
          Fit Statistics
        </h2>
        <span className="badge">Base Data</span>
      </div>

      <CargoHoldPanel
        analysis={cargoAnalysis}
        dragSource={dragSource}
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
              {section.rows.map(([label, value]) => (
                <div className="fit-stat-row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
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
          <small>Base / Unmodified</small>
        </div>
        <span>
          {formatVolume(analysis.usedVolume)} / {formatVolume(analysis.baseCapacity)} m³
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

      {analysis.overBaseBy > Number.EPSILON ? (
        <div className="fitting-cargo-warning" role="status">
          {formatVolume(analysis.overBaseBy)} m³ over base — soft warning only
        </div>
      ) : warnings[0] ? (
        <div className="fitting-cargo-note" role="status">
          {warnings[0].message}
        </div>
      ) : (
        <div className="fitting-cargo-note">
          Effective cargo modifiers are not calculated.
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

function formatVolume(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
