"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1c1c1c]">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">You are logged in</h1>
        <p className="mt-2 text-zinc-400">Welcome to CEFC Woodlands</p>
        <button
          onClick={handleSignOut}
          className="mt-6 px-4 py-2 rounded-lg bg-zinc-700 text-white text-sm hover:bg-zinc-600 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
