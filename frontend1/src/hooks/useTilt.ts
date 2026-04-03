import { useState, useCallback } from "react";
import type { MouseEvent } from "react";

export function useTilt(maxTilt = 8) {
  const [tiltStyle, setTiltStyle] = useState({});

  const onMouseMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
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
    [maxTilt]
  );

  const onMouseLeave = useCallback(() => {
    setTiltStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      transition: "transform 0.5s ease-out",
    });
  }, []);

  return { tiltStyle, onMouseMove, onMouseLeave };
}
