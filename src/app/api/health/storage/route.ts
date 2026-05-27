import { NextResponse } from "next/server";
import { checkStorageConnection } from "@/lib/storage/storage-service";

export async function GET() {
  try {
    await checkStorageConnection();
    return NextResponse.json({
      status: "healthy",
      service: "storage",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "unhealthy",
        service: "storage",
        error: err instanceof Error ? err.message : "Connection failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
