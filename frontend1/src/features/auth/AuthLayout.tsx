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
    <main className="min-h-screen flex flex-col lg:flex-row bg-background text-text-primary overflow-hidden">
      {/* Left side: Information/Content about Diabetic Retinopathy */}
      <div className="hidden lg:flex lg:flex-1 relative p-12 lg:p-24 flex-col justify-between overflow-hidden">
        {/* Background gradient/decoration */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-surface to-background -z-10" />
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-secondary-bright/5 blur-[100px] rounded-full" />

        <motion.div
           initial={{ opacity: 0, x: -30 }}
           animate={{ opacity: 1, x: 0 }}
           transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-primary/30 rounded-full bg-primary/5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-primary-bright">Clinical Intelligence</span>
          </div>
          
          <h2 className="text-6xl xl:text-7xl font-bold tracking-tight mb-8">
            Protecting Vision with <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-bright to-primary">Precision AI</span>
          </h2>
          
          <div className="max-w-xl space-y-6 text-text-secondary text-lg leading-relaxed">
            <p>
              Diabetic Retinopathy is the leading cause of preventable blindness in working-age adults. 
              Our platform leverages advanced neural networks to provide rapid, accurate screening of retinal images.
            </p>
            <p>
              By detecting microaneurysms and exudates early, we empower healthcare providers to intervene before permanent vision loss occurs.
            </p>
          </div>
        </motion.div>

        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 0.3 }}
           transition={{ duration: 1.5, delay: 0.5 }}
           className="font-mono text-xs tracking-[0.4em] uppercase text-text-variant"
        >
          Retina AI Ecosystem • Early Detection • Precision Diagnostics
        </motion.div>
      </div>

      {/* Right side: Authentication Form */}
      <div className="flex-1 lg:max-w-[500px] relative flex flex-col items-center justify-center p-6 md:p-12 lg:p-16 border-l border-border bg-surface/50 backdrop-blur-md">
        {/* Branding for mobile/small screens */}
        <div className="lg:hidden mb-12 text-center">
            <h1 className="text-4xl font-bold text-text-primary tracking-tight">
                Retina <span className="text-primary-bright">AI</span>
            </h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="w-full max-w-sm"
        >
          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-bold text-text-primary mb-2">
                {props.title}
            </h2>
            <p className="text-text-variant text-sm leading-relaxed">
                {props.subtitle}
            </p>
          </div>

          <div className="mb-10">
            {props.children}
          </div>

          <div className="text-center pt-6 border-t border-border text-sm text-text-variant font-mono">
            {props.footer}
          </div>
        </motion.div>

        {/* Floating Branding bottom left corner of right pane */}
        <div className="absolute bottom-6 left-8 font-mono text-text-variant text-[10px] tracking-[0.3em] uppercase">
          {APP_NAME}
        </div>
      </div>
    </main>
  );
}
