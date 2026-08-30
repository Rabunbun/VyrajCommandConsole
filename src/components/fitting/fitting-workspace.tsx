"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSavedFittingAction,
  deleteSavedFittingAction,
  loadSavedFittingAction,
  updateSavedFittingAction
} from "@/app/fitting/actions";
import { FitStatistics } from "@/components/fitting/fit-statistics";
import { CharacterSimulationDrawer } from "@/components/fitting/character-simulation-drawer";
import { EftDrawer } from "@/components/fitting/eft-drawer";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { SavedFittingLoadDialog } from "@/components/fitting/saved-fitting-load-dialog";
import { FittingStage } from "@/components/fitting/fitting-stage";
import type {
  BrowserFittingDragSource,
  FittingBrowserSection,
  FittingDragSource,
  ModuleActionMode,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import { ItemBrowser } from "@/components/fitting/item-browser";
import {
  useFittingState,
  type BulkLoadChargeAttemptResult,
  type FitModuleAttemptResult,
  type FitOperationAttemptResult,
  type LoadChargeAttemptResult
} from "@/components/fitting/use-fitting-state";
import { useFittingSimulation } from "@/components/fitting/use-fitting-simulation";
import type {
  BrowsableFittingRack,
  FittingHullSummary,
  FittingModuleSearchResult
} from "@/lib/fitting/types";
import type { EftPreviewResponse } from "@/lib/fitting/eft/types";
import { hasMeaningfulFitContent } from "@/lib/fitting/fit-state";
import {
  createUnsavedFittingEditor,
  establishSavedFittingEditor,
  evaluateSavedFittingEditor
} from "@/lib/fitting/saved/editor";
import type { SavedFittingLoadResult } from "@/lib/fitting/saved/load-types";
import { fitStateToSavedFittingSnapshotV1 } from "@/lib/fitting/saved/snapshot";
import type {
  SavedFittingLibraryState,
  SavedFittingSummary
} from "@/lib/fitting/saved/ui-types";
import type { FittingSimulationBootstrap } from "@/lib/fitting/simulation";

type FittingWorkspaceProps = {
  hulls: FittingHullSummary[];
  initialSavedFittings: SavedFittingLibraryState;
  simulationBootstrap: FittingSimulationBootstrap;
};

type SavedFittingMessage = {
  text: string;
  tone: "error" | "info" | "success";
};

type SuccessfulSavedFittingLoad = Extract<SavedFittingLoadResult, { ok: true }>;

export function FittingWorkspace({
  hulls,
  initialSavedFittings,
  simulationBootstrap
}: FittingWorkspaceProps) {
  const {
    addDrone,
    addCargo,
    analysis,
    applyEftPreview,
    applySavedFittingLoad,
    bulkLoadCharge,
    cancelPendingOperation,
    cargoHoldAnalysis,
    cargoWarnings,
    clearCargo,
    decrementDrone,
    decrementCargo,
    droneBayAnalysis,
    fitModule,
    fitWarnings,
    fitState,
    loadCharge,
    moveModule,
    removeDrone,
    removeCargo,
    removeModule,
    replaceModule,
    selectHull,
    selectedHull,
    unloadCharge
  } = useFittingState({ hulls });
  const {
    disconnect: disconnectCharacterData,
    refreshSkills,
    selectProfile: selectSimulationProfile,
    state: simulationState
  } = useFittingSimulation(fitState, simulationBootstrap);
  const [selectedSlot, setSelectedSlot] = useState<SelectedFittingSlot | null>(null);
  const [savedFittingLibrary, setSavedFittingLibrary] = useState(initialSavedFittings);
  const [savedFittingEditor, setSavedFittingEditor] = useState(createUnsavedFittingEditor);
  const [savedFittingMessage, setSavedFittingMessage] = useState<SavedFittingMessage | null>(null);
  const [savedFittingConflict, setSavedFittingConflict] = useState<{
    fittingId: string;
    fittingName: string;
  } | null>(null);
  const [pendingSavedFittingLoad, setPendingSavedFittingLoad] = useState<{
    confirmReplacement: boolean;
    load: SuccessfulSavedFittingLoad;
  } | null>(null);
  const [busySavedFittingId, setBusySavedFittingId] = useState<string | null>(null);
  const [isSavingFitting, setIsSavingFitting] = useState(false);
  const [isEftDrawerOpen, setIsEftDrawerOpen] = useState(false);
  const [isSimulationDrawerOpen, setIsSimulationDrawerOpen] = useState(false);
  const [moduleActionMode, setModuleActionMode] = useState<ModuleActionMode>(null);
  const [browserRack, setBrowserRack] = useState<BrowsableFittingRack>("high");
  const [openBrowserSections, setOpenBrowserSections] = useState<
    Record<FittingBrowserSection, boolean>
  >({ cargo: false, charges: false, drones: false, hulls: true, modules: false });
  const [manipulationError, setManipulationError] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<FittingDragSource | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<SelectedFittingSlot | null>(null);
  const [isRemoveDragOver, setIsRemoveDragOver] = useState(false);
  const [isStageDragOver, setIsStageDragOver] = useState(false);
  const [isCargoDragOver, setIsCargoDragOver] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [resolvedModuleNamesByTypeId, setResolvedModuleNamesByTypeId] = useState<
    Record<number, string>
  >({});
  const [resolvedChargeNamesByTypeId, setResolvedChargeNamesByTypeId] = useState<
    Record<number, string>
  >({});
  const browserRackBeforeReplacementRef = useRef<BrowsableFittingRack | null>(null);
  const editorAssociationEpochRef = useRef(0);
  const latestFitStateRef = useRef(fitState);
  const latestSavedFittingEditorRef = useRef(savedFittingEditor);
  const savedFittingStatus = useMemo(
    () => evaluateSavedFittingEditor(savedFittingEditor, fitState),
    [fitState, savedFittingEditor]
  );
  const selectedModule = selectedSlot
    ? fitState.slots[selectedSlot.rack].find(
        (slot) => slot.index === selectedSlot.index
      )?.module ?? null
    : null;
  const selectedModuleName = selectedModule
    ? resolvedModuleNamesByTypeId[selectedModule.typeId] ??
      `Module type ${selectedModule.typeId}`
    : null;
  const selectedChargeName = selectedModule?.charge
    ? resolvedChargeNamesByTypeId[selectedModule.charge.typeId] ??
      `Charge type ${selectedModule.charge.typeId}`
    : null;
  const latestSavedFittingStatusRef = useRef(savedFittingStatus);
  const clearDragState = useCallback(() => {
    setDragOverSlot(null);
    setDragSource(null);
    setIsRemoveDragOver(false);
    setIsStageDragOver(false);
    setIsCargoDragOver(false);
  }, []);
  const clearImportedFitInteractions = useCallback(() => {
    cancelPendingOperation();
    clearDragState();
    browserRackBeforeReplacementRef.current = null;
    setDragError(null);
    setManipulationError(null);
    setModuleActionMode(null);
    setSelectedSlot(null);
  }, [cancelPendingOperation, clearDragState]);
  const openBrowserSection = useCallback((section: FittingBrowserSection) => {
    setOpenBrowserSections((current) => ({ ...current, [section]: true }));
  }, []);
  const restoreBrowserRackAfterReplacement = useCallback(() => {
    const previousRack = browserRackBeforeReplacementRef.current;

    if (previousRack) {
      setBrowserRack(previousRack);
      browserRackBeforeReplacementRef.current = null;
    }
  }, []);
  const clearSelectedSlot = useCallback(() => {
    cancelPendingOperation();
    clearDragState();
    restoreBrowserRackAfterReplacement();
    setDragError(null);
    setManipulationError(null);
    setModuleActionMode(null);
    setSelectedSlot(null);
  }, [cancelPendingOperation, clearDragState, restoreBrowserRackAfterReplacement]);
  const handleSelectHull = useCallback(
    (hull: FittingHullSummary) => {
      setResolvedChargeNamesByTypeId({});
      setResolvedModuleNamesByTypeId({});
      clearSelectedSlot();
      selectHull(hull);
    },
    [clearSelectedSlot, selectHull]
  );
  const handleApplyEftPreview = useCallback(
    (preview: EftPreviewResponse): FitOperationAttemptResult => {
      const result = applyEftPreview(preview, {
        clearTransientInteractionState: clearImportedFitInteractions
      });
      if (!result.ok) return result;

      const moduleNames: Record<number, string> = {};
      const chargeNames: Record<number, string> = {};
      for (const rack of ["low", "mid", "high", "rig"] as const) {
        for (const slot of preview.racks[rack]) {
          if (!slot.module) continue;
          moduleNames[slot.module.typeId] = slot.module.typeName;
          if (slot.module.charge) {
            chargeNames[slot.module.charge.typeId] = slot.module.charge.typeName;
          }
        }
      }
      setResolvedModuleNamesByTypeId(moduleNames);
      setResolvedChargeNamesByTypeId(chargeNames);
      editorAssociationEpochRef.current += 1;
      setSavedFittingEditor(
        createUnsavedFittingEditor(preview.fitName?.trim() || preview.hull?.typeName || "")
      );
      setSavedFittingConflict(null);
      setSavedFittingMessage({ text: "EFT import applied as an unsaved fitting.", tone: "info" });
      return result;
    },
    [applyEftPreview, clearImportedFitInteractions]
  );

  const updateSavedFittingSummary = useCallback((fitting: SavedFittingSummary) => {
    setSavedFittingLibrary((current) => {
      if (current.status === "unavailable") return current;

      return {
        ...current,
        fittings: [
          fitting,
          ...current.fittings.filter((candidate) => candidate.id !== fitting.id)
        ]
      };
    });
  }, []);

  const handleSaveFitting = useCallback(
    async (saveAs: boolean) => {
      if (savedFittingLibrary.status === "unavailable") {
        setSavedFittingMessage({ text: savedFittingLibrary.message, tone: "error" });
        return;
      }

      const snapshot = fitStateToSavedFittingSnapshotV1(fitState);
      if (!snapshot.ok) {
        setSavedFittingMessage({
          text: snapshot.diagnostics[0]?.message ?? "Select a hull before saving.",
          tone: "error"
        });
        return;
      }

      const name = savedFittingEditor.name.trim();
      if (!name) {
        setSavedFittingMessage({ text: "Enter a fitting name before saving.", tone: "error" });
        return;
      }

      setIsSavingFitting(true);
      const editorAssociationEpoch = editorAssociationEpochRef.current;
      setSavedFittingConflict(null);
      setSavedFittingMessage(null);

      const result = saveAs || !savedFittingEditor.savedFittingId || !savedFittingEditor.savedRevision
        ? await createSavedFittingAction({ name, snapshot: snapshot.value })
        : await updateSavedFittingAction({
            expectedRevision: savedFittingEditor.savedRevision,
            id: savedFittingEditor.savedFittingId,
            name,
            snapshot: snapshot.value
          });

      setIsSavingFitting(false);

      if (!result.ok) {
        if (editorAssociationEpoch !== editorAssociationEpochRef.current) return;
        if (result.code === "REVISION_CONFLICT" && savedFittingEditor.savedFittingId) {
          setSavedFittingConflict({
            fittingId: savedFittingEditor.savedFittingId,
            fittingName: name
          });
          return;
        }

        setSavedFittingMessage({ text: savedFittingFailureMessage(result), tone: "error" });
        return;
      }

      updateSavedFittingSummary(result.fitting);
      if (editorAssociationEpoch !== editorAssociationEpochRef.current) {
        setSavedFittingMessage({
          text: "The submitted snapshot was saved, but the newer editor state remains active.",
          tone: "info"
        });
        return;
      }

      setSavedFittingEditor(establishSavedFittingEditor({
        id: result.fitting.id,
        name: result.fitting.name,
        revision: result.fitting.revision,
        snapshot: result.fitting.snapshot
      }));
      setSavedFittingMessage({
        text: saveAs ? "Saved as a new personal fitting." : "Personal fitting saved.",
        tone: "success"
      });
    },
    [fitState, savedFittingEditor, savedFittingLibrary, updateSavedFittingSummary]
  );

  const applyLoadedSavedFitting = useCallback(
    (load: SuccessfulSavedFittingLoad) => {
      if (!load.application || !load.analysis || !load.editorBaseline) {
        setSavedFittingMessage({
          text: "This saved fitting contains blocking errors and cannot be loaded.",
          tone: "error"
        });
        return;
      }

      const result = applySavedFittingLoad(load, {
        clearTransientInteractionState: clearImportedFitInteractions
      });
      if (!result.ok) {
        setSavedFittingMessage({ text: result.message, tone: "error" });
        return;
      }

      const moduleNames: Record<number, string> = {};
      const chargeNames: Record<number, string> = {};
      for (const rack of ["low", "mid", "high", "rig"] as const) {
        for (const slot of load.racks[rack]) {
          if (!slot.module?.typeName) continue;
          moduleNames[slot.module.typeId] = slot.module.typeName;
          if (slot.module.charge?.typeName) {
            chargeNames[slot.module.charge.typeId] = slot.module.charge.typeName;
          }
        }
      }

      setResolvedModuleNamesByTypeId(moduleNames);
      setResolvedChargeNamesByTypeId(chargeNames);
      editorAssociationEpochRef.current += 1;
      setSavedFittingEditor(establishSavedFittingEditor({
        baselineFingerprint: load.editorBaseline.baselineFingerprint,
        id: load.editorBaseline.savedFittingId,
        name: load.savedFitting.name,
        revision: load.editorBaseline.savedRevision
      }));
      updateSavedFittingSummary({
        hullTypeId: load.hull?.typeId ?? load.application.hullTypeId,
        id: load.savedFitting.id,
        name: load.savedFitting.name,
        revision: load.savedFitting.revision,
        updatedAt: load.savedFitting.updatedAt
      });
      setPendingSavedFittingLoad(null);
      setSavedFittingConflict(null);
      setSavedFittingMessage({
        text: load.status === "review"
          ? "Saved fitting loaded with reviewed static-data changes."
          : "Saved fitting loaded.",
        tone: "success"
      });
    },
    [applySavedFittingLoad, clearImportedFitInteractions, updateSavedFittingSummary]
  );

  const handleLoadSavedFitting = useCallback(
    async (fitting: SavedFittingSummary) => {
      setBusySavedFittingId(fitting.id);
      setSavedFittingMessage(null);
      const result = await loadSavedFittingAction(fitting.id);
      setBusySavedFittingId(null);

      if (!result.ok) {
        setSavedFittingMessage({ text: savedFittingFailureMessage(result), tone: "error" });
        return;
      }

      const confirmReplacement =
        result.status === "review" ||
        (latestSavedFittingStatusRef.current.dirty &&
          (latestFitStateRef.current.hullTypeId !== null ||
            hasMeaningfulFitContent(latestFitStateRef.current)));

      if (result.status === "blocked" || confirmReplacement) {
        setPendingSavedFittingLoad({ confirmReplacement, load: result });
        return;
      }

      applyLoadedSavedFitting(result);
    },
    [applyLoadedSavedFitting]
  );

  const handleDeleteSavedFitting = useCallback(
    async (fitting: SavedFittingSummary) => {
      if (!window.confirm(`Delete saved fitting “${fitting.name}”? This cannot be undone.`)) {
        return;
      }

      setBusySavedFittingId(fitting.id);
      setSavedFittingMessage(null);
      const result = await deleteSavedFittingAction({
        expectedRevision: fitting.revision,
        id: fitting.id
      });
      setBusySavedFittingId(null);

      if (!result.ok) {
        if (result.code === "REVISION_CONFLICT") {
          setSavedFittingMessage({
            text: "This fitting changed elsewhere and was not deleted. Reload it before trying again.",
            tone: "error"
          });
        } else {
          setSavedFittingMessage({ text: savedFittingFailureMessage(result), tone: "error" });
        }
        return;
      }

      setSavedFittingLibrary((current) => current.status === "available"
        ? { ...current, fittings: current.fittings.filter((candidate) => candidate.id !== fitting.id) }
        : current);
      if (latestSavedFittingEditorRef.current.savedFittingId === fitting.id) {
        editorAssociationEpochRef.current += 1;
        setSavedFittingEditor(
          createUnsavedFittingEditor(latestSavedFittingEditorRef.current.name)
        );
        setSavedFittingConflict(null);
      }
      setSavedFittingMessage({ text: "Saved fitting deleted. The editor was left unchanged.", tone: "success" });
    },
    []
  );

  useEffect(() => {
    latestFitStateRef.current = fitState;
    latestSavedFittingEditorRef.current = savedFittingEditor;
    latestSavedFittingStatusRef.current = savedFittingStatus;
  }, [fitState, savedFittingEditor, savedFittingStatus]);
  const handleSelectSlot = useCallback(
    (slot: SelectedFittingSlot) => {
      if (
        selectedSlot?.rack === slot.rack &&
        selectedSlot.index === slot.index
      ) {
        clearSelectedSlot();
        return;
      }

      const fittedModule = fitState.slots[slot.rack].find(
        (candidate) => candidate.index === slot.index
      )?.module;

      restoreBrowserRackAfterReplacement();

      if (fittedModule) {
        openBrowserSection("charges");
      } else {
        setBrowserRack(slot.rack);
        openBrowserSection("modules");
      }

      setDragError(null);
      setManipulationError(null);
      setModuleActionMode(null);
      setSelectedSlot(slot);
    },
    [
      clearSelectedSlot,
      fitState.slots,
      openBrowserSection,
      restoreBrowserRackAfterReplacement,
      selectedSlot
    ]
  );
  const fitModuleAtSlot = useCallback(
    async (
      targetSlot: SelectedFittingSlot,
      typeId: number
    ): Promise<FitModuleAttemptResult> => {
      const result = await fitModule({ ...targetSlot, typeId });

      if (result.ok) {
        setResolvedModuleNamesByTypeId((currentNames) => ({
          ...currentNames,
          [result.module.typeId]: result.module.typeName
        }));
        clearSelectedSlot();
      }

      return result;
    },
    [clearSelectedSlot, fitModule]
  );
  const handleFitModule = useCallback(
    async (typeId: number): Promise<FitModuleAttemptResult> => {
      if (!selectedSlot) {
        return {
          message: "Select an empty socket before fitting a module.",
          ok: false
        };
      }

      return fitModuleAtSlot(selectedSlot, typeId);
    },
    [fitModuleAtSlot, selectedSlot]
  );
  const handleAutoFitModule = useCallback(
    async (
      module: Pick<FittingModuleSearchResult, "rack" | "typeId" | "typeName">
    ): Promise<FitModuleAttemptResult> => {
      const emptySlots = fitState.slots[module.rack]
        .filter((slot) => !slot.module)
        .map((slot) => ({ index: slot.index, rack: module.rack }))
        .sort((left, right) => left.index - right.index);

      if (!emptySlots.length) {
        return {
          message: `No empty ${module.rack} slots are available.`,
          ok: false
        };
      }

      let lastSlotError: FitModuleAttemptResult | null = null;

      for (const targetSlot of emptySlots) {
        const result = await fitModuleAtSlot(targetSlot, module.typeId);

        if (result.ok) {
          return result;
        }

        if (result.code !== "SLOT_OCCUPIED" && result.code !== "INVALID_SLOT") {
          return result;
        }

        lastSlotError = result;
      }

      return (
        lastSlotError ?? {
          message: `No empty ${module.rack} slot can accept ${module.typeName}.`,
          ok: false
        }
      );
    },
    [fitModuleAtSlot, fitState.slots]
  );
  const handleReplaceModule = useCallback(
    async (typeId: number): Promise<FitModuleAttemptResult> => {
      const targetSlot = selectedSlot;

      if (!targetSlot || !selectedModule) {
        return {
          message: "Select a fitted module before replacing it.",
          ok: false
        };
      }

      const result = await replaceModule({ ...targetSlot, typeId });

      if (result.ok) {
        setResolvedModuleNamesByTypeId((currentNames) => ({
          ...currentNames,
          [result.module.typeId]: result.module.typeName
        }));
        clearSelectedSlot();
      }

      return result;
    },
    [clearSelectedSlot, replaceModule, selectedModule, selectedSlot]
  );
  const handleRemoveModuleAt = useCallback(
    async (slot: SelectedFittingSlot): Promise<FitOperationAttemptResult> => {
      const fittedModule = fitState.slots[slot.rack].find(
        (candidate) => candidate.index === slot.index
      )?.module;

      if (!fittedModule) {
        return {
          message: "Select a fitted module before removing it.",
          ok: false
        };
      }

      const result = await removeModule(slot);

      if (result.ok) {
        setDragError(null);

        if (
          selectedSlot?.rack === slot.rack &&
          selectedSlot.index === slot.index
        ) {
          clearSelectedSlot();
        } else {
          setManipulationError(null);
        }
      } else {
        setDragError(result.message);
        setManipulationError(result.message);
      }

      return result;
    },
    [clearSelectedSlot, fitState.slots, removeModule, selectedSlot]
  );
  const handleRemoveModule = useCallback(async (): Promise<FitOperationAttemptResult> => {
    if (!selectedSlot || !selectedModule) {
      return {
        message: "Select a fitted module before removing it.",
        ok: false
      };
    }

    return handleRemoveModuleAt(selectedSlot);
  }, [handleRemoveModuleAt, selectedModule, selectedSlot]);
  const handleLoadChargeAt = useCallback(
    async (
      targetSlot: SelectedFittingSlot,
      chargeTypeId: number
    ): Promise<LoadChargeAttemptResult> => {
      const targetModule = fitState.slots[targetSlot.rack].find(
        (slot) => slot.index === targetSlot.index
      )?.module;
      if (!targetModule) {
        return {
          message: "Select a fitted module before loading a charge.",
          ok: false
        };
      }

      const result = await loadCharge(targetSlot, chargeTypeId);

      if (result.ok) {
        setResolvedChargeNamesByTypeId((currentNames) => ({
          ...currentNames,
          [result.charge.typeId]: result.charge.typeName
        }));
        setManipulationError(null);
      } else {
        setManipulationError(result.message);
      }

      return result;
    },
    [fitState.slots, loadCharge]
  );
  const handleLoadCharge = useCallback(
    async (chargeTypeId: number): Promise<LoadChargeAttemptResult> => {
      if (!selectedSlot || !selectedModule) {
        return {
          message: "Select a fitted module before loading a charge.",
          ok: false
        };
      }

      return handleLoadChargeAt(selectedSlot, chargeTypeId);
    },
    [handleLoadChargeAt, selectedModule, selectedSlot]
  );
  const handleUnloadCharge = useCallback((): FitOperationAttemptResult => {
    if (!selectedSlot || !selectedModule) {
      return {
        message: "Select a fitted module before unloading its charge.",
        ok: false
      };
    }

    const result = unloadCharge(selectedSlot);

    setManipulationError(result.ok ? null : result.message);
    return result;
  }, [selectedModule, selectedSlot, unloadCharge]);
  const handleStartMoveAt = useCallback(
    (slot: SelectedFittingSlot) => {
      restoreBrowserRackAfterReplacement();
      openBrowserSection("charges");
      setDragError(null);
      setManipulationError(null);
      setSelectedSlot(slot);
      setModuleActionMode("move");
    },
    [openBrowserSection, restoreBrowserRackAfterReplacement]
  );
  const handleStartReplaceAt = useCallback(
    (slot: SelectedFittingSlot) => {
      if (!browserRackBeforeReplacementRef.current) {
        browserRackBeforeReplacementRef.current = browserRack;
      }

      setBrowserRack(slot.rack);
      openBrowserSection("modules");
      setDragError(null);
      setManipulationError(null);
      setSelectedSlot(slot);
      setModuleActionMode("replace");
    },
    [browserRack, openBrowserSection]
  );
  const handleMoveTarget = useCallback(
    (target: SelectedFittingSlot) => {
      if (!selectedSlot || moduleActionMode !== "move") {
        return;
      }

      const result = moveModule({ from: selectedSlot, to: target });

      if (result.ok) {
        clearSelectedSlot();
      } else {
        setManipulationError(result.message);
      }
    },
    [clearSelectedSlot, moduleActionMode, moveModule, selectedSlot]
  );
  const handleBrowserDragStart = useCallback(
    (source: BrowserFittingDragSource) => {
      setDragError(null);
      setManipulationError(null);
      setDragSource(source);
    },
    []
  );
  const handleFittedModuleDragStart = useCallback(
    (source: Extract<FittingDragSource, { kind: "fitted-module" }>) => {
      setDragError(null);
      setManipulationError(null);
      setDragSource(source);
    },
    []
  );
  const handleDragOverSlot = useCallback((slot: SelectedFittingSlot | null) => {
    setDragOverSlot((currentSlot) =>
      currentSlot?.rack === slot?.rack && currentSlot?.index === slot?.index
        ? currentSlot
        : slot
    );
  }, []);
  const handleDropOnSlot = useCallback(
    async (target: SelectedFittingSlot) => {
      const source = dragSource;

      setDragOverSlot(null);
      setIsRemoveDragOver(false);

      if (!source) {
        return;
      }

      if (source.kind === "browser-module") {
        const result = await fitModuleAtSlot(target, source.typeId);

        if (!result.ok) {
          setDragError(result.message);
          clearDragState();
        }

        return;
      }

      if (source.kind === "browser-charge") {
        const result = await handleLoadChargeAt(target, source.typeId);
        if (!result.ok) {
          setDragError(result.message);
        }
        clearDragState();
        return;
      }

      if (source.kind === "browser-drone") {
        clearDragState();
        return;
      }

      if (source.kind === "browser-cargo") {
        const result = await addCargo(source.typeId);
        setDragError(result.ok ? null : result.message);
        clearDragState();
        return;
      }

      const result = moveModule({ from: source.from, to: target });

      if (result.ok) {
        clearSelectedSlot();
      } else {
        setDragError(result.message);
        clearDragState();
      }
    },
    [
      clearDragState,
      clearSelectedSlot,
      dragSource,
      fitModuleAtSlot,
      handleLoadChargeAt,
      addCargo,
      moveModule
    ]
  );
  const handleDropOnStage = useCallback(async () => {
    const source = dragSource;
    setIsStageDragOver(false);
    if (!source || source.kind === "fitted-module") {
      return;
    }

    if (source.kind === "browser-module") {
      const result = await handleAutoFitModule(source);
      if (!result.ok) {
        setDragError(result.message);
        clearDragState();
      }
      return;
    }

    if (source.kind === "browser-charge") {
      const result: BulkLoadChargeAttemptResult = await bulkLoadCharge(source.typeId);
      if (result.ok) {
        setResolvedChargeNamesByTypeId((currentNames) => ({
          ...currentNames,
          [result.chargeTypeId]: result.chargeTypeName
        }));
        setDragError(null);
      } else {
        setDragError(result.message);
      }
      clearDragState();
      return;
    }

    const result = source.kind === "browser-cargo"
      ? await addCargo(source.typeId)
      : await addDrone(source.typeId);
    setDragError(result.ok ? null : result.message);
    clearDragState();
  }, [
    addDrone,
    addCargo,
    bulkLoadCharge,
    clearDragState,
    dragSource,
    handleAutoFitModule
  ]);
  const handleDropOnCargo = useCallback(async () => {
    const source = dragSource;
    setIsCargoDragOver(false);

    if (!source || source.kind !== "browser-cargo") {
      return;
    }

    const result = await addCargo(source.typeId);
    setDragError(result.ok ? null : result.message);
    clearDragState();
  }, [addCargo, clearDragState, dragSource]);
  const handleDropOnRemove = useCallback(async () => {
    const source = dragSource;

    setIsRemoveDragOver(false);

    if (!source || source.kind !== "fitted-module") {
      return;
    }

    const result = await removeModule(source.from);

    if (result.ok) {
      clearSelectedSlot();
    } else {
      setDragError(result.message);
      clearDragState();
    }
  }, [clearDragState, clearSelectedSlot, dragSource, removeModule]);

  useEffect(() => {
    if (isEftDrawerOpen || isSimulationDrawerOpen || (!selectedSlot && !dragSource)) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelectedSlot();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelectedSlot, dragSource, isEftDrawerOpen, isSimulationDrawerOpen, selectedSlot]);

  return (
    <div className="fitting-shell" aria-labelledby="fitting-bay-title">
      <FittingHeader
        conflict={savedFittingConflict}
        fittingName={savedFittingEditor.name}
        isSaving={isSavingFitting}
        onFittingNameChange={(name) => {
          setSavedFittingEditor((current) => ({ ...current, name }));
          setSavedFittingMessage(null);
        }}
        onOpenEft={() => {
          setIsSimulationDrawerOpen(false);
          setIsEftDrawerOpen(true);
        }}
        onOpenSimulation={() => {
          setIsEftDrawerOpen(false);
          setIsSimulationDrawerOpen(true);
        }}
        onReloadConflict={() => {
          if (savedFittingLibrary.status !== "available" || !savedFittingConflict) return;
          const fitting = savedFittingLibrary.fittings.find(
            (candidate) => candidate.id === savedFittingConflict.fittingId
          );
          if (fitting) void handleLoadSavedFitting(fitting);
        }}
        onSave={() => void handleSaveFitting(false)}
        onSaveAs={() => void handleSaveFitting(true)}
        persistenceAvailable={savedFittingLibrary.status === "available"}
        persistenceMessage={savedFittingMessage}
        saveDisabled={fitState.hullTypeId === null || !savedFittingEditor.name.trim()}
        selectedHull={selectedHull}
        simulationState={simulationState}
        status={savedFittingStatus}
      />
      <div className="fitting-workspace-grid">
        <ItemBrowser
          activeSavedFittingId={savedFittingEditor.savedFittingId}
          activeSavedFittingIsDirty={savedFittingStatus.dirty}
          actionMode={moduleActionMode}
          browserRack={browserRack}
          busySavedFittingId={busySavedFittingId}
          cargoHoldAnalysis={cargoHoldAnalysis}
          droneBayAnalysis={droneBayAnalysis}
          dragSource={dragSource}
          hulls={hulls}
          manipulationError={manipulationError}
          onAutoFitModule={handleAutoFitModule}
          onAddCargo={addCargo}
          onAddDrone={addDrone}
          onClearSelectedSlot={clearSelectedSlot}
          onDecrementDrone={decrementDrone}
          onDeleteSavedFitting={(fitting) => void handleDeleteSavedFitting(fitting)}
          onFitModule={handleFitModule}
          onLoadCharge={handleLoadCharge}
          onLoadSavedFitting={(fitting) => void handleLoadSavedFitting(fitting)}
          onBrowserDragEnd={clearDragState}
          onBrowserDragStart={handleBrowserDragStart}
          onModuleRackChange={setBrowserRack}
          onRemoveModule={handleRemoveModule}
          onRemoveDrone={removeDrone}
          onReplaceModule={handleReplaceModule}
          onReturnToActions={() => {
            restoreBrowserRackAfterReplacement();
            setManipulationError(null);
            setModuleActionMode(null);
          }}
          onSelectHull={handleSelectHull}
          onStartMove={() => {
            if (selectedSlot) {
              handleStartMoveAt(selectedSlot);
            }
          }}
          onStartReplace={() => {
            if (selectedSlot) {
              handleStartReplaceAt(selectedSlot);
            }
          }}
          onToggleSection={(section) => {
            setOpenBrowserSections((current) => ({
              ...current,
              [section]: !current[section]
            }));
          }}
          onUnloadCharge={handleUnloadCharge}
          openSections={openBrowserSections}
          savedFittingLibrary={savedFittingLibrary}
          savedFittingMessage={savedFittingMessage}
          selectedHull={selectedHull}
          selectedChargeName={selectedChargeName}
          selectedModule={selectedModule}
          selectedModuleName={selectedModuleName}
          selectedSlot={selectedSlot}
        />
        <FittingStage
          analysis={analysis}
          dragError={dragError}
          dragOverSlot={dragOverSlot}
          dragSource={dragSource}
          isRemoveDragOver={isRemoveDragOver}
          isStageDragOver={isStageDragOver}
          chargeNamesByTypeId={resolvedChargeNamesByTypeId}
          moduleNamesByTypeId={resolvedModuleNamesByTypeId}
          moveSource={moduleActionMode === "move" ? selectedSlot : null}
          onClearSelectedSlot={clearSelectedSlot}
          onDragEnd={clearDragState}
          onDragOverSlot={handleDragOverSlot}
          onDropOnRemove={handleDropOnRemove}
          onDropOnSlot={handleDropOnSlot}
          onDropOnStage={handleDropOnStage}
          onFittedModuleDragStart={handleFittedModuleDragStart}
          onMoveTarget={handleMoveTarget}
          onRemoveModule={handleRemoveModuleAt}
          onRemoveDragOverChange={setIsRemoveDragOver}
          onStageDragOverChange={setIsStageDragOver}
          onSelectSlot={handleSelectSlot}
          onStartMove={handleStartMoveAt}
          onStartReplace={handleStartReplaceAt}
          selectedHull={selectedHull}
          selectedSlot={selectedSlot}
          slots={fitState.slots}
        />
        <FitStatistics
          cargoAnalysis={cargoHoldAnalysis}
          cargoWarnings={cargoWarnings}
          dragSource={dragSource}
          isCargoDragOver={isCargoDragOver}
          onAddCargo={addCargo}
          onCargoDragOverChange={setIsCargoDragOver}
          onClearCargo={clearCargo}
          onDecrementCargo={decrementCargo}
          onDropCargo={() => void handleDropOnCargo()}
          onRemoveCargo={removeCargo}
        />
      </div>
      <FittingResources
        analysis={analysis}
        droneBayUsedVolume={droneBayAnalysis.usedVolume}
        selectedHull={selectedHull}
        warnings={fitWarnings}
      />
      <EftDrawer
        currentFitName={savedFittingEditor.name}
        fitState={fitState}
        isOpen={isEftDrawerOpen}
        onApplyPreview={handleApplyEftPreview}
        onClose={() => setIsEftDrawerOpen(false)}
        onFitNameChange={(name) =>
          setSavedFittingEditor((current) => ({ ...current, name }))
        }
      />
      <CharacterSimulationDrawer
        isOpen={isSimulationDrawerOpen}
        onClose={() => setIsSimulationDrawerOpen(false)}
        onDisconnect={disconnectCharacterData}
        onRefreshSkills={refreshSkills}
        onSelectProfile={selectSimulationProfile}
        state={simulationState}
      />
      {pendingSavedFittingLoad ? (
        <SavedFittingLoadDialog
          confirmReplacement={pendingSavedFittingLoad.confirmReplacement}
          load={pendingSavedFittingLoad.load}
          onApply={() => applyLoadedSavedFitting(pendingSavedFittingLoad.load)}
          onClose={() => setPendingSavedFittingLoad(null)}
        />
      ) : null}
    </div>
  );
}

function savedFittingFailureMessage(result: {
  code: string;
  issues?: Array<{ message: string }>;
  message?: string;
  ok: false;
}) {
  if (result.code === "REVISION_CONFLICT") {
    return "This fitting changed elsewhere. Reload the saved version or use Save As.";
  }
  if (result.code === "INVALID_INPUT") {
    return result.issues?.[0]?.message ?? "The saved fitting input is invalid.";
  }
  if (result.code === "UNAVAILABLE") {
    return "That saved fitting is unavailable.";
  }

  return result.message ?? "Personal saved fittings are temporarily unavailable.";
}
