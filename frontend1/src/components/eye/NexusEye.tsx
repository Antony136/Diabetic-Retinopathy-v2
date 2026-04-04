import { useState, useEffect } from "react";
import { useMousePosition } from "../../hooks/useMousePosition";

/**
 * NEXUS-style Eye with blink animation.
 * Properly centered: viewBox 0 0 400 300, eye centered at (200, 150).
 * Blinks periodically like the reference template.
 */
export default function NexusEye({ size = 400 }: { size?: number }) {
  const { x, y } = useMousePosition();
  const [blinkPhase, setBlinkPhase] = useState(0); // 0 = open, 1 = closing, 2 = closed, 3 = opening

  const centerX = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
  const centerY = typeof window !== "undefined" ? window.innerHeight / 2 : 0;

  const limit = 6;
  const moveX = Math.min(Math.max((x - centerX) / 80, -limit), limit);
  const moveY = Math.min(Math.max((y - centerY) / 80, -limit), limit);

  // Blink every 3-5 seconds
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 2000;
      return setTimeout(() => {
        setBlinkPhase(1); // closing
        setTimeout(() => {
          setBlinkPhase(2); // closed
          setTimeout(() => {
            setBlinkPhase(3); // opening
            setTimeout(() => {
              setBlinkPhase(0); // open
            }, 120);
          }, 80);
        }, 120);
      }, delay);
    };

    let timer = scheduleBlink();
    const interval = setInterval(() => {
      clearTimeout(timer);
      timer = scheduleBlink();
    }, 5000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // Eyelid close amount: 0 = fully open, 1 = fully closed
  const blinkAmount =
    blinkPhase === 0 ? 0 :
    blinkPhase === 1 ? 0.85 :
    blinkPhase === 2 ? 1 :
    blinkPhase === 3 ? 0.3 : 0;

  const cx = 200;
  const cy = 150;

  // Generate iris rays
  const rayCount = 36;
  const rays = Array.from({ length: rayCount }, (_, i) => {
    const angle = (i / rayCount) * Math.PI * 2;
    const innerR = 30;
    const outerR = 60;
    return {
      x1: cx + Math.cos(angle) * innerR,
      y1: cy + Math.sin(angle) * innerR,
      x2: cx + Math.cos(angle) * outerR,
      y2: cy + Math.sin(angle) * outerR,
    };
  });

  // Dynamic eyelid paths based on blink amount
  // When blinkAmount = 0, lids are wide open. When 1, they meet at center (cy)
  const topLidY = 20 + blinkAmount * 100;   // moves down from 20 to 120
  const botLidY = 280 - blinkAmount * 100;   // moves up from 280 to 180

  const eyePath = `M 30 150 Q 200 ${topLidY} 370 150 Q 200 ${botLidY} 30 150 Z`;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size * 0.75 }}>
      <svg
        viewBox="0 0 400 300"
        className="w-full h-full"
      >
        <defs>
          <radialGradient id="nxIrisGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a0a2e" />
            <stop offset="40%" stopColor="#5efdba" stopOpacity="0.25" />
            <stop offset="80%" stopColor="#C87CFF" stopOpacity="0.15" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="nxPupilGrad" cx="45%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#0a0a0a" />
            <stop offset="80%" stopColor="#1a0a2e" />
            <stop offset="100%" stopColor="#2E183D" />
          </radialGradient>
          <radialGradient id="nxGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C87CFF" stopOpacity="0.3" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <clipPath id="eyeClip">
            <path d={eyePath} />
          </clipPath>
        </defs>

        {/* Ambient glow behind the eye */}
        <ellipse cx={cx} cy={cy} rx="120" ry="90" fill="url(#nxGlow)" opacity="0.5" />

        {/* Eyelid shape — almond outline (dynamic) */}
        <path
          d={eyePath}
          fill="rgba(8,5,15,0.9)"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.5"
          style={{ transition: "d 0.12s ease-in-out" }}
        />

        {/* All iris content clipped to eye shape */}
        <g clipPath="url(#eyeClip)">
          {/* Upper decorative lines */}
          <path
            d={`M 130 145 L 200 ${70 + blinkAmount * 40} L 270 145`}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />

          {/* Outer iris ring */}
          <circle cx={cx} cy={cy} r="65" fill="none" stroke="rgba(200,124,255,0.25)" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r="66" fill="none" stroke="rgba(94,253,186,0.1)" strokeWidth="0.5" />

          {/* Iris gradient fill */}
          <circle cx={cx} cy={cy} r="64" fill="url(#nxIrisGrad)" />

          {/* Iris rays */}
          {rays.map((ray, i) => (
            <line
              key={i}
              x1={ray.x1 + moveX}
              y1={ray.y1 + moveY}
              x2={ray.x2 + moveX}
              y2={ray.y2 + moveY}
              stroke="#5efdba"
              strokeWidth={i % 3 === 0 ? "1.5" : "0.8"}
              opacity={i % 3 === 0 ? 0.5 : 0.25}
            />
          ))}

          {/* Inner iris ring */}
          <circle
            cx={cx + moveX}
            cy={cy + moveY}
            r="32"
            fill="none"
            stroke="rgba(200,124,255,0.4)"
            strokeWidth="1.5"
          />

          {/* Pupil */}
          <circle
            cx={cx + moveX}
            cy={cy + moveY}
            r="22"
            fill="url(#nxPupilGrad)"
            stroke="rgba(200,124,255,0.5)"
            strokeWidth="1"
          />

          {/* Pupil highlights */}
          <circle cx={cx + moveX - 6} cy={cy + moveY - 6} r="4" fill="white" opacity="0.8" />
          <circle cx={cx + moveX + 4} cy={cy + moveY + 3} r="1.5" fill="white" opacity="0.4" />
        </g>

        {/* Small dot below eye */}
        <circle cx={cx} cy={cy + 75} r="3.5" fill="rgba(255,255,255,0.5)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

        {/* Upper lid crease */}
        <path
          d={`M 70 148 Q 200 ${50 + blinkAmount * 50} 330 148`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.8"
        />
      </svg>
    </div>
  );
}
