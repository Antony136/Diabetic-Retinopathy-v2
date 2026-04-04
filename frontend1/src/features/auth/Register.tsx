import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import { registerUser } from "../../services/auth";
import { getAuthToken } from "../../services/authStorage";
import AuthLayout from "./AuthLayout";

export default function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
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
      await registerUser({ name, email, password });
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Registration failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Join the Retina intelligence platform for professional eye screening."
      footer={
        <div className="flex flex-col items-center gap-4">
          <p className="text-text-variant text-sm font-mono tracking-widest">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="text-primary-bright hover:text-primary-bright/80 font-bold transition-colors ml-2"
            >
              Login
            </button>
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-bold tracking-wide text-text-primary uppercase font-mono">
              Professional Name
            </label>
            <input
              className="block w-full px-5 py-4 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-variant/60 focus:border-primary-bright/50 focus:ring-1 focus:ring-primary-bright/50 transition-all outline-none text-sm font-body shadow-sm"
              placeholder="Dr. Jordan Smith"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>

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
              placeholder="Create a strong password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
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
          icon={isSubmitting ? "progress_activity" : "person_add"}
        >
          {isSubmitting ? "Creating Account..." : "Join Retina Max"}
        </Button>
      </form>
    </AuthLayout>
  );
}
