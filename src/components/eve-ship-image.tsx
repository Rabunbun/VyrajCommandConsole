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

type ImageState = {
  didFallback: boolean;
  failed: boolean;
  iconUrl?: string;
  renderUrl: string;
  src: string;
};

export function EveShipImage({
  alt = "",
  className,
  fallbackLabel = "?",
  iconUrl,
  renderUrl
}: EveShipImageProps) {
  const [imageState, setImageState] = useState<ImageState>(() =>
    createImageState(renderUrl, iconUrl)
  );
  const currentImageState =
    imageState.renderUrl === renderUrl && imageState.iconUrl === iconUrl
      ? imageState
      : createImageState(renderUrl, iconUrl);

  if (currentImageState.failed) {
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
        if (iconUrl && !currentImageState.didFallback) {
          setImageState({
            didFallback: true,
            failed: false,
            iconUrl,
            renderUrl,
            src: iconUrl
          });
        } else {
          setImageState({
            ...currentImageState,
            failed: true
          });
        }
      }}
      src={currentImageState.src}
    />
  );
}

function createImageState(renderUrl: string, iconUrl?: string): ImageState {
  return {
    didFallback: false,
    failed: false,
    iconUrl,
    renderUrl,
    src: renderUrl
  };
}
