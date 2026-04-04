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
        <>
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-[#C87CFF] hover:text-[#C87CFF]/80 font-medium transition-colors"
          >
            Login
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">
            Full Name
          </label>
          <input
            className="block w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:border-[#C87CFF]/50 focus:ring-1 focus:ring-[#C87CFF]/50 transition-all outline-none text-sm"
            placeholder="Enter your full name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">
            Email Address
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
            placeholder="Create a password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
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
          icon={isSubmitting ? "progress_activity" : "person_add"}
        >
          {isSubmitting ? "Creating account..." : "Register"}
        </Button>
      </form>
    </AuthLayout>
  );
}
