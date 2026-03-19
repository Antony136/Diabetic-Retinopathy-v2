import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { APP_NAME } from "../../utils/constants";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function AuthLayout(props: AuthLayoutProps) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const heroUrl = useMemo(() => "/auth-hero.png", []);

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-12">
      <section
        className="relative lg:col-span-7 overflow-hidden min-h-[320px] lg:min-h-screen"
        onMouseMove={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const y = (e.clientY - rect.top) / rect.height;
          const ry = clamp((x - 0.5) * 10, -6, 6);
          const rx = clamp((0.5 - y) * 10, -6, 6);
          setTilt({ rx, ry });
        }}
        onMouseLeave={() => setTilt({ rx: 0, ry: 0 })}
        style={{ transformStyle: "preserve-3d", perspective: "900px" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${heroUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "saturate(1.1) contrast(1.05)",
            transform: `translateZ(-1px) scale(1.02) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
            transition: "transform 220ms ease-out",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/25 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,130,253,0.28),transparent_45%)]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-surface via-surface/50 to-transparent" />

        <div className="relative z-10 h-full flex flex-col justify-between p-8 lg:p-14">
          <div className="inline-flex items-center gap-2 text-on-surface">
            <span className="material-symbols-outlined text-primary text-xl">visibility</span>
            <span className="font-headline font-extrabold tracking-tight text-lg">{APP_NAME}</span>
          </div>

          <div className="max-w-xl">
            <div className="text-xs font-bold tracking-[0.28em] uppercase text-primary/90 mb-3">
              Retina Screening Suite
            </div>
            <h2 className="font-headline text-4xl lg:text-5xl font-extrabold tracking-tight text-on-surface">
              Faster triage. Clearer decisions.
            </h2>
            <p className="mt-4 text-on-surface-variant text-base lg:text-lg leading-relaxed">
              Upload fundus images, generate DR stage reports, and prioritize patients with confidence-based insights.
            </p>
          </div>

          <div className="hidden lg:flex gap-2 text-xs text-on-surface-variant">
          </div>
        </div>
      </section>

      <section className="lg:col-span-5 flex items-center justify-center px-6 py-12 lg:py-0 bg-surface">
        <div className="w-full max-w-md">
          <div className="mb-8 animate-[fadeInUp_520ms_ease-out_1]">
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">{props.title}</h1>
            <p className="mt-2 text-on-surface-variant">{props.subtitle}</p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-7 shadow-2xl shadow-black/25 animate-[fadeInUp_640ms_ease-out_1]">
            {props.children}
          </div>

          <div className="mt-7 text-sm text-on-surface-variant animate-[fadeInUp_760ms_ease-out_1]">
            {props.footer}
          </div>
        </div>
      </section>
    </main>
  );
}
