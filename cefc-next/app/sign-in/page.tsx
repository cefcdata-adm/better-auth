import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SignInForm from "./SignInForm";

// If the user already has a valid session AND arrived via an OIDC authorize
// redirect (client_id present), skip the sign-in form entirely and forward
// them straight to the authorize endpoint so the OIDC flow completes.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  if (params.client_id) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
      ).toString();
      redirect(`/api/auth/oauth2/authorize?${qs}`);
    }
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-[#1c1c1c] items-center justify-center px-4 py-8 sm:px-8">
          <p className="text-zinc-400 text-sm">Loading...</p>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
