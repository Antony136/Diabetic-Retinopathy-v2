import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { APP_NAME } from "../../utils/constants";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

export default function AuthLayout(props: AuthLayoutProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative z-10">
      {/* Title section matching template "Establish Connection" style */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        className="text-center mb-12"
      >
        <h1 className="text-5xl md:text-6xl font-bold text-text-primary tracking-tight">
          {props.title.split(" ").slice(0, -1).join(" ")}{" "}
          <span className="text-primary-bright">{props.title.split(" ").slice(-1)}</span>
        </h1>
        <p className="mt-4 text-text-variant font-mono text-sm tracking-wider">
          {props.subtitle}
        </p>
      </motion.div>

      {/* Form card matching template glassmorphism style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-lg bg-white/[0.03] backdrop-blur-xl border border-border rounded-xl p-8 md:p-10 shadow-[0_0_60px_rgba(200,124,255,0.08)]"
      >
        {props.children}
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="mt-8 text-sm text-text-variant font-mono"
      >
        {props.footer}
      </motion.div>

      {/* Branding at bottom */}
      <div className="fixed bottom-6 left-8 font-mono text-text-variant text-xs tracking-[0.3em] uppercase">
        {APP_NAME}
      </div>
    </main>
  );
}
