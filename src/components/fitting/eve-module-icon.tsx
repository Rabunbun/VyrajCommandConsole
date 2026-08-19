"use client";

import Image from "next/image";
import { useState } from "react";
import { ModuleIcon } from "@/components/module-visuals";

type EveModuleIconProps = {
  typeId: number;
  typeName: string;
  variant?: "result" | "slot";
};

export function EveModuleIcon({
  typeId,
  typeName,
  variant = "result"
}: EveModuleIconProps) {
  const [failedTypeId, setFailedTypeId] = useState<number | null>(null);
  const iconSize = variant === "slot" ? 32 : 44;
  const iconClassName =
    variant === "slot" ? "fitting-slot-module-icon" : "fitting-module-icon";
  const fallbackClassName =
    variant === "slot"
      ? "fitting-slot-module-icon-fallback"
      : "fitting-module-icon-fallback";

  if (failedTypeId === typeId) {
    return (
      <span
        aria-label={`${typeName} icon unavailable`}
        className={fallbackClassName}
        role="img"
      >
        <ModuleIcon name="doctrine" size={variant === "slot" ? 16 : 20} />
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
