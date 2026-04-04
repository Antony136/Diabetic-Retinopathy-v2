import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import Button from "../../components/ui/Button";
import { loginUser } from "../../services/auth";
import { getAuthToken, setAuthToken } from "../../services/authStorage";
import { runSync } from "../../services/sync";
import AuthLayout from "./AuthLayout";

type LocationState = { from?: { pathname?: string } } | null;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = useMemo(() => {
    const state = location.state as LocationState;
    return state?.from?.pathname && state.from.pathname !== "/login"
      ? state.from.pathname
      : "/";
  }, [location.state]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getAuthToken()) navigate("/", { replace: true });
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const token = await loginUser({ email, password });
      setAuthToken(token.access_token);

      if (navigator.onLine) {
        try {
          await runSync();
        } catch (syncErr) {
          console.warn("Sync after login failed", syncErr);
        }
      }

      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
        if (typeof detail === "string" && detail.trim()) {
          setError(detail);
        } else if (err.code === "ECONNABORTED") {
          setError("Connection timed out. Server may be waking up — please retry.");
        } else {
          setError(err.message || "Authentication failed");
        }
        return;
      }

      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Authentication failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Establish Connection"
      subtitle="Initiate contact with the Retina network. Provide your credentials below."
      footer={
        <>
          No account?{" "}
          <button
            type="button"
            onClick={() => navigate("/register")}
            className="text-primary-bright hover:text-primary-bright/80 font-mono tracking-wider transition-colors"
          >
            REGISTER
          </button>
        </>
      }
    >
      {/* GDSC Notice */}
      <div className="mb-8 p-5 border border-border rounded-lg bg-white/[0.02] space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary-bright" />
          <span className="font-mono font-bold text-xs tracking-[0.2em] uppercase text-text-variant">SYSTEM_NOTICE</span>
        </div>
        
        <p className="text-xs font-mono text-text-variant leading-relaxed">
          GDSC Reviewers: Use these credentials for a quick preview.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 border border-border rounded-lg">
            <p className="text-[10px] font-mono font-bold text-primary-bright uppercase tracking-widest mb-1">ADMIN_ACCESS</p>
            <p className="text-xs font-mono text-text-variant">icebox1306@gmail.com</p>
            <p className="text-xs font-mono text-text-variant">Pass: 123456</p>
          </div>
          <div className="p-3 border border-border rounded-lg">
            <p className="text-[10px] font-mono font-bold text-secondary-bright uppercase tracking-widest mb-1">DOCTOR_ACCESS</p>
            <p className="text-xs font-mono text-text-variant">doc@gmail.com</p>
            <p className="text-xs font-mono text-text-variant">Pass: 123456</p>
          </div>
        </div>
        
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] font-mono text-text-variant leading-relaxed">
            ML inference engine runs on <span className="text-primary-bright/70">Hugging Face Spaces</span>.
          </p>
          <a 
            href="https://huggingface.co/spaces/jczdgyo/diabetic-retinopathy" 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 border border-primary-bright/50 text-primary-bright text-[10px] font-mono font-bold hover:bg-primary-bright/10 transition-colors uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-xs">explore</span>
            VIEW MODEL
          </a>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Email field - template style with bottom border only */}
        <div className="space-y-2">
          <label className="block text-xs font-mono text-text-variant uppercase tracking-[0.2em]">
            COMMUNICATION_RELAY
          </label>
          <input
            className="block w-full px-0 py-3 bg-transparent border-0 border-b border-border font-mono text-text-variant placeholder:text-text-variant focus:border-primary-bright/50 focus:ring-0 transition-colors outline-none text-sm"
            placeholder="Secure channel address..."
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        {/* Password field */}
        <div className="space-y-2">
          <label className="block text-xs font-mono text-text-variant uppercase tracking-[0.2em]">
            ACCESS_KEY
          </label>
          <input
            className="block w-full px-0 py-3 bg-transparent border-0 border-b border-border font-mono text-text-variant placeholder:text-text-variant focus:border-primary-bright/50 focus:ring-0 transition-colors outline-none text-sm"
            placeholder="Enter passphrase..."
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div className="font-mono text-xs text-red-400 border border-red-400/20 bg-red-400/5 px-4 py-3 tracking-wider uppercase">
            [ERROR] {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-4"
          icon={isSubmitting ? "progress_activity" : "send"}
        >
          {isSubmitting ? "AUTHENTICATING..." : "TRANSMIT"}
        </Button>
      </form>
    </AuthLayout>
  );
}
