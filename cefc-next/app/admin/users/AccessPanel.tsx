"use client";

import { useEffect, useState } from "react";

type AppAccess = { clientId: string; name: string; granted: boolean };

type Props = { userId: string; onClose: () => void };

export function AccessPanel({ userId, onClose }: Props) {
  const [access, setAccess] = useState<AppAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  async function fetchAccess() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/access?userId=${userId}`);
      const data = await res.json();
      setAccess(data.access ?? []);
    } catch {
      setError("Failed to load access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAccess(); }, [userId]);

  async function handleToggle(clientId: string, currently: boolean) {
    setToggling(clientId);
    setError("");
    try {
      const res = await fetch("/api/admin/access", {
        method: currently ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, clientId }),
      });
      if (!res.ok) { setError("Failed to update access."); return; }
      await fetchAccess();
    } catch {
      setError("Network error.");
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="mt-2 p-4 bg-zinc-900 rounded-lg border border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white text-sm font-semibold">App Access</p>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">Close</button>
      </div>
      {loading && <p className="text-zinc-500 text-xs">Loading...</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {!loading && access.length === 0 && (
        <p className="text-zinc-500 text-xs">No apps registered. Register apps in the Apps tab first.</p>
      )}
      <div className="space-y-2">
        {access.map((app) => (
          <div key={app.clientId} className="flex items-center justify-between">
            <div>
              <p className="text-white text-xs font-medium">{app.name}</p>
              <p className="text-zinc-500 text-xs font-mono">{app.clientId}</p>
            </div>
            <button
              onClick={() => handleToggle(app.clientId, app.granted)}
              disabled={toggling === app.clientId}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                app.granted
                  ? "bg-green-900 text-green-200 hover:bg-red-900 hover:text-red-200"
                  : "bg-zinc-700 text-zinc-300 hover:bg-green-900 hover:text-green-200"
              }`}
            >
              {toggling === app.clientId ? "..." : app.granted ? "Revoke" : "Grant"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
