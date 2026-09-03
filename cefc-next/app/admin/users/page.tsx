"use client";

import { useEffect, useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { UserActions } from "./UserActions";
import { RequestActions } from "./RequestActions";
import { AccessPanel } from "./AccessPanel";

type User = {
  id: string;
  name: string;
  email: string;
  role: string | null | undefined;
  banned: boolean | null | undefined;
  createdAt: Date | string;
};

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string | Date;
  appName: string | null;
};

export default function UsersPage() {
  const [tab, setTab] = useState<"users" | "requests">("users");

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState("");

  const [accessPanelUserId, setAccessPanelUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const { data } = await authClient.admin.listUsers({ query: { limit: 100 } });
      setUsers((data?.users as User[]) ?? []);
    } catch {
      setUsersError("Failed to load users. Make sure you are signed in as an admin.");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError("");
    try {
      const res = await fetch("/api/access-requests");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch {
      setRequestsError("Failed to load requests.");
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchRequests();
  }, [fetchUsers, fetchRequests]);

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      active
        ? "bg-zinc-700 text-white"
        : "text-zinc-400 hover:text-white"
    }`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage all CEFC Woodlands user accounts</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button className={tabClass(tab === "users")} onClick={() => setTab("users")}>
          Users
        </button>
        <button className={tabClass(tab === "requests")} onClick={() => setTab("requests")}>
          Requests
          {requests.filter((r) => r.status === "pending").length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-purple-700 text-purple-100 text-xs">
              {requests.filter((r) => r.status === "pending").length}
            </span>
          )}
        </button>
      </div>

      {/* Users Tab */}
      {tab === "users" && (
        <>
          {usersLoading && <p className="text-zinc-400 text-sm">Loading users...</p>}
          {usersError && <p role="alert" className="text-red-400 text-sm">{usersError}</p>}
          {!usersLoading && !usersError && (
            <div className="bg-[#2a2a2a] rounded-xl border border-zinc-700 overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Email</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Role</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Created</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{user.name}</td>
                      <td className="px-4 py-3 text-zinc-300">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === "admin"
                            ? "bg-purple-900 text-purple-200"
                            : "bg-zinc-700 text-zinc-300"
                        }`}>
                          {user.role ?? "user"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          user.banned
                            ? "bg-red-900 text-red-200"
                            : "bg-green-900 text-green-200"
                        }`}>
                          {user.banned ? "Banned" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <UserActions user={user} onRefresh={fetchUsers} />
                            <button
                              onClick={() => setAccessPanelUserId(accessPanelUserId === user.id ? null : user.id)}
                              className="px-3 py-1 rounded text-xs font-medium bg-blue-900 text-blue-200 hover:bg-blue-800 transition-colors"
                            >
                              Access
                            </button>
                          </div>
                          {accessPanelUserId === user.id && (
                            <AccessPanel userId={user.id} onClose={() => setAccessPanelUserId(null)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-8">No users found.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Requests Tab */}
      {tab === "requests" && (
        <>
          {requestsLoading && <p className="text-zinc-400 text-sm">Loading requests...</p>}
          {requestsError && <p role="alert" className="text-red-400 text-sm">{requestsError}</p>}
          {!requestsLoading && !requestsError && (
            <div className="bg-[#2a2a2a] rounded-xl border border-zinc-700 overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-zinc-700">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Email</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">App</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Submitted</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests
                    .filter((r) => r.status === "pending")
                    .map((request) => (
                      <tr key={request.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{request.name}</td>
                        <td className="px-4 py-3 text-zinc-300">{request.email}</td>
                        <td className="px-4 py-3 text-zinc-300">{request.appName ?? "CEFC Woodlands"}</td>
                        <td className="px-4 py-3 text-zinc-400">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <RequestActions request={request} onRefresh={fetchRequests} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {requests.filter((r) => r.status === "pending").length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-8">No pending requests.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
