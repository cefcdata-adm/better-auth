"use client";

import { useState } from "react";

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  createdAt: string | Date;
};

type Props = {
  request: AccessRequest;
  onRefresh: () => void;
};

export function RequestActions({ request, onRefresh }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleApprove() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/access-requests/${request.id}/approve`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      onRefresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!confirm(`Reject access request from ${request.name} (${request.email})?`)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/access-requests/${request.id}/reject`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      onRefresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="px-3 py-1 rounded text-xs font-medium bg-green-900 text-green-200 hover:bg-green-800 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Approve"}
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="px-3 py-1 rounded text-xs font-medium bg-red-900 text-red-200 hover:bg-red-800 transition-colors disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
