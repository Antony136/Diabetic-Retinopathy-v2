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
        <>
          New user?{" "}
          <button
            type="button"
            onClick={() => navigate("/register")}
            className="text-[#C87CFF] hover:text-[#C87CFF]/80 font-medium transition-colors"
          >
            Register
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">
            Username / Email
          </label>
          <input
            className="block w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:border-[#C87CFF]/50 focus:ring-1 focus:ring-[#C87CFF]/50 transition-all outline-none text-sm"
            placeholder="Enter your email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">
            Password
          </label>
          <input
            className="block w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:border-[#C87CFF]/50 focus:ring-1 focus:ring-[#C87CFF]/50 transition-all outline-none text-sm"
            placeholder="Enter your password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div className="text-xs text-red-400 border border-red-400/20 bg-red-400/5 px-4 py-3 rounded-lg">
            Error: {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-4 py-4"
          icon={isSubmitting ? "progress_activity" : "login"}
        >
          {isSubmitting ? "Logging in..." : "Login"}
        </Button>
      </form>
    </AuthLayout>
  );
}
