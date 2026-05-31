"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type { Group } from "three";

type WorldLabelTone = "default" | "city" | "repo" | "banner";

function labelToneClass(tone: WorldLabelTone) {
  if (tone === "city") return "border border-copper/70 bg-[#14252a]/95 text-xs font-semibold text-white";
  if (tone === "banner") {
    return "border border-[#f0c45b]/80 bg-[#203844]/95 px-3 py-1.5 text-sm font-bold tracking-wide text-white";
  }
  if (tone === "repo") {
    return "border border-[#f0c45b]/60 bg-[#14252a]/95 text-[9px] font-semibold text-stone-50";
  }
  return "border border-white/20 bg-[#14252a]/90 text-[10px] font-medium text-stone-100";
}

export function WorldLabel({
  position,
  children,
  tone = "default",
  maxDistance = 18
}: {
  position: [number, number, number];
  children: ReactNode;
  tone?: WorldLabelTone;
  maxDistance?: number;
}) {
  const anchor = useRef<Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!anchor.current || !label.current) return;
    label.current.style.display =
      camera.position.distanceTo(anchor.current.getWorldPosition(camera.position.clone())) <= maxDistance
        ? "block"
        : "none";
  });

  return (
    <group ref={anchor} position={position}>
      <Html center zIndexRange={[6, 4]}>
        <div
          ref={label}
          className={`pointer-events-none max-w-36 truncate whitespace-nowrap rounded px-2 py-1 text-center shadow-lg ${labelToneClass(
            tone
          )}`}
        >
          {children}
        </div>
      </Html>
    </group>
  );
}
