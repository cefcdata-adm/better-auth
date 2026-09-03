import Link from "next/link";
import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id } = await searchParams;

  let appName = "this application";
  if (client_id) {
    const rows = await db
      .select({ name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, client_id))
      .limit(1);
    appName = rows[0]?.name ?? client_id;
  }

  return (
    <div className="flex min-h-screen bg-[#1c1c1c] items-center justify-center px-4 py-8 sm:px-8">
      <div className="w-full max-w-sm bg-[#2a2a2a] rounded-xl p-6 sm:p-8 border border-zinc-700 text-center">
        <div className="w-12 h-12 bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-red-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access denied</h2>
        <p className="text-zinc-400 text-sm mb-6">
          You don&apos;t have access to <span className="text-white font-medium">{appName}</span>.
        </p>
        {client_id && (
          <Link
            href={`/request-access?client_id=${encodeURIComponent(client_id)}`}
            className="block w-full py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors text-center mb-4"
          >
            Request Access
          </Link>
        )}
        <Link href="/sign-in" className="text-emerald-400 text-sm hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
