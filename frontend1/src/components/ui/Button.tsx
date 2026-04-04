import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> {
  variant?: "primary" | "secondary" | "ghost";
  icon?: string;
  children: ReactNode;
}

const variantClasses: Record<string, string> = {
  primary:
    "bg-primary text-white font-mono uppercase tracking-widest border border-primary-bright/50 hover:bg-primary-bright hover:shadow-[0_0_15px_var(--glow)] shadow-md shadow-primary/20",
  secondary:
    "bg-surface text-text-primary font-mono uppercase tracking-widest border border-border hover:bg-border/20 shadow-sm shadow-black/5 dark:shadow-black/20",
  ghost:
    "bg-transparent text-text-secondary font-mono uppercase tracking-widest hover:text-text-primary hover:bg-surface/50",
};

export default function Button({
  variant = "primary",
  icon,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`px-6 py-3 rounded-md font-mono text-sm flex items-center justify-center gap-3 transition-colors ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon && (
        <span className="material-symbols-outlined text-sm">{icon}</span>
      )}
      {children}
    </motion.button>
  );
}
