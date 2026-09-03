"use client";

import { useState } from "react";
import Link from "next/link";

type Props = { clientId: string | null; appName: string | null };

export function RequestAccessForm({ clientId, appName }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const displayName = appName ?? "CEFC Woodlands";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          clientId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#1c1c1c] items-center justify-center px-4 py-8 sm:px-8">
      <div className="w-full max-w-sm bg-[#2a2a2a] rounded-xl p-6 sm:p-8 border border-zinc-700">
        {submitted ? (
          <div className="text-center">
            <h2 className="text-xl font-bold text-white mb-2">Request submitted</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Your request has been submitted. We&apos;ll be in touch.
            </p>
            <Link href="/sign-in" className="text-purple-400 text-sm hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-white text-center mb-1">Request for Access</h2>
            <p className="text-zinc-400 text-sm text-center mb-6">
              {appName
                ? `Submit your details to request access to ${displayName}.`
                : "Submit your details and an IT admin will review your request."}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-white mb-1">Full name</label>
                <input id="name" type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your full name" required autoComplete="name"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white mb-1">Email address</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Your email address" required autoComplete="email"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading} aria-busy={loading}
                className="w-full py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-colors disabled:opacity-50">
                {loading ? "Submitting..." : "Submit Request"}
              </button>
            </form>
            <div className="mt-6 text-center">
              <Link href="/sign-in" className="text-purple-400 text-sm hover:underline">Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
