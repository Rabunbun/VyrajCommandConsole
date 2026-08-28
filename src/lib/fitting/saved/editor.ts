import type { FitState } from "@/lib/fitting/fit-state";
import { createSavedFittingFingerprint, normalizeSavedFittingName } from "./fingerprint";
import { fitStateToSavedFittingSnapshotV1 } from "./snapshot";
import type { SavedFittingEditorContext, SavedFittingSnapshotV1 } from "./types";

export type SavedFittingEditorState = SavedFittingEditorContext & {
  name: string;
};

export type SavedFittingEditorStatus = {
  currentFingerprint: string | null;
  dirty: boolean;
  kind: "not-saved" | "saved" | "unsaved-changes";
  label: "Not Saved" | "Saved" | "Unsaved Changes";
};

export function createUnsavedFittingEditor(name = ""): SavedFittingEditorState {
  return {
    baselineFingerprint: null,
    name: normalizeSavedFittingName(name),
    savedFittingId: null,
    savedRevision: null
  };
}

export function establishSavedFittingEditor(input: {
  baselineFingerprint?: string;
  id: string;
  name: string;
  revision: number;
  snapshot?: SavedFittingSnapshotV1;
}): SavedFittingEditorState {
  const baselineFingerprint = input.baselineFingerprint ?? fingerprint(input.name, input.snapshot);

  return {
    baselineFingerprint,
    name: normalizeSavedFittingName(input.name),
    savedFittingId: input.id,
    savedRevision: input.revision
  };
}

export function evaluateSavedFittingEditor(
  editor: SavedFittingEditorState,
  fitState: FitState
): SavedFittingEditorStatus {
  const snapshot = fitStateToSavedFittingSnapshotV1(fitState);
  const currentFingerprint = snapshot.ok
    ? fingerprint(editor.name, snapshot.value)
    : null;

  if (
    editor.savedFittingId === null ||
    editor.savedRevision === null ||
    editor.baselineFingerprint === null
  ) {
    return {
      currentFingerprint,
      dirty: true,
      kind: "not-saved",
      label: "Not Saved"
    };
  }

  const dirty = currentFingerprint !== editor.baselineFingerprint;
  return {
    currentFingerprint,
    dirty,
    kind: dirty ? "unsaved-changes" : "saved",
    label: dirty ? "Unsaved Changes" : "Saved"
  };
}

function fingerprint(name: string, snapshot: unknown) {
  const result = createSavedFittingFingerprint(name, snapshot);

  if (!result.ok) {
    throw new Error("A canonical saved fitting could not be fingerprinted.");
  }

  return result.value;
}
