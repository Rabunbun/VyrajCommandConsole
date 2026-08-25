import type { FitState } from "@/lib/fitting/fit-state";
import { canonicalizeSavedFittingSnapshot } from "./canonicalize";
import {
  savedFittingRackOrder,
  type SavedFittingApplicationCandidateV1,
  type SavedFittingDomainResult,
  type SavedFittingSnapshotV1
} from "./types";

export function decodeSavedFittingSnapshotV1(
  input: unknown
): SavedFittingDomainResult<SavedFittingSnapshotV1> {
  return canonicalizeSavedFittingSnapshot(input);
}

export function fitStateToSavedFittingSnapshotV1(
  state: FitState
): SavedFittingDomainResult<SavedFittingSnapshotV1> {
  if (state.hullTypeId === null) {
    return {
      diagnostics: [
        {
          code: "MISSING_HULL",
          message: "A hull is required before a fitting can be saved.",
          path: "hullTypeId",
          severity: "error"
        }
      ],
      ok: false,
      value: null
    };
  }

  if (state.slots.subsystem.length > 0) {
    return {
      diagnostics: [
        {
          code: "UNSUPPORTED_RACK_CONTENT",
          message: "SavedFittingSnapshotV1 does not support subsystem topology.",
          path: "slots.subsystem",
          severity: "error"
        }
      ],
      ok: false,
      value: null
    };
  }

  return canonicalizeSavedFittingSnapshot({
    cargo: state.cargo.map((entry) => ({ ...entry })),
    drones: state.drones.map((entry) => ({ ...entry })),
    hullTypeId: state.hullTypeId,
    slots: Object.fromEntries(
      savedFittingRackOrder.map((rack) => [
        rack,
        state.slots[rack].map((slot) => ({
          index: slot.index,
          module: slot.module
            ? {
                charge: slot.module.charge ? { ...slot.module.charge } : null,
                typeId: slot.module.typeId
              }
            : null
        }))
      ])
    )
  });
}

export function savedFittingSnapshotToApplicationCandidate(
  input: unknown
): SavedFittingDomainResult<SavedFittingApplicationCandidateV1> {
  const decoded = decodeSavedFittingSnapshotV1(input);

  if (!decoded.ok) {
    return decoded;
  }

  const snapshot = decoded.value;
  const slots = Object.fromEntries(
    savedFittingRackOrder.map((rack) => [
      rack,
      snapshot.slots[rack].map((slot) => ({
        index: slot.index,
        module: slot.module
          ? {
              charge: slot.module.charge ? { ...slot.module.charge } : null,
              typeId: slot.module.typeId
            }
          : null
      }))
    ])
  ) as SavedFittingApplicationCandidateV1["slots"];

  return {
    diagnostics: decoded.diagnostics,
    ok: true,
    value: {
      cargo: snapshot.cargo.map((entry) => ({ ...entry })),
      drones: snapshot.drones.map((entry) => ({ ...entry })),
      hullTypeId: snapshot.hullTypeId,
      slots,
      topology: {
        highSlots: slots.high.length,
        lowSlots: slots.low.length,
        midSlots: slots.mid.length,
        rigSlots: slots.rig.length
      }
    }
  };
}
