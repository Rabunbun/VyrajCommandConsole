"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CharacterSkillSnapshotSafeResult } from "@/lib/eve-sso/private/skills/types";
import type { PrivateEsiCredentialSafeStatus } from "@/lib/eve-sso/private/types";
import type { FitState } from "@/lib/fitting/fit-state";
import {
  collectSimulationSkillSources,
  createInitialFittingSimulationState,
  createSimulationAnalysisKey,
  createSimulationProfile,
  initializeFittingSimulationState,
  selectFittingSimulationProfile,
  type FittingSimulationBootstrap,
  type SimulationProfileMode
} from "@/lib/fitting/simulation";
import type {
  FittingSkillSource,
  SkillAnalysis
} from "@/lib/fitting/skills/types";

type SkillAnalysisResponse = {
  analysis: SkillAnalysis;
  sourceNames: Record<number, string>;
};

export function useFittingSimulation(
  fitState: FitState,
  bootstrap: FittingSimulationBootstrap
) {
  const [state, setState] = useState(() =>
    initializeFittingSimulationState(
      createInitialFittingSimulationState(),
      bootstrap
    )
  );
  const analysisRequestRef = useRef(0);
  const refreshRequestRef = useRef(0);
  const skipAnalysisKeyRef = useRef<string | null>(null);
  const modeRef = useRef(state.mode);
  const itemSources = useMemo(
    () =>
      collectSimulationSkillSources({
        cargo: [],
        drones: fitState.drones,
        hullTypeId: fitState.hullTypeId,
        slots: fitState.slots
      }),
    [fitState.drones, fitState.hullTypeId, fitState.slots]
  );
  const itemSourcesRef = useRef(itemSources);
  const analysisKey = createSimulationAnalysisKey({
    itemSources,
    linkedSnapshot: state.linkedSnapshot,
    mode: state.mode
  });

  modeRef.current = state.mode;
  itemSourcesRef.current = itemSources;

  useEffect(() => {
    if (state.isInitializing) {
      return;
    }

    if (skipAnalysisKeyRef.current === analysisKey) {
      skipAnalysisKeyRef.current = null;
      return;
    }

    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    const controller = new AbortController();

    setState((current) => ({ ...current, error: null, isAnalyzing: true }));
    void requestSkillAnalysis(state.mode, itemSources, controller.signal).then(
      (result) => {
        if (analysisRequestRef.current !== requestId) {
          return;
        }

        setState((current) =>
          result.ok
            ? {
                ...current,
                analysis: result.value.analysis,
                error: null,
                isAnalyzing: false,
                sourceNames: result.value.sourceNames
              }
            : {
                ...current,
                error: result.message,
                isAnalyzing: false
              }
        );
      }
    );

    return () => controller.abort();
  }, [analysisKey, itemSources, state.isInitializing, state.mode]);

  const selectProfile = useCallback((mode: SimulationProfileMode) => {
    analysisRequestRef.current += 1;
    modeRef.current = mode;
    setState((current) => selectFittingSimulationProfile(current, mode));
  }, []);

  const refreshSkills = useCallback(async () => {
    if (state.isRefreshing) {
      return;
    }

    const refreshId = refreshRequestRef.current + 1;
    refreshRequestRef.current = refreshId;
    analysisRequestRef.current += 1;
    setState((current) => ({ ...current, error: null, isRefreshing: true }));

    const snapshotResult = await requestSkillRefresh();

    if (refreshRequestRef.current !== refreshId) {
      return;
    }

    if (!snapshotResult.ok) {
      setState((current) => {
        const linkedSnapshot = markSnapshotStale(current.linkedSnapshot);

        return {
          ...current,
          error: snapshotResult.message,
          isRefreshing: false,
          linkedSnapshot,
          profile: createSimulationProfile(current.mode, linkedSnapshot)
        };
      });
      return;
    }

    const currentMode = modeRef.current;
    const analysisSources = itemSourcesRef.current;
    const [connection, analysisResult] = await Promise.all([
      requestPrivateEsiStatus(),
      currentMode === "linked-character"
        ? requestSkillAnalysis(
            "linked-character",
            analysisSources
          )
        : Promise.resolve(null)
    ]);

    if (refreshRequestRef.current !== refreshId) {
      return;
    }

    const sourcesRemainCurrent =
      JSON.stringify(itemSourcesRef.current) === JSON.stringify(analysisSources);

    if (
      modeRef.current === currentMode &&
      sourcesRemainCurrent &&
      currentMode === "linked-character" &&
      analysisResult?.ok
    ) {
      skipAnalysisKeyRef.current = createSimulationAnalysisKey({
        itemSources: analysisSources,
        linkedSnapshot: snapshotResult.value,
        mode: currentMode
      });
    }

    setState((current) => {
      const mode = current.mode;
      const linkedAnalysis =
        mode === currentMode &&
        sourcesRemainCurrent &&
        mode === "linked-character" &&
        analysisResult?.ok
          ? analysisResult.value
          : null;

      return {
        ...current,
        ...(linkedAnalysis
          ? {
              analysis: linkedAnalysis.analysis,
              sourceNames: linkedAnalysis.sourceNames
            }
          : {}),
        connection,
        error:
          analysisResult && !analysisResult.ok
            ? analysisResult.message
            : null,
        isAnalyzing: false,
        isRefreshing: false,
        linkedSnapshot: snapshotResult.value,
        profile: createSimulationProfile(mode, snapshotResult.value)
      };
    });
  }, [state.isRefreshing]);

  const disconnect = useCallback(async () => {
    if (state.isRefreshing) {
      return;
    }

    setState((current) => ({ ...current, error: null, isRefreshing: true }));

    try {
      const response = await fetch("/api/auth/eve/private/disconnect", {
        cache: "no-store",
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Character data could not be disconnected.");
      }

      const connection = await requestPrivateEsiStatus();
      analysisRequestRef.current += 1;
      setState((current) => ({
        ...current,
        analysis: current.mode === "linked-character" ? null : current.analysis,
        connection,
        isRefreshing: false,
        linkedSnapshot: null,
        profile: createSimulationProfile(current.mode, null),
        sourceNames: current.mode === "linked-character" ? {} : current.sourceNames
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Character data could not be disconnected.",
        isRefreshing: false
      }));
    }
  }, [state.isRefreshing]);

  return {
    disconnect,
    refreshSkills,
    selectProfile,
    state
  };
}

function markSnapshotStale(
  value: CharacterSkillSnapshotSafeResult | null
): CharacterSkillSnapshotSafeResult | null {
  return value?.snapshot
    ? {
        ...value,
        snapshot: { ...value.snapshot, stale: true },
        status: "stale"
      }
    : value;
}

async function requestPrivateEsiStatus() {
  try {
    const response = await fetch("/api/auth/eve/private/status", {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PrivateEsiCredentialSafeStatus;
  } catch {
    return null;
  }
}

async function requestSkillRefresh(): Promise<
  | { message: string; ok: false }
  | { ok: true; value: CharacterSkillSnapshotSafeResult }
> {
  try {
    const response = await fetch("/api/auth/eve/private/skills", {
      cache: "no-store",
      method: "POST"
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      return { message: "Character skills could not be refreshed.", ok: false };
    }

    return { ok: true, value: payload as CharacterSkillSnapshotSafeResult };
  } catch {
    return { message: "Character skills could not be refreshed.", ok: false };
  }
}

async function requestSkillAnalysis(
  profileMode: SimulationProfileMode,
  itemSources: FittingSkillSource[],
  signal?: AbortSignal
): Promise<
  | { message: string; ok: false }
  | { ok: true; value: SkillAnalysisResponse }
> {
  try {
    const response = await fetch("/api/fitting/skills", {
      body: JSON.stringify({ itemSources, profileMode }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal
    });
    const payload = await response.json().catch(() => null) as
      | SkillAnalysisResponse
      | { error?: unknown }
      | null;

    if (!response.ok || !isSkillAnalysisResponse(payload)) {
      return {
        message:
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Skill analysis is temporarily unavailable.",
        ok: false
      };
    }

    return { ok: true, value: payload };
  } catch (error) {
    return {
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "Skill analysis was superseded."
          : "Skill analysis is temporarily unavailable.",
      ok: false
    };
  }
}

function isSkillAnalysisResponse(value: unknown): value is SkillAnalysisResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("analysis" in value) ||
    !("sourceNames" in value)
  ) {
    return false;
  }

  const analysis = value.analysis;
  const sourceNames = value.sourceNames;

  if (!analysis || typeof analysis !== "object") {
    return false;
  }

  return (
    "diagnostics" in analysis &&
    "missingCount" in analysis &&
    "requirements" in analysis &&
    "status" in analysis &&
    Array.isArray(analysis.diagnostics) &&
    typeof analysis.missingCount === "number" &&
    Array.isArray(analysis.requirements) &&
    ["met", "missing", "unavailable"].includes(String(analysis.status)) &&
    Boolean(sourceNames) &&
    typeof sourceNames === "object" &&
    !Array.isArray(sourceNames)
  );
}
