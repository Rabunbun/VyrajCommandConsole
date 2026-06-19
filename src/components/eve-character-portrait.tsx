"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ModuleIcon } from "@/components/module-visuals";

type EveCharacterPortraitProps = {
  characterId?: string | null;
  characterName: string;
  className?: string;
  size?: 64 | 128;
};

export function EveCharacterPortrait({
  characterId,
  characterName,
  className = "",
  size = 64
}: EveCharacterPortraitProps) {
  const [failed, setFailed] = useState(false);
  const hasPortrait = Boolean(characterId) && !failed;

  return (
    <span
      aria-label={
        hasPortrait
          ? `${characterName} EVE portrait`
          : `${characterName} capsuleer portrait unavailable`
      }
      className={`character-portrait ${className}`.trim()}
      role="img"
    >
      {hasPortrait ? (
        <img
          alt=""
          height={size}
          onError={() => setFailed(true)}
          src={`https://images.evetech.net/characters/${characterId}/portrait?size=${size}`}
          width={size}
        />
      ) : (
        <ModuleIcon name="identity" size={Math.round(size * 0.42)} />
      )}
    </span>
  );
}
