"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type User = {
  id: string;
  name: string;
  email: string;
  role: string | null | undefined;
  banned: boolean | null | undefined;
};

type Props = {
  user: User;
  onRefresh: () => void;
};

export function UserActions({ user, onRefresh }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isBanned = !!user.banned;
  const isAdmin = user.role === "admin";

  async function handleToggleBan() {
    setLoading(true);
    setError("");
    try {
      if (isBanned) {
        await authClient.admin.unbanUser({ userId: user.id });
      } else {
        await authClient.admin.banUser({ userId: user.id, banReason: "Banned by admin" });
      }
      onRefresh();
    } catch {
      setError("Failed to update ban status.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleRole() {
    setLoading(true);
    setError("");
    try {
      await authClient.admin.setRole({
        userId: user.id,
        role: isAdmin ? "user" : "admin",
      });
      onRefresh();
    } catch {
      setError("Failed to update role.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Permanently delete ${user.name} (${user.email})?`)) return;
    setLoading(true);
    setError("");
    try {
      const { error: err } = await authClient.admin.removeUser({ userId: user.id });
      if (err) {
        setError(err.message ?? "Failed to delete user.");
        return;
      }
      onRefresh();
    } catch {
      setError("Failed to delete user.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggleRole}
          disabled={loading}
          className="px-3 py-1 rounded text-xs font-medium bg-purple-900 text-purple-200 hover:bg-purple-800 transition-colors disabled:opacity-50"
        >
          {isAdmin ? "Demote" : "Make Admin"}
        </button>
        <button
          onClick={handleToggleBan}
          disabled={loading}
          className="px-3 py-1 rounded text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors disabled:opacity-50"
        >
          {isBanned ? "Unban" : "Ban"}
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-3 py-1 rounded text-xs font-medium bg-red-900 text-red-200 hover:bg-red-800 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Delete"}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
