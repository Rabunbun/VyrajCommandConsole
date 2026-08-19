"use client";

import Image from "next/image";
import { useState } from "react";
import { ModuleIcon } from "@/components/module-visuals";

type EveModuleIconProps = {
  typeId: number;
  typeName: string;
};

export function EveModuleIcon({ typeId, typeName }: EveModuleIconProps) {
  const [failedTypeId, setFailedTypeId] = useState<number | null>(null);

  if (failedTypeId === typeId) {
    return (
      <span
        aria-label={`${typeName} icon unavailable`}
        className="fitting-module-icon-fallback"
        role="img"
      >
        <ModuleIcon name="doctrine" size={20} />
      </span>
    );
  }

  return (
    <Image
      alt=""
      className="fitting-module-icon"
      height={44}
      onError={() => setFailedTypeId(typeId)}
      src={`https://images.evetech.net/types/${typeId}/icon?size=64`}
      width={44}
    />
  );
}
