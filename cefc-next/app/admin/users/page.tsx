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

type UsersResponse = {
  users?: User[];
  total?: number;
};

type SortDirection = "asc" | "desc";
type UserSortField = "name" | "email" | "role" | "banned" | "createdAt";

const pageSizeOptions = [25, 50, 100] as const;

export default function UsersPage() {
  const [tab, setTab] = useState<"users" | "requests">("users");

  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(25);
  const [userSortField, setUserSortField] = useState<UserSortField>("createdAt");
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>("desc");
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
      const offset = (page - 1) * pageSize;
      const { data } = await authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset,
          sortBy: userSortField,
          sortDirection: userSortDirection,
        },
      });
      const response = data as UsersResponse | null | undefined;
      setUsers(response?.users ?? []);
      setTotalUsers(response?.total ?? 0);
    } catch {
      setUsersError("Failed to load users. Make sure you are signed in as an admin.");
    } finally {
      setUsersLoading(false);
    }
  }, [page, pageSize, userSortField, userSortDirection]);

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
        ? "bg-emerald-700 text-white"
        : "text-zinc-400 hover:text-white"
    }`;

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const firstUserNumber = totalUsers === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastUserNumber = Math.min(page * pageSize, totalUsers);

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value) as (typeof pageSizeOptions)[number]);
    setPage(1);
    setAccessPanelUserId(null);
  }

  function goToPage(nextPage: number) {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
    setAccessPanelUserId(null);
  }

  function handleUserSort(field: UserSortField) {
    if (userSortField === field) {
      setUserSortDirection(userSortDirection === "asc" ? "desc" : "asc");
    } else {
      setUserSortField(field);
      setUserSortDirection(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
    setAccessPanelUserId(null);
  }

  function renderUserSortHeader(label: string, field: UserSortField) {
    const active = userSortField === field;
    return (
      <button
        type="button"
        onClick={() => handleUserSort(field)}
        className="inline-flex items-center gap-1 text-left transition-colors hover:text-white"
      >
        <span>{label}</span>
        <span className={active ? "text-emerald-400" : "text-zinc-600"}>
          {active ? (userSortDirection === "asc" ? "^" : "v") : "-"}
        </span>
      </button>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage all Cleverfish user accounts</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button className={tabClass(tab === "users")} onClick={() => setTab("users")}>
          Users
        </button>
        <button className={tabClass(tab === "requests")} onClick={() => setTab("requests")}>
          Requests
          {requests.filter((r) => r.status === "pending").length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-emerald-700 text-white text-xs">
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
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium" aria-sort={userSortField === "name" ? (userSortDirection === "asc" ? "ascending" : "descending") : "none"}>{renderUserSortHeader("Name", "name")}</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium" aria-sort={userSortField === "email" ? (userSortDirection === "asc" ? "ascending" : "descending") : "none"}>{renderUserSortHeader("Email", "email")}</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium" aria-sort={userSortField === "role" ? (userSortDirection === "asc" ? "ascending" : "descending") : "none"}>{renderUserSortHeader("Role", "role")}</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium" aria-sort={userSortField === "banned" ? (userSortDirection === "asc" ? "ascending" : "descending") : "none"}>{renderUserSortHeader("Status", "banned")}</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium" aria-sort={userSortField === "createdAt" ? (userSortDirection === "asc" ? "ascending" : "descending") : "none"}>{renderUserSortHeader("Created", "createdAt")}</th>
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
                            ? "bg-emerald-900 text-emerald-100"
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
                              className="px-3 py-1 rounded text-xs font-medium bg-emerald-900 text-emerald-100 hover:bg-emerald-800 transition-colors"
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
              <div className="flex flex-col gap-3 border-t border-zinc-700 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-zinc-400">
                  Showing {firstUserNumber}-{lastUserNumber} of {totalUsers} users
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-400">
                    Page size
                    <select
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(e.target.value)}
                      className="rounded-lg border border-zinc-600 bg-[#1c1c1c] px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      {pageSizeOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1}
                      className="rounded-lg border border-zinc-600 px-3 py-1 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-zinc-400">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= totalPages}
                      className="rounded-lg border border-zinc-600 px-3 py-1 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
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
                        <td className="px-4 py-3 text-zinc-300">{request.appName ?? "Cleverfish"}</td>
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
