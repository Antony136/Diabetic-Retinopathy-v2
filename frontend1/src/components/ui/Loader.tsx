import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Loader({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"video" | "quick" | "done">("video");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isFirstVisit = !sessionStorage.getItem("retina_visited");

  const finish = useCallback(() => {
    setPhase("done");
    // Small delay so the exit animation plays
    setTimeout(() => onCompleteRef.current(), 600);
  }, []);

  useEffect(() => {
    if (!isFirstVisit) {
      setPhase("quick");
      const timer = setTimeout(finish, 800);
      return () => clearTimeout(timer);
    } else {
      sessionStorage.setItem("retina_visited", "1");
      setPhase("video");
    }
  }, [isFirstVisit, finish]);

  const handleVideoEnd = useCallback(() => {
    finish();
  }, [finish]);

  // Fallback timeout for video (in case it doesn't fire onEnded)
  useEffect(() => {
    if (phase !== "video" || !isFirstVisit) return;
    const timer = setTimeout(finish, 5000);
    return () => clearTimeout(timer);
  }, [phase, isFirstVisit, finish]);

  if (phase === "done") return null;

  return (
    <AnimatePresence>
      <motion.div
        key="loader"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="fixed inset-0 z-[200] bg-[#050505] flex items-center justify-center overflow-hidden"
      >
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(200,124,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(200,124,255,0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {phase === "video" && isFirstVisit ? (
          <video
            ref={videoRef}
            src="/Opening_animation.mp4"
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
            className="absolute inset-0 w-full h-full object-cover z-10"
            onError={() => finish()}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-6 z-10"
          >
            <div className="w-16 h-16 rounded-full border-2 border-primary-bright/50 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-primary-bright animate-pulse" />
            </div>
            <div className="font-mono text-primary-bright tracking-[0.3em] text-sm uppercase">
              INITIALIZING...
            </div>
          </motion.div>
        )}

        {/* Purple glow at edges */}
        <div className="absolute inset-0 pointer-events-none z-20 opacity-30"
          style={{
            background: "radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(46,24,61,0.8) 100%)"
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
}
