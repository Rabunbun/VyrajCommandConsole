import "server-only";

import { getEveSsoServerConfig } from "@/lib/eve-sso/config";
import {
  CharacterSkillSyncError,
  type CharacterSkillCacheMetadata,
  type CharacterSkillsConditionalResponse
} from "./types";
import type { PrivateEsiActor } from "../types";

const requestTimeoutMs = 10_000;

export function fetchCharacterSkills(input: {
  accessToken: string;
  actor: PrivateEsiActor;
  validators: CharacterSkillCacheMetadata | null;
}) {
  return fetchPrivateCharacterData({
    ...input,
    endpoint: "skills",
    path: `/latest/characters/${encodeURIComponent(input.actor.characterId)}/skills/`
  });
}

export function fetchCharacterSkillQueue(input: {
  accessToken: string;
  actor: PrivateEsiActor;
  validators: CharacterSkillCacheMetadata | null;
}) {
  return fetchPrivateCharacterData({
    ...input,
    endpoint: "queue",
    path: `/latest/characters/${encodeURIComponent(input.actor.characterId)}/skillqueue/`
  });
}

async function fetchPrivateCharacterData(input: {
  accessToken: string;
  actor: PrivateEsiActor;
  endpoint: "queue" | "skills";
  path: string;
  validators: CharacterSkillCacheMetadata | null;
}): Promise<CharacterSkillsConditionalResponse> {
  if (!/^\d+$/.test(input.actor.characterId)) {
    throw requestError(input.endpoint, "The bound EVE character ID is invalid.");
  }

  const config = getEveSsoServerConfig();
  const url = new URL(input.path, `${config.esiBaseUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("datasource", "tranquility");

  if (config.esiCompatibilityDate) {
    url.searchParams.set("compatibility_date", config.esiCompatibilityDate);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${input.accessToken}`,
    "User-Agent": "VyrajCommandConsoleV2 private character skill synchronization"
  };

  if (config.esiCompatibilityDate) {
    headers["X-Compatibility-Date"] = config.esiCompatibilityDate;
  }

  if (input.validators?.etag) {
    headers["If-None-Match"] = input.validators.etag;
  }

  if (input.validators?.lastModified) {
    headers["If-Modified-Since"] = input.validators.lastModified;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers,
      signal: controller.signal
    });
    const metadata = readMetadata(response.headers);

    if (response.status === 304) {
      return { kind: "not-modified", metadata };
    }

    if (!response.ok) {
      throw requestError(
        input.endpoint,
        `Private ESI ${input.endpoint} request failed with status ${response.status}.`,
        response.status
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw requestError(
        input.endpoint,
        `Private ESI ${input.endpoint} returned invalid JSON.`,
        response.status
      );
    }

    return { kind: "modified", metadata, payload };
  } catch (error) {
    if (error instanceof CharacterSkillSyncError) {
      throw error;
    }

    throw requestError(
      input.endpoint,
      error instanceof Error
        ? `Private ESI ${input.endpoint} request failed: ${error.name}.`
        : `Private ESI ${input.endpoint} request failed.`
    );
  } finally {
    clearTimeout(timeout);
  }
}

function readMetadata(headers: Headers): CharacterSkillCacheMetadata {
  return {
    cacheControl: headers.get("cache-control"),
    etag: headers.get("etag"),
    lastModified: headers.get("last-modified")
  };
}

function requestError(
  endpoint: "queue" | "skills",
  message: string,
  httpStatus?: number
) {
  return new CharacterSkillSyncError(
    endpoint === "skills"
      ? "ESI_SKILLS_REQUEST_FAILED"
      : "ESI_QUEUE_REQUEST_FAILED",
    message,
    httpStatus
  );
}

