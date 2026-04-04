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
      title="Initialize Account"
      subtitle="Create a new identity on the Retina network."
      footer={
        <>
          Existing user?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-primary-bright hover:text-primary-bright/80 font-mono tracking-wider transition-colors"
          >
            AUTHENTICATE
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-xs font-mono text-text-variant uppercase tracking-[0.2em]">
            SUBJECT_IDENTIFIER
          </label>
          <input
            className="block w-full px-0 py-3 bg-transparent border-0 border-b border-border font-mono text-text-variant placeholder:text-text-variant focus:border-primary-bright/50 focus:ring-0 transition-colors outline-none text-sm"
            placeholder="Enter designation..."
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>

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

        <div className="space-y-2">
          <label className="block text-xs font-mono text-text-variant uppercase tracking-[0.2em]">
            ACCESS_KEY
          </label>
          <input
            className="block w-full px-0 py-3 bg-transparent border-0 border-b border-border font-mono text-text-variant placeholder:text-text-variant focus:border-primary-bright/50 focus:ring-0 transition-colors outline-none text-sm"
            placeholder="Create passphrase..."
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
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
          icon={isSubmitting ? "progress_activity" : "person_add"}
        >
          {isSubmitting ? "INITIALIZING..." : "CREATE_IDENTITY"}
        </Button>
      </form>
    </AuthLayout>
  );
}
