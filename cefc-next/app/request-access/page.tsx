import { db } from "@/lib/db";
import { oauthApplication } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { RequestAccessForm } from "./RequestAccessForm";

export default async function RequestAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id } = await searchParams;

  let appName: string | null = null;
  if (client_id) {
    const rows = await db
      .select({ name: oauthApplication.name })
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, client_id))
      .limit(1);
    appName = rows[0]?.name ?? null;
  }

  return <RequestAccessForm clientId={client_id ?? null} appName={appName} />;
}
