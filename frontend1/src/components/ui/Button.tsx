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
    "bg-[#321c43] text-white font-mono uppercase tracking-widest border border-[#522f6d] hover:bg-[#3d2352] hover:border-[#653a85]",
  secondary:
    "bg-transparent text-white/70 font-mono uppercase tracking-widest border border-white/10 hover:bg-white/5 hover:text-white hover:border-white/20",
  ghost:
    "bg-transparent text-text-secondary font-mono uppercase tracking-widest hover:text-text-primary hover:bg-text-primary/5",
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
