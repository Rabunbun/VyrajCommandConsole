import {
  createFittingSlots,
  type FitState,
  type FittingTopology,
} from "@/lib/fitting/fit-state";
import {
  EFT_SUPPORTED_RACKS,
  type EftImportStatus,
  type EftSupportedRack,
  type ResolvedEftApplication,
  type ResolvedEftDraft,
} from "./types";

export type FittedModuleInstanceIdFactory = () => string;

export function resolvedEftDraftToApplication(
  draft: ResolvedEftDraft,
): ResolvedEftApplication | null {
  if (draft.status === "error") {
    return null;
  }

  const slots = Object.fromEntries(
    EFT_SUPPORTED_RACKS.map((rack) => [
      rack,
      draft.slots[rack].map((slot) => ({
        index: slot.index,
        module: slot.module
          ? {
              charge: slot.module.charge ? { ...slot.module.charge } : null,
              typeId: slot.module.typeId,
            }
          : null,
      })),
    ]),
  ) as ResolvedEftApplication["slots"];

  return {
    cargo: draft.cargo.map((entry) => ({ ...entry })),
    drones: draft.drones.map((entry) => ({ ...entry })),
    hullTypeId: draft.hullTypeId,
    slots,
    topology: topologyFromSlots(slots),
  };
}

export function resolvedEftApplicationToFitState(
  application: ResolvedEftApplication,
  createInstanceId: FittedModuleInstanceIdFactory = () => crypto.randomUUID(),
): FitState | null {
  if (!isValidApplication(application)) {
    return null;
  }

  const slots = createFittingSlots(application.topology);
  const instanceIds = new Set<string>();

  for (const rack of EFT_SUPPORTED_RACKS) {
    for (const sourceSlot of application.slots[rack]) {
      if (!sourceSlot.module) {
        continue;
      }

      const instanceId = createInstanceId();
      if (
        typeof instanceId !== "string" ||
        !instanceId.trim() ||
        instanceIds.has(instanceId)
      ) {
        return null;
      }
      instanceIds.add(instanceId);
      slots[rack][sourceSlot.index] = {
        index: sourceSlot.index,
        module: {
          charge: sourceSlot.module.charge
            ? { ...sourceSlot.module.charge }
            : null,
          instanceId,
          typeId: sourceSlot.module.typeId,
        },
      };
    }
  }

  return {
    cargo: application.cargo.map((entry) => ({ ...entry })),
    drones: application.drones.map((entry) => ({ ...entry })),
    hullTypeId: application.hullTypeId,
    slots,
  };
}

export function resolvedEftDraftToFitState(
  draft: ResolvedEftDraft,
  createInstanceId?: FittedModuleInstanceIdFactory,
): FitState | null {
  const application = resolvedEftDraftToApplication(draft);
  return application
    ? resolvedEftApplicationToFitState(application, createInstanceId)
    : null;
}

export function canApplyEftPreview(
  status: EftImportStatus,
  application: ResolvedEftApplication | null,
): application is ResolvedEftApplication {
  return status !== "error" && application !== null;
}

function topologyFromSlots(
  slots: ResolvedEftApplication["slots"],
): FittingTopology {
  return {
    highSlots: slots.high.length,
    lowSlots: slots.low.length,
    midSlots: slots.mid.length,
    rigSlots: slots.rig.length,
  };
}

function isValidApplication(value: ResolvedEftApplication): boolean {
  if (!isPositiveInteger(value.hullTypeId)) {
    return false;
  }
  if (
    !isValidEntries(value.cargo) ||
    !isValidEntries(value.drones) ||
    new Set(value.cargo.map((entry) => entry.typeId)).size !== value.cargo.length ||
    new Set(value.drones.map((entry) => entry.typeId)).size !== value.drones.length
  ) {
    return false;
  }

  const topology = topologyFromSlots(value.slots);
  if (
    !sameTopology(topology, value.topology) ||
    !EFT_SUPPORTED_RACKS.every((rack) => isValidRack(value.slots[rack]))
  ) {
    return false;
  }

  return true;
}

function isValidRack(
  slots: ResolvedEftApplication["slots"][EftSupportedRack],
): boolean {
  return (
    Array.isArray(slots) &&
    slots.every(
      (slot, index) =>
        slot.index === index &&
        (slot.module === null ||
          (isPositiveInteger(slot.module.typeId) &&
            (slot.module.charge === null ||
              (isPositiveInteger(slot.module.charge.typeId) &&
                isPositiveInteger(slot.module.charge.quantity))))),
    )
  );
}

function isValidEntries(entries: Array<{ quantity: number; typeId: number }>) {
  return (
    Array.isArray(entries) &&
    entries.every(
      (entry) =>
        isPositiveInteger(entry.typeId) && isPositiveInteger(entry.quantity),
    )
  );
}

function sameTopology(left: FittingTopology, right: FittingTopology) {
  return (
    left.highSlots === right.highSlots &&
    left.lowSlots === right.lowSlots &&
    left.midSlots === right.midSlots &&
    left.rigSlots === right.rigSlots
  );
}

function isPositiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}
