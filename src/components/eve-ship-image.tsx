"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

type EveShipImageProps = {
  alt?: string;
  className?: string;
  iconUrl?: string;
  renderUrl: string;
};

export function EveShipImage({
  alt = "",
  className,
  iconUrl,
  renderUrl
}: EveShipImageProps) {
  const [src, setSrc] = useState(renderUrl);
  const [didFallback, setDidFallback] = useState(false);

  return (
    <img
      alt={alt}
      className={className}
      onError={() => {
        if (iconUrl && !didFallback) {
          setSrc(iconUrl);
          setDidFallback(true);
        }
      }}
      src={src}
    />
  );
}
