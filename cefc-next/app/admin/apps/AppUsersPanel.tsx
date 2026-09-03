"use client";

import { useEffect, useState } from "react";

type AppUser = { userId: string; name: string; email: string; grantedAt: string };
type Props = { clientId: string; appName: string; onClose: () => void };

export function AppUsersPanel({ clientId, appName, onClose }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  async function fetchUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/apps/${clientId}/users`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, [clientId]);

  async function handleRevoke(userId: string) {
    setRevoking(userId);
    setError("");
    try {
      const res = await fetch("/api/admin/access", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, clientId }),
      });
      if (!res.ok) { setError("Failed to revoke access."); return; }
      await fetchUsers();
    } catch {
      setError("Network error.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <tr>
      <td colSpan={6} className="px-4 pb-4 pt-0">
        <div className="bg-zinc-900 rounded-lg border border-zinc-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-sm font-semibold">
              Users with access to <span className="text-emerald-300">{appName}</span>
            </p>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">
              Close
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          {loading && <p className="text-zinc-500 text-xs">Loading...</p>}
          {!loading && users.length === 0 && (
            <p className="text-zinc-500 text-xs">No users have access to this app yet.</p>
          )}
          {!loading && users.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left py-2 text-zinc-400 font-medium">Name</th>
                  <th className="text-left py-2 text-zinc-400 font-medium">Email</th>
                  <th className="text-left py-2 text-zinc-400 font-medium">Granted</th>
                  <th className="text-left py-2 text-zinc-400 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.userId} className="border-b border-zinc-800">
                    <td className="py-2 text-white">{u.name}</td>
                    <td className="py-2 text-zinc-300">{u.email}</td>
                    <td className="py-2 text-zinc-500">
                      {new Date(u.grantedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => handleRevoke(u.userId)}
                        disabled={revoking === u.userId}
                        className="px-2 py-0.5 rounded text-xs font-medium bg-red-900 text-red-200 hover:bg-red-800 transition-colors disabled:opacity-50"
                      >
                        {revoking === u.userId ? "..." : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}
