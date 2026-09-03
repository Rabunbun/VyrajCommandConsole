"use client";

import { useCallback, useEffect, useRef } from "react";
import { EveCharacterPortrait } from "@/components/eve-character-portrait";
import {
  formatSkillLevel,
  formatSkillSourceLabel,
  getMissingSkillRequirements,
  getSimulationProfileLabel,
  getSimulationWarningSummary,
  type FittingSimulationState,
  type SimulationProfileMode
} from "@/lib/fitting/simulation";

type CharacterSimulationDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onDisconnect: () => Promise<void>;
  onRefreshSkills: () => Promise<void>;
  onSelectProfile: (mode: SimulationProfileMode) => void;
  state: FittingSimulationState;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

export function CharacterSimulationDrawer({
  isOpen,
  onClose,
  onDisconnect,
  onRefreshSkills,
  onSelectProfile,
  state
}: CharacterSimulationDrawerProps) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeDrawer = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    drawerRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [closeDrawer, isOpen]);

  if (!isOpen) {
    return null;
  }

  const warning = getSimulationWarningSummary(state);
  const missingRequirements = getMissingSkillRequirements(state.analysis);
  const characterId =
    state.linkedSnapshot?.characterId ?? state.connection?.characterId ?? null;
  const characterName =
    state.linkedSnapshot?.characterName ??
    state.connection?.characterName ??
    "Linked Character";
  const connectionStatus = state.connection?.status ?? "unavailable";
  const canRefresh =
    connectionStatus === "connected" && !state.isRefreshing;
  const canDisconnect = Boolean(state.connection) && connectionStatus !== "not-connected";

  return (
    <div
      className="eft-drawer-layer"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          closeDrawer();
        }
      }}
      role="presentation"
    >
      <aside
        aria-label="Character and Simulation"
        aria-modal="true"
        className="character-simulation-drawer"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="eft-drawer-header">
          <div>
            <span className="eyebrow">Requirement Simulation</span>
            <h2>Character / Simulation</h2>
          </div>
          <button className="secondary-button" onClick={closeDrawer} type="button">
            Close
          </button>
        </header>

        <div className="character-simulation-body">
          <section className="character-simulation-section" aria-labelledby="simulation-profile-heading">
            <div className="character-simulation-section-heading">
              <div>
                <span className="eyebrow">Profile</span>
                <h3 id="simulation-profile-heading">Requirement Source</h3>
              </div>
              <span className="simulation-status-badge" data-tone={warning.tone}>
                {warning.label}
              </span>
            </div>

            <div className="simulation-profile-options" role="radiogroup" aria-label="Simulation profile">
              <button
                aria-checked={state.mode === "linked-character"}
                className="simulation-profile-option"
                data-selected={state.mode === "linked-character"}
                disabled={!state.linkedSnapshot?.snapshot}
                onClick={() => onSelectProfile("linked-character")}
                role="radio"
                type="button"
              >
                <span>Linked Character</span>
                <small>{state.linkedSnapshot?.snapshot ? characterName : "Not connected / unavailable"}</small>
              </button>
              <button
                aria-checked={state.mode === "all-v"}
                className="simulation-profile-option"
                data-selected={state.mode === "all-v"}
                onClick={() => onSelectProfile("all-v")}
                role="radio"
                type="button"
              >
                <span>All V</span>
                <small>Virtual requirement profile</small>
              </button>
            </div>
          </section>

          <section className="character-simulation-section" aria-labelledby="linked-character-heading">
            <div className="linked-character-summary">
              <EveCharacterPortrait
                characterId={characterId}
                characterName={characterName}
                className="simulation-character-portrait"
                size={64}
              />
              <div>
                <span className="eyebrow">Linked Character</span>
                <h3 id="linked-character-heading">{characterName}</h3>
                <p>{connectionLabel(connectionStatus, Boolean(state.connection))}</p>
              </div>
            </div>

            <dl className="simulation-metadata">
              <div>
                <dt>Selected</dt>
                <dd>{getSimulationProfileLabel(state)}</dd>
              </div>
              <div>
                <dt>Last checked</dt>
                <dd>{formatDate(state.linkedSnapshot?.checkedAt)}</dd>
              </div>
              <div>
                <dt>Snapshot fetched</dt>
                <dd>{formatDate(state.linkedSnapshot?.fetchedAt)}</dd>
              </div>
              <div>
                <dt>Snapshot</dt>
                <dd>
                  {state.linkedSnapshot?.snapshot
                    ? state.linkedSnapshot.snapshot.stale
                      ? "Stale — last known data"
                      : "Current"
                    : "Unavailable"}
                </dd>
              </div>
            </dl>

            <div className="simulation-actions">
              {connectionStatus === "not-connected" ? (
                <a className="command-button" href="/api/auth/eve/private/start">
                  Connect Character Data
                </a>
              ) : null}
              {connectionStatus === "reauthorization-required" || connectionStatus === "revoked" ? (
                <a className="command-button" href="/api/auth/eve/private/start">
                  Reauthorize
                </a>
              ) : null}
              {!state.connection ? (
                <a className="secondary-button" href="/login">
                  Login to Connect
                </a>
              ) : null}
              {connectionStatus === "connected" ? (
                <button
                  className="command-button"
                  disabled={!canRefresh}
                  onClick={() => void onRefreshSkills()}
                  type="button"
                >
                  {state.isRefreshing ? "Updating…" : "Refresh Skills"}
                </button>
              ) : null}
              {canDisconnect ? (
                <button
                  className="secondary-button"
                  disabled={state.isRefreshing}
                  onClick={() => void onDisconnect()}
                  type="button"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
            {state.error ? <p className="simulation-error" role="status">{state.error}</p> : null}
          </section>

          <section className="character-simulation-section" aria-labelledby="skill-analysis-heading">
            <div className="character-simulation-section-heading">
              <div>
                <span className="eyebrow">Skill Analysis</span>
                <h3 id="skill-analysis-heading">Fitting Requirements</h3>
              </div>
              {state.isAnalyzing || state.isRefreshing ? (
                <span className="simulation-updating">Updating…</span>
              ) : null}
            </div>

            {!state.analysis || state.analysis.status === "unavailable" ? (
              <div className="simulation-empty" data-tone="unavailable">
                Skill requirements are unavailable for the selected profile. No missing skills were inferred.
              </div>
            ) : missingRequirements.length === 0 ? (
              <div className="simulation-empty" data-tone="success">
                All known direct fitting requirements are met.
              </div>
            ) : (
              <div className="missing-skill-list">
                {missingRequirements.map((requirement) => (
                  <article className="missing-skill-card" key={requirement.skillTypeId}>
                    <div className="missing-skill-heading">
                      <h4>
                        {requirement.skillName} {formatSkillLevel(requirement.requiredLevel)}
                      </h4>
                      <span>Active {formatSkillLevel(requirement.activeLevel)}</span>
                    </div>
                    {requirement.trainedLevel !== requirement.activeLevel ? (
                      <p>Trained: {formatSkillLevel(requirement.trainedLevel)}</p>
                    ) : null}
                    <div className="missing-skill-sources">
                      <span>Required by</span>
                      <ul>
                        {requirement.contributingSources.map((contribution, index) => (
                          <li key={sourceKey(contribution.source, index)}>
                            {formatSkillSourceLabel(contribution.source, state.sourceNames)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <p className="simulation-scope-note">
            This profile drives fitting requirements and effective CPU and powergrid.
            Other effective statistics remain deferred.
          </p>
        </div>
      </aside>
    </div>
  );
}

function connectionLabel(
  status: "connected" | "not-connected" | "reauthorization-required" | "revoked" | "unavailable",
  hasAuthorizedIdentity: boolean
) {
  if (!hasAuthorizedIdentity) {
    return "Login required for private character data";
  }

  switch (status) {
    case "connected":
      return "Private skill access connected";
    case "not-connected":
      return "Character data not connected";
    case "reauthorization-required":
      return "Reauthorization required";
    case "revoked":
      return "Authorization revoked";
    case "unavailable":
      return "Character data unavailable";
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : `${dateFormatter.format(date)} UTC`;
}

function sourceKey(
  source: {
    instanceId?: string;
    kind: string;
    slotIndex?: number;
    typeId: number;
  },
  index: number
) {
  return `${source.kind}:${source.typeId}:${source.instanceId ?? ""}:${source.slotIndex ?? ""}:${index}`;
}
