import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { useTilt } from "../../hooks/useTilt";

interface CardProps extends Omit<HTMLMotionProps<"div">, "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className = "", ...rest }: CardProps) {
  const { tiltStyle, onMouseMove, onMouseLeave } = useTilt(3); // slight 3deg tilt on cards

  return (
    <motion.div 
      className={`bg-surface relative z-10 overflow-hidden shadow-lg shadow-black/5 dark:shadow-black/40 border border-border rounded-xl transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:-translate-y-0.5 ${className}`} 
      style={tiltStyle}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
