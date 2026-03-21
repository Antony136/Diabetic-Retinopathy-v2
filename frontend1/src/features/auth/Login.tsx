import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import { loginUser } from "../../services/auth";
import { getAuthToken, setAuthToken } from "../../services/authStorage";
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
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Login failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Login to continue to your dashboard."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={() => navigate("/register")}
            className="text-primary hover:underline font-semibold"
          >
            Register
          </button>
        </>
      }
    >
      {/* GDSC Hackathon Notice */}
      <div className="mb-8 p-5 rounded-2xl bg-primary-container/10 border border-primary/10 space-y-3">
        <div className="flex items-center gap-2 text-primary">
          <span className="font-label font-bold text-sm tracking-wide uppercase">GDSC Notice</span>
        </div>
        
        <div className="space-y-2">
          <p className="text-sm font-label text-on-surface/80 leading-relaxed">
            Welcome GDSC Reviewers! Use these credentials for a quick preview:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline/5">
              <p className="text-[10px] font-bold text-primary uppercase mb-1">Admin Access</p>
              <p className="text-xs font-mono text-on-surface">icebox1306@gmail.com</p>
              <p className="text-xs font-mono text-on-surface-variant">Pass: 123456</p>
            </div>
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline/5">
              <p className="text-[10px] font-bold text-secondary uppercase mb-1">Doctor Access</p>
              <p className="text-xs font-mono text-on-surface">doc@gmail.com</p>
              <p className="text-xs font-mono text-on-surface-variant">Pass: 123456</p>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-outline/5">
          <p className="text-[11px] leading-normal text-on-surface-variant italic">
            This platform uses <strong>EfficientNet-B3</strong> for high-accuracy retinal screening with Grad-CAM explainability.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-label text-on-surface-variant mb-2">
            Email
          </label>
          <input
            className="block w-full px-4 py-3 bg-surface-container-lowest border border-outline/10 rounded-xl font-body text-on-surface focus:ring-1 focus:ring-primary/40 focus:border-transparent transition-all outline-none"
            placeholder="you@domain.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-label text-on-surface-variant mb-2">
            Password
          </label>
          <input
            className="block w-full px-4 py-3 bg-surface-container-lowest border border-outline/10 rounded-xl font-body text-on-surface focus:ring-1 focus:ring-primary/40 focus:border-transparent transition-all outline-none"
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm animate-[pulse_1.2s_ease-in-out_1]">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full"
          icon={isSubmitting ? "progress_activity" : "login"}
        >
          {isSubmitting ? "Signing in..." : "Login"}
        </Button>
      </form>
    </AuthLayout>
  );
}
