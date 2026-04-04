import { useState, useCallback } from "react";
import type { MouseEvent } from "react";
import { useAnimation } from "../contexts/AnimationContext";

export function useTilt(maxTilt = 8) {
  const [tiltStyle, setTiltStyle] = useState({});
  const { animationsEnabled } = useAnimation();

  const onMouseMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (!animationsEnabled) return;
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      
      const tiltX = ((y - cy) / cy) * -maxTilt;
      const tiltY = ((x - cx) / cx) * maxTilt;
      
      setTiltStyle({
        transform: `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`,
        transition: "transform 0.1s ease-out",
      });
    },
    [maxTilt, animationsEnabled]
  );

  const onMouseLeave = useCallback(() => {
    if (!animationsEnabled) {
      setTiltStyle({ transform: "none" });
      return;
    }
    setTiltStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      transition: "transform 0.5s ease-out",
    });
  }, [animationsEnabled]);

  return { tiltStyle, onMouseMove, onMouseLeave };
}
