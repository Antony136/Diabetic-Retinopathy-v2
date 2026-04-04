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
      title="User Login"
      subtitle="Access the Retina intelligence platform for diabetic retinopathy screening."
      footer={
        <div className="flex flex-col items-center gap-4">
          <p className="text-text-variant text-sm font-mono tracking-widest">
            New to the platform?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="text-primary-bright hover:text-primary-bright/80 font-bold transition-colors ml-2"
            >
              Register
            </button>
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-bold tracking-wide text-text-primary uppercase font-mono">
              Work Email
            </label>
            <input
              className="block w-full px-5 py-4 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-variant/60 focus:border-primary-bright/50 focus:ring-1 focus:ring-primary-bright/50 transition-all outline-none text-sm font-body shadow-sm"
              placeholder="name@clinical.org"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold tracking-wide text-text-primary uppercase font-mono">
              Security Password
            </label>
            <input
              className="block w-full px-5 py-4 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-variant/60 focus:border-primary-bright/50 focus:ring-1 focus:ring-primary-bright/50 transition-all outline-none text-sm font-body shadow-sm"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-100 border border-red-500/30 bg-red-500/10 px-5 py-4 rounded-xl flex items-center gap-3 backdrop-blur-sm">
            <span className="material-symbols-outlined text-sm text-red-500">error</span>
            <span className="font-medium">Error: {error}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 text-base font-bold shadow-lg shadow-primary/20"
          icon={isSubmitting ? "progress_activity" : "login"}
        >
          {isSubmitting ? "Authenticating..." : "Login to Workspace"}
        </Button>
      </form>
    </AuthLayout>
  );
}
