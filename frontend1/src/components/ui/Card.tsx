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
      className={`bg-surface backdrop-blur-md border border-border rounded-xl hover:border-primary-bright/50 hover:shadow-[0_0_15px_var(--glow)] transition-colors duration-300 ${className}`} 
      style={tiltStyle}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
