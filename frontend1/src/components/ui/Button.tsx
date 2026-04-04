import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> {
  variant?: "primary" | "secondary" | "ghost";
  icon?: string;
  children: ReactNode;
}

const variantClasses: Record<string, string> = {
  primary: [
    "bg-primary text-white font-mono uppercase tracking-widest",
    "border border-primary/60",
    "shadow-[0_2px_12px_rgba(200,124,255,0.25)]",
    "hover:bg-primary-bright hover:shadow-[0_4px_20px_rgba(200,124,255,0.40)]",
    "hover:border-primary-bright/80",
    "active:scale-[0.97] active:shadow-none",
  ].join(" "),
  secondary: [
    "bg-surface text-text-primary font-mono uppercase tracking-widest",
    "border border-border",
    "shadow-[0_1px_4px_rgba(0,0,0,0.06)]",
    "dark:shadow-[0_1px_6px_rgba(0,0,0,0.25)]",
    "hover:bg-surface-container hover:border-primary/30 hover:text-primary-bright",
    "active:scale-[0.97]",
  ].join(" "),
  ghost: [
    "bg-transparent text-text-variant font-mono uppercase tracking-widest",
    "border border-transparent",
    "hover:text-text-primary hover:bg-surface/60 hover:border-border",
    "active:scale-[0.97]",
  ].join(" "),
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
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`px-6 py-2.5 rounded-lg font-mono text-sm flex items-center justify-center gap-2.5 transition-all duration-200 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon && (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      )}
      {children}
    </motion.button>
  );
}
