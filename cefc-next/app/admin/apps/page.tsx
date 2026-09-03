"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { AppUsersPanel } from "./AppUsersPanel";

type App = {
  id: string;
  name: string;
  clientId: string;
  redirectUrls: string;
  disabled: boolean | null;
  createdAt: string | Date;
  metadata: { subdomain?: string; sessionTimeout?: number; postLogoutRedirectUris?: string[] };
};

type CreatedApp = { clientId: string; clientSecret: string; name: string } | null;
type EditingApp = {
  clientId: string;
  name: string;
  subdomain: string;
  redirectUris: string;
  postLogoutRedirectUris: string;
  sessionTimeout: string;
} | null;

export default function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [createdApp, setCreatedApp] = useState<CreatedApp>(null);
  const [usersPanelClientId, setUsersPanelClientId] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<EditingApp>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formSubdomain, setFormSubdomain] = useState("");
  const [formRedirectUris, setFormRedirectUris] = useState("");
  const [formPostLogoutRedirectUris, setFormPostLogoutRedirectUris] = useState("");
  const [formSessionTimeout, setFormSessionTimeout] = useState("28800");

  const fetchApps = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/apps");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setApps(data.apps ?? []);
    } catch {
      setError("Failed to load apps.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  function splitTextareaValues(value: string) {
    return value.split("\n").map((item) => item.trim()).filter(Boolean);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    const uris = splitTextareaValues(formRedirectUris);
    const postLogoutUris = splitTextareaValues(formPostLogoutRedirectUris);
    if (uris.length === 0) {
      setError("At least one redirect URI is required.");
      setCreating(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          subdomain: formSubdomain.trim(),
          redirectUris: uris,
          postLogoutRedirectUris: postLogoutUris,
          sessionTimeout: Number(formSessionTimeout),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create app."); return; }
      setCreatedApp(data);
      setShowForm(false);
      setFormName("");
      setFormSubdomain("");
      setFormRedirectUris("");
      setFormPostLogoutRedirectUris("");
      setFormSessionTimeout("28800");
      fetchApps();
    } catch {
      setError("Network error.");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(app: App) {
    const postLogoutRedirectUris = app.metadata.postLogoutRedirectUris ?? [];
    const redirectUris = app.redirectUrls
      .split(",")
      .map((uri) => uri.trim())
      .filter(Boolean)
      .filter((uri) => !postLogoutRedirectUris.includes(uri));

    setEditingApp({
      clientId: app.clientId,
      name: app.name,
      subdomain: app.metadata.subdomain ?? "",
      redirectUris: redirectUris.join("\n"),
      postLogoutRedirectUris: postLogoutRedirectUris.join("\n"),
      sessionTimeout: String(app.metadata.sessionTimeout ?? 28800),
    });
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingApp) return;
    setSaving(true);
    setError("");
    const uris = splitTextareaValues(editingApp.redirectUris);
    const postLogoutUris = splitTextareaValues(editingApp.postLogoutRedirectUris);
    if (uris.length === 0) { setError("At least one redirect URI is required."); setSaving(false); return; }
    try {
      const res = await fetch(`/api/admin/apps/${editingApp.clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingApp.name.trim(),
          subdomain: editingApp.subdomain.trim(),
          redirectUris: uris,
          postLogoutRedirectUris: postLogoutUris,
          sessionTimeout: Number(editingApp.sessionTimeout),
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to save."); return; }
      setEditingApp(null);
      fetchApps();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(clientId: string, name: string) {
    if (!confirm(`Permanently delete app "${name}"? This will revoke all user access.`)) return;
    const res = await fetch(`/api/admin/apps/${clientId}`, { method: "DELETE" });
    if (!res.ok) { setError("Failed to delete app."); return; }
    fetchApps();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Apps</h1>
          <p className="text-zinc-400 text-sm mt-1">Registered OIDC client applications</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingApp(null); setError(""); }}
          className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
        >
          Register App
        </button>
      </div>

      {createdApp && (
        <div className="mb-6 bg-green-900/30 border border-green-700 rounded-xl p-4">
          <p className="text-green-300 font-semibold text-sm mb-2">App registered — save the client secret now, it won&apos;t be shown again.</p>
          <p className="text-zinc-300 text-sm"><span className="text-zinc-500">Client ID:</span> <code className="text-green-300">{createdApp.clientId}</code></p>
          <p className="text-zinc-300 text-sm mt-1"><span className="text-zinc-500">Client Secret:</span> <code className="text-yellow-300 break-all">{createdApp.clientSecret}</code></p>
          <button onClick={() => setCreatedApp(null)} className="mt-3 text-zinc-500 text-xs hover:text-zinc-300">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-[#2a2a2a] border border-zinc-700 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Register New App</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">App Name</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} required placeholder="CEFC Collab"
                  className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Subdomain</label>
                <input value={formSubdomain} onChange={e => setFormSubdomain(e.target.value)} placeholder="collab.cefc.org.sg"
                  className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Redirect URIs (one per line)</label>
              <textarea value={formRedirectUris} onChange={e => setFormRedirectUris(e.target.value)} required rows={3}
                placeholder={"https://collab.cefc.org.sg/api/auth/oauth2/callback/cefc-auth\nhttp://localhost:3001/api/auth/oauth2/callback/cefc-auth"}
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500 font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Post-Logout Redirect URIs (one per line)</label>
              <textarea value={formPostLogoutRedirectUris} onChange={e => setFormPostLogoutRedirectUris(e.target.value)} rows={2}
                placeholder={"https://collab.cefc.org.sg/sign-in"}
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500 font-mono" />
              <p className="text-zinc-500 text-xs mt-1">Optional. These are also registered with Better Auth so end-session redirects will pass validation.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Session Timeout (seconds)</label>
              <input type="number" value={formSessionTimeout} onChange={e => setFormSessionTimeout(e.target.value)} min="300"
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
              <p className="text-zinc-500 text-xs mt-1">Default: 28800 (8 hours)</p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={creating}
                className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {creating ? "Registering..." : "Register"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError(""); }}
                className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {editingApp && (
        <div className="mb-6 bg-[#2a2a2a] border border-zinc-700 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Edit App — <span className="text-zinc-400 font-mono text-sm">{editingApp.clientId}</span></h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">App Name</label>
                <input value={editingApp.name} onChange={e => setEditingApp({ ...editingApp, name: e.target.value })} required
                  className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Subdomain</label>
                <input value={editingApp.subdomain} onChange={e => setEditingApp({ ...editingApp, subdomain: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Redirect URIs (one per line)</label>
              <textarea value={editingApp.redirectUris} onChange={e => setEditingApp({ ...editingApp, redirectUris: e.target.value })} required rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500 font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Post-Logout Redirect URIs (one per line)</label>
              <textarea value={editingApp.postLogoutRedirectUris} onChange={e => setEditingApp({ ...editingApp, postLogoutRedirectUris: e.target.value })} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500 font-mono" />
              <p className="text-zinc-500 text-xs mt-1">Optional. Better Auth validates these against the registered URI list during end-session requests.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Session Timeout (seconds)</label>
              <input type="number" value={editingApp.sessionTimeout} onChange={e => setEditingApp({ ...editingApp, sessionTimeout: e.target.value })} min="300"
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1c] border border-zinc-600 text-white text-sm focus:outline-none focus:border-purple-500" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => { setEditingApp(null); setError(""); }}
                className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <p className="text-zinc-400 text-sm">Loading apps...</p>}
      {error && !showForm && !editingApp && <p className="text-red-400 text-sm">{error}</p>}
      {!loading && (
        <div className="bg-[#2a2a2a] rounded-xl border border-zinc-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Client ID</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Subdomain</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Session</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Created</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <Fragment key={app.id}>
                  <tr className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{app.name}</td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{app.clientId}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{app.metadata.subdomain ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{app.metadata.sessionTimeout ?? 28800}s</td>
                    <td className="px-4 py-3 text-zinc-400">{new Date(app.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setUsersPanelClientId(usersPanelClientId === app.clientId ? null : app.clientId)}
                          className="px-3 py-1 rounded text-xs font-medium bg-blue-900 text-blue-200 hover:bg-blue-800 transition-colors"
                        >
                          Users
                        </button>
                        <button
                          onClick={() => { openEdit(app); setShowForm(false); }}
                          className="px-3 py-1 rounded text-xs font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDelete(app.clientId, app.name)}
                          className="px-3 py-1 rounded text-xs font-medium bg-red-900 text-red-200 hover:bg-red-800 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {usersPanelClientId === app.clientId && (
                    <AppUsersPanel
                      clientId={app.clientId}
                      appName={app.name}
                      onClose={() => setUsersPanelClientId(null)}
                    />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {apps.length === 0 && (
            <p className="text-center text-zinc-500 text-sm py-8">No apps registered yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
