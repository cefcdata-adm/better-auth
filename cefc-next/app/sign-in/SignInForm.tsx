"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const signInBackgrounds = [
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1920&q=80",
  "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1920&q=80",
];

function getSignInBackground(url: string) {
  return `linear-gradient(120deg, rgb(10 20 16 / 0.84), rgb(10 20 16 / 0.62)), url('${url}')`;
}

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState(getSignInBackground(signInBackgrounds[0]));

  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id");

  // If we arrived here from an OIDC authorize redirect, the original OIDC
  // params are in the URL. After sign-in we must return to the authorize
  // endpoint so the OIDC flow (cookie-based state) can resume.
  const oidcCallbackURL = clientId
    ? `/api/auth/oauth2/authorize?${searchParams.toString()}`
    : "/";

  const requestAccessHref = clientId
    ? `/request-access?client_id=${encodeURIComponent(clientId)}`
    : "/request-access";

  useEffect(() => {
    const image = signInBackgrounds[Math.floor(Math.random() * signInBackgrounds.length)];
    setBackgroundImage(getSignInBackground(image));
  }, []);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password, callbackURL: oidcCallbackURL });
      if (error) {
        setError(error.message ?? "Sign in failed. Please try again.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialSignIn(provider: "google") {
    setError("");
    setLoading(true);
    try {
      await authClient.signIn.social({ provider, callbackURL: oidcCallbackURL });
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen bg-[#1c1c1c] bg-cover bg-center items-center justify-center px-4 py-8 sm:px-8"
      style={{ backgroundImage }}
    >
        <div className="w-full max-w-sm rounded-xl border border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur sm:p-8">
          <h2 className="text-xl font-bold text-zinc-950 text-center mb-1">
            Cleverfish
          </h2>
          <p className="text-zinc-600 text-sm text-center mb-6">
            Welcome back! Please sign in to continue
          </p>

          {/* Social Buttons */}
          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={() => handleSocialSignIn("google")}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-300 bg-white text-zinc-900 text-sm hover:bg-zinc-100 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-zinc-500 text-sm">or</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-800 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                autoComplete="username"
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-300 text-zinc-950 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-800 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-300 text-zinc-950 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-600"
              />
            </div>
            {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <a href={requestAccessHref} className="text-emerald-700 text-sm font-medium hover:underline">
              Request for Access
            </a>
          </div>
        </div>
    </div>
  );
}
