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
    "bg-[#C87CFF] text-black font-bold uppercase tracking-widest hover:shadow-[0_0_25px_rgba(200,124,255,0.7)] border border-[#C87CFF] hover:bg-[#d99aff]",
  secondary:
    "bg-[#C87CFF]/10 text-[#C87CFF] border border-[#C87CFF]/50 font-bold uppercase tracking-widest hover:bg-[#C87CFF]/20 hover:shadow-[0_0_15px_rgba(200,124,255,0.3)] hover:border-[#C87CFF]/80",
  ghost:
    "bg-transparent text-white/60 border border-white/20 font-bold uppercase tracking-widest hover:text-white hover:border-white/40 hover:bg-white/5",
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
      className={`px-6 py-3 rounded-none font-mono text-xs flex items-center justify-center gap-3 transition-colors ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon && (
        <span className="material-symbols-outlined text-sm">{icon}</span>
      )}
      {children}
    </motion.button>
  );
}
