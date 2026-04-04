import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { useTilt } from "../../hooks/useTilt";

interface CardProps extends Omit<HTMLMotionProps<"div">, "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className = "", ...rest }: CardProps) {
  const { tiltStyle, onMouseMove, onMouseLeave } = useTilt(3);

  return (
    <motion.div
      className={`
        bg-surface relative z-10 rounded-xl
        border border-border
        shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.08)]
        dark:shadow-[0_1px_4px_rgba(0,0,0,0.3),0_6px_24px_rgba(0,0,0,0.4)]
        transition-all duration-300 ease-out
        hover:border-primary/30
        hover:shadow-[0_2px_8px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(200,124,255,0.06)]
        dark:hover:shadow-[0_2px_12px_rgba(0,0,0,0.4),0_12px_40px_rgba(0,0,0,0.5),0_0_20px_rgba(200,124,255,0.08)]
        hover:-translate-y-0.5
        ${className}
      `}
      style={tiltStyle}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      {/* Subtle top highlight line for depth */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
      {children}
    </motion.div>
  );
}

