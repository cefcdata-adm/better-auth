"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setError(error.message ?? "Failed to set password. The link may have expired.");
      } else {
        setDone(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Password set!</h2>
        <p className="text-zinc-400 text-sm mb-6">You can now sign in with your new password.</p>
        <button
          onClick={() => router.push("/sign-in")}
          className="px-6 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors"
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-xl font-bold text-white text-center mb-1">Set your password</h2>
      <p className="text-zinc-400 text-sm text-center mb-6">Choose a password to activate your account</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-white mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            autoComplete="new-password"
            className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-white mb-1">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password"
            required
            autoComplete="new-password"
            className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="w-full py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {loading ? "Setting password..." : "Set Password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen bg-[#1c1c1c] items-center justify-center px-4 py-8 sm:px-8">
      <div className="w-full max-w-sm bg-[#2a2a2a] rounded-xl p-6 sm:p-8 border border-zinc-700">
        <Suspense fallback={<p className="text-zinc-400 text-sm text-center">Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
