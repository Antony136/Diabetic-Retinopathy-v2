import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Lightning trace cursor — a glowing light trail that follows the mouse.
 * Renders a fading polyline trail with a bright head dot.
 */

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

export default function CustomCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const mouseRef = useRef({ x: -100, y: -100 });
  const hovRef = useRef(false);
  const rafRef = useRef(0);
  const [, setTick] = useState(0);

  const MAX_TRAIL = 20;
  const TRAIL_LIFETIME = 300; // ms

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      trailRef.current.push({ x: e.clientX, y: e.clientY, t: Date.now() });
      if (trailRef.current.length > MAX_TRAIL) {
        trailRef.current.shift();
      }
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      hovRef.current =
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        !!target.closest("button") ||
        !!target.closest("a") ||
        target.classList.contains("cursor-pointer");
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseover", onOver);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    const now = Date.now();
    const trail = trailRef.current.filter((p) => now - p.t < TRAIL_LIFETIME);
    trailRef.current = trail;

    if (trail.length > 1) {
      // Draw the trail with fading opacity and width
      for (let i = 1; i < trail.length; i++) {
        const prev = trail[i - 1]!;
        const curr = trail[i]!;
        const age = (now - curr.t) / TRAIL_LIFETIME; // 0 = new, 1 = old
        const alpha = Math.max(0, 1 - age) * 0.7;
        const lineWidth = Math.max(0.5, (1 - age) * 3);

        // Purple-to-teal gradient along the trail
        const purpleAmount = age;
        const r = Math.round(200 - purpleAmount * 106);
        const g = Math.round(124 + purpleAmount * 129);
        const b = Math.round(255 - purpleAmount * 69);

        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }

    // Head glow
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const headSize = hovRef.current ? 12 : 6;

    // Outer glow
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, headSize * 3);
    glow.addColorStop(0, "rgba(200,124,255,0.3)");
    glow.addColorStop(1, "rgba(200,124,255,0)");
    ctx.beginPath();
    ctx.arc(mx, my, headSize * 3, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Bright center dot
    ctx.beginPath();
    ctx.arc(mx, my, hovRef.current ? 4 : 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200,124,255,0.9)";
    ctx.fill();

    // White core
    ctx.beginPath();
    ctx.arc(mx, my, hovRef.current ? 2 : 1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Keep canvas sized
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
