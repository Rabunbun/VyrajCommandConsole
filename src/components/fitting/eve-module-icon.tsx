"use client";

import Image from "next/image";
import { useState } from "react";
import { ModuleIcon } from "@/components/module-visuals";

type EveModuleIconProps = {
  typeId: number;
  typeName: string;
  variant?: "charge" | "result" | "slot";
};

export function EveModuleIcon({
  typeId,
  typeName,
  variant = "result"
}: EveModuleIconProps) {
  const [failedTypeId, setFailedTypeId] = useState<number | null>(null);
  const iconSize = variant === "charge" ? 14 : variant === "slot" ? 32 : 44;
  const iconClassName = getIconClassName(variant, false);
  const fallbackClassName = getIconClassName(variant, true);

  if (failedTypeId === typeId) {
    return (
      <span
        aria-label={`${typeName} icon unavailable`}
        className={fallbackClassName}
        role="img"
      >
        <ModuleIcon
          name="doctrine"
          size={variant === "charge" ? 8 : variant === "slot" ? 16 : 20}
        />
      </span>
    );
  }

  return (
    <Image
      alt=""
      className={iconClassName}
      height={iconSize}
      onError={() => setFailedTypeId(typeId)}
      src={`https://images.evetech.net/types/${typeId}/icon?size=64`}
      width={iconSize}
    />
  );
}

function getIconClassName(
  variant: NonNullable<EveModuleIconProps["variant"]>,
  fallback: boolean
) {
  if (variant === "charge") {
    return fallback
      ? "fitting-slot-charge-icon-fallback"
      : "fitting-slot-charge-icon";
  }

  if (variant === "slot") {
    return fallback
      ? "fitting-slot-module-icon-fallback"
      : "fitting-slot-module-icon";
  }

  return fallback ? "fitting-module-icon-fallback" : "fitting-module-icon";
}
