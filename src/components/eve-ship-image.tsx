"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ModuleIcon } from "@/components/module-visuals";

type EveShipImageProps = {
  alt?: string;
  className?: string;
  fallbackLabel?: string;
  iconUrl?: string;
  renderUrl: string;
};

export function EveShipImage({
  alt = "",
  className,
  fallbackLabel = "?",
  iconUrl,
  renderUrl
}: EveShipImageProps) {
  const [src, setSrc] = useState(renderUrl);
  const [didFallback, setDidFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="doctrine-ship-placeholder" aria-label={alt} role="img">
        <ModuleIcon name="ship" size={28} />
        <span className="visually-hidden">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className={className}
      onError={() => {
        if (iconUrl && !didFallback) {
          setSrc(iconUrl);
          setDidFallback(true);
        } else {
          setFailed(true);
        }
      }}
      src={src}
    />
  );
}
