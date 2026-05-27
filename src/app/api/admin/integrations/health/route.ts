import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { getStorageConfig } from "@/lib/storage/storage-env";
import { buildAdminAuthContext } from "@/lib/auth/admin-guard";
import { handleApiError } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    await buildAdminAuthContext(request);

    const storageConfig = getStorageConfig();
    const resendApiKey = serverEnv.RESEND_API_KEY;

    // Check Email health (basic check if API key exists)
    const emailHealth = {
      provider: "Resend",
      configured: !!resendApiKey,
      senderAddress: serverEnv.MAIL_FROM,
    };

    // Check Storage health
    const storageHealth = {
      driver: storageConfig?.driver || "none",
      configured: !!storageConfig,
      bucket: storageConfig?.bucket || null,
      region: storageConfig?.region || null,
    };

    return NextResponse.json({
      email: emailHealth,
      storage: storageHealth,
      slack: { configured: false, status: "coming_soon" },
      jira: { configured: false, status: "coming_soon" },
    });
  } catch (error) {
    console.error("Failed to fetch integrations health", error);
    return handleApiError(error);
  }
}
